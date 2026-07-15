import { loadEnv } from 'vite';

const env = {
  ...process.env,
  ...loadEnv(process.env.NODE_ENV || 'development', process.cwd(), ''),
};

function required(name, fallbackName) {
  const value = String(env[name] || (fallbackName ? env[fallbackName] : '') || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || payload?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload;
}

async function run() {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID');
  const streamToken = required('CLOUDFLARE_STREAM_API_TOKEN');
  const supabaseUrl = required('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');

  const [streamPayload, videos, uploadJobs] = await Promise.all([
    fetchJson(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream?limit=1000`, {
      headers: { authorization: `Bearer ${streamToken}` },
    }),
    fetchJson(`${supabaseUrl}/rest/v1/videos?select=id,stream_uid,deleted_at`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    }),
    fetchJson(`${supabaseUrl}/rest/v1/upload_jobs?select=id,target_id,stream_upload_id,status,upload_phase`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    }),
  ]);

  const providerAssets = Array.isArray(streamPayload.result) ? streamPayload.result : [];
  if (providerAssets.length >= 1000) {
    throw new Error('Cloudflare returned 1000 assets; add pagination before trusting this audit.');
  }

  const videosById = new Map(videos.map((video) => [video.id, video]));
  const activeVideosByUid = new Map(
    videos.filter((video) => video.stream_uid && !video.deleted_at).map((video) => [video.stream_uid, video]),
  );
  const deletedVideosByUid = new Map(
    videos.filter((video) => video.stream_uid && video.deleted_at).map((video) => [video.stream_uid, video]),
  );
  const jobsById = new Map(uploadJobs.map((job) => [job.id, job]));
  const jobsByUid = new Map(
    uploadJobs.filter((job) => job.stream_upload_id).map((job) => [job.stream_upload_id, job]),
  );

  const classifications = providerAssets.map((asset) => {
    const meta = asset?.meta && typeof asset.meta === 'object' ? asset.meta : {};
    const uid = String(asset?.uid || '').trim();
    const metaTargetId = String(meta.videoId || meta.targetId || '').trim();
    const metaVideo = videosById.get(metaTargetId);
    const uidVideo = activeVideosByUid.get(uid);
    const deletedVideo = deletedVideosByUid.get(uid);
    const job = jobsByUid.get(uid) || jobsById.get(String(meta.uploadJobId || ''));
    const managed = Boolean(meta.accountId && (metaTargetId || meta.uploadJobId || meta.galleryId));

    let classification = 'unmanaged';
    if (uidVideo) classification = 'active_video';
    else if (deletedVideo) classification = 'deleted_video_cleanup';
    else if (job) classification = 'upload_job';
    else if (metaVideo?.deleted_at) classification = 'deleted_video_cleanup';
    else if (metaVideo && !metaVideo.stream_uid) classification = 'recovery_candidate';
    else if (metaVideo) classification = 'superseded_video_asset';
    else if (managed) classification = 'orphan';

    return {
      classification,
      created: asset?.created || null,
      metaTargetId: metaTargetId || null,
      name: asset?.meta?.name || asset?.name || null,
      ready: asset?.readyToStream === true,
      uid,
    };
  });

  const count = (classification) => classifications.filter((asset) => asset.classification === classification).length;
  const report = {
    activeVideoMatches: count('active_video'),
    deletedVideoCleanup: count('deleted_video_cleanup'),
    orphanCount: count('orphan'),
    orphans: classifications.filter((asset) => asset.classification === 'orphan'),
    providerAssetCount: providerAssets.length,
    recoveryCandidates: count('recovery_candidate'),
    supersededVideoAssets: count('superseded_video_asset'),
    unmanagedAssets: count('unmanaged'),
    uploadJobMatches: count('upload_job'),
  };

  console.log(JSON.stringify(report, null, 2));
}

await run();
