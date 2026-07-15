import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiSource = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260714180000_honest_media_task_ledger.sql', import.meta.url),
  'utf8',
);
const queue = fs.readFileSync(new URL('../docs/Lanterna_fix_queue.md', import.meta.url), 'utf8');
const auditSource = fs.readFileSync(new URL('./audit-stream-orphans.mjs', import.meta.url), 'utf8');

const processReadyStart = apiSource.indexOf('async function processReady');
const processReadyEnd = apiSource.indexOf('async function backgroundSlot', processReadyStart);
const processReadySource = apiSource.slice(processReadyStart, processReadyEnd);

assert.ok(processReadyStart >= 0 && processReadyEnd > processReadyStart);
assert.doesNotMatch(processReadySource, /media_tasks/);
assert.doesNotMatch(processReadySource, /generate_web_copy/);
assert.doesNotMatch(processReadySource, /pendingReplacementTasks/);

assert.match(migration, /task\.task_type = 'generate_web_copy'/);
assert.match(migration, /Target video no longer exists; web copy was not generated\./);
assert.match(migration, /video\.web_copy_r2_key IS NULL/);
assert.match(migration, /SET status = 'pending'/);
assert.match(migration, /video\.web_copy_r2_key IS NOT NULL/);
assert.match(migration, /SET status = 'done'/);

assert.match(queue, /found 19 Cloudflare Stream assets/);
assert.match(queue, /15 are orphaned/);
assert.match(queue, /delete all 15 from Cloudflare Stream/);
assert.match(queue, /audit:stream-orphans/);

assert.match(auditSource, /\/stream\?limit=1000/);
assert.match(auditSource, /rest\/v1\/videos/);
assert.match(auditSource, /rest\/v1\/upload_jobs/);
assert.match(auditSource, /meta\.videoId \|\| meta\.targetId/);
assert.match(auditSource, /classification = 'recovery_candidate'/);
assert.match(auditSource, /classification = 'orphan'/);

console.log('honest media-task ledger checks passed');
