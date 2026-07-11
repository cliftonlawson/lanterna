import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireEnv } from './http.js';

const MIB = 1024 * 1024;
const MIN_PART_SIZE = 5 * MIB;
const MAX_PART_SIZE = 5 * 1024 * MIB;
const MAX_PARTS = 10_000;
const DEFAULT_PART_SIZE = 64 * MIB;
const DEFAULT_PART_URL_TTL_SECONDS = 3600;

function requiredR2Env(env) {
  requireEnv(env, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']);
}

function r2Client(env) {
  requiredR2Env(env);
  return new S3Client({
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function roundUpToMib(value) {
  return Math.ceil(value / MIB) * MIB;
}

export function multipartPartSize(env, bytesTotal) {
  const configured = positiveInteger(env.R2_MULTIPART_PART_SIZE_BYTES, DEFAULT_PART_SIZE);
  const minimumForPartLimit = roundUpToMib(Math.ceil(Number(bytesTotal || 0) / MAX_PARTS));
  return Math.min(Math.max(configured, MIN_PART_SIZE, minimumForPartLimit), MAX_PART_SIZE);
}

export function multipartPartCount(bytesTotal, partSize) {
  const bytes = positiveInteger(bytesTotal, 0);
  const size = positiveInteger(partSize, 0);
  if (!bytes || !size) throw new Error('Multipart upload size and part size must be positive integers.');
  const count = Math.ceil(bytes / size);
  if (count > MAX_PARTS) throw new Error('Multipart upload exceeds the 10,000 part limit.');
  return count;
}

export function validateMultipartParts(parts, bytesTotal, partSize) {
  const expectedCount = multipartPartCount(bytesTotal, partSize);
  const ordered = [...parts].sort((left, right) => left.partNumber - right.partNumber);
  if (ordered.length !== expectedCount) {
    throw new Error(`Multipart upload has ${ordered.length} of ${expectedCount} required parts.`);
  }

  let verifiedBytes = 0;
  ordered.forEach((part, index) => {
    const expectedPartNumber = index + 1;
    if (part.partNumber !== expectedPartNumber || !part.etag) {
      throw new Error(`Multipart upload is missing part ${expectedPartNumber}.`);
    }

    const expectedSize = index === ordered.length - 1
      ? Number(bytesTotal) - partSize * index
      : partSize;
    if (part.size !== expectedSize) {
      throw new Error(`Multipart part ${part.partNumber} has an unexpected size.`);
    }
    verifiedBytes += part.size;
  });

  if (verifiedBytes !== Number(bytesTotal)) {
    throw new Error('Multipart upload byte total does not match the reserved upload size.');
  }

  return ordered;
}

export function r2ObjectNotFound(error) {
  return error?.name === 'NotFound'
    || error?.name === 'NoSuchKey'
    || error?.$metadata?.httpStatusCode === 404;
}

export function r2MultipartNotFound(error) {
  return error?.name === 'NoSuchUpload'
    || error?.$metadata?.httpStatusCode === 404;
}

export async function createR2MultipartUpload(env, { contentType, key }) {
  const response = await r2Client(env).send(new CreateMultipartUploadCommand({
    Bucket: env.R2_BUCKET_NAME,
    ContentType: contentType,
    Key: key,
  }));
  if (!response.UploadId) throw new Error('R2 did not return a multipart upload id.');

  return {
    key,
    uploadId: response.UploadId,
  };
}

export async function createR2UploadPartUrl(env, { key, partNumber, uploadId }) {
  const expiresIn = positiveInteger(env.R2_MULTIPART_PART_URL_TTL_SECONDS, DEFAULT_PART_URL_TTL_SECONDS);
  const url = await getSignedUrl(
    r2Client(env),
    new UploadPartCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      PartNumber: partNumber,
      UploadId: uploadId,
    }),
    { expiresIn },
  );

  return {
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    headers: {},
    method: 'PUT',
    partNumber,
    url,
  };
}

export async function listR2MultipartParts(env, { key, uploadId }) {
  const client = r2Client(env);
  const parts = [];
  let marker;

  do {
    const response = await client.send(new ListPartsCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      PartNumberMarker: marker,
      UploadId: uploadId,
    }));
    parts.push(...(response.Parts ?? []).map((part) => ({
      etag: part.ETag,
      partNumber: Number(part.PartNumber),
      size: Number(part.Size),
    })));
    marker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
  } while (marker != null);

  return parts;
}

export async function completeR2MultipartUpload(env, { key, parts, uploadId }) {
  const response = await r2Client(env).send(new CompleteMultipartUploadCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    MultipartUpload: {
      Parts: parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })),
    },
    UploadId: uploadId,
  }));

  return {
    etag: response.ETag ?? null,
    key,
  };
}

export async function headR2Object(env, key) {
  try {
    const response = await r2Client(env).send(new HeadObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    }));
    return {
      bytes: Number(response.ContentLength ?? 0),
      contentType: response.ContentType ?? '',
      etag: response.ETag ?? null,
      exists: true,
      key,
    };
  } catch (error) {
    if (r2ObjectNotFound(error)) return { exists: false, key };
    throw error;
  }
}

export async function abortR2MultipartUpload(env, { key, uploadId }) {
  try {
    await r2Client(env).send(new AbortMultipartUploadCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    }));
    return true;
  } catch (error) {
    if (r2MultipartNotFound(error)) return false;
    throw error;
  }
}

export async function deleteR2Object(env, key) {
  await r2Client(env).send(new DeleteObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  }));
}
