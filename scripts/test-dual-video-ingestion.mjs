import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  multipartPartCount,
  multipartPartSize,
  validateMultipartParts,
} from '../src/server/r2Multipart.js';
import { createStreamCopy, streamCopySourceTtlSeconds } from '../src/server/cloudflareStream.js';
import { startStreamCopyFromMaster, StreamCopyStartError } from '../src/server/videoIngestion.js';

const MIB = 1024 * 1024;

function multipartParts(bytesTotal, partSize) {
  const count = multipartPartCount(bytesTotal, partSize);
  return Array.from({ length: count }, (_, index) => ({
    etag: `etag-${index + 1}`,
    partNumber: index + 1,
    size: index === count - 1 ? bytesTotal - index * partSize : partSize,
  }));
}

async function run() {
  const bytesTotal = 2.5 * 1024 * 1024 * 1024;
  const partSize = multipartPartSize({}, bytesTotal);
  assert.equal(partSize, 64 * MIB);
  assert.equal(multipartPartCount(bytesTotal, partSize), 40);
  const parts = multipartParts(bytesTotal, partSize);
  assert.equal(validateMultipartParts(parts, bytesTotal, partSize).length, 40);
  assert.throws(
    () => validateMultipartParts(parts.slice(1), bytesTotal, partSize),
    /required parts|missing part/,
  );

  assert.equal(streamCopySourceTtlSeconds({}), 86_400);
  assert.equal(streamCopySourceTtlSeconds({ STREAM_COPY_SOURCE_TTL_SECONDS: '60' }), 3600);
  assert.equal(streamCopySourceTtlSeconds({ STREAM_COPY_SOURCE_TTL_SECONDS: '9999999' }), 604_800);

  let copyRequestBody;
  const copyResult = await createStreamCopy({
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    CLOUDFLARE_STREAM_ALLOWED_ORIGINS: 'http://127.0.0.1:5173,https://deliver.example.com',
    CLOUDFLARE_STREAM_API_TOKEN: 'test-token',
  }, {
    accountId: 'account-id',
    fileName: 'master.mp4',
    galleryId: 'gallery-id',
    sourceUrl: 'https://r2.invalid/presigned-source',
    uploadJobId: 'upload-job-id',
    videoId: 'video-id',
  }, async (_url, request) => {
    copyRequestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ result: { uid: 'stream-uid' }, success: true }), { status: 200 });
  });
  assert.equal(copyResult.uid, 'stream-uid');
  assert.equal(copyRequestBody.input, 'https://r2.invalid/presigned-source');
  assert.equal(copyRequestBody.requireSignedURLs, true);
  assert.deepEqual(copyRequestBody.allowedOrigins, ['127.0.0.1:5173', 'deliver.example.com']);

  const job = {
    accountId: 'account-id',
    fileName: 'master.mp4',
    galleryId: 'gallery-id',
    r2Key: 'account/gallery/films/video/master.mp4',
    uploadJobId: 'upload-job-id',
    videoId: 'video-id',
  };
  let accepted = false;
  let failedMessage = '';
  let removedStream = false;

  await assert.rejects(
    () => startStreamCopyFromMaster({
      env: {},
      job,
      onAccepted: async () => { accepted = true; },
      onFailure: async (message) => { failedMessage = message; },
    }, {
      createSourceUrl: async () => ({
        expiresAt: '2026-07-12T00:00:00.000Z',
        url: 'https://r2.invalid/presigned-source',
      }),
      copyToStream: async () => { throw new Error('Forced Stream copy failure'); },
      removeStreamVideo: async () => { removedStream = true; },
    }),
    StreamCopyStartError,
  );
  assert.equal(accepted, false);
  assert.equal(removedStream, false);
  assert.match(failedMessage, /Forced Stream copy failure/);
  assert.equal(job.r2Key, 'account/gallery/films/video/master.mp4');

  failedMessage = '';
  removedStream = false;
  await assert.rejects(
    () => startStreamCopyFromMaster({
      env: {},
      job,
      onAccepted: async () => { throw new Error('Database write failed'); },
      onFailure: async (message) => { failedMessage = message; },
    }, {
      createSourceUrl: async () => ({
        expiresAt: '2026-07-12T00:00:00.000Z',
        url: 'https://r2.invalid/presigned-source',
      }),
      copyToStream: async () => ({ uid: 'temporary-stream-uid' }),
      removeStreamVideo: async (_env, uid) => { removedStream = uid === 'temporary-stream-uid'; },
    }),
    StreamCopyStartError,
  );
  assert.equal(removedStream, true);
  assert.match(failedMessage, /Database write failed/);

  const success = await startStreamCopyFromMaster({
    env: {},
    job,
    onAccepted: async ({ streamUid }) => { accepted = streamUid === 'stream-uid'; },
    onFailure: async () => { throw new Error('Unexpected failure callback'); },
  }, {
    createSourceUrl: async () => ({
      expiresAt: '2026-07-12T00:00:00.000Z',
      url: 'https://r2.invalid/presigned-source',
    }),
    copyToStream: async () => ({ uid: 'stream-uid' }),
  });
  assert.equal(accepted, true);
  assert.equal(success.streamUid, 'stream-uid');
  assert.equal(success.ttlSeconds, 86_400);

  const migration = fs.readFileSync(
    new URL('../supabase/migrations/20260711130000_dual_video_ingestion.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /usage_events_upload_job_unique_idx/);
  assert.match(migration, /ON CONFLICT \(upload_job_id\) DO NOTHING/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.finalize_video_stream_copy/);
  assert.match(migration, /IF v_job\.is_replacement THEN/);

  console.log('dual video ingestion checks passed');
}

await run();
