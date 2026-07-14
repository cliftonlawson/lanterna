import { requireEnv, safeSlug } from './http.js';

function utf8(value) {
  return new TextEncoder().encode(value);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKeyPath(key) {
  return String(key || '').split('/').map(rfc3986).join('/');
}

async function hmac(key, value, output = 'bytes') {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? utf8(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, utf8(value));
  return output === 'hex' ? hex(signature) : signature;
}

async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', utf8(value)));
}

function amzTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function signingKey(secretAccessKey, dateStamp) {
  const dateKey = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmac(dateKey, 'auto');
  const serviceKey = await hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

export function mediaObjectKey({ accountId, galleryId, objectName = 'original', targetType, targetId, fileName }) {
  const extension = String(fileName || '').split('.').pop()?.toLowerCase();
  const suffix = extension && extension !== fileName.toLowerCase() ? `.${safeSlug(extension)}` : '';
  const folder = targetType === 'photo' ? 'photos' : targetType === 'background' ? 'backgrounds' : 'films';

  return [
    safeSlug(accountId),
    safeSlug(galleryId),
    folder,
    safeSlug(targetId),
    `${safeSlug(objectName)}${suffix}`,
  ].join('/');
}

async function createR2PresignedUrl(env, {
  contentLength,
  contentType,
  expiresInSeconds,
  key,
  method,
  now,
}) {
  requireEnv(env, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']);
  if (!key) throw new Error('R2 object key is required.');

  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucket = env.R2_BUCKET_NAME;
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const credential = `${env.R2_ACCESS_KEY_ID}/${credentialScope}`;
  const signsContentType = method === 'PUT' && contentType;
  const signsContentLength = method === 'PUT' && Number.isSafeInteger(contentLength) && contentLength > 0;
  const headerValues = {
    ...(signsContentLength ? { 'content-length': String(contentLength) } : {}),
    ...(signsContentType ? { 'content-type': contentType } : {}),
    host,
  };
  const signedHeaders = Object.keys(headerValues).sort().join(';');
  const canonicalHeaders = Object.entries(headerValues)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');
  const canonicalUri = `/${encodeKeyPath(bucket)}/${encodeKeyPath(key)}`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${rfc3986(name)}=${rfc3986(value)}`)
    .join('&');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256(canonicalRequest)].join('\n');
  const signature = await hmac(await signingKey(env.R2_SECRET_ACCESS_KEY, dateStamp), stringToSign, 'hex');

  return {
    bucket,
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    headers: signsContentType ? { 'content-type': contentType } : {},
    key,
    method,
    provider: 'r2',
    url: `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
  };
}

export async function createR2PresignedPutUrl(env, { key, contentLength, contentType, expiresInSeconds = 900, now = new Date() }) {
  return createR2PresignedUrl(env, { contentLength, contentType, expiresInSeconds, key, method: 'PUT', now });
}

export async function createR2PresignedGetUrl(env, { key, expiresInSeconds = 600, now = new Date() }) {
  return createR2PresignedUrl(env, { expiresInSeconds, key, method: 'GET', now });
}
