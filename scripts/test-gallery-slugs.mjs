import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiSource = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260714170000_global_gallery_slug_uniqueness.sql', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../Lanterna_schema_spec.md', import.meta.url), 'utf8');

const allocatorStart = apiSource.indexOf('async function globallyUniqueGallerySlug');
const allocatorEnd = apiSource.indexOf('function isGallerySlugConflict', allocatorStart);
const allocator = apiSource.slice(allocatorStart, allocatorEnd);

assert.ok(allocatorStart >= 0 && allocatorEnd > allocatorStart);
assert.match(allocator, /galleries\?select=id&slug=eq\./);
assert.doesNotMatch(allocator, /account_id=eq/);
assert.match(apiSource, /if \(isGallerySlugConflict\(error\)\) continue/);
assert.match(migration, /HAVING count\(\*\) > 1/);
assert.match(migration, /DROP CONSTRAINT IF EXISTS galleries_slug_unique/);
assert.match(migration, /ADD CONSTRAINT galleries_slug_global_unique UNIQUE \(slug\)/);
assert.match(schema, /unique \(slug\)/);
assert.doesNotMatch(schema, /unique \(account_id, slug\)/);

console.log('global gallery slug checks passed');
