import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  hashGalleryPassword,
  supportedGalleryPasswordHash,
  verifyGalleryPassword,
} from '../src/server/galleryPassword.js';

const password = 'Lanterna item 18a password';
const hash = await hashGalleryPassword(password);

assert.equal(hash.includes(password), false);
assert.equal(supportedGalleryPasswordHash(hash), true);
assert.equal(await verifyGalleryPassword(password, hash), true);
assert.equal(await verifyGalleryPassword('incorrect password', hash), false);
assert.equal(await verifyGalleryPassword(password, `plain:${password}`), false);
assert.equal(await verifyGalleryPassword(password, password), false);

const apiSource = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
const mapperSource = fs.readFileSync(new URL('../src/pages/lanterna-dashboard/schemaMapper.ts', import.meta.url), 'utf8');
const repositorySource = fs.readFileSync(new URL('../src/pages/lanterna-dashboard/dashboardRepository.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260714160000_server_owned_gallery_access.sql', import.meta.url), 'utf8');

assert.doesNotMatch(apiSource, /ui-configured:/);
assert.doesNotMatch(apiSource, /stored\.slice\(6\) === password|stored === password/);
assert.match(apiSource, /path === 'gallery\/access'/);
assert.match(mapperSource, /password_hash: null/);
assert.doesNotMatch(mapperSource, /ui-configured:/);
assert.match(repositorySource, /'access_type'/);
assert.match(repositorySource, /'password_hash'/);
assert.match(migration, /NEW\.access_type IS DISTINCT FROM OLD\.access_type/);
assert.match(migration, /NEW\.password_hash IS DISTINCT FROM OLD\.password_hash/);

console.log('gallery password integrity checks passed');
