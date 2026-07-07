import { createR2PresignedGetUrl, createR2PresignedPutUrl, mediaObjectKey } from './r2Signing.js';
import { createStreamDirectUpload, createStreamPlayback, createStreamTusUpload, getStreamVideo } from './cloudflareStream.js';
import { publicGalleryAccessError } from './galleryAccess.js';
import { accountForUser, assertGalleryMembership, currentUser, publicGalleryBySlug, supabaseRest } from './supabaseRest.js';
import { empty, errorJson, json, readJson, routePath } from './http.js';
import { sendTransactionalEmail } from './transactionalEmail.js';
import { createPaidUnlockCheckout, paidUnlockSession, recoverPaidUnlock, stripeWebhook } from './stripeCheckout.js';

const uploadTargetTypes = new Set(['video', 'photo']);
const PUBLIC_STREAM_PLAYBACK_TTL_SECONDS = 21600;
const STREAM_BASIC_POST_MAX_BYTES = 200 * 1024 * 1024;
const DEFAULT_UPLOAD_ALLOWANCE_GB = 50;
const DEFAULT_UPLOAD_JOB_STALE_MINUTES = 180;
const STREAM_FAILED_STATES = new Set(['error', 'failed', 'failure', 'cancelled', 'canceled']);
const STREAM_TERMINAL_ERROR_PATTERN = /not found|does not exist|invalid/i;

function publicBaseUrl(env) {
  return String(env.PUBLIC_DELIVERY_BASE_URL || env.APP_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text = '') {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function deliveryLinkForGallery(env, gallery) {
  return `${publicBaseUrl(env)}/g/${encodeURIComponent(gallery.slug)}`;
}

function deliveryEmailHtml(message, deliveryLink) {
  return `${textToHtml(message)}<p><a href="${escapeHtml(deliveryLink)}">Open your gallery</a></p>`;
}

function streamDirectUploadsEnabled(env) {
  return String(env.CLOUDFLARE_STREAM_DIRECT_UPLOADS_ENABLED || '').toLowerCase() === 'true';
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
    `videos?select=id&gallery_id=eq.${encodeURIComponent(gallery.id)}&deleted_at=is.null&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  if (!videos?.[0]) return { code: 'video_required', message: 'Add at least one film before publishing.' };

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

function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return Number.isFinite(value) && value > 0 ? value / 1024 / 1024 / 1024 : 0;
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
    `upload_jobs?select=bytes_total&account_id=eq.${encodeURIComponent(accountId)}&status=in.(pending,uploading)`,
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
    `upload_jobs?select=id&account_id=eq.${encodeURIComponent(accountId)}&status=in.(pending,uploading)&updated_at=lt.${encodeURIComponent(cutoff)}`,
    { headers: { accept: 'application/json' } },
  );
  if (!rows?.length) return 0;

  await supabaseRest(
    env,
    `upload_jobs?account_id=eq.${encodeURIComponent(accountId)}&status=in.(pending,uploading)&updated_at=lt.${encodeURIComponent(cutoff)}`,
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

async function uploadSlot(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const targetId = requireString(body, 'targetId');
  const targetType = requireString(body, 'targetType');
  const fileName = requireString(body, 'fileName');

  if (!uploadTargetTypes.has(targetType)) throw new Error(`Unsupported upload target type: ${targetType}`);

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const bytesTotal = Number(body.bytesTotal || 0);
  const allowanceError = await requireUploadAllowance(env, accountId, bytesTotal);
  if (allowanceError) return allowanceError;

  const contentType = String(body.contentType || '').trim() || undefined;
  const key = mediaObjectKey({ accountId, galleryId, targetType, targetId, fileName });
  const r2 = await createR2PresignedPutUrl(env, { key, contentType });
  const uploadJobId = crypto.randomUUID();

  await supabaseRest(env, 'upload_jobs', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      account_id: accountId,
      bytes_total: bytesTotal,
      bytes_uploaded: 0,
      gallery_id: gallery.id,
      id: uploadJobId,
      status: 'pending',
      target_id: targetId,
      target_type: targetType,
    }),
  });

  let stream = null;
  if (targetType === 'video' && streamDirectUploadsEnabled(env) && env.CLOUDFLARE_STREAM_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
    try {
      stream = bytesTotal > STREAM_BASIC_POST_MAX_BYTES
        ? await createStreamTusUpload(env, { accountId, bytesTotal, fileName, galleryId, targetId })
        : await createStreamDirectUpload(env, { accountId, galleryId, targetId });
    } catch (error) {
      console.warn('Cloudflare Stream direct upload unavailable; falling back to R2 upload slot', error);
      stream = null;
    }
  }

  return json({
    galleryId,
    r2,
    stream,
    targetId,
    targetType,
    uploadJobId,
  });
}

async function uploadComplete(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const targetId = requireString(body, 'targetId');
  const targetType = requireString(body, 'targetType');
  const streamUid = String(body.streamUid || '').trim() || null;
  const r2Key = targetType === 'video' && streamUid
    ? String(body.r2Key || '').trim() || null
    : requireString(body, 'r2Key');
  const bytes = Number(body.bytes || 0);

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  if (!await uploadTargetExists(env, gallery.id, targetId, targetType)) {
    await markUploadJobErrored(env, accountId, body.uploadJobId);
    return errorJson('Upload target no longer exists. Reload and retry the upload.', 409);
  }

  if (targetType === 'video' && body.stageReplacement === true && streamUid) {
    if (body.uploadJobId) {
      await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(body.uploadJobId)}&account_id=eq.${encodeURIComponent(accountId)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ bytes_uploaded: bytes, status: 'processing' }),
      });
    }

    await supabaseRest(env, 'media_tasks', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        account_id: accountId,
        gallery_id: gallery.id,
        id: crypto.randomUUID(),
        task_type: 'generate_web_copy',
        payload: {
          replacement: true,
          r2_bytes: bytes,
          r2_key: r2Key,
          stream_uid: streamUid,
          target_id: targetId,
          target_type: targetType,
          upload_job_id: body.uploadJobId || null,
        },
        status: 'pending',
        video_id: targetId,
      }),
    });

    await recordUploadUsageEvent(env, {
      accountId,
      bytes,
      galleryId: gallery.id,
      targetId,
      targetType,
    });

    return json({ ok: true, staged: true });
  }

  const mediaUpdate = targetType === 'photo'
    ? { r2_key: r2Key, r2_bytes: bytes, processing_status: 'ready' }
    : {
      r2_key: r2Key,
      r2_bytes: bytes,
      processing_status: 'processing',
      stream_uid: streamUid,
      stream_ready: false,
    };
  const table = targetType === 'photo' ? 'photos' : 'videos';

  await supabaseRest(env, `${table}?id=eq.${encodeURIComponent(targetId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(mediaUpdate),
  });

  if (body.uploadJobId) {
    await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(body.uploadJobId)}&account_id=eq.${encodeURIComponent(accountId)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ bytes_uploaded: bytes, status: targetType === 'photo' ? 'complete' : 'processing' }),
    });
  }

  if (targetType === 'video') {
    await supabaseRest(env, 'media_tasks', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        account_id: accountId,
        gallery_id: gallery.id,
        id: crypto.randomUUID(),
        task_type: 'generate_web_copy',
        payload: { r2_key: r2Key, stream_uid: streamUid, target_id: targetId, target_type: targetType },
        status: 'pending',
        video_id: targetId,
      }),
    });
  }

  await recordUploadUsageEvent(env, {
    accountId,
    bytes,
    galleryId: gallery.id,
    targetId,
    targetType,
  });

  return json({ ok: true });
}

async function processReady(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const videoId = String(body.videoId || '').trim();

  const expiredUploadJobs = await expireStaleUploadJobs(env, accountId);
  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const videoFilter = videoId ? `&id=eq.${encodeURIComponent(videoId)}` : '';
  const processingVideos = await supabaseRest(
    env,
    `videos?select=id,r2_key,web_copy_r2_key,stream_uid,processing_status&gallery_id=eq.${encodeURIComponent(gallery.id)}&deleted_at=is.null&processing_status=in.(processing,uploading)${videoFilter}`,
    { headers: { accept: 'application/json' } },
  );
  const pendingTasks = await supabaseRest(
    env,
    `media_tasks?select=id,video_id,payload&account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&task_type=eq.generate_web_copy&status=eq.pending${videoId ? `&video_id=eq.${encodeURIComponent(videoId)}` : ''}`,
    { headers: { accept: 'application/json' } },
  );
  const pendingReplacementTasks = (pendingTasks || []).filter((task) => task?.payload?.replacement === true && task?.payload?.stream_uid && task?.video_id);
  const pendingNonReplacementTasks = (pendingTasks || []).filter((task) => task?.payload?.replacement !== true && task?.video_id);
  const pendingNonReplacementVideoIds = [...new Set(pendingNonReplacementTasks.map((task) => task.video_id).filter(Boolean))];
  const readyExistingTaskVideoIds = new Set();

  if (pendingNonReplacementVideoIds.length > 0) {
    const taskVideos = await supabaseRest(
      env,
      `videos?select=id,r2_key,web_copy_r2_key,stream_uid,stream_ready,processing_status&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=in.(${pendingNonReplacementVideoIds.map((id) => encodeURIComponent(id)).join(',')})&deleted_at=is.null`,
      { headers: { accept: 'application/json' } },
    );

    for (const taskVideo of taskVideos || []) {
      const hasPlayableAsset = Boolean(taskVideo.r2_key || taskVideo.web_copy_r2_key || (taskVideo.stream_uid && taskVideo.stream_ready));
      if (taskVideo.processing_status === 'ready' && hasPlayableAsset) readyExistingTaskVideoIds.add(taskVideo.id);
    }
  }

  const readyVideos = [];
  const readyReplacementTasks = [];
  const failedVideoIds = new Set();
  const pendingStreamVideos = [];
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

  for (const task of pendingReplacementTasks) {
    const streamUid = String(task.payload.stream_uid || '').trim();
    let streamVideo = null;
    try {
      streamVideo = await getStreamVideo(env, streamUid);
    } catch (error) {
      if (streamStatusErrorIsTerminal(error)) {
        failedVideoIds.add(task.video_id);
      }
      pendingStreamVideos.push({
        error: error instanceof Error ? error.message : 'Stream status check failed.',
        id: task.video_id,
        state: 'status_error',
        streamUid,
      });
      continue;
    }

    const state = String(streamVideo?.status?.state || '').toLowerCase();
    if (STREAM_FAILED_STATES.has(state)) {
      failedVideoIds.add(task.video_id);
      pendingStreamVideos.push({
        error: streamVideo?.status?.errorReason || streamVideo?.status?.error || 'Cloudflare Stream encode failed.',
        id: task.video_id,
        state: state || 'failed',
        streamUid,
      });
      continue;
    }

    const ready = streamVideo?.readyToStream === true || state === 'ready';
    if (!ready) {
      pendingStreamVideos.push({
        id: task.video_id,
        state: state || 'processing',
        streamUid,
      });
      continue;
    }

    readyReplacementTasks.push({
      duration_seconds: Number.isFinite(Number(streamVideo.duration)) ? Math.round(Number(streamVideo.duration)) : null,
      r2_bytes: Number(task.payload.r2_bytes || 0),
      r2_key: String(task.payload.r2_key || '').trim() || null,
      stream_uid: streamUid,
      task_id: task.id,
      upload_job_id: String(task.payload.upload_job_id || '').trim() || null,
      video_id: task.video_id,
    });
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

    await supabaseRest(env, `media_tasks?account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&video_id=eq.${encodeURIComponent(video.id)}&status=eq.pending`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'done' }),
    });
  }

  for (const replacement of readyReplacementTasks) {
    await supabaseRest(env, `videos?id=eq.${encodeURIComponent(replacement.video_id)}&gallery_id=eq.${encodeURIComponent(gallery.id)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        ...(replacement.duration_seconds ? { duration_seconds: replacement.duration_seconds } : {}),
        poster_r2_key: null,
        processing_status: 'ready',
        r2_bytes: replacement.r2_bytes,
        r2_key: replacement.r2_key,
        stream_ready: true,
        stream_uid: replacement.stream_uid,
        web_copy_r2_key: null,
      }),
    });

    if (replacement.upload_job_id) {
      await supabaseRest(env, `upload_jobs?id=eq.${encodeURIComponent(replacement.upload_job_id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ bytes_uploaded: replacement.r2_bytes, status: 'complete' }),
      });
    } else {
      await supabaseRest(env, `upload_jobs?account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&target_id=eq.${encodeURIComponent(replacement.video_id)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'complete' }),
      });
    }

    await supabaseRest(env, `media_tasks?id=eq.${encodeURIComponent(replacement.task_id)}&account_id=eq.${encodeURIComponent(accountId)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'done' }),
    });
  }

  if (readyExistingTaskVideoIds.size > 0) {
    await supabaseRest(env, `media_tasks?account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&task_type=eq.generate_web_copy&status=eq.pending&video_id=in.(${[...readyExistingTaskVideoIds].map((id) => encodeURIComponent(id)).join(',')})`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'done' }),
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

    await supabaseRest(env, `media_tasks?account_id=eq.${encodeURIComponent(accountId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&video_id=in.(${failedIds})&status=eq.pending`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', last_error: 'Cloudflare Stream encode failed.' }),
    });
  }

  return json({
    cleanedTasks: readyExistingTaskVideoIds.size,
    errored: failedVideoIds.size,
    erroredVideoIds: [...failedVideoIds],
    expiredUploadJobs,
    pending: pendingStreamVideos.filter((video) => !failedVideoIds.has(video.id)).length,
    pendingStreamVideos,
    processed: readyVideos.length + readyReplacementTasks.length,
    processedVideoIds: [...readyVideos.map((video) => video.id), ...readyReplacementTasks.map((task) => task.video_id)],
    checked: (processingVideos?.length ?? 0) + pendingReplacementTasks.length,
  });
}

async function backgroundSlot(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const fileName = requireString(body, 'fileName');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const allowanceError = await requireUploadAllowance(env, accountId, Number(body.bytesTotal || 0));
  if (allowanceError) return allowanceError;

  const contentType = String(body.contentType || '').trim() || undefined;
  const key = mediaObjectKey({ accountId, galleryId: gallery.id, targetType: 'background', targetId: 'hero', fileName });
  const r2 = await createR2PresignedPutUrl(env, { key, contentType });

  return json({
    galleryId: gallery.id,
    r2,
  });
}

async function backgroundComplete(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const r2Key = requireString(body, 'r2Key');
  const bytes = Number(body.bytes || 0);

  const gallery = await assertGalleryMembership(env, accountId, galleryId);

  await supabaseRest(env, `gallery_design?gallery_id=eq.${encodeURIComponent(gallery.id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ background_r2_key: r2Key, background_type: 'image' }),
  });

  await recordUploadUsageEvent(env, { accountId, bytes, galleryId: gallery.id });

  return json({ ok: true, r2Key });
}

async function posterSlot(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const videoId = requireString(body, 'videoId');
  const fileName = requireString(body, 'fileName');
  const contentType = String(body.contentType || '').trim() || undefined;

  if (contentType && !contentType.startsWith('image/')) throw new Error('Poster uploads must be image files.');

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  const allowanceError = await requireUploadAllowance(env, accountId, Number(body.bytesTotal || 0));
  if (allowanceError) return allowanceError;

  const videos = await supabaseRest(env, `videos?select=id&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(videoId)}&deleted_at=is.null&limit=1`);
  if (!videos?.[0]) throw new Error('Video not found for this gallery.');

  const key = mediaObjectKey({ accountId, galleryId: gallery.id, targetType: 'poster', targetId: videoId, objectName: 'poster', fileName });
  const r2 = await createR2PresignedPutUrl(env, { key, contentType });

  return json({ galleryId: gallery.id, r2, videoId });
}

async function posterComplete(request, env) {
  const body = await readJson(request);
  const { accountId } = await requireAccountContext(request, env);
  const galleryId = requireString(body, 'galleryId');
  const videoId = requireString(body, 'videoId');
  const r2Key = requireString(body, 'r2Key');
  const bytes = Number(body.bytes || 0);

  const gallery = await assertGalleryMembership(env, accountId, galleryId);
  if (!r2Key.startsWith(`${accountId}/${gallery.id}/films/${videoId}/`)) throw new Error('Poster key does not belong to this video.');

  await supabaseRest(env, `videos?id=eq.${encodeURIComponent(videoId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ poster_r2_key: r2Key }),
  });

  await recordUploadUsageEvent(env, {
    accountId,
    bytes,
    galleryId: gallery.id,
    targetId: videoId,
    targetType: 'video',
  });

  return json({ ok: true, r2Key });
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
  const r2 = await createR2PresignedPutUrl(env, { key, contentType: 'image/jpeg' });
  const uploadResponse = await fetch(r2.url, {
    method: 'PUT',
    headers: r2.headers,
    body: frameBuffer,
  });
  if (!uploadResponse.ok) throw new Error(`R2 frame upload failed (${uploadResponse.status}).`);

  await supabaseRest(env, `videos?id=eq.${encodeURIComponent(videoId)}&gallery_id=eq.${encodeURIComponent(gallery.id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ poster_r2_key: key }),
  });

  await recordUploadUsageEvent(env, {
    accountId,
    bytes,
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

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hexFromBuffer(digest);
}

async function passwordMatches(gallery, password) {
  const stored = String(gallery.password_hash || '');
  if (!stored) return { error: 'This gallery needs a password reset before it can be unlocked.', ok: false };
  if (stored.startsWith('ui-configured:')) {
    return {
      error: 'This gallery password was configured before unlock was wired. Reset the password in gallery settings.',
      ok: false,
    };
  }
  if (stored.startsWith('plain:')) return { ok: stored.slice(6) === password };
  if (stored.startsWith('sha256:')) {
    const [, salt, hash] = stored.split(':');
    if (!salt || !hash) return { error: 'This gallery needs a password reset before it can be unlocked.', ok: false };
    return { ok: await sha256Hex(`${salt}:${password}`) === hash };
  }
  return { ok: stored === password };
}

async function publicGalleryPayload(env, gallery) {
  const videos = await supabaseRest(env, `videos?select=id,title,duration_seconds,r2_key,stream_uid,stream_ready,web_copy_r2_key,poster_r2_key,processing_status,download_enabled,visible_in_gallery,paid_unlock_enabled,paid_unlock_price_cents,paid_unlock_currency,paid_unlock_label,paid_unlock_tagline,paid_unlock_trailer&gallery_id=eq.${encodeURIComponent(gallery.id)}&visible_in_gallery=eq.true&deleted_at=is.null&order=sort_order.asc`);
  const publishableVideos = videos.filter((video) => video.processing_status === 'ready' || (video.processing_status == null && video.stream_ready !== false));
  const photos = await supabaseRest(env, `photos?select=id,album_id,r2_key,width,height&gallery_id=eq.${encodeURIComponent(gallery.id)}&deleted_at=is.null&order=sort_order.asc`);
  const design = await supabaseRest(env, `gallery_design?select=*&gallery_id=eq.${encodeURIComponent(gallery.id)}&limit=1`);
  const branding = await supabaseRest(env, `vendor_branding?select=studio_name,tagline,accent_color,custom_domain&account_id=eq.${encodeURIComponent(gallery.account_id)}&limit=1`);
  const designRow = design?.[0] ?? null;
  const mediaKeys = [
    designRow?.background_r2_key,
    ...publishableVideos.flatMap((video) => video.paid_unlock_enabled ? [video.poster_r2_key] : [video.r2_key, video.web_copy_r2_key, video.poster_r2_key]),
    ...photos.map((photo) => photo.r2_key),
  ];
  const media = await publicSignedMediaUrls(env, gallery, mediaKeys);
  const stream = await streamPlaybackUrls(env, publishableVideos);

  return {
    gallery: {
      accessType: gallery.access_type,
      allowDownloads: designRow?.allow_downloads ?? true,
      clientName: gallery.client_name,
      design: designRow,
      eventDate: gallery.event_date,
      name: gallery.name,
      photos,
      slug: gallery.slug,
      status: gallery.status,
      videos: publishableVideos,
    },
    media,
    stream,
    workspace: {
      accentColor: branding?.[0]?.accent_color ?? '#FFB24D',
      customDomain: branding?.[0]?.custom_domain ?? null,
      studioName: branding?.[0]?.studio_name ?? 'Lanterna Studio',
      tagline: branding?.[0]?.tagline ?? null,
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
  const message = String(body.message || '').trim() || 'Your gallery is ready.';
  const subject = String(body.subject || `${gallery.name} is ready`);

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
        html: deliveryEmailHtml(message, deliveryLink),
        subject,
        text: `${message}\n\nOpen your gallery: ${deliveryLink}`,
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
    if (request.method === 'POST' && path === 'upload/complete') return await uploadComplete(request, env);
    if (request.method === 'POST' && path === 'media/process-ready') return await processReady(request, env);
    if (request.method === 'POST' && path === 'background/slot') return await backgroundSlot(request, env);
    if (request.method === 'POST' && path === 'background/complete') return await backgroundComplete(request, env);
    if (request.method === 'POST' && path === 'poster/slot') return await posterSlot(request, env);
    if (request.method === 'POST' && path === 'poster/complete') return await posterComplete(request, env);
    if (request.method === 'POST' && path === 'poster/capture-frame') return await posterCaptureFrame(request, env);
    if (request.method === 'POST' && path === 'media/urls') return await mediaUrls(request, env);
    if (request.method === 'POST' && path === 'stream/playback') return await streamPlayback(request, env);
    if (request.method === 'POST' && path === 'gallery/publish') return await publishGallery(request, env);
    if (request.method === 'POST' && path === 'delivery/record') return await deliveryRecord(request, env);
    if (request.method === 'POST' && path === 'stripe/webhook') return await stripeWebhook(request, env);
    if (request.method === 'GET' && path.startsWith('public/gallery/') && path.endsWith('/paid-unlock/session')) return await paidUnlockSession(request, env, path.replace(/^public\/gallery\//, '').replace(/\/paid-unlock\/session$/, ''));
    if (request.method === 'POST' && path.startsWith('public/gallery/') && path.endsWith('/paid-unlock/recover')) return await recoverPaidUnlock(request, env, path.replace(/^public\/gallery\//, '').replace(/\/paid-unlock\/recover$/, ''));
    if (request.method === 'POST' && path.startsWith('public/gallery/') && path.endsWith('/paid-unlock/checkout')) return await createPaidUnlockCheckout(request, env, path.replace(/^public\/gallery\//, '').replace(/\/paid-unlock\/checkout$/, ''));
    if (request.method === 'POST' && path.startsWith('public/gallery/') && path.endsWith('/unlock')) return await publicGalleryUnlock(request, env, path.replace(/^public\/gallery\//, '').replace(/\/unlock$/, ''));
    if (request.method === 'GET' && path.startsWith('public/gallery/')) return await publicGallery(request, env, path.replace(/^public\/gallery\//, ''));

    return errorJson('API route not found.', 404);
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : 'Lanterna API request failed.', 400);
  }
}
