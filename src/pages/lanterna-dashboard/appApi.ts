import { supabase } from '../../lib/supabase';
import type { DashboardGallery, WorkspaceAccount } from './model';
import { photoDatabaseId, videoDatabaseId } from './schemaMapper';

type NotifyDeliveryInput = {
  deliveryLink: string;
  gallery: DashboardGallery;
  recipients: string[];
  workspace: WorkspaceAccount;
};

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
    throw new Error(payload?.error ?? `Lanterna API failed (${response.status})`);
  }

  return await response.json() as T;
}

async function postOptionalApi(path: string, body: unknown) {
  const token = await sessionToken();
  if (!token) return null;

  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function notifyDeliveryRecipients({ deliveryLink, gallery, recipients, workspace }: NotifyDeliveryInput) {
  if (!recipients.length) return null;

  return postOptionalApi('/api/delivery/notify', {
    deliveryLink,
    galleryId: gallery.id,
    message: gallery.deliveryDraft.message,
    recipients,
    subject: `${gallery.name} is ready`,
    workspaceName: workspace.studioName,
  });
}

export async function publishGallery(galleryId: string) {
  return postApi<{ gallery: { id: string; status: 'published' | 'delivered' }; ok: boolean }>('/api/gallery/publish', {
    galleryId,
  });
}

export async function recordGalleryDelivery(input: {
  galleryId: string;
  message: string;
  recipients: string[];
}) {
  return postApi<{ deliveryId: string; gallery: { id: string; status: 'delivered' }; ok: boolean }>('/api/delivery/record', input);
}

type UploadTargetType = 'video' | 'photo';

type CreateUploadSlotInput = {
  bytesTotal: number;
  contentType: string;
  fileName: string;
  galleryId: string;
  targetId: string;
  targetType: UploadTargetType;
};

type UploadSlotResponse = {
  galleryId: string;
  r2: {
    headers: Record<string, string>;
    key: string;
    method: 'PUT';
    url: string;
  };
  stream: null | {
    protocol?: 'post' | 'tus';
    streamUploadId?: string;
    url?: string;
  };
  targetId: string;
  targetType: UploadTargetType;
  uploadJobId: string;
};

export async function createUploadSlot(input: CreateUploadSlotInput) {
  const targetId = input.targetType === 'video' ? videoDatabaseId(input.targetId) : photoDatabaseId(input.targetId);

  return postApi<UploadSlotResponse>('/api/upload/slot', {
    bytesTotal: input.bytesTotal,
    contentType: input.contentType,
    fileName: input.fileName,
    galleryId: input.galleryId,
    targetId,
    targetType: input.targetType,
  });
}

type CompleteUploadInput = {
  bytes: number;
  galleryId: string;
  r2Key?: string | null;
  stageReplacement?: boolean;
  streamUid?: string | null;
  targetId: string;
  targetType: UploadTargetType;
  uploadJobId: string;
};

export async function completeUpload(input: CompleteUploadInput) {
  const targetId = input.targetType === 'video' ? videoDatabaseId(input.targetId) : photoDatabaseId(input.targetId);

  return postApi<{ ok: boolean }>('/api/upload/complete', {
    bytes: input.bytes,
    galleryId: input.galleryId,
    r2Key: input.r2Key,
    stageReplacement: input.stageReplacement,
    streamUid: input.streamUid,
    targetId,
    targetType: input.targetType,
    uploadJobId: input.uploadJobId,
  });
}

export async function processUploadedVideos(galleryId: string, videoId?: string) {
  return postApi<{ checked: number; pending: number; processed: number; processedVideoIds: string[] }>('/api/media/process-ready', {
    galleryId,
    videoId: videoId ? videoDatabaseId(videoId) : undefined,
  });
}

type BackgroundSlotResponse = {
  galleryId: string;
  r2: UploadSlotResponse['r2'];
};

export async function createBackgroundUploadSlot(input: {
  contentType: string;
  fileName: string;
  galleryId: string;
}) {
  return postApi<BackgroundSlotResponse>('/api/background/slot', {
    contentType: input.contentType,
    fileName: input.fileName,
    galleryId: input.galleryId,
  });
}

export async function completeBackgroundUpload(input: {
  bytes: number;
  galleryId: string;
  r2Key: string;
}) {
  return postApi<{ ok: boolean; r2Key: string }>('/api/background/complete', {
    bytes: input.bytes,
    galleryId: input.galleryId,
    r2Key: input.r2Key,
  });
}

export async function createPosterUploadSlot(input: {
  contentType: string;
  fileName: string;
  galleryId: string;
  videoId: string;
}) {
  return postApi<BackgroundSlotResponse & { videoId: string }>('/api/poster/slot', {
    contentType: input.contentType,
    fileName: input.fileName,
    galleryId: input.galleryId,
    videoId: videoDatabaseId(input.videoId),
  });
}

export async function completePosterUpload(input: {
  bytes: number;
  galleryId: string;
  r2Key: string;
  videoId: string;
}) {
  return postApi<{ ok: boolean; r2Key: string }>('/api/poster/complete', {
    bytes: input.bytes,
    galleryId: input.galleryId,
    r2Key: input.r2Key,
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
  gallery: {
    accessType: string;
    allowDownloads: boolean;
    clientName: string | null;
    design: Record<string, unknown> | null;
    eventDate: string | null;
    name: string;
    photos: Array<Record<string, unknown>>;
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

export async function verifyPaidUnlockSession(slug: string, sessionId: string) {
  const response = await fetch(`/api/public/gallery/${encodeURIComponent(slug)}/paid-unlock/session?session_id=${encodeURIComponent(sessionId)}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error ?? payload?.message ?? `Unlock verification failed (${response.status})`;
    throw new Error(message);
  }

  return payload as PaidUnlockSessionPayload;
}

export function putFileToR2(
  file: File,
  r2: UploadSlotResponse['r2'],
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

export function postFileToStream(
  file: File,
  stream: NonNullable<UploadSlotResponse['stream']>,
  onProgress: (bytesUploaded: number) => void,
) {
  if (!stream.url) throw new Error('Cloudflare Stream upload URL is missing.');
  if (stream.protocol === 'tus') return uploadFileToStreamTus(file, stream.url, onProgress);

  const uploadUrl = stream.url;

  onProgress(Math.max(1, Math.round(file.size * 0.02)));

  const body = new FormData();
  body.set('file', file, file.name);

  return fetch(uploadUrl, {
    body,
    method: 'POST',
  }).then(async (response) => {
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Cloudflare Stream upload failed (${response.status})${details ? `: ${details.slice(0, 220)}` : ''}`);
    }
    onProgress(file.size);
  }).catch((error) => {
    if (error instanceof Error && error.message.startsWith('Cloudflare Stream upload failed')) throw error;
    throw new Error('Cloudflare Stream upload failed. Falling back to R2 original upload.');
  });
}

function uploadFileToStreamTus(
  file: File,
  uploadUrl: string,
  onProgress: (bytesUploaded: number) => void,
) {
  const chunkSize = 50 * 1024 * 1024;
  const retryDelays = [0, 1000, 3000, 5000];

  const uploadChunk = (offset: number, attempt = 0): Promise<void> => {
    if (offset >= file.size) {
      onProgress(file.size);
      return Promise.resolve();
    }

    const end = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, end);

    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PATCH', uploadUrl);
      request.setRequestHeader('content-type', 'application/offset+octet-stream');
      request.setRequestHeader('tus-resumable', '1.0.0');
      request.setRequestHeader('upload-offset', String(offset));

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(offset + event.loaded);
      };

      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          const nextOffset = Number(request.getResponseHeader('upload-offset') || end);
          onProgress(Math.min(nextOffset, file.size));
          resolve(uploadChunk(nextOffset, 0));
          return;
        }

        const retryDelay = retryDelays[attempt];
        if (retryDelay != null) {
          window.setTimeout(() => {
            void uploadChunk(offset, attempt + 1).then(resolve).catch(reject);
          }, retryDelay);
          return;
        }

        reject(new Error(`Cloudflare Stream tus upload failed (${request.status})`));
      };

      request.onerror = () => {
        const retryDelay = retryDelays[attempt];
        if (retryDelay != null) {
          window.setTimeout(() => {
            void uploadChunk(offset, attempt + 1).then(resolve).catch(reject);
          }, retryDelay);
          return;
        }

        reject(new Error('Cloudflare Stream tus upload failed.'));
      };

      request.send(chunk);
    });
  };

  return uploadChunk(0).catch((error) => {
    if (error instanceof Error && error.message.startsWith('Cloudflare Stream tus upload failed')) throw error;
    throw new Error('Cloudflare Stream upload failed. Falling back to R2 original upload.');
  });
}
