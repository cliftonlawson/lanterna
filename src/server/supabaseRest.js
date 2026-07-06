import { bearerToken, requireEnv } from './http.js';

function supabaseUrl(env) {
  return env.SUPABASE_URL || env.VITE_SUPABASE_URL;
}

function serviceKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY;
}

function anonKey(env) {
  return env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
}

export function assertSupabaseAdmin(env) {
  requireEnv({ ...env, SUPABASE_URL: supabaseUrl(env), SUPABASE_SERVICE_ROLE_KEY: serviceKey(env) }, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
}

export async function currentUser(request, env, fetchImpl = fetch) {
  const token = bearerToken(request);
  if (!token) throw new Error('Missing bearer token.');
  requireEnv({ ...env, SUPABASE_URL: supabaseUrl(env), SUPABASE_ANON_KEY: anonKey(env) }, ['SUPABASE_URL', 'SUPABASE_ANON_KEY']);

  const response = await fetchImpl(`${supabaseUrl(env)}/auth/v1/user`, {
    headers: {
      apikey: anonKey(env),
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error('Supabase session is invalid.');
  return payload;
}

export async function supabaseRest(env, path, options = {}, fetchImpl = fetch) {
  assertSupabaseAdmin(env);
  const headers = {
    apikey: serviceKey(env),
    authorization: `Bearer ${serviceKey(env)}`,
    'content-type': 'application/json',
    ...(options.headers || {}),
  };
  const response = await fetchImpl(`${supabaseUrl(env)}/rest/v1/${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Supabase REST request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function accountForUser(env, userId, fetchImpl = fetch) {
  const rows = await supabaseRest(
    env,
    `account_members?select=account_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: { accept: 'application/json' } },
    fetchImpl,
  );
  const accountId = rows?.[0]?.account_id;
  if (!accountId) throw new Error('No Lanterna account membership found for this user.');
  return accountId;
}

export async function assertGalleryMembership(env, accountId, galleryId, fetchImpl = fetch) {
  const rows = await supabaseRest(
    env,
    `galleries?select=id,slug,name,access_type,password_hash,status,account_id&account_id=eq.${encodeURIComponent(accountId)}&id=eq.${encodeURIComponent(galleryId)}&limit=1`,
    { headers: { accept: 'application/json' } },
    fetchImpl,
  );
  const gallery = rows?.[0];
  if (!gallery) throw new Error('Gallery not found for this account.');
  return gallery;
}

export async function publicGalleryBySlug(env, slug, fetchImpl = fetch) {
  const rows = await supabaseRest(
    env,
    `galleries?select=id,account_id,slug,name,client_name,event_date,access_type,password_hash,status,source_file_expires_at,access_expires_at,storage_tier,is_extended,extended_until,cover_video_id,cover_photo_id,archived_at,deleted_at&slug=eq.${encodeURIComponent(slug)}&deleted_at=is.null&limit=1`,
    { headers: { accept: 'application/json' } },
    fetchImpl,
  );
  return rows?.[0] ?? null;
}
