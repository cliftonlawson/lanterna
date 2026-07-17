import assert from 'node:assert/strict';
import fs from 'node:fs';

const studioSource = fs.readFileSync(
  new URL('../src/pages/lanterna-dashboard/GalleryStudioScreen.tsx', import.meta.url),
  'utf8',
);
const publicApiSource = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
const repositorySource = fs.readFileSync(
  new URL('../src/pages/lanterna-dashboard/dashboardRepository.ts', import.meta.url),
  'utf8',
);
const mapperSource = fs.readFileSync(
  new URL('../src/pages/lanterna-dashboard/schemaMapper.ts', import.meta.url),
  'utf8',
);

assert.match(studioSource, /repeatFilms: previewOnly/);
assert.match(studioSource, /repeatFilms: false/);
assert.match(studioSource, /const filmCount = sampleMode \? 8 : sourceFilms\.length/);
assert.match(studioSource, /: films\.map\(\(film, index\) => \(\{/);
assert.match(studioSource, /if \(!model\.films\.length\) return <GalleryEmptyTemplate/);
assert.match(studioSource, /if \(!model\.films\.length\) return <GalleryMobileEmptyTemplate/);

assert.match(publicApiSource, /const publishableVideos = videos\.filter/);
assert.match(publicApiSource, /return ready && playable/);
assert.match(publicApiSource, /const publishablePhotos = photos\.filter\(\(photo\) => Boolean\(photo\.r2_key\)\)/);
assert.match(publicApiSource, /videos: resolvedVideos/);
assert.match(publicApiSource, /photos: publishablePhotos/);

assert.match(repositorySource, /function isVisibleDashboardVideo\(video: VideoRecord\) \{\s+return hasUploadedVideoAsset\(video\);\s+\}/);
assert.match(repositorySource, /photo\.gallery_id === gallery\.id && Boolean\(photo\.r2_key\)/);
assert.match(mapperSource, /r2_key: photo\.r2Key \?\? null/);
assert.doesNotMatch(mapperSource, /photo\.r2Key \?\? `media\/photos\//);

console.log('gallery content honesty checks passed');
