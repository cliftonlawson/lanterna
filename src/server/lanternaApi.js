import { createR2PresignedGetUrl, createR2PresignedPutUrl, mediaObjectKey } from './r2Signing.js';
import { deleteStreamVideo, createStreamPlayback, getStreamVideo, streamAllowedOrigins } from './cloudflareStream.js';
import {
  abortR2MultipartUpload,
  completeR2MultipartUpload,
  createR2MultipartUpload,
  createR2UploadPartUrl,
  deleteR2Object,
  headR2Object,
  listR2MultipartParts,
  multipartPartCount,
  multipartPartSize,
  r2MultipartNotFound,
  validateMultipartParts,
} from './r2Multipart.js';
import { publicGalleryAccessError } from './galleryAccess.js';
import { accountForUser, assertGalleryMembership, currentUser, publicGalleryBySlug, supabaseRest } from './supabaseRest.js';
import { empty, errorJson, json, readJson, routePath, safeSlug } from './http.js';
import { buildDeliveryEmailContent, sendTransactionalEmail } from './transactionalEmail.js';
import { createPaidUnlockCheckout, paidUnlockSession, recoverPaidUnlock, stripeWebhook } from './stripeCheckout.js';
import { resolveGalleryDownloadPermission, resolveVideoDownloadPermission } from './downloadPermissions.js';
import { hashGalleryPassword, supportedGalleryPasswordHash, verifyGalleryPassword } from './galleryPassword.js';
import { startStreamCopyFromMaster, StreamCopyStartError } from './videoIngestion.js';
import { bytesToGb, UploadVerificationError, verifyDirectR2Object } from './uploadAccounting.js';

const uploadTargetTypes = new Set(['video', 'photo']);
const PUBLIC_STREAM_PLAYBACK_TTL_SECONDS = 21600;
const DEFAULT_UPLOAD_ALLOWANCE_GB = 50;
const DEFAULT_UPLOAD_JOB_STALE_MINUTES = 180;
const MAX_STREAM_SOURCE_BYTES = 30 * 1024 * 1024 * 1024;
const STREAM_FAILED_STATES = new Set(['error', 'failed', 'failure', 'cancelled', 'canceled']);
const STREAM_TERMINAL_ERROR_PATTERN = /not found|does not exist|invalid/i;
const GALLERY_ACCESS_TYPES = new Set(['public', 'password', 'private']);
const GALLERY_PROJECT_TYPES = new Set(['wedding', 'engagement', 'portrait']);

function publicBaseUrl(env) {
  return String(env.PUBLIC_DELIVERY_BASE_URL || env.APP_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
}

function deliveryLinkForGallery(env, gallery) {
  return `${publicBaseUrl(env)}/g/${encodeURIComponent(gallery.slug)}`;
}

async function vendorBrandingForAccount(env, accountId) {
  const rows = await supabaseRest(
    env,
    `vendor_branding?select=studio_name,tagline,accent_color&account_id=eq.${encodeURIComponent(accountId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  return rows?.[0] ?? null;
}

function requireString(input, key) {
  const value = String(input[key] || '').trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

async function requireAccountContext(request, env) {
  const user = await currentUser(request, env);
  const accountId = await accountForUser(env, user.id);
  return { accountId, user };
}

async function galleryPreflight(env, gallery) {
  if (!['public', 'password', 'private'].includes(gallery.access_type)) {
    return { code: 'access_required', message: 'Choose gallery access before publishing.' };
  }

  if (gallery.access_type === 'password' && !gallery.password_hash) {
    return { code: 'password_required', message: 'Set a gallery password before publishing.' };
  }

  const videos = await supabaseRest(
    env,
    `videos?select=id,r2_key,web_copy_r2_key,stream_uid,stream_ready,processing_status&gallery_id=eq.${encodeURIComponent(gallery.id)}&visible_in_gallery=eq.true&deleted_at=is.null&limit=25`,
    { headers: { accept: 'application/json' } },
  );
  const readyPlayableVideo = (videos || []).find((video) => video.processing_status === 'ready' && (
    video.r2_key
    || video.web_copy_r2_key
    || (video.stream_uid && video.stream_ready !== false)
  ));
  if (!readyPlayableVideo) return { code: 'ready_video_required', message: 'Add at least one ready, playable film before publishing.' };

  if (!gallery.cover_video_id && !gallery.cover_photo_id) {
    return { code: 'cover_required', message: 'Choose a cover before publishing.' };
  }

  return null;
}

async function requireGalleryPreflight(env, gallery) {
  const failure = await galleryPreflight(env, gallery);
  if (!failure) return null;
  return errorJson(failure.message, 422, { code: failure.code });
}

async function accountUsage(env, accountId) {
  const rows = await supabaseRest(
    env,
    `account_usage?select=allowance_used_gb,allowance_total_gb&account_id=eq.${encodeURIComponent(accountId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const usage = rows?.[0] ?? {};
  const allowanceTotalGb = Number(usage.allowance_total_gb ?? DEFAULT_UPLOAD_ALLOWANCE_GB);

  return {
    allowanceTotalGb: allowanceTotalGb > 0 ? allowanceTotalGb : DEFAULT_UPLOAD_ALLOWANCE_GB,
    allowanceUsedGb: Number(usage.allowance_used_gb ?? 0),
  };
}

async function activeUploadReservationGb(env, accountId) {
  const rows = await supabaseRest(
    env,
    `upload_jobs?select=bytes_total&account_id=eq.${encodeURIComponent(accountId)}&status=in.(pending,uploading,paused)`,
    { headers: { accept: 'application/json' } },
  );

  return (rows || []).reduce((sum, job) => sum + bytesToGb(job.bytes_total), 0);
}

async function expireStaleUploadJobs(env, accountId) {
  const minutes = Number(env.UPLOAD_JOB_STALE_MINUTES || DEFAULT_UPLOAD_JOB_STALE_MINUTES);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;

  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const rows = await supabaseRest(
    env,
    `upload_jobs?select=id&account_id=eq.${encodeURIComponent(accountId)}&status=in.(pending,uploading,paused)&updated_at=lt.${encodeURIComponent(cutoff)}`,
    { headers: { accept: 'application/json' } },
  );
  if (!rows?.length) return 0;

  await supabaseRest(
    env,
    `upload_jobs?account_id=eq.${encodeURIComponent(accountId)}&status=in.(pending,uploading,paused)&updated_at=lt.${encodeURIComponent(cutoff)}`,
    {
      body: JSON.stringify({ status: 'errored' }),
      headers: { prefer: 'return=minimal' },
      method: 'PATCH',
    },
  );

  return rows.length;
}

async function requireUploadAllowance(env, accountId, bytesTotal) {
  const requestedGb = bytesToGb(bytesTotal);
  if (requestedGb <= 0) return null;

  await expireStaleUploadJobs(env, accountId);
  const usage = await accountUsage(env, accountId);
  const reservedGb = await activeUploadReservationGb(env, accountId);
  const availableGb = Math.max(usage.allowanceTotalGb - usage.allowanceUsedGb - reservedGb, 0);
  if (requestedGb <= availableGb) return null;

  return errorJson('Not enough upload allowance for this upload.', 422, {
    availableGb: Number(availableGb.toFixed(4)),
    code: 'upload_allowance_exceeded',
    requestedGb: Number(requestedGb.toFixed(4)),
    allowanceTotalGb: usage.allowanceTotalGb,
    allowanceUsedGb: usage.allowanceUsedGb,
    reservedGb: Number(reservedGb.toFixed(4)),
  });
}

async function recordUploadUsageEvent(env, { accountId, bytes, galleryId, targetId = null, targetType = null }) {
  const gb = bytesToGb(bytes);
  if (gb <= 0) return;

  await supabaseRest(env, 'usage_events', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      account_id: accountId,
      bytes,
      gallery_id: galleryId,
      gb,
      photo_id: targetType === 'photo' ? targetId : null,
      video_id: targetType === 'video' ? targetId : null,
    }),
  });
}

async function markUploadJobErrored(env, accountId, uploadJobId) {
  if (!uploadJobId) return;

  await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(uploadJobId)}&account_id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'errored' }),
  });
}

async function uploadTargetExists(env, galleryId, targetId, targetType) {
  const table = targetType === 'photo' ? 'photos' : 'videos';
  const rows = await supabaseRest(
    env,
    `${table}?select=id&gallery_id=eq.${encodeURIComponent(galleryId)}&id=eq.${encodeURIComponent(targetId)}&deleted_at=is.null&limit=1`,
    { headers: { accept: 'application/json' } },
  );

  return rows?.length > 0;
}

async function uploadJobForTarget(env, { accountId, galleryId, targetId, targetType, uploadJobId }) {
  if (!uploadJobId) throw new Error('uploadJobId is required.');
  const rows = await supabaseRest(
    env,
    `upload_jobs?select=id,gallery_id,target_id,target_type,status,bytes_total,bytes_uploaded,r2_key,content_type,file_name,upload_phase,verified_bytes,completed_at,error_code,error_message,stream_upload_id&account_id=eq.${encodeURIComponent(accountId)}&id=eq.${encodeURIComponent(uploadJobId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const job = rows?.[0];
  if (!job || job.gallery_id !== galleryId || job.target_id !== targetId || job.target_type !== targetType) {
    throw new Error('Upload job does not match this upload target.');
  }
  return job;
}

async function createDirectR2UploadSlot(env, {
  accountId,
  bytesTotal,
  contentType,
  fileName,
  galleryId,
  targetId,
  targetType,
}) {
  const uploadJobId = crypto.randomUUID();
  const objectName = targetType === 'photo'
    ? `original-${uploadJobId}`
    : `${targetType}-${uploadJobId}`;
  const key = mediaObjectKey({
    accountId,
    fileName,
    galleryId,
    objectName,
    targetId,
    targetType,
  });
  const r2 = await createR2PresignedPutUrl(env, { key, contentLength: bytesTotal, contentType });

  await supabaseRest(env, 'upload_jobs', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      account_id: accountId,
      bytes_total: bytesTotal,
      bytes_uploaded: 0,
      content_type: contentType,
      file_name: fileName,
      gallery_id: galleryId,
      id: uploadJobId,
      r2_key: key,
      status: 'pending',
      target_id: targetId,
      target_type: targetType,
      upload_phase: 'uploading_master',
    }),
  });

  return { r2, uploadJobId };
}

async function completeVerifiedDirectR2Upload(env, {
  accountId,
  galleryId,
  targetId,
  targetType,
  uploadJobId,
}) {
  const job = await uploadJobForTarget(env, {
    accountId,
    galleryId,
    targetId,
    targetType,
    uploadJobId,
  });

  if (job.status === 'complete' && job.completed_at && Number(job.verified_bytes) > 0) {
    return callUploadRpc(env, 'complete_verified_r2_upload', {
      p_account_id: accountId,
      p_content_type: job.content_type,
      p_gallery_id: galleryId,
      p_r2_key: job.r2_key,
      p_upload_job_id: uploadJobId,
      p_verified_bytes: Number(job.verified_bytes),
    });
  }

  if (!job.r2_key) throw new Error('Upload job is missing its R2 object key.');
  const object = await headR2Object(env, job.r2_key);

  let verification;
  try {
    verification = verifyDirectR2Object(job, object);
  } catch (error) {
    if (!(error instanceof UploadVerificationError)) throw error;

    await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(job.id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        error_code: error.code,
        error_message: error.message,
        status: 'errored',
      }),
    });
    if (object.exists) await deleteR2Object(env, job.r2_key).catch(() => undefined);

    return {
      error: errorJson(error.message, 409, {
        code: error.code,
        expectedBytes: error.expectedBytes,
        verifiedBytes: error.verifiedBytes,
      }),
    };
  }

  return callUploadRpc(env, 'complete_verified_r2_upload', {
    p_account_id: accountId,
    p_content_type: verification.contentType,
    p_gallery_id: galleryId,
    p_r2_key: job.r2_key,
    p_upload_job_id: uploadJobId,
    p_verified_bytes: verification.verifiedBytes,
  });
}

async function videoUploadJob(env, { accountId, galleryId, uploadJobId }) {
  if (!uploadJobId) throw new Error('uploadJobId is required.');
  const rows = await supabaseRest(
    env,
    `upload_jobs?select=id,account_id,gallery_id,target_id,target_type,status,bytes_total,bytes_uploaded,multipart_upload_id,multipart_part_size,r2_key,content_type,file_name,upload_phase,is_replacement,verified_bytes,master_verified_at,stream_upload_id,stream_source_expires_at,error_code,error_message&account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(galleryId)}&id=eq.${encodeURIComponent(uploadJobId)}&target_type=eq.video&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const job = rows?.[0];
  if (!job) throw new Error('Video upload job not found.');
  return job;
}

async function callUploadRpc(env, name, body) {
  return supabaseRest(env, `rpc/${name}`, {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}

async function markVideoCopyFailed(env, { accountId, galleryId, job, message }) {
  await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(job.id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      error_code: 'stream_copy_failed',
      error_message: String(message || 'Cloudflare Stream copy failed.').slice(0, 500),
      status: 'errored',
      upload_phase: 'copy_failed',
    }),
  });

  if (!job.is_replacement) {
    await supabaseRest(env, `videos?id=eq.${encodeURIComponent(job.target_id)}&gallery_id=eq.${encodeURIComponent(galleryId)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ processing_status: 'errored', stream_ready: false }),
    });
  }
}

function streamStatusErrorIsTerminal(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return STREAM_TERMINAL_ERROR_PATTERN.test(message);
}

async function publishGallery(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const preflightError = await requireGalleryPreflight(env, gallery);
  if (preflightError) return preflightError;

  if (gallery.status !== 'delivered') {
    await supabaseRest(env, `galleries?id=eq.${encodeURIComponent(gallery.id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'published' }),
    });
  }

  return json({ gallery: { id: gallery.id, status: gallery.status === 'delivered' ? 'delivered' : 'published' }, ok: true });
}

function gallerySlugCandidate(base, number) {
  if (number === 1) return base;
  const suffix = `-${number}`;
  return `${base.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
}

async function globallyUniqueGallerySlug(env, name) {
  const normalized = safeSlug(name);
  const base = normalized === 'file' && !/[a-z0-9]/i.test(name) ? 'gallery' : normalized;

  for (let number = 1; number <= 10000; number += 1) {
    const slug = gallerySlugCandidate(base, number);
    const rows = await supabaseRest(
      env,
      `galleries?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { accept: 'application/json' } },
    );
    if (!rows?.length) return slug;
  }

  throw new Error('Could not allocate a unique gallery link.');
}

function isGallerySlugConflict(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /duplicate key|unique constraint/i.test(message) && /slug/i.test(message);
}

async function createGallery(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const name = requireString(body, 'name').slice(0, 200);
  const clientName = String(body.clientName || '').trim().slice(0, 200) || name;
  const eventDate = String(body.eventDate || '').trim() || null;
  const accessType = String(body.accessType || '').trim();
  const projectType = String(body.projectType || '').trim();

  if (!GALLERY_ACCESS_TYPES.has(accessType)) throw new Error('Choose a valid gallery access type.');
  if (!GALLERY_PROJECT_TYPES.has(projectType)) throw new Error('Choose a valid project type.');
  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error('Event date must use YYYY-MM-DD.');
  const password = String(body.password || '').trim();
  if (accessType === 'password' && !password) {
    return errorJson('Set a gallery password before creating this gallery.', 422, { code: 'password_required' });
  }
  const passwordHash = accessType === 'password' ? await hashGalleryPassword(password) : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const galleryId = crypto.randomUUID();
    const slug = await globallyUniqueGallerySlug(env, name);

    try {
      await supabaseRest(env, 'galleries', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({
          access_type: accessType,
          account_id: accountId,
          client_name: clientName,
          event_date: eventDate,
          id: galleryId,
          name,
          password_hash: passwordHash,
          project_type: projectType,
          slug,
        }),
      });
    } catch (error) {
      if (isGallerySlugConflict(error)) continue;
      throw error;
    }

    try {
      await supabaseRest(env, 'gallery_design', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({
          allow_downloads: false,
          gallery_id: galleryId,
          heading_title: name,
        }),
      });
    } catch (error) {
      await supabaseRest(env, `galleries?id=eq.${encodeURIComponent(galleryId)}&account_id=eq.${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
        headers: { prefer: 'return=minimal' },
      });
      throw error;
    }

    return json({
      gallery: {
        accessType,
        clientName,
        eventDate,
        id: galleryId,
        name,
        passwordSet: accessType === 'password',
        projectType,
        slug,
        status: 'draft',
      },
      ok: true,
    }, { status: 201 });
  }

  return errorJson('A unique gallery link could not be reserved. Try again.', 409, { code: 'slug_conflict' });
}

async function setGalleryAccess(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const accessType = requireString(body, 'accessType');
  if (!GALLERY_ACCESS_TYPES.has(accessType)) throw new Error('Choose a valid gallery access type.');

  await assertGalleryMembership(env, accountId, galleryId);
  const passwordHash = accessType === 'password'
    ? await hashGalleryPassword(String(body.password || ''))
    : null;
  const rows = await supabaseRest(
    env,
    `galleries?select=id,access_type,password_hash&account_id=eq.${encodeURIComponent(accountId)}&id=eq.${encodeURIComponent(galleryId)}&deleted_at=is.null`,
    {
      body: JSON.stringify({ access_type: accessType, password_hash: passwordHash }),
      headers: { prefer: 'return=representation' },
      method: 'PATCH',
    },
  );
  const gallery = rows?.[0];
  if (!gallery) return errorJson('Gallery not found for this account.', 404);

  return json({
    gallery: {
      accessType: gallery.access_type,
      id: gallery.id,
      passwordSet: gallery.access_type === 'password' && Boolean(gallery.password_hash),
    },
    ok: true,
  });
}

async function setGalleryArchived(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  if (typeof body.archived !== 'boolean') throw new Error('archived must be true or false.');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const archivedAt = body.archived ? new Date().toISOString() : null;
  const rows = await supabaseRest(
    env,
    `galleries?select=id,archived_at&id=eq.${encodeURIComponent(gallery.id)}&account_id=eq.${encodeURIComponent(accountId)}&deleted_at=is.null`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ archived_at: archivedAt }),
    },
  );
  const updated = rows?.[0];
  if (!updated) return errorJson('Gallery not found for this account.', 404);

  return json({
    gallery: { archivedAt: updated.archived_at, id: updated.id },
    ok: true,
  });
}

async function deleteGallery(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const result = await supabaseRest(env, 'rpc/request_gallery_soft_delete', {
    method: 'POST',
    body: JSON.stringify({
      target_account_id: accountId,
      target_gallery_id: galleryId,
    }),
  });

  return json({
    alreadyDeleted: Boolean(result?.alreadyDeleted),
    deletedAt: result?.deletedAt ?? null,
    galleryId: result?.galleryId ?? galleryId,
    ok: true,
    purgeTaskId: result?.purgeTaskId ?? null,
  });
}

async function uploadSlot(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const targetId = requireString(body, 'targetId');
  const targetType = requireString(body, 'targetType');
  const fileName = requireString(body, 'fileName');

  if (!uploadTargetTypes.has(targetType)) throw new Error(`Unsupported upload target type: ${targetType}`);

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  if (!await uploadTargetExists(env, gallery.id, targetId, targetType)) {
    return errorJson('Upload target no longer exists. Reload and retry the upload.', 409);
  }

  const bytesTotal = Number(body.bytesTotal || 0);
  if (!Number.isSafeInteger(bytesTotal) || bytesTotal <= 0) return errorJson('Upload size must be a positive integer.', 422);
  if (targetType === 'video' && bytesTotal > MAX_STREAM_SOURCE_BYTES) {
    return errorJson('Cloudflare Stream accepts video masters up to 30 GB.', 422);
  }
  const contentType = String(body.contentType || '').trim() || 'application/octet-stream';
  if (targetType === 'photo' && !contentType.startsWith('image/')) {
    return errorJson('Photo uploads require an image content type.', 422);
  }

  if (targetType === 'video') {
    if (!contentType.startsWith('video/')) return errorJson('Video uploads require a video content type.', 422);
    const videoRows = await supabaseRest(
      env,
      `videos?select=id,r2_key,web_copy_r2_key,stream_uid,stream_ready,processing_status&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(targetId)}&deleted_at=is.null&limit=1`,
      { headers: { accept: 'application/json' } },
    );
    const targetVideo = videoRows?.[0];
    if (!targetVideo) return errorJson('Video upload target no longer exists.', 409);
    const isReplacement = Boolean(targetVideo.r2_key || targetVideo.web_copy_r2_key || targetVideo.stream_uid);

    const resumeUploadJobId = String(body.resumeUploadJobId || '').trim();
    if (resumeUploadJobId) {
      const existing = await videoUploadJob(env, { accountId, galleryId: gallery.id, uploadJobId: resumeUploadJobId });
      if (existing.target_id !== targetId
        || Number(existing.bytes_total) !== bytesTotal
        || existing.file_name !== fileName
        || String(existing.content_type || '').toLowerCase() !== contentType.toLowerCase()
        || !existing.multipart_upload_id
        || !existing.r2_key
      ) {
        return errorJson('Selected file does not match this resumable upload.', 409);
      }
      if (!['uploading_master', 'master_secured', 'copy_failed'].includes(existing.upload_phase)) {
        return errorJson('This video upload cannot be resumed from its current state.', 409);
      }
      if (existing.status === 'errored' && existing.upload_phase === 'uploading_master') {
        const allowanceError = await requireUploadAllowance(env, accountId, bytesTotal);
        if (allowanceError) return allowanceError;
      }

      return json({
        galleryId,
        r2: {
          key: existing.r2_key,
          method: 'MULTIPART',
          partSize: Number(existing.multipart_part_size),
          provider: 'r2',
        },
        resumed: true,
        stream: null,
        targetId,
        targetType,
        uploadJobId: existing.id,
        uploadPhase: existing.upload_phase,
      });
    }

    const allowanceError = await requireUploadAllowance(env, accountId, bytesTotal);
    if (allowanceError) return allowanceError;

    const uploadJobId = crypto.randomUUID();
    const key = mediaObjectKey({
      accountId,
      galleryId,
      targetType,
      targetId,
      fileName,
      objectName: `master-${uploadJobId}`,
    });
    const partSize = multipartPartSize(env, bytesTotal);
    const multipart = await createR2MultipartUpload(env, { contentType, key });

    try {
      await supabaseRest(env, 'upload_jobs', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({
          account_id: accountId,
          bytes_total: bytesTotal,
          bytes_uploaded: 0,
          content_type: contentType,
          file_name: fileName,
          gallery_id: gallery.id,
          id: uploadJobId,
          is_replacement: isReplacement,
          multipart_part_size: partSize,
          multipart_upload_id: multipart.uploadId,
          r2_key: key,
          status: 'pending',
          target_id: targetId,
          target_type: targetType,
          upload_phase: 'uploading_master',
        }),
      });
    } catch (error) {
      await abortR2MultipartUpload(env, { key, uploadId: multipart.uploadId }).catch(() => undefined);
      throw error;
    }

    return json({
      galleryId,
      r2: {
        key,
        method: 'MULTIPART',
        partSize,
        provider: 'r2',
      },
      resumed: false,
      isReplacement,
      stream: null,
      targetId,
      targetType,
      uploadJobId,
      uploadPhase: 'uploading_master',
    });
  }

  const allowanceError = await requireUploadAllowance(env, accountId, bytesTotal);
  if (allowanceError) return allowanceError;
  const slot = await createDirectR2UploadSlot(env, {
    accountId,
    bytesTotal,
    contentType,
    fileName,
    galleryId: gallery.id,
    targetId,
    targetType,
  });

  return json({ galleryId, r2: slot.r2, stream: null, targetId, targetType, uploadJobId: slot.uploadJobId });
}

async function videoMultipartPartUrl(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const uploadJobId = requireString(body, 'uploadJobId');
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const job = await videoUploadJob(env, { accountId, galleryId: gallery.id, uploadJobId });
  if (job.upload_phase !== 'uploading_master' || !job.multipart_upload_id || !job.r2_key) {
    return errorJson('Video master is not accepting multipart parts.', 409);
  }

  const partNumber = Number(body.partNumber);
  const partCount = multipartPartCount(Number(job.bytes_total), Number(job.multipart_part_size));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
    return errorJson('Multipart part number is outside this upload.', 422);
  }

  const part = await createR2UploadPartUrl(env, {
    key: job.r2_key,
    partNumber,
    uploadId: job.multipart_upload_id,
  });

  if (job.status !== 'uploading') {
    await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(job.id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'uploading' }),
    });
  }

  return json({ ok: true, part, uploadJobId });
}

async function videoMultipartStatus(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const uploadJobId = requireString(body, 'uploadJobId');
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const job = await videoUploadJob(env, { accountId, galleryId: gallery.id, uploadJobId });

  if (job.master_verified_at) {
    return json({
      bytesUploaded: Number(job.verified_bytes || job.bytes_total),
      objectComplete: true,
      ok: true,
      parts: [],
      uploadJobId,
      uploadPhase: job.upload_phase,
    });
  }
  if (!job.multipart_upload_id || !job.r2_key) throw new Error('Video multipart session is missing.');

  const completedObject = await headR2Object(env, job.r2_key);
  if (completedObject.exists) {
    return json({
      bytesUploaded: Number(completedObject.bytes || 0),
      objectComplete: true,
      ok: true,
      parts: [],
      uploadJobId,
      uploadPhase: job.upload_phase,
    });
  }

  let parts;
  try {
    parts = await listR2MultipartParts(env, { key: job.r2_key, uploadId: job.multipart_upload_id });
  } catch (error) {
    if (r2MultipartNotFound(error)) return errorJson('R2 multipart session expired. Start this upload again.', 410);
    throw error;
  }
  const bytesUploaded = parts.reduce((sum, part) => sum + Number(part.size || 0), 0);

  await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(job.id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ bytes_uploaded: bytesUploaded }),
  });

  return json({
    bytesUploaded,
    objectComplete: false,
    ok: true,
    partSize: Number(job.multipart_part_size),
    parts: parts.map((part) => ({ partNumber: part.partNumber, size: part.size })),
    uploadJobId,
    uploadPhase: job.upload_phase,
  });
}

async function pauseVideoMasterUpload(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const uploadJobId = requireString(body, 'uploadJobId');
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const job = await videoUploadJob(env, { accountId, galleryId: gallery.id, uploadJobId });
  if (job.upload_phase !== 'uploading_master') {
    return errorJson('Only an active master upload can be paused.', 409);
  }

  await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(job.id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'paused' }),
  });

  return json({ ok: true, uploadJobId, uploadPhase: job.upload_phase });
}

async function completeVideoMaster(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const uploadJobId = requireString(body, 'uploadJobId');
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const job = await videoUploadJob(env, { accountId, galleryId: gallery.id, uploadJobId });
  if (!job.multipart_upload_id || !job.r2_key) throw new Error('Video multipart session is missing.');

  let object = await headR2Object(env, job.r2_key);
  if (!object.exists) {
    let parts;
    try {
      parts = await listR2MultipartParts(env, { key: job.r2_key, uploadId: job.multipart_upload_id });
    } catch (error) {
      if (r2MultipartNotFound(error)) return errorJson('R2 multipart session expired before completion.', 410);
      throw error;
    }
    const verifiedParts = validateMultipartParts(parts, Number(job.bytes_total), Number(job.multipart_part_size));
    try {
      await completeR2MultipartUpload(env, {
        key: job.r2_key,
        parts: verifiedParts,
        uploadId: job.multipart_upload_id,
      });
    } catch (error) {
      if (!r2MultipartNotFound(error)) throw error;
    }
    object = await headR2Object(env, job.r2_key);
  }

  const verifiedBytes = Number(object.bytes || 0);
  const verifiedContentType = String(object.contentType || '').toLowerCase();
  if (!object.exists || verifiedBytes !== Number(job.bytes_total)) {
    return errorJson('R2 master verification failed: uploaded byte size does not match the reserved file.', 409, {
      code: 'master_size_mismatch',
      expectedBytes: Number(job.bytes_total),
      verifiedBytes,
    });
  }
  if (String(job.content_type || '').toLowerCase() !== verifiedContentType) {
    return errorJson('R2 master verification failed: content type does not match the upload slot.', 409, {
      code: 'master_content_type_mismatch',
    });
  }

  const result = await callUploadRpc(env, 'secure_video_master_upload', {
    p_account_id: accountId,
    p_content_type: object.contentType,
    p_gallery_id: gallery.id,
    p_r2_key: job.r2_key,
    p_upload_job_id: job.id,
    p_verified_bytes: verifiedBytes,
    p_video_id: job.target_id,
  });

  return json({
    alreadyCompleted: Boolean(result?.alreadyCompleted),
    isReplacement: Boolean(result?.isReplacement),
    ok: true,
    r2Key: result?.r2Key ?? job.r2_key,
    uploadJobId: job.id,
    uploadPhase: 'master_secured',
    usageRecorded: Boolean(result?.usageRecorded),
    verifiedBytes: Number(result?.verifiedBytes ?? verifiedBytes),
  });
}

async function startVideoPlaybackPreparation(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const uploadJobId = requireString(body, 'uploadJobId');
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const claim = await callUploadRpc(env, 'claim_video_stream_copy', {
    p_account_id: accountId,
    p_gallery_id: gallery.id,
    p_upload_job_id: uploadJobId,
  });

  if (claim?.alreadyReady || claim?.alreadyStarted) {
    return json({
      alreadyStarted: true,
      ok: true,
      streamUid: claim.streamUid,
      uploadJobId,
      uploadPhase: claim.alreadyReady ? 'ready' : 'preparing_playback',
    });
  }
  if (claim?.inProgress) {
    return errorJson('Playback preparation is already starting. Try again in a moment.', 409, { code: 'stream_copy_in_progress' });
  }

  const job = await videoUploadJob(env, { accountId, galleryId: gallery.id, uploadJobId });
  if (claim?.previousStreamUid) {
    await deleteStreamVideo(env, claim.previousStreamUid).catch(() => undefined);
  }

  try {
    const started = await startStreamCopyFromMaster({
      env,
      job: {
        accountId,
        fileName: job.file_name || 'video',
        galleryId: gallery.id,
        r2Key: job.r2_key,
        uploadJobId: job.id,
        videoId: job.target_id,
      },
      onAccepted: async ({ sourceExpiresAt, streamUid }) => {
        await callUploadRpc(env, 'record_video_stream_copy', {
          p_account_id: accountId,
          p_gallery_id: gallery.id,
          p_source_expires_at: sourceExpiresAt,
          p_stream_uid: streamUid,
          p_upload_job_id: job.id,
        });
      },
      onFailure: async (message) => markVideoCopyFailed(env, {
        accountId,
        galleryId: gallery.id,
        job,
        message,
      }),
    });

    return json({
      ok: true,
      sourceExpiresAt: started.sourceExpiresAt,
      streamUid: started.streamUid,
      uploadJobId: job.id,
      uploadPhase: 'preparing_playback',
    });
  } catch (error) {
    if (error instanceof StreamCopyStartError) {
      return errorJson('Master secured, but playback preparation failed. Retry without uploading again.', 502, {
        code: 'stream_copy_failed',
      });
    }
    throw error;
  }
}

async function uploadComplete(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const targetId = requireString(body, 'targetId');
  const targetType = requireString(body, 'targetType');
  if (targetType === 'video') {
    return errorJson('Video masters must use the verified multipart completion route.', 409, {
      code: 'video_multipart_completion_required',
    });
  }
  if (targetType !== 'photo') throw new Error('targetType must be photo.');
  const uploadJobId = requireString(body, 'uploadJobId');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  if (!await uploadTargetExists(env, gallery.id, targetId, targetType)) {
    await markUploadJobErrored(env, accountId, uploadJobId);
    return errorJson('Upload target no longer exists. Reload and retry the upload.', 409);
  }
  const completion = await completeVerifiedDirectR2Upload(env, {
    accountId,
    galleryId: gallery.id,
    targetId,
    targetType,
    uploadJobId,
  });
  if (completion.error) return completion.error;

  return json({
    alreadyCompleted: Boolean(completion.alreadyCompleted),
    ok: true,
    r2Key: completion.r2Key,
    usageRecorded: Boolean(completion.usageRecorded),
    verifiedBytes: Number(completion.verifiedBytes),
  });
}

async function clearUploadJob(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const uploadJobId = requireString(body, 'uploadJobId');
  const rows = await supabaseRest(
    env,
    `upload_jobs?select=id,status,target_type,upload_phase,master_verified_at&account_id=eq.${encodeURIComponent(accountId)}&id=eq.${encodeURIComponent(uploadJobId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const job = rows?.[0];
  if (!job) return errorJson('Upload job not found.', 404);
  if (!['complete', 'errored'].includes(job.status)) {
    return errorJson('Only complete or errored upload jobs can be cleared.', 409);
  }
  if (job.target_type === 'video' && job.master_verified_at && job.upload_phase === 'copy_failed') {
    return errorJson('This secured master still needs a playback retry or an explicit video delete.', 409);
  }

  await supabaseRest(env, `upload_jobs?account_id=eq.${encodeURIComponent(accountId)}&id=eq.${encodeURIComponent(uploadJobId)}`, {
    method: 'DELETE',
    headers: { prefer: 'return=minimal' },
  });

  return json({ ok: true, uploadJobId });
}

async function deleteGalleryMedia(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const targetId = requireString(body, 'targetId');
  const targetType = requireString(body, 'targetType');
  if (!uploadTargetTypes.has(targetType)) throw new Error('targetType must be video or photo.');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const table = targetType === 'photo' ? 'photos' : 'videos';
  const select = targetType === 'photo'
    ? 'id,r2_key,r2_bytes,processing_status'
    : 'id,r2_key,web_copy_r2_key,poster_r2_key,stream_uid,processing_status';
  const rows = await supabaseRest(
    env,
    `${table}?select=${select}&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(targetId)}&deleted_at=is.null&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const media = rows?.[0];
  if (!media) return errorJson('Media not found for this gallery.', 404);

  const stagedVideoJobs = targetType === 'video'
    ? await supabaseRest(
      env,
      `upload_jobs?select=id,r2_key,stream_upload_id&account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&target_type=eq.video&target_id=eq.${encodeURIComponent(targetId)}&master_verified_at=not.is.null&upload_phase=neq.ready`,
      { headers: { accept: 'application/json' } },
    )
    : [];

  const deletedAt = new Date().toISOString();
  await supabaseRest(env, `${table}?gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(targetId)}&deleted_at=is.null`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: deletedAt }),
  });

  const r2Keys = [...new Set(targetType === 'photo'
    ? [media.r2_key].filter(Boolean)
    : [
      media.r2_key,
      media.web_copy_r2_key,
      media.poster_r2_key,
      ...(stagedVideoJobs || []).map((job) => job.r2_key),
    ].filter(Boolean))];
  for (const r2Key of r2Keys) {
    await supabaseRest(env, 'media_tasks', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        account_id: accountId,
        gallery_id: gallery.id,
        id: crypto.randomUUID(),
        task_type: 'delete_r2',
        payload: {
          deleted_at: deletedAt,
          r2_key: r2Key,
          target_id: targetId,
          target_type: targetType,
        },
        status: 'pending',
        video_id: targetType === 'video' ? targetId : null,
      }),
    });
  }

  const streamUids = targetType === 'video'
    ? [...new Set([media.stream_uid, ...(stagedVideoJobs || []).map((job) => job.stream_upload_id)].filter(Boolean))]
    : [];
  for (const streamUid of streamUids) {
    await supabaseRest(env, 'media_tasks', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        account_id: accountId,
        gallery_id: gallery.id,
        id: crypto.randomUUID(),
        task_type: 'delete_stream',
        payload: {
          deleted_at: deletedAt,
          stream_uid: streamUid,
          target_id: targetId,
          target_type: targetType,
        },
        status: 'pending',
        video_id: targetId,
      }),
    });
  }

  if (stagedVideoJobs?.length) {
    await supabaseRest(env, `upload_jobs?account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&target_type=eq.video&target_id=eq.${encodeURIComponent(targetId)}&upload_phase=neq.ready`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        error_code: 'upload_target_deleted',
        error_message: 'Video was deleted before playback preparation completed.',
        status: 'errored',
      }),
    });
  }

  return json({
    cleanupTasks: r2Keys.length + streamUids.length,
    deletedAt,
    ok: true,
    targetId,
    targetType,
  });
}

async function processReady(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const videoId = String(body.videoId || '').trim();

  const expiredUploadJobs = await expireStaleUploadJobs(env, accountId);
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const videoFilter = videoId ? `&id=eq.${encodeURIComponent(videoId)}` : '';
  const dualIngestionJobs = await supabaseRest(
    env,
    `upload_jobs?select=id,target_id,status,upload_phase,stream_upload_id,is_replacement,r2_key,verified_bytes&account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&target_type=eq.video&status=in.(processing,errored)&upload_phase=in.(master_secured,starting_playback,preparing_playback,copy_failed)${videoId ? `&target_id=eq.${encodeURIComponent(videoId)}` : ''}`,
    { headers: { accept: 'application/json' } },
  );
  const dualIngestionVideoIds = new Set((dualIngestionJobs || []).map((job) => job.target_id).filter(Boolean));
  const preparingPlaybackJobs = (dualIngestionJobs || []).filter((job) => job.status === 'processing' && job.upload_phase === 'preparing_playback');
  const allProcessingVideos = await supabaseRest(
    env,
    `videos?select=id,r2_key,web_copy_r2_key,stream_uid,processing_status&gallery_id=eq.${encodeURIComponent(gallery.id)}&deleted_at=is.null&processing_status=in.(processing,uploading)${videoFilter}`,
    { headers: { accept: 'application/json' } },
  );
  const processingVideos = (allProcessingVideos || []).filter((video) => !dualIngestionVideoIds.has(video.id));

  const readyVideos = [];
  const readyDualIngestionVideoIds = [];
  const failedVideoIds = new Set();
  const reportedFailedVideoIds = new Set();
  const pendingStreamVideos = [];

  for (const job of preparingPlaybackJobs) {
    const streamUid = String(job.stream_upload_id || '').trim();
    if (!streamUid) {
      await markVideoCopyFailed(env, {
        accountId,
        galleryId: gallery.id,
        job,
        message: 'Stream copy uid is missing.',
      });
      reportedFailedVideoIds.add(job.target_id);
      continue;
    }

    let streamVideo = null;
    try {
      streamVideo = await getStreamVideo(env, streamUid);
    } catch (error) {
      if (streamStatusErrorIsTerminal(error)) {
        await markVideoCopyFailed(env, {
          accountId,
          galleryId: gallery.id,
          job,
          message: error instanceof Error ? error.message : 'Stream status check failed.',
        });
        reportedFailedVideoIds.add(job.target_id);
      } else {
        pendingStreamVideos.push({
          error: error instanceof Error ? error.message : 'Stream status check failed.',
          id: job.target_id,
          state: 'status_error',
          streamUid,
        });
      }
      continue;
    }

    const state = String(streamVideo?.status?.state || '').toLowerCase();
    if (STREAM_FAILED_STATES.has(state)) {
      await markVideoCopyFailed(env, {
        accountId,
        galleryId: gallery.id,
        job,
        message: streamVideo?.status?.errorReasonText
          || streamVideo?.status?.errorReason
          || streamVideo?.status?.error
          || 'Cloudflare Stream encode failed.',
      });
      reportedFailedVideoIds.add(job.target_id);
      continue;
    }

    const ready = streamVideo?.readyToStream === true || state === 'ready';
    if (!ready) {
      pendingStreamVideos.push({
        id: job.target_id,
        state: state || 'processing',
        streamUid,
      });
      continue;
    }

    const expectedOrigins = [...streamAllowedOrigins(env)].sort();
    const actualOrigins = [...(streamVideo.allowedOrigins || [])].sort();
    const originsMatch = expectedOrigins.length === 0
      || JSON.stringify(expectedOrigins) === JSON.stringify(actualOrigins);
    if (streamVideo.requireSignedURLs !== true || !originsMatch) {
      await markVideoCopyFailed(env, {
        accountId,
        galleryId: gallery.id,
        job,
        message: 'Cloudflare Stream playback access controls were not applied.',
      });
      reportedFailedVideoIds.add(job.target_id);
      continue;
    }

    await callUploadRpc(env, 'finalize_video_stream_copy', {
      p_account_id: accountId,
      p_duration_seconds: Number.isFinite(Number(streamVideo.duration)) ? Math.round(Number(streamVideo.duration)) : 0,
      p_gallery_id: gallery.id,
      p_stream_uid: streamUid,
      p_upload_job_id: job.id,
    });
    readyDualIngestionVideoIds.push(job.target_id);
  }

  for (const video of processingVideos || []) {
    if (video.stream_uid) {
      let streamVideo = null;
      try {
        streamVideo = await getStreamVideo(env, video.stream_uid);
      } catch (error) {
        if (streamStatusErrorIsTerminal(error)) {
          failedVideoIds.add(video.id);
        }
        pendingStreamVideos.push({
          error: error instanceof Error ? error.message : 'Stream status check failed.',
          id: video.id,
          state: 'status_error',
          streamUid: video.stream_uid,
        });
        continue;
      }

      const state = String(streamVideo?.status?.state || '').toLowerCase();
      if (STREAM_FAILED_STATES.has(state)) {
        failedVideoIds.add(video.id);
        pendingStreamVideos.push({
          error: streamVideo?.status?.errorReason || streamVideo?.status?.error || 'Cloudflare Stream encode failed.',
          id: video.id,
          state: state || 'failed',
          streamUid: video.stream_uid,
        });
        continue;
      }

      const ready = streamVideo?.readyToStream === true || state === 'ready';
      if (!ready) {
        pendingStreamVideos.push({
          id: video.id,
          state: state || 'processing',
          streamUid: video.stream_uid,
        });
        continue;
      }
      readyVideos.push({
        ...video,
        duration_seconds: Number.isFinite(Number(streamVideo.duration)) ? Math.round(Number(streamVideo.duration)) : null,
        stream_ready: true,
      });
      continue;
    }

    if (video.r2_key || video.web_copy_r2_key) {
      readyVideos.push({ ...video, stream_ready: Boolean(video.web_copy_r2_key) });
    }
  }

  for (const video of readyVideos) {
    await supabaseRest(env, `videos?id=eq.${encodeURIComponent(video.id)}&gallery_id=eq.${encodeURIComponent(gallery.id)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        ...(video.duration_seconds ? { duration_seconds: video.duration_seconds } : {}),
        processing_status: 'ready',
        stream_ready: video.stream_ready,
      }),
    });

    await supabaseRest(env, `upload_jobs?account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&target_id=eq.${encodeURIComponent(video.id)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'complete' }),
    });

  }

  if (failedVideoIds.size > 0) {
    const failedIds = [...failedVideoIds].map((id) => encodeURIComponent(id)).join(',');
    await supabaseRest(env, `videos?gallery_id=eq.${encodeURIComponent(gallery.id)}&id=in.(${failedIds})`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ processing_status: 'errored', stream_ready: false }),
    });

    await supabaseRest(env, `upload_jobs?account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&target_type=eq.video&target_id=in.(${failedIds})`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'errored' }),
    });

  }

  failedVideoIds.forEach((id) => reportedFailedVideoIds.add(id));

  return json({
    errored: reportedFailedVideoIds.size,
    erroredVideoIds: [...reportedFailedVideoIds],
    expiredUploadJobs,
    pending: pendingStreamVideos.filter((video) => !reportedFailedVideoIds.has(video.id)).length,
    pendingStreamVideos,
    processed: readyDualIngestionVideoIds.length + readyVideos.length,
    processedVideoIds: [...readyDualIngestionVideoIds, ...readyVideos.map((video) => video.id)],
    checked: preparingPlaybackJobs.length + (processingVideos?.length ?? 0),
  });
}

async function backgroundSlot(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const fileName = requireString(body, 'fileName');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const bytesTotal = Number(body.bytesTotal || 0);
  if (!Number.isSafeInteger(bytesTotal) || bytesTotal <= 0) return errorJson('Upload size must be a positive integer.', 422);
  const contentType = String(body.contentType || '').trim() || 'application/octet-stream';
  if (!contentType.startsWith('image/')) return errorJson('Background uploads require an image content type.', 422);
  const allowanceError = await requireUploadAllowance(env, accountId, bytesTotal);
  if (allowanceError) return allowanceError;

  const slot = await createDirectR2UploadSlot(env, {
    accountId,
    bytesTotal,
    contentType,
    fileName,
    galleryId: gallery.id,
    targetId: gallery.id,
    targetType: 'background',
  });

  return json({
    galleryId: gallery.id,
    r2: slot.r2,
    uploadJobId: slot.uploadJobId,
  });
}

async function backgroundComplete(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const uploadJobId = requireString(body, 'uploadJobId');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const completion = await completeVerifiedDirectR2Upload(env, {
    accountId,
    galleryId: gallery.id,
    targetId: gallery.id,
    targetType: 'background',
    uploadJobId,
  });
  if (completion.error) return completion.error;

  return json({
    alreadyCompleted: Boolean(completion.alreadyCompleted),
    ok: true,
    r2Key: completion.r2Key,
    usageRecorded: Boolean(completion.usageRecorded),
    verifiedBytes: Number(completion.verifiedBytes),
  });
}

async function posterSlot(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const videoId = requireString(body, 'videoId');
  const fileName = requireString(body, 'fileName');
  const contentType = String(body.contentType || '').trim() || 'application/octet-stream';

  if (!contentType.startsWith('image/')) throw new Error('Poster uploads must be image files.');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const bytesTotal = Number(body.bytesTotal || 0);
  if (!Number.isSafeInteger(bytesTotal) || bytesTotal <= 0) return errorJson('Upload size must be a positive integer.', 422);
  const allowanceError = await requireUploadAllowance(env, accountId, bytesTotal);
  if (allowanceError) return allowanceError;

  const videos = await supabaseRest(env, `videos?select=id&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(videoId)}&deleted_at=is.null&limit=1`);
  if (!videos?.[0]) throw new Error('Video not found for this gallery.');

  const slot = await createDirectR2UploadSlot(env, {
    accountId,
    bytesTotal,
    contentType,
    fileName,
    galleryId: gallery.id,
    targetId: videoId,
    targetType: 'poster',
  });

  return json({ galleryId: gallery.id, r2: slot.r2, uploadJobId: slot.uploadJobId, videoId });
}

async function posterComplete(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const videoId = requireString(body, 'videoId');
  const uploadJobId = requireString(body, 'uploadJobId');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const completion = await completeVerifiedDirectR2Upload(env, {
    accountId,
    galleryId: gallery.id,
    targetId: videoId,
    targetType: 'poster',
    uploadJobId,
  });
  if (completion.error) return completion.error;

  return json({
    alreadyCompleted: Boolean(completion.alreadyCompleted),
    ok: true,
    r2Key: completion.r2Key,
    usageRecorded: Boolean(completion.usageRecorded),
    verifiedBytes: Number(completion.verifiedBytes),
  });
}

async function posterCaptureFrame(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const videoId = requireString(body, 'videoId');
  const requestedSeconds = Number(body.timeSeconds || 0);
  const seconds = Number.isFinite(requestedSeconds) ? Math.max(0, Math.round(requestedSeconds * 100) / 100) : 0;

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const videos = await supabaseRest(
    env,
    `videos?select=id,stream_uid,stream_ready&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(videoId)}&deleted_at=is.null&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const video = videos?.[0];
  if (!video) throw new Error('Video not found for this gallery.');
  if (!video.stream_uid || video.stream_ready === false) throw new Error('Stream video is not ready for frame capture.');

  const playback = await createStreamPlayback(env, video.stream_uid, { expiresInSeconds: 300 });
  const thumbnailUrl = new URL(playback.thumbnailUrl);
  thumbnailUrl.searchParams.set('time', `${seconds}s`);
  thumbnailUrl.searchParams.set('height', '720');

  const frameResponse = await fetch(thumbnailUrl.toString());
  if (!frameResponse.ok) throw new Error(`Cloudflare frame capture failed (${frameResponse.status}).`);
  const contentType = frameResponse.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error('Cloudflare did not return an image frame.');
  const frameBuffer = await frameResponse.arrayBuffer();
  const bytes = frameBuffer.byteLength;
  if (!bytes) throw new Error('Cloudflare returned an empty frame.');

  const objectName = `poster-frame-${String(Math.round(seconds * 100)).padStart(1, '0')}-${crypto.randomUUID().slice(0, 8)}`;
  const key = mediaObjectKey({ accountId, galleryId: gallery.id, targetType: 'poster', targetId: videoId, objectName, fileName: 'frame.jpg' });
  const r2 = await createR2PresignedPutUrl(env, { key, contentLength: bytes, contentType: 'image/jpeg' });
  const uploadResponse = await fetch(r2.url, {
    method: 'PUT',
    headers: r2.headers,
    body: frameBuffer,
  });
  if (!uploadResponse.ok) throw new Error(`R2 frame upload failed (${uploadResponse.status}).`);
  const capturedObject = await headR2Object(env, key);
  let capturedVerification;
  try {
    capturedVerification = verifyDirectR2Object({ bytes_total: bytes, content_type: 'image/jpeg' }, capturedObject);
  } catch (error) {
    await deleteR2Object(env, key).catch(() => undefined);
    throw error;
  }

  await supabaseRest(env, `videos?id=eq.${encodeURIComponent(videoId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ poster_r2_key: key }),
  });

  await recordUploadUsageEvent(env, {
    accountId,
    bytes: capturedVerification.verifiedBytes,
    galleryId: gallery.id,
    targetId: videoId,
    targetType: 'video',
  });

  const poster = await createR2PresignedGetUrl(env, { key });
  return json({ media: { [key]: poster }, ok: true, posterUrl: poster.url, r2Key: key });
}

async function mediaUrls(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const keys = Array.isArray(body.keys) ? body.keys : [];
  const uniqueKeys = [...new Set(keys.map((key) => String(key || '').trim()).filter(Boolean))].slice(0, 80);
  const signed = {};

  for (const key of uniqueKeys) {
    if (!key.startsWith(`${accountId}/`)) continue;
    signed[key] = await createR2PresignedGetUrl(env, { key });
  }

  return json({ media: signed });
}

async function publicSignedMediaUrls(env, gallery, keys) {
  const accountPrefix = `${gallery.account_id}/`;
  const uniqueKeys = [...new Set(keys.map((key) => String(key || '').trim()).filter(Boolean))].slice(0, 120);
  const signed = {};

  for (const key of uniqueKeys) {
    if (!key.startsWith(accountPrefix)) continue;
    signed[key] = await createR2PresignedGetUrl(env, { key, expiresInSeconds: 900 });
  }

  return signed;
}

async function streamPlaybackUrls(env, videos) {
  if (!env.CLOUDFLARE_STREAM_SIGNING_KEY_ID || !env.CLOUDFLARE_STREAM_SIGNING_JWK) return {};
  const playableVideos = videos.filter((video) => video.stream_uid && video.stream_ready !== false && !video.paid_unlock_enabled);
  const signed = {};
  const expiresInSeconds = Number(env.PUBLIC_STREAM_PLAYBACK_TTL_SECONDS || PUBLIC_STREAM_PLAYBACK_TTL_SECONDS);

  for (const video of playableVideos) {
    signed[video.stream_uid] = await createStreamPlayback(env, video.stream_uid, { expiresInSeconds });
  }

  return signed;
}

async function streamPlayback(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const streamUids = Array.isArray(body.streamUids) ? body.streamUids : [body.streamUid];
  const uniqueStreamUids = [...new Set(streamUids.map((uid) => String(uid || '').trim()).filter(Boolean))].slice(0, 30);
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const playback = {};

  for (const streamUid of uniqueStreamUids) {
    const rows = await supabaseRest(
      env,
      `videos?select=id,stream_uid,stream_ready&gallery_id=eq.${encodeURIComponent(gallery.id)}&stream_uid=eq.${encodeURIComponent(streamUid)}&deleted_at=is.null&limit=1`,
      { headers: { accept: 'application/json' } },
    );
    const video = rows?.[0];
    if (!video || video.stream_ready === false) continue;
    playback[streamUid] = await createStreamPlayback(env, streamUid);
  }

  return json({ playback });
}

async function passwordMatches(gallery, password) {
  const stored = String(gallery.password_hash || '');
  if (!stored) return { error: 'This gallery needs a password reset before it can be unlocked.', ok: false };
  if (!supportedGalleryPasswordHash(stored)) {
    return {
      error: 'This gallery password was configured before unlock was wired. Reset the password in gallery settings.',
      ok: false,
    };
  }
  return { ok: await verifyGalleryPassword(password, stored) };
}

async function publicGalleryPayload(env, gallery) {
  const videos = await supabaseRest(env, `videos?select=id,title,duration_seconds,r2_key,stream_uid,stream_ready,web_copy_r2_key,poster_r2_key,processing_status,download_enabled,visible_in_gallery,paid_unlock_enabled,paid_unlock_price_cents,paid_unlock_currency,paid_unlock_label,paid_unlock_tagline&gallery_id=eq.${encodeURIComponent(gallery.id)}&visible_in_gallery=eq.true&deleted_at=is.null&order=sort_order.asc`);
  const publishableVideos = videos.filter((video) => video.processing_status === 'ready' || (video.processing_status == null && video.stream_ready !== false));
  const photos = await supabaseRest(env, `photos?select=id,album_id,r2_key,width,height&gallery_id=eq.${encodeURIComponent(gallery.id)}&deleted_at=is.null&order=sort_order.asc`);
  const design = await supabaseRest(env, `gallery_design?select=*&gallery_id=eq.${encodeURIComponent(gallery.id)}&limit=1`);
  const branding = await supabaseRest(env, `vendor_branding?select=studio_name,tagline,accent_color,custom_domain,default_downloads&account_id=eq.${encodeURIComponent(gallery.account_id)}&limit=1`);
  const designRow = design?.[0] ?? null;
  const brandingRow = branding?.[0] ?? null;
  const galleryAllowsDownloads = resolveGalleryDownloadPermission(designRow?.allow_downloads, brandingRow?.default_downloads);
  const resolvedVideos = publishableVideos.map((video) => ({
    ...video,
    download_enabled: resolveVideoDownloadPermission(
      video.download_enabled,
      designRow?.allow_downloads,
      brandingRow?.default_downloads,
    ),
  }));
  const mediaKeys = [
    designRow?.background_r2_key,
    ...resolvedVideos.flatMap((video) => {
      if (video.paid_unlock_enabled) return [video.poster_r2_key];
      return [
        video.download_enabled ? video.r2_key : null,
        video.web_copy_r2_key,
        video.poster_r2_key,
      ];
    }),
    ...photos.map((photo) => photo.r2_key),
  ];
  const media = await publicSignedMediaUrls(env, gallery, mediaKeys);
  const stream = await streamPlaybackUrls(env, resolvedVideos);

  return {
    gallery: {
      accessType: gallery.access_type,
      allowDownloads: galleryAllowsDownloads,
      clientName: gallery.client_name,
      design: designRow,
      eventDate: gallery.event_date,
      name: gallery.name,
      photos,
      slug: gallery.slug,
      status: gallery.status,
      videos: resolvedVideos,
    },
    media,
    stream,
    workspace: {
      accentColor: brandingRow?.accent_color ?? '#6EE7F9',
      customDomain: brandingRow?.custom_domain ?? null,
      studioName: brandingRow?.studio_name ?? 'LANTERNA Studio',
      tagline: brandingRow?.tagline ?? null,
    },
  };
}

async function deliveryRecord(request, env) {
  const body = await readJson(request);
  const { accountId, user } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const preflightError = await requireGalleryPreflight(env, gallery);
  if (preflightError) return preflightError;

  const recipients = Array.isArray(body.recipients)
    ? body.recipients.map((recipient) => String(recipient || '').trim()).filter(Boolean)
    : [];
  if (!recipients.length) return errorJson('Add at least one recipient before delivery.', 422, { code: 'recipient_required' });

  const deliveryId = crypto.randomUUID();
  const attemptedAt = new Date().toISOString();
  const deliveryLink = deliveryLinkForGallery(env, gallery);
  const customMessage = String(body.message || '').trim();
  const message = customMessage || 'Your gallery is ready.';
  const subject = String(body.subject || `${gallery.name} is ready`);
  const branding = await vendorBrandingForAccount(env, gallery.account_id);
  const emailContent = buildDeliveryEmailContent({
    accentColor: branding?.accent_color,
    deliveryLink,
    galleryName: gallery.name,
    message: customMessage,
    studioName: branding?.studio_name,
    tagline: branding?.tagline,
  });

  await supabaseRest(env, 'deliveries', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      gallery_id: gallery.id,
      id: deliveryId,
      message,
      sent_by: user.id,
    }),
  });

  const recipientRows = recipients.map((email) => ({
    delivery_id: deliveryId,
    email,
    gallery_id: gallery.id,
    id: crypto.randomUUID(),
    name: null,
    status: 'failed',
    last_sent_at: attemptedAt,
  }));

  await supabaseRest(env, 'delivery_recipients', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(recipientRows),
  });

  const emails = [];
  const failures = [];
  for (const recipient of recipientRows) {
    try {
      const email = await sendTransactionalEmail(env, {
        html: emailContent.html,
        subject,
        text: emailContent.text,
        to: recipient.email,
      });
      emails.push(email);

      await supabaseRest(env, 'delivery_events', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({
          event_type: 'sent',
          gallery_id: gallery.id,
          id: crypto.randomUUID(),
          metadata: { delivery_id: deliveryId, provider: email.provider, provider_id: email.id },
          recipient_id: recipient.id,
          video_id: null,
        }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Email provider request failed.';
      failures.push({ email: recipient.email, message: errorMessage });
      await supabaseRest(env, 'delivery_events', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({
          event_type: 'failed',
          gallery_id: gallery.id,
          id: crypto.randomUUID(),
          metadata: { delivery_id: deliveryId, error: errorMessage, provider: 'resend' },
          recipient_id: recipient.id,
          video_id: null,
        }),
      });
    }
  }

  if (failures.length) {
    return errorJson('Delivery email failed. The failed send was recorded.', 502, {
      code: 'email_failed',
      deliveryId,
      failedCount: failures.length,
      sentCount: emails.length,
    });
  }

  return json({ deliveryId, emails, gallery: { id: gallery.id, status: 'delivered' }, ok: true });
}

async function publicGallery(request, env, slug) {
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);

  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;
  if (gallery.access_type === 'password') return json({ access: 'password_required', gallery: { name: gallery.name, slug: gallery.slug } }, { status: 401 });

  return json(await publicGalleryPayload(env, gallery));
}

async function publicGalleryUnlock(request, env, slug) {
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);

  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;
  if (gallery.access_type !== 'password') return json(await publicGalleryPayload(env, gallery));

  const body = await readJson(request);
  const password = String(body.password || '');
  const match = await passwordMatches(gallery, password);
  if (!match.ok) return errorJson(match.error || 'Incorrect gallery password.', 403);

  return json(await publicGalleryPayload(env, gallery));
}

export async function handleLanternaApiRequest(request, { env = {} } = {}) {
  if (request.method === 'OPTIONS') return empty();

  try {
    const path = routePath(request);
    if (request.method === 'POST' && path === 'upload/slot') return await uploadSlot(request, env);
    if (request.method === 'POST' && path === 'upload/video/part') return await videoMultipartPartUrl(request, env);
    if (request.method === 'POST' && path === 'upload/video/status') return await videoMultipartStatus(request, env);
    if (request.method === 'POST' && path === 'upload/video/pause') return await pauseVideoMasterUpload(request, env);
    if (request.method === 'POST' && path === 'upload/video/complete-master') return await completeVideoMaster(request, env);
    if (request.method === 'POST' && path === 'upload/video/start-playback') return await startVideoPlaybackPreparation(request, env);
    if (request.method === 'POST' && path === 'upload/complete') return await uploadComplete(request, env);
    if (request.method === 'POST' && path === 'upload/clear-job') return await clearUploadJob(request, env);
    if (request.method === 'POST' && path === 'media/delete') return await deleteGalleryMedia(request, env);
    if (request.method === 'POST' && path === 'media/process-ready') return await processReady(request, env);
    if (request.method === 'POST' && path === 'background/slot') return await backgroundSlot(request, env);
    if (request.method === 'POST' && path === 'background/complete') return await backgroundComplete(request, env);
    if (request.method === 'POST' && path === 'poster/slot') return await posterSlot(request, env);
    if (request.method === 'POST' && path === 'poster/complete') return await posterComplete(request, env);
    if (request.method === 'POST' && path === 'poster/capture-frame') return await posterCaptureFrame(request, env);
    if (request.method === 'POST' && path === 'media/urls') return await mediaUrls(request, env);
    if (request.method === 'POST' && path === 'stream/playback') return await streamPlayback(request, env);
    if (request.method === 'POST' && path === 'gallery/create') return await createGallery(request, env);
    if (request.method === 'POST' && path === 'gallery/access') return await setGalleryAccess(request, env);
    if (request.method === 'POST' && path === 'gallery/publish') return await publishGallery(request, env);
    if (request.method === 'POST' && path === 'gallery/archive') return await setGalleryArchived(request, env);
    if (request.method === 'POST' && path === 'gallery/delete') return await deleteGallery(request, env);
    if (request.method === 'POST' && path === 'delivery/record') return await deliveryRecord(request, env);
    if (request.method === 'POST' && path === 'stripe/webhook') return await stripeWebhook(request, env);
    if (request.method === 'GET' && path.startsWith('public/gallery/') && path.endsWith('/paid-unlock/session')) return await paidUnlockSession(request, env, path.replace(/^public\/gallery\//, '').replace(/\/paid-unlock\/session$/, ''));
    if (request.method === 'POST' && path.startsWith('public/gallery/') && path.endsWith('/paid-unlock/recover')) return await recoverPaidUnlock(request, env, path.replace(/^public\/gallery\//, '').replace(/\/paid-unlock\/recover$/, ''));
    if (request.method === 'POST' && path.startsWith('public/gallery/') && path.endsWith('/paid-unlock/checkout')) return await createPaidUnlockCheckout(request, env, path.replace(/^public\/gallery\//, '').replace(/\/paid-unlock\/checkout$/, ''));
    if (request.method === 'POST' && path.startsWith('public/gallery/') && path.endsWith('/unlock')) return await publicGalleryUnlock(request, env, path.replace(/^public\/gallery\//, '').replace(/\/unlock$/, ''));
    if (request.method === 'GET' && path.startsWith('public/gallery/')) return await publicGallery(request, env, path.replace(/^public\/gallery\//, ''));

    return errorJson('API route not found.', 404);
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : 'LANTERNA API request failed.', 400);
  }
}
