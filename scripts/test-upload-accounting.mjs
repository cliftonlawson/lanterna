import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bytesToGb,
  UploadVerificationError,
  verifyDirectR2Object,
} from '../src/server/uploadAccounting.js';
import { createR2PresignedPutUrl } from '../src/server/r2Signing.js';

const verifiedJob = {
  bytes_total: 3_749_378_168,
  content_type: 'video/quicktime',
};

assert.equal(bytesToGb(3_749_378_168), 3.749378168);
assert.equal(bytesToGb(4_000_000), 0.004);
assert.equal(bytesToGb(0), 0);

assert.deepEqual(
  verifyDirectR2Object(verifiedJob, {
    bytes: 3_749_378_168,
    contentType: 'video/quicktime',
    exists: true,
  }),
  { contentType: 'video/quicktime', verifiedBytes: 3_749_378_168 },
);

assert.throws(
  () => verifyDirectR2Object(verifiedJob, { exists: false }),
  (error) => error instanceof UploadVerificationError && error.code === 'upload_object_missing',
);
assert.throws(
  () => verifyDirectR2Object(verifiedJob, {
    bytes: 1,
    contentType: 'video/quicktime',
    exists: true,
  }),
  (error) => error instanceof UploadVerificationError
    && error.code === 'upload_size_mismatch'
    && error.expectedBytes === 3_749_378_168
    && error.verifiedBytes === 1,
);
assert.throws(
  () => verifyDirectR2Object(verifiedJob, {
    bytes: 3_749_378_168,
    contentType: 'application/octet-stream',
    exists: true,
  }),
  (error) => error instanceof UploadVerificationError && error.code === 'upload_content_type_mismatch',
);

const signedPut = await createR2PresignedPutUrl({
  R2_ACCESS_KEY_ID: 'access-key',
  R2_ACCOUNT_ID: 'account-id',
  R2_BUCKET_NAME: 'bucket',
  R2_SECRET_ACCESS_KEY: 'secret-key',
}, {
  contentLength: 4_000_000,
  contentType: 'image/jpeg',
  key: 'account/gallery/photos/photo/original.jpg',
  now: new Date('2026-07-14T12:00:00.000Z'),
});
const signedPutUrl = new URL(signedPut.url);
assert.equal(signedPutUrl.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host');
assert.deepEqual(signedPut.headers, { 'content-type': 'image/jpeg' });

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260714120000_truthful_upload_accounting.sql', import.meta.url),
  'utf8',
);
assert.match(migration, /target_type IN \('video', 'photo', 'background', 'poster'\)/);
assert.match(migration, /prevent_client_gallery_design_asset_state_change/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS bytes bigint/);
assert.match(migration, /p_verified_bytes::numeric \/ 1000000000::numeric/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_verified_r2_upload/);
assert.match(migration, /ON CONFLICT \(upload_job_id\) DO NOTHING/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_verified_r2_upload/);

const apiSource = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
assert.match(apiSource, /completeVerifiedDirectR2Upload/);
assert.match(apiSource, /headR2Object\(env, job\.r2_key\)/);
const functionSource = (name, nextName) => apiSource.slice(
  apiSource.indexOf(`async function ${name}`),
  apiSource.indexOf(`async function ${nextName}`),
);
assert.doesNotMatch(functionSource('uploadComplete', 'clearUploadJob'), /body\.bytes|body\.r2Key/);
const cancelUploadSource = functionSource('cancelUploadJob', 'deleteGalleryMedia');
assert.match(cancelUploadSource, /abortR2MultipartUpload/);
assert.match(cancelUploadSource, /deleteR2Object/);
assert.match(cancelUploadSource, /deleteStreamVideo/);
assert.match(cancelUploadSource, /!job\.is_replacement/);
assert.match(cancelUploadSource, /method: 'DELETE'/);
assert.doesNotMatch(functionSource('backgroundComplete', 'musicSlot'), /body\.bytes|body\.r2Key/);
assert.doesNotMatch(functionSource('posterComplete', 'posterCaptureFrame'), /body\.bytes|body\.r2Key/);

console.log('truthful upload accounting checks passed');
