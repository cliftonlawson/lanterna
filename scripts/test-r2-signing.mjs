import assert from 'node:assert/strict';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createR2PresignedGetUrl } from '../src/server/r2Signing.js';

const env = {
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_ACCOUNT_ID: 'test-account',
  R2_BUCKET_NAME: 'test-bucket',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
};
const key = 'account/gallery/films/video/original.mov';
const now = new Date('2026-07-17T03:30:00Z');
const responseContentDisposition = 'attachment; filename="wedding-film.mov"';
const client = new S3Client({
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
});

const expected = new URL(await getSignedUrl(client, new GetObjectCommand({
  Bucket: env.R2_BUCKET_NAME,
  Key: key,
  ResponseContentDisposition: responseContentDisposition,
}), { expiresIn: 900, signingDate: now }));
const actual = new URL((await createR2PresignedGetUrl(env, {
  expiresInSeconds: 900,
  key,
  now,
  responseContentDisposition,
})).url);

assert.equal(actual.host, expected.host);
assert.equal(actual.pathname, expected.pathname);
assert.equal(actual.searchParams.get('response-content-disposition'), responseContentDisposition);
assert.equal(actual.searchParams.get('X-Amz-Signature'), expected.searchParams.get('X-Amz-Signature'));

console.log('R2 attachment signing test passed.');
