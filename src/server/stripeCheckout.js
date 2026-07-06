import { errorJson, json, requireEnv } from './http.js';
import { publicGalleryAccessError } from './galleryAccess.js';
import { createStreamPlayback } from './cloudflareStream.js';
import { createR2PresignedGetUrl } from './r2Signing.js';
import { publicGalleryBySlug, supabaseRest } from './supabaseRest.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const PLATFORM_FEE_RATE = 0.1;
const WEBHOOK_TOLERANCE_SECONDS = 300;

function stripeSecretKey(env) {
  return env.STRIPE_SECRET_KEY;
}

function stripeWebhookSecret(env) {
  return env.STRIPE_WEBHOOK_SECRET;
}

function encodedForm(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    body.set(key, String(value));
  }
  return body;
}

async function stripeRequest(env, path, params) {
  requireEnv({ ...env, STRIPE_SECRET_KEY: stripeSecretKey(env) }, ['STRIPE_SECRET_KEY']);
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    body: encodedForm(params),
    headers: {
      authorization: `Bearer ${stripeSecretKey(env)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe request failed with ${response.status}`);
  }
  return payload;
}

async function stripeGet(env, path) {
  requireEnv({ ...env, STRIPE_SECRET_KEY: stripeSecretKey(env) }, ['STRIPE_SECRET_KEY']);
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${stripeSecretKey(env)}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe request failed with ${response.status}`);
  }
  return payload;
}

function cents(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

function payoutFor(amountCents) {
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  return {
    platformFeeCents,
    studioPayoutCents: Math.max(0, amountCents - platformFeeCents),
  };
}

async function paidVideoForGallery(env, gallery, videoId) {
  const rows = await supabaseRest(
    env,
    `videos?select=id,title,duration_seconds,r2_key,stream_uid,stream_ready,web_copy_r2_key,poster_r2_key,download_enabled,visible_in_gallery,paid_unlock_enabled,paid_unlock_price_cents,paid_unlock_currency,paid_unlock_label,paid_unlock_tagline,paid_unlock_trailer&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(videoId)}&visible_in_gallery=eq.true&deleted_at=is.null&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const video = rows?.[0] ?? null;
  if (!video) throw new Error('Film not found.');
  if (video.paid_unlock_enabled !== true) throw new Error('This film is not locked for paid unlock.');
  return video;
}

function baseUrlFromRequest(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function checkoutReturnUrl(request, gallery, status) {
  const base = baseUrlFromRequest(request);
  const query = status === 'success'
    ? '?unlock_session={CHECKOUT_SESSION_ID}'
    : '?unlock_cancelled=true';
  return `${base}/g/${encodeURIComponent(gallery.slug)}${query}`;
}

export async function createPaidUnlockCheckout(request, env, slug) {
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);
  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;

  const body = await request.json().catch(() => ({}));
  const video = await paidVideoForGallery(env, gallery, String(body.videoId || ''));
  const amountCents = cents(video.paid_unlock_price_cents || 30000);
  if (amountCents < 50) throw new Error('Paid unlock price must be at least $0.50.');

  const label = String(video.paid_unlock_label || video.title || 'Bonus film');
  const session = await stripeRequest(env, '/checkout/sessions', {
    mode: 'payment',
    success_url: checkoutReturnUrl(request, gallery, 'success'),
    cancel_url: checkoutReturnUrl(request, gallery, 'cancel'),
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': video.paid_unlock_currency || 'usd',
    'line_items[0][price_data][unit_amount]': amountCents,
    'line_items[0][price_data][product_data][name]': label,
    'line_items[0][price_data][product_data][description]': String(video.paid_unlock_tagline || `${gallery.name} bonus film`),
    'metadata[account_id]': gallery.account_id,
    'metadata[gallery_id]': gallery.id,
    'metadata[gallery_slug]': gallery.slug,
    'metadata[video_id]': video.id,
    'metadata[kind]': 'video_unlock',
  });

  return json({ checkoutUrl: session.url, sessionId: session.id });
}

function stripeSignatureParts(header) {
  const parts = {};
  for (const piece of String(header || '').split(',')) {
    const [key, value] = piece.split('=');
    if (!key || !value) continue;
    if (!parts[key]) parts[key] = [];
    parts[key].push(value);
  }
  return parts;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function verifyStripeWebhook(request, env) {
  requireEnv({ ...env, STRIPE_WEBHOOK_SECRET: stripeWebhookSecret(env) }, ['STRIPE_WEBHOOK_SECRET']);
  const rawBody = await request.text();
  const parts = stripeSignatureParts(request.headers.get('stripe-signature'));
  const timestamp = Number(parts.t?.[0] || 0);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error('Stripe webhook timestamp is outside tolerance.');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = await hmacHex(stripeWebhookSecret(env), signedPayload);
  const valid = (parts.v1 || []).some((signature) => timingSafeEqual(signature, expected));
  if (!valid) throw new Error('Stripe webhook signature verification failed.');
  return JSON.parse(rawBody);
}

async function upsertCompletedPurchase(env, session) {
  if (session?.metadata?.kind !== 'video_unlock') return;
  if (session.payment_status !== 'paid') return;

  const accountId = session.metadata.account_id;
  const galleryId = session.metadata.gallery_id;
  const videoId = session.metadata.video_id;
  const buyerEmail = session.customer_details?.email || session.customer_email;
  if (!accountId || !galleryId || !videoId || !buyerEmail) throw new Error('Stripe session is missing unlock metadata.');

  const amountCents = cents(session.amount_total);
  const { platformFeeCents, studioPayoutCents } = payoutFor(amountCents);

  await supabaseRest(env, 'video_unlock_purchases?on_conflict=stripe_checkout_session_id', {
    body: JSON.stringify({
      account_id: accountId,
      amount_cents: amountCents,
      buyer_email: buyerEmail,
      currency: session.currency || 'usd',
      gallery_id: galleryId,
      platform_fee_cents: platformFeeCents,
      status: 'complete',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      studio_payout_cents: studioPayoutCents,
      unlocked_at: new Date().toISOString(),
      video_id: videoId,
    }),
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    method: 'POST',
  });
}

export async function stripeWebhook(request, env) {
  let event;
  try {
    event = await verifyStripeWebhook(request, env);
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : 'Invalid Stripe webhook.', 400);
  }

  if (event.type === 'checkout.session.completed') {
    await upsertCompletedPurchase(env, event.data?.object);
  }

  return json({ ok: true });
}

function sessionUnlockMediaKeys(video) {
  return [video.r2_key, video.web_copy_r2_key, video.poster_r2_key].filter(Boolean);
}

export async function paidUnlockSession(request, env, slug) {
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);
  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;

  const url = new URL(request.url);
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  if (!sessionId) return errorJson('session_id is required.', 400);

  const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (session.payment_status !== 'paid') return errorJson('Payment has not completed yet.', 402);
  if (
    session.metadata?.account_id !== gallery.account_id
    || session.metadata?.gallery_id !== gallery.id
    || session.metadata?.kind !== 'video_unlock'
  ) {
    return errorJson('Unlock session does not match this gallery.', 403);
  }

  await upsertCompletedPurchase(env, session);
  const video = await paidVideoForGallery(env, gallery, session.metadata.video_id);
  const media = {};
  for (const key of sessionUnlockMediaKeys(video)) {
    media[key] = await createR2PresignedGetUrl(env, { expiresInSeconds: 900, key });
  }
  const stream = video.stream_uid && video.stream_ready !== false && env.CLOUDFLARE_STREAM_SIGNING_KEY_ID && env.CLOUDFLARE_STREAM_SIGNING_JWK
    ? { [video.stream_uid]: await createStreamPlayback(env, video.stream_uid, { expiresInSeconds: 900 }) }
    : {};

  return json({
    buyerEmail: session.customer_details?.email || session.customer_email || null,
    media,
    stream,
    videoId: video.id,
  });
}
