import { supabase } from '../../lib/supabase';
import { photoDatabaseId, videoDatabaseId } from './schemaMapper';

async function sessionToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function postApi<T>(path: string, body: unknown) {
  const token = await sessionToken();
  if (!token) throw new Error('Sign in before uploading files.');

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `LANTERNA API failed (${response.status})`);
  }

  return await response.json() as T;
}

async function getApi<T>(path: string) {
  const token = await sessionToken();
  if (!token) throw new Error('Sign in to continue.');

  const response = await fetch(path, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `LANTERNA API failed (${response.status})`);
  }
  return await response.json() as T;
}

export type ConnectStatus = {
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
  sales: {
    grossCents: number;
    lanternaFeeCents: number;
    salesCount: number;
    studioEarningsCents: number;
  };
  state: 'not_connected' | 'pending' | 'restricted' | 'active';
};

export async function getConnectStatus() {
  return getApi<ConnectStatus>('/api/connect/status');
}

export async function startConnectOnboarding() {
  return postApi<{ onboardingUrl: string }>('/api/connect/onboarding', {});
}

export async function createGalleryRemote(input: {
  accessType: 'public' | 'password' | 'private';
  clientName: string;
  eventDate: string | null;
  name: string;
  password: string | null;
  projectType: 'wedding' | 'engagement' | 'portrait';
}) {
  return postApi<{
    gallery: {
      accessType: 'public' | 'password' | 'private';
      clientName: string;
      eventDate: string | null;
      id: string;
      name: string;
      passwordSet: boolean;
      projectType: 'wedding' | 'engagement' | 'portrait';
      slug: string;
      status: 'draft';
    };
    ok: boolean;
  }>('/api/gallery/create', input);
}

export async function setGalleryAccessRemote(
  galleryId: string,
  accessType: 'public' | 'password' | 'private',
  password?: string,
) {
  return postApi<{
    gallery: {
      accessType: 'public' | 'password' | 'private';
      id: string;
      passwordSet: boolean;
    };
    ok: boolean;
  }>('/api/gallery/access', { accessType, galleryId, password });
}

export async function publishGallery(galleryId: string) {
  return postApi<{ gallery: { id: string; status: 'published' | 'delivered' }; ok: boolean }>('/api/gallery/publish', {
    galleryId,
  });
}

export async function setGalleryArchivedRemote(galleryId: string, archived: boolean) {
  return postApi<{ gallery: { archivedAt: string | null; id: string }; ok: boolean }>('/api/gallery/archive', {
    archived,
    galleryId,
  });
}

export async function deleteGalleryPermanentlyRemote(galleryId: string) {
  return postApi<{
    alreadyDeleted: boolean;
    deletedAt: string;
    galleryId: string;
    ok: boolean;
    purgeTaskId: string;
  }>('/api/gallery/delete', { galleryId });
}

export async function recordGalleryDelivery(input: {
  galleryId: string;
  message: string;
  recipients: string[];
}) {
  return postApi<{ deliveryId: string; emails: Array<{ id: string; provider: string; status: string; to: string }>; gallery: { id: string; status: 'delivered' }; ok: boolean }>('/api/delivery/record', input);
}

type UploadTargetType = 'video' | 'photo';

type CreateUploadSlotInput = {
  bytesTotal: number;
  contentType: string;
  fileName: string;
  galleryId: string;
  resumeUploadJobId?: string;
  targetId: string;
  targetType: UploadTargetType;
};

type R2PutSlot = {
  headers: Record<string, string>;
  key: string;
  method: 'PUT';
  url: string;
};

export type R2MultipartSlot = {
  key: string;
  method: 'MULTIPART';
  partSize: number;
  provider: 'r2';
};

type UploadSlotResponse = {
  galleryId: string;
  r2: R2PutSlot | R2MultipartSlot;
  resumed?: boolean;
  stream: null;
  targetId: string;
  targetType: UploadTargetType;
  uploadJobId: string;
  uploadPhase?: VideoUploadPhase;
};

export async function createUploadSlot(input: CreateUploadSlotInput) {
  const targetId = input.targetType === 'video' ? videoDatabaseId(input.targetId) : photoDatabaseId(input.targetId);

  return postApi<UploadSlotResponse>('/api/upload/slot', {
    bytesTotal: input.bytesTotal,
    contentType: input.contentType,
    fileName: input.fileName,
    galleryId: input.galleryId,
    resumeUploadJobId: input.resumeUploadJobId,
    targetId,
    targetType: input.targetType,
  });
}

type CompleteUploadInput = {
  galleryId: string;
  targetId: string;
  targetType: 'photo';
  uploadJobId: string;
};

export async function completeUpload(input: CompleteUploadInput) {
  const targetId = photoDatabaseId(input.targetId);

  return postApi<{
    alreadyCompleted: boolean;
    ok: boolean;
    r2Key: string;
    usageRecorded: boolean;
    verifiedBytes: number;
  }>('/api/upload/complete', {
    galleryId: input.galleryId,
    targetId,
    targetType: input.targetType,
    uploadJobId: input.uploadJobId,
  });
}

export type VideoUploadPhase = 'uploading_master' | 'master_secured' | 'starting_playback' | 'preparing_playback' | 'copy_failed' | 'ready';

type MultipartStatusResponse = {
  bytesUploaded: number;
  objectComplete: boolean;
  ok: boolean;
  parts: Array<{ partNumber: number; size: number }>;
  uploadJobId: string;
  uploadPhase: VideoUploadPhase;
};

export async function getVideoMultipartStatus(galleryId: string, uploadJobId: string) {
  return postApi<MultipartStatusResponse>('/api/upload/video/status', { galleryId, uploadJobId });
}

export async function pauseVideoMasterUpload(galleryId: string, uploadJobId: string) {
  return postApi<{ ok: boolean; uploadJobId: string; uploadPhase: 'uploading_master' }>('/api/upload/video/pause', {
    galleryId,
    uploadJobId,
  });
}

export async function createVideoUploadPartUrl(galleryId: string, uploadJobId: string, partNumber: number) {
  return postApi<{
    ok: boolean;
    part: {
      expiresAt: string;
      headers: Record<string, string>;
      method: 'PUT';
      partNumber: number;
      url: string;
    };
    uploadJobId: string;
  }>('/api/upload/video/part', { galleryId, partNumber, uploadJobId });
}

export async function completeVideoMasterUpload(galleryId: string, uploadJobId: string) {
  return postApi<{
    alreadyCompleted: boolean;
    isReplacement: boolean;
    ok: boolean;
    r2Key: string;
    uploadJobId: string;
    uploadPhase: 'master_secured';
    usageRecorded: boolean;
    verifiedBytes: number;
  }>('/api/upload/video/complete-master', { galleryId, uploadJobId });
}

export async function startVideoPlaybackPreparation(galleryId: string, uploadJobId: string) {
  return postApi<{
    alreadyStarted?: boolean;
    ok: boolean;
    sourceExpiresAt?: string;
    streamUid: string;
    uploadJobId: string;
    uploadPhase: 'preparing_playback' | 'ready';
  }>('/api/upload/video/start-playback', { galleryId, uploadJobId });
}

export async function processUploadedVideos(galleryId: string, videoId?: string) {
  return postApi<{
    checked: number;
    errored: number;
    erroredVideoIds: string[];
    expiredUploadJobs: number;
    pending: number;
    processed: number;
    processedVideoIds: string[];
  }>('/api/media/process-ready', {
    galleryId,
    videoId: videoId ? videoDatabaseId(videoId) : undefined,
  });
}

export async function clearUploadJobRemote(uploadJobId: string) {
  return postApi<{ ok: boolean; uploadJobId: string }>('/api/upload/clear-job', {
    uploadJobId,
  });
}

export async function deleteGalleryMediaRemote(input: {
  galleryId: string;
  targetId: string;
  targetType: UploadTargetType;
}) {
  const targetId = input.targetType === 'video' ? videoDatabaseId(input.targetId) : photoDatabaseId(input.targetId);

  return postApi<{ ok: boolean; targetId: string; targetType: UploadTargetType }>('/api/media/delete', {
    galleryId: input.galleryId,
    targetId,
    targetType: input.targetType,
  });
}

type BackgroundSlotResponse = {
  galleryId: string;
  r2: R2PutSlot;
  uploadJobId: string;
};

export async function createBackgroundUploadSlot(input: {
  bytesTotal: number;
  contentType: string;
  fileName: string;
  galleryId: string;
}) {
  return postApi<BackgroundSlotResponse>('/api/background/slot', {
    bytesTotal: input.bytesTotal,
    contentType: input.contentType,
    fileName: input.fileName,
    galleryId: input.galleryId,
  });
}

export async function completeBackgroundUpload(input: {
  galleryId: string;
  uploadJobId: string;
}) {
  return postApi<{
    alreadyCompleted: boolean;
    ok: boolean;
    r2Key: string;
    usageRecorded: boolean;
    verifiedBytes: number;
  }>('/api/background/complete', {
    galleryId: input.galleryId,
    uploadJobId: input.uploadJobId,
  });
}

export async function createMusicUploadSlot(input: {
  bytesTotal: number;
  contentType: string;
  fileName: string;
  galleryId: string;
}) {
  return postApi<BackgroundSlotResponse>('/api/music/slot', {
    bytesTotal: input.bytesTotal,
    contentType: input.contentType,
    fileName: input.fileName,
    galleryId: input.galleryId,
  });
}

export async function completeMusicUpload(input: {
  galleryId: string;
  uploadJobId: string;
}) {
  return postApi<{
    alreadyCompleted: boolean;
    ok: boolean;
    r2Key: string;
    usageRecorded: boolean;
    verifiedBytes: number;
  }>('/api/music/complete', {
    galleryId: input.galleryId,
    uploadJobId: input.uploadJobId,
  });
}

export async function createPosterUploadSlot(input: {
  bytesTotal: number;
  contentType: string;
  fileName: string;
  galleryId: string;
  videoId: string;
}) {
  return postApi<BackgroundSlotResponse & { videoId: string }>('/api/poster/slot', {
    bytesTotal: input.bytesTotal,
    contentType: input.contentType,
    fileName: input.fileName,
    galleryId: input.galleryId,
    videoId: videoDatabaseId(input.videoId),
  });
}

export async function completePosterUpload(input: {
  galleryId: string;
  uploadJobId: string;
  videoId: string;
}) {
  return postApi<{
    alreadyCompleted: boolean;
    ok: boolean;
    r2Key: string;
    usageRecorded: boolean;
    verifiedBytes: number;
  }>('/api/poster/complete', {
    galleryId: input.galleryId,
    uploadJobId: input.uploadJobId,
    videoId: videoDatabaseId(input.videoId),
  });
}

export async function capturePosterFrame(input: {
  galleryId: string;
  timeSeconds: number;
  videoId: string;
}) {
  return postApi<{ media: Record<string, SignedMediaUrl>; ok: boolean; posterUrl: string; r2Key: string }>('/api/poster/capture-frame', {
    galleryId: input.galleryId,
    timeSeconds: input.timeSeconds,
    videoId: videoDatabaseId(input.videoId),
  });
}

export type SignedMediaUrl = {
  bucket: string;
  expiresAt: string;
  headers: Record<string, string>;
  key: string;
  method: 'GET';
  provider: 'r2';
  url: string;
};

export type SignedStreamPlayback = {
  expiresAt: string;
  iframeUrl: string;
  provider: 'cloudflare-stream';
  streamUid: string;
  thumbnailUrl?: string;
};

export async function getMediaUrls(keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (!uniqueKeys.length) return {};

  const payload = await postApi<{ media: Record<string, SignedMediaUrl> }>('/api/media/urls', {
    keys: uniqueKeys,
  });

  return Object.fromEntries(Object.entries(payload.media ?? {}).map(([key, signed]) => [key, signed.url]));
}

export async function getStreamPlayback(galleryId: string, streamUids: string[]) {
  const uniqueStreamUids = [...new Set(streamUids.filter(Boolean))];
  if (!uniqueStreamUids.length) return {};

  const payload = await postApi<{ playback: Record<string, SignedStreamPlayback> }>('/api/stream/playback', {
    galleryId,
    streamUids: uniqueStreamUids,
  });

  return payload.playback ?? {};
}

export type PublicGalleryPayload = {
  downloads?: Record<string, SignedMediaUrl>;
  gallery: {
    accessType: string;
    allowDownloads: boolean;
    clientName: string | null;
    design: Record<string, unknown> | null;
    eventDate: string | null;
    name: string;
    photos: Array<Record<string, unknown>>;
    projectType: 'wedding' | 'engagement' | 'portrait' | null;
    slug: string;
    status: string;
    videos: Array<Record<string, unknown>>;
  };
  media: Record<string, SignedMediaUrl>;
  stream?: Record<string, SignedStreamPlayback>;
  workspace: {
    accentColor: string;
    customDomain: string | null;
    studioName: string;
    tagline: string | null;
  };
};

export async function getPublicGallery(slug: string) {
  const response = await fetch(`/api/public/gallery/${encodeURIComponent(slug)}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error ?? payload?.message ?? `Gallery unavailable (${response.status})`;
    const error = new Error(message) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload as PublicGalleryPayload;
}

export async function unlockPublicGallery(slug: string, password: string) {
  const response = await fetch(`/api/public/gallery/${encodeURIComponent(slug)}/unlock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error ?? payload?.message ?? `Gallery unlock failed (${response.status})`;
    const error = new Error(message) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload as PublicGalleryPayload;
}

export type PaidUnlockSessionPayload = {
  buyerEmail: string | null;
  download?: SignedMediaUrl | null;
  downloadAllowed: boolean;
  media: Record<string, SignedMediaUrl>;
  stream?: Record<string, SignedStreamPlayback>;
  videoId: string;
};

export async function createPaidUnlockCheckout(slug: string, videoId: string) {
  const response = await fetch(`/api/public/gallery/${encodeURIComponent(slug)}/paid-unlock/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ videoId }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error ?? payload?.message ?? `Checkout failed (${response.status})`;
    throw new Error(message);
  }

  return payload as { checkoutUrl: string; sessionId: string };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function verifyPaidUnlockSession(slug: string, sessionId: string) {
  let payload: { details?: { code?: string }; error?: string; message?: string } | null = null;
  let response: Response | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch(`/api/public/gallery/${encodeURIComponent(slug)}/paid-unlock/session?session_id=${encodeURIComponent(sessionId)}`);
    payload = await response.json().catch(() => null);
    if (response.ok) return payload as PaidUnlockSessionPayload;

    if (response.status !== 409 || payload?.details?.code !== 'unlock_pending_webhook') break;
    await wait(1000);
  }

  const message = payload?.error ?? payload?.message ?? `Unlock verification failed (${response?.status ?? 0})`;
  throw new Error(message);
}


export async function recoverPaidUnlock(slug: string, videoId: string, email: string) {
  const response = await fetch(`/api/public/gallery/${encodeURIComponent(slug)}/paid-unlock/recover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, videoId }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error ?? payload?.message ?? `Unlock recovery failed (${response.status})`;
    throw new Error(message);
  }

  return payload as PaidUnlockSessionPayload;
}

export function putFileToR2(
  file: File,
  r2: R2PutSlot,
  onProgress: (bytesUploaded: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(r2.method, r2.url);

    Object.entries(r2.headers ?? {}).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size);
        resolve();
      } else {
        reject(new Error(`R2 upload failed (${request.status})`));
      }
    };
    request.onerror = () => reject(new Error('R2 upload failed.'));
    request.send(file);
  });
}

const VIDEO_MULTIPART_CONCURRENCY = 3;
const VIDEO_PART_RETRY_DELAYS = [0, 1000, 3000, 5000];

export async function uploadVideoMasterMultipart(
  file: File,
  input: {
    galleryId: string;
    r2: R2MultipartSlot;
    uploadJobId: string;
  },
  onProgress: (bytesUploaded: number) => void,
  signal?: AbortSignal,
) {
  const status = await getVideoMultipartStatus(input.galleryId, input.uploadJobId);
  if (status.objectComplete || status.uploadPhase !== 'uploading_master') {
    onProgress(status.bytesUploaded);
    return;
  }

  const partCount = Math.ceil(file.size / input.r2.partSize);
  const completedParts = new Map(status.parts.map((part) => [part.partNumber, part.size]));
  const progressByPart = new Map(completedParts);
  const missingParts: number[] = [];

  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    const start = (partNumber - 1) * input.r2.partSize;
    const expectedSize = Math.min(input.r2.partSize, file.size - start);
    if (completedParts.get(partNumber) === expectedSize) continue;
    missingParts.push(partNumber);
  }

  const reportProgress = () => {
    const uploaded = [...progressByPart.values()].reduce((sum, bytes) => sum + bytes, 0);
    onProgress(Math.min(uploaded, file.size));
  };
  reportProgress();

  let queueIndex = 0;
  const worker = async () => {
    while (queueIndex < missingParts.length) {
      if (signal?.aborted) throw new DOMException('Upload paused.', 'AbortError');
      const partNumber = missingParts[queueIndex];
      queueIndex += 1;
      const start = (partNumber - 1) * input.r2.partSize;
      const end = Math.min(start + input.r2.partSize, file.size);
      const part = file.slice(start, end);

      await uploadVideoPartWithRetry({
        blob: part,
        galleryId: input.galleryId,
        onProgress: (bytes) => {
          progressByPart.set(partNumber, bytes);
          reportProgress();
        },
        partNumber,
        signal,
        uploadJobId: input.uploadJobId,
      });
      progressByPart.set(partNumber, part.size);
      reportProgress();
    }
  };

  const workers = Array.from(
    { length: Math.min(VIDEO_MULTIPART_CONCURRENCY, Math.max(missingParts.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  onProgress(file.size);
}

async function uploadVideoPartWithRetry(input: {
  blob: Blob;
  galleryId: string;
  onProgress: (bytesUploaded: number) => void;
  partNumber: number;
  signal?: AbortSignal;
  uploadJobId: string;
}) {
  let lastError: unknown;

  for (let attempt = 0; attempt < VIDEO_PART_RETRY_DELAYS.length; attempt += 1) {
    if (input.signal?.aborted) throw new DOMException('Upload paused.', 'AbortError');
    const delay = VIDEO_PART_RETRY_DELAYS[attempt];
    if (delay > 0) await wait(delay);

    try {
      const signed = await createVideoUploadPartUrl(input.galleryId, input.uploadJobId, input.partNumber);
      await putBlobToSignedUrl(input.blob, signed.part, input.onProgress, input.signal);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`R2 multipart part ${input.partNumber} failed.`);
}

function putBlobToSignedUrl(
  blob: Blob,
  signed: { headers: Record<string, string>; method: 'PUT'; url: string },
  onProgress: (bytesUploaded: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => request.abort();

    request.open(signed.method, signed.url);
    Object.entries(signed.headers ?? {}).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(blob.size);
        finish(resolve);
      } else {
        finish(() => reject(new Error(`R2 multipart part failed (${request.status})`)));
      }
    };
    request.onerror = () => finish(() => reject(new Error('R2 multipart part failed.')));
    request.onabort = () => finish(() => reject(new DOMException('Upload paused.', 'AbortError')));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    request.send(blob);
  });
}
