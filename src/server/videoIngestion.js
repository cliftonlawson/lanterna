import { createStreamCopy, deleteStreamVideo, streamCopySourceTtlSeconds } from './cloudflareStream.js';
import { createR2PresignedGetUrl } from './r2Signing.js';

export class StreamCopyStartError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'StreamCopyStartError';
  }
}

function safeProviderMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'Cloudflare Stream copy failed.');
  return message.replace(/https:\/\/\S+/g, '[source URL hidden]').slice(0, 500);
}

export async function startStreamCopyFromMaster({ env, job, onAccepted, onFailure }, dependencies = {}) {
  const createSourceUrl = dependencies.createSourceUrl ?? createR2PresignedGetUrl;
  const copyToStream = dependencies.copyToStream ?? createStreamCopy;
  const removeStreamVideo = dependencies.removeStreamVideo ?? deleteStreamVideo;
  const ttlSeconds = streamCopySourceTtlSeconds(env);
  let streamUid = null;

  try {
    const source = await createSourceUrl(env, {
      expiresInSeconds: ttlSeconds,
      key: job.r2Key,
    });
    const stream = await copyToStream(env, {
      accountId: job.accountId,
      fileName: job.fileName,
      galleryId: job.galleryId,
      sourceUrl: source.url,
      uploadJobId: job.uploadJobId,
      videoId: job.videoId,
    });
    streamUid = stream.uid;
    await onAccepted({
      sourceExpiresAt: source.expiresAt,
      streamUid,
    });

    return {
      sourceExpiresAt: source.expiresAt,
      streamUid,
      ttlSeconds,
    };
  } catch (error) {
    if (streamUid) {
      await removeStreamVideo(env, streamUid).catch(() => undefined);
    }
    const message = safeProviderMessage(error);
    await onFailure(message);
    throw new StreamCopyStartError(message, error);
  }
}
