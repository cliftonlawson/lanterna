import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiSource = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
const supabaseSource = fs.readFileSync(new URL('../src/server/supabaseRest.js', import.meta.url), 'utf8');
const screenSource = fs.readFileSync(
  new URL('../src/pages/lanterna-dashboard/AllGalleriesScreen.tsx', import.meta.url),
  'utf8',
);
const repositorySource = fs.readFileSync(
  new URL('../src/pages/lanterna-dashboard/dashboardRepository.ts', import.meta.url),
  'utf8',
);

const deleteStart = apiSource.indexOf('async function deleteGallery');
const deleteEnd = apiSource.indexOf('async function uploadSlot', deleteStart);
const deleteSource = apiSource.slice(deleteStart, deleteEnd);

assert.ok(deleteStart >= 0 && deleteEnd > deleteStart);
assert.match(supabaseSource, /cover_photo_id,archived_at/);
assert.match(deleteSource, /assertGalleryMembership/);
assert.match(deleteSource, /if \(!gallery\.archived_at\)/);
assert.match(deleteSource, /gallery_must_be_archived/);
assert.match(deleteSource, /rpc\/request_gallery_soft_delete/);

assert.match(screenSource, /gallery\.archived && \(/);
assert.match(screenSource, /Delete permanently/);
assert.match(screenSource, /confirmation\.trim\(\) === gallery\.name/);
assert.match(screenSource, /aria-modal="true"/);
assert.match(repositorySource, /deleteGalleryPermanentlyRemote\(galleryId\)/);
assert.match(repositorySource, /filter\(\(gallery\) => gallery\.id !== galleryId\)/);

console.log('archived gallery permanent-delete checks passed');
