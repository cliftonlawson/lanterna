import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleLanternaApiRequest } from '../src/server/lanternaApi.js';

const events = [];
const gallery = {
  access_type: 'public',
  account_id: 'account-1',
  archived_at: null,
  deleted_at: null,
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'emma-and-james',
  status: 'delivered',
};
const videoId = '22222222-2222-4222-8222-222222222222';
const env = {
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_URL: 'https://example.supabase.co',
};

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.includes('/rest/v1/galleries?')) return response([gallery]);
  if (url.includes('/rest/v1/videos?')) return response([{ download_enabled: true, id: videoId }]);
  if (url.includes('/rest/v1/gallery_design?')) return response([{ allow_downloads: true }]);
  if (url.includes('/rest/v1/vendor_branding?')) return response([{ default_downloads: true }]);
  if (url.includes('/rest/v1/delivery_events?on_conflict=id')) {
    events.push({ body: JSON.parse(init.body), prefer: init.headers.prefer });
    return response(null);
  }
  throw new Error(`Unexpected request: ${init.method || 'GET'} ${url}`);
};

const sessionId = 'gallery_session_12345678';
const opened = await activityRequest('opened', sessionId);
assert.equal(opened.status, 200);
assert.deepEqual(await opened.json(), { ok: true });

await activityRequest('opened', sessionId);
assert.equal(events[0].body.id, events[1].body.id);
assert.equal(events[0].body.gallery_id, gallery.id);
assert.equal(events[0].body.video_id, null);
assert.equal(events[0].body.metadata.source, 'public_gallery');
assert.equal(events[0].prefer, 'resolution=ignore-duplicates,return=minimal');

const played = await activityRequest('video_viewed', sessionId, videoId);
assert.equal(played.status, 200);
assert.equal(events[2].body.video_id, videoId);
assert.notEqual(events[2].body.id, events[0].body.id);

const downloaded = await activityRequest('downloaded', sessionId, videoId);
assert.equal(downloaded.status, 200);
assert.equal(events[3].body.event_type, 'downloaded');

assert.equal((await activityRequest('sent', sessionId)).status, 422);
assert.equal((await activityRequest('opened', 'short')).status, 422);

const publicPage = fs.readFileSync(new URL('../src/pages/PublicGalleryPage.tsx', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../src/pages/lanterna-dashboard/dashboardRepository.ts', import.meta.url), 'utf8');
const studio = fs.readFileSync(new URL('../src/pages/lanterna-dashboard/GalleryStudioScreen.tsx', import.meta.url), 'utf8');
assert.match(publicPage, /recordActivity\('opened'\)/);
assert.match(publicPage, /recordActivity\('video_viewed', videoId\)/);
assert.match(publicPage, /recordActivity\('downloaded', videoId\)/);
assert.match(repository, /from\('delivery_events'\)/);
assert.match(studio, /Viewing activity/);
assert.match(studio, /Gallery opens/);
assert.match(studio, /Film plays/);
assert.match(studio, /Downloads/);

console.log('Public gallery activity recording and dashboard visibility passed.');

function activityRequest(eventType, activitySessionId, requestedVideoId) {
  return handleLanternaApiRequest(new Request('https://app.lanterna.video/api/public/gallery/emma-and-james/activity', {
    body: JSON.stringify({ eventType, sessionId: activitySessionId, videoId: requestedVideoId }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }), { env });
}

function response(payload, status = 200) {
  return new Response(payload == null ? '' : JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
