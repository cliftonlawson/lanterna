import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mediaObjectKey } from '../src/server/r2Signing.js';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260717090000_music_upload_accounting.sql', import.meta.url),
  'utf8',
);
const apiSource = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
const studioSource = fs.readFileSync(
  new URL('../src/pages/lanterna-dashboard/GalleryStudioScreen.tsx', import.meta.url),
  'utf8',
);
const publicSource = fs.readFileSync(new URL('../src/pages/PublicGalleryPage.tsx', import.meta.url), 'utf8');
const repositorySource = fs.readFileSync(
  new URL('../src/pages/lanterna-dashboard/dashboardRepository.ts', import.meta.url),
  'utf8',
);

assert.match(migration, /target_type IN \('video', 'photo', 'background', 'poster', 'music'\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_verified_music_upload/);
assert.match(migration, /p_verified_bytes::numeric \/ 1000000000::numeric/);
assert.match(migration, /ON CONFLICT \(upload_job_id\) DO NOTHING/);
assert.match(migration, /music_track_name = v_job\.file_name/);
assert.match(migration, /'music_replaced'/);
assert.match(migration, /music_track_r2_key NOT LIKE '%\/%'/);

assert.match(apiSource, /async function musicSlot/);
assert.match(apiSource, /requireUploadAllowance\(env, accountId, bytesTotal\)/);
assert.match(apiSource, /targetType: 'music'/);
assert.match(apiSource, /path === 'music\/slot'/);
assert.match(apiSource, /path === 'music\/complete'/);
assert.match(apiSource, /designRow\?\.music_track_r2_key/);

assert.match(studioSource, /accept="audio\/\*,\.mp3,\.wav,\.m4a,\.aac,\.ogg"/);
assert.match(studioSource, /music-preview-player/);
assert.match(publicSource, /function BackgroundMusic/);
assert.match(publicSource, /suspended=\{Boolean\(selectedFilm \|\| lockedFilm\)\}/);
assert.match(publicSource, /audio\.pause\(\)/);
assert.match(publicSource, /audio\.play\(\)/);
assert.match(repositorySource, /'music_track_r2_key'/);
assert.match(repositorySource, /'music_track_name'/);

assert.equal(
  mediaObjectKey({
    accountId: 'account',
    fileName: 'first-dance.mp3',
    galleryId: 'gallery',
    objectName: 'music-job',
    targetId: 'gallery',
    targetType: 'music',
  }),
  'account/gallery/music/gallery/music-job.mp3',
);

console.log('background music upload and playback checks passed');
