import { requireEnv } from './http.js';

const STREAM_SIGNING_TTL_SECONDS = 3600;

function streamAllowedOrigins(env) {
  return String(env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).host;
      } catch {
        return origin;
      }
    });
}

async function readProviderPayload(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || payload?.error || `Cloudflare Stream request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function base64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Json(value) {
  const binary = atob(String(value || ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function streamPlayerBase(env) {
  const configuredBase = String(env.CLOUDFLARE_STREAM_IFRAME_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configuredBase) return configuredBase;

  const customerCode = String(env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '').trim();
  if (customerCode) return `https://customer-${customerCode}.cloudflarestream.com`;

  return 'https://iframe.videodelivery.net';
}

export function streamIframeUrl(env, signedToken) {
  const base = streamPlayerBase(env);
  if (base.includes('cloudflarestream.com')) return `${base}/${signedToken}/iframe`;
  return `${base}/${signedToken}`;
}

export function streamThumbnailUrl(env, signedToken) {
  const base = streamPlayerBase(env).replace(/^https:\/\/iframe\./, 'https://');
  return `${base}/${signedToken}/thumbnails/thumbnail.jpg`;
}

export async function createStreamSignedToken(env, streamUid, options = {}) {
  requireEnv(env, ['CLOUDFLARE_STREAM_SIGNING_KEY_ID', 'CLOUDFLARE_STREAM_SIGNING_JWK']);
  if (!streamUid) throw new Error('Stream uid is required.');

  const expiresInSeconds = Number(options.expiresInSeconds || STREAM_SIGNING_TTL_SECONDS);
  const keyId = String(env.CLOUDFLARE_STREAM_SIGNING_KEY_ID);
  const privateJwk = decodeBase64Json(env.CLOUDFLARE_STREAM_SIGNING_JWK);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: keyId, typ: 'JWT' };
  const payload = {
    exp: now + expiresInSeconds,
    kid: keyId,
    sub: streamUid,
    ...(options.downloadable ? { downloadable: true } : {}),
  };
  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedToken));
  return {
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    token: `${unsignedToken}.${base64Url(new Uint8Array(signature))}`,
  };
}

export async function createStreamPlayback(env, streamUid, options = {}) {
  const signed = await createStreamSignedToken(env, streamUid, options);
  return {
    expiresAt: signed.expiresAt,
    iframeUrl: streamIframeUrl(env, signed.token),
    provider: 'cloudflare-stream',
    streamUid,
    thumbnailUrl: streamThumbnailUrl(env, signed.token),
  };
}

export async function createStreamDirectUpload(env, input = {}, fetchImpl = fetch) {
  requireEnv(env, ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_STREAM_API_TOKEN']);

  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...(streamAllowedOrigins(env).length > 0 ? { allowedOrigins: streamAllowedOrigins(env) } : {}),
      expiry: new Date(Date.now() + Number(env.STREAM_UPLOAD_URL_TTL_SECONDS || 3600) * 1000).toISOString(),
      maxDurationSeconds: Number(env.STREAM_MAX_DURATION_SECONDS || 14400),
      meta: {
        accountId: input.accountId,
        galleryId: input.galleryId,
        targetId: input.targetId,
      },
      requireSignedURLs: true,
    }),
  });

  const payload = await readProviderPayload(response);
  return {
    expiresAt: payload.result?.expiry,
    provider: 'cloudflare-stream',
    protocol: 'post',
    streamUploadId: payload.result?.uid,
    url: payload.result?.uploadURL,
  };
}

function streamUploadMetadata(input = {}, env = {}) {
  const expiresAt = new Date(Date.now() + Number(env.STREAM_UPLOAD_URL_TTL_SECONDS || 3600) * 1000).toISOString();
  const metadata = {
    accountId: input.accountId,
    expiry: expiresAt,
    galleryId: input.galleryId,
    maxDurationSeconds: String(Number(env.STREAM_MAX_DURATION_SECONDS || 14400)),
    name: input.fileName,
    targetId: input.targetId,
  };

  const entries = Object.entries(metadata)
    .filter(([, value]) => value != null && String(value).trim())
    .map(([key, value]) => `${key} ${btoa(String(value))}`);

  const origins = streamAllowedOrigins(env);
  if (origins.length) entries.push(`allowedorigins ${btoa(origins.join(','))}`);
  entries.push('requiresignedurls');
  return entries.join(',');
}

export async function createStreamTusUpload(env, input = {}, fetchImpl = fetch) {
  requireEnv(env, ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_STREAM_API_TOKEN']);

  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}`,
      'tus-resumable': '1.0.0',
      'upload-length': String(input.bytesTotal || 0),
      'upload-metadata': streamUploadMetadata(input, env),
    },
  });

  if (!response.ok) await readProviderPayload(response);

  const streamUploadId = response.headers.get('stream-media-id');
  const url = response.headers.get('location');
  if (!streamUploadId || !url) throw new Error('Cloudflare Stream tus upload URL is missing.');

  return {
    provider: 'cloudflare-stream',
    protocol: 'tus',
    streamUploadId,
    url,
  };
}

export async function getStreamVideo(env, streamUid, fetchImpl = fetch) {
  requireEnv(env, ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_STREAM_API_TOKEN']);
  if (!streamUid) throw new Error('Stream uid is required.');

  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/${encodeURIComponent(streamUid)}`, {
    headers: { authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}` },
  });
  const payload = await readProviderPayload(response);
  return payload.result;
}
