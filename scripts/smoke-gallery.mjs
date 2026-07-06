const DEFAULT_BASE_URL = 'http://127.0.0.1:5173';

const [, , slugArg, titleArg, baseUrlArg] = process.argv;
const slug = slugArg || 'test';
const expectedTitle = titleArg || '';
const baseUrl = (baseUrlArg || process.env.LANTERNA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const galleryUrl = `${baseUrl}/g/${encodeURIComponent(slug)}`;
const apiUrl = `${baseUrl}/api/public/gallery/${encodeURIComponent(slug)}`;

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2));
  process.exit(1);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) fail('Public gallery API failed', { status: response.status });
  return response.json();
}

async function rangedGet(url) {
  if (!url) return null;
  const response = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
  await response.body?.cancel?.();
  return response.status;
}

async function browserOriginGet(url) {
  if (!url) return null;
  const response = await fetch(url, {
    headers: {
      Origin: baseUrl,
      Referer: galleryUrl,
    },
  });
  await response.body?.cancel?.();
  return response.status;
}

const payload = await fetchJson(apiUrl);
const videos = payload.gallery?.videos ?? [];
const design = payload.gallery?.design ?? {};
const targetVideo = expectedTitle
  ? videos.find((video) => video.title === expectedTitle)
  : videos.find((video) => video.stream_uid && video.processing_status === 'ready') ?? videos[0];

if (!payload.gallery?.slug) fail('Gallery payload is missing gallery data');
if (!videos.length) fail('Gallery has no videos');
if (!targetVideo) fail('Expected video was not found', { expectedTitle });
if (targetVideo.processing_status !== 'ready') {
  fail('Target video is not ready', { title: targetVideo.title, status: targetVideo.processing_status });
}

const backgroundUrl = design.background_r2_key ? payload.media?.[design.background_r2_key]?.url : null;
const posterUrl = targetVideo.poster_r2_key ? payload.media?.[targetVideo.poster_r2_key]?.url : null;
const stream = targetVideo.stream_uid ? payload.stream?.[targetVideo.stream_uid] : null;

const result = {
  ok: true,
  apiStatus: 200,
  slug: payload.gallery.slug,
  videoCount: videos.length,
  targetTitle: targetVideo.title,
  targetReady: targetVideo.processing_status === 'ready',
  targetStreamReady: targetVideo.stream_ready === true,
  backgroundGet: await rangedGet(backgroundUrl),
  posterCheck: posterUrl ? 'fetched' : 'skipped_no_poster_key',
  posterGet: await rangedGet(posterUrl),
  streamThumbnailGet: await rangedGet(stream?.thumbnailUrl),
  streamIframeGet: await browserOriginGet(stream?.iframeUrl),
};

const expectedOk = [
  result.backgroundGet == null || [200, 206].includes(result.backgroundGet),
  result.posterGet == null || [200, 206].includes(result.posterGet),
  !targetVideo.stream_uid || result.targetStreamReady,
  !targetVideo.stream_uid || result.streamThumbnailGet === 200 || result.streamThumbnailGet === 206,
  !targetVideo.stream_uid || result.streamIframeGet === 200,
].every(Boolean);

if (!expectedOk) fail('Gallery smoke check failed', result);
console.log(JSON.stringify(result, null, 2));
