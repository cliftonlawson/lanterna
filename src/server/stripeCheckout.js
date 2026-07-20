import { errorJson, json, requireEnv, safeSlug } from './http.js';
import { publicGalleryAccessError, sourceFilesAvailable } from './galleryAccess.js';
import { createStreamPlayback } from './cloudflareStream.js';
import { createR2PresignedGetUrl } from './r2Signing.js';
import { accountForUser, currentUser, publicGalleryBySlug, supabaseRest } from './supabaseRest.js';
import { resolveVideoDownloadPermission } from './downloadPermissions.js';
import { handlePlatformBillingStripeEvent } from './platformBilling.js';
import { sendTransactionalEmail } from './transactionalEmail.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const PLATFORM_FEE_RATE = 0.1;
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function filmSalesEnabled(env = {}) {
  return ['1', 'true', 'yes', 'on'].includes(String(env.FILM_SALES_ENABLED || '').trim().toLowerCase());
}

function filmSalesUnavailable() {
  return errorJson('Film sales are temporarily unavailable.', 503, { code: 'film_sales_unavailable' });
}

function stripeSecretKey(env) {
  return env.STRIPE_SECRET_KEY;
}

function stripeWebhookSecret(env) {
  return env.STRIPE_WEBHOOK_SECRET;
}

function stripeConnectWebhookSecret(env) {
  return env.STRIPE_CONNECT_WEBHOOK_SECRET;
}

function encodedForm(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    body.set(key, String(value));
  }
  return body;
}

async function stripeRequest(env, path, params, options = {}) {
  requireEnv({ ...env, STRIPE_SECRET_KEY: stripeSecretKey(env) }, ['STRIPE_SECRET_KEY']);
  const headers = {
    authorization: `Bearer ${stripeSecretKey(env)}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (options.stripeAccount) headers['stripe-account'] = options.stripeAccount;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    body: encodedForm(params),
    headers,
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe request failed with ${response.status}`);
  }
  return payload;
}

async function stripeGet(env, path, options = {}) {
  requireEnv({ ...env, STRIPE_SECRET_KEY: stripeSecretKey(env) }, ['STRIPE_SECRET_KEY']);
  const headers = { authorization: `Bearer ${stripeSecretKey(env)}` };
  if (options.stripeAccount) headers['stripe-account'] = options.stripeAccount;
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers,
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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function accountContext(request, env, { ownerOnly = false } = {}) {
  const user = await currentUser(request, env);
  const accountId = await accountForUser(env, user.id);
  if (ownerOnly) {
    const memberships = await supabaseRest(
      env,
      `account_members?select=role&account_id=eq.${encodeURIComponent(accountId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { accept: 'application/json' } },
    );
    if (memberships?.[0]?.role !== 'owner') throw new Error('Only the workspace owner can set up film payouts.');
  }
  return { accountId, user };
}

async function connectedAccountForLanternaAccount(env, accountId) {
  const rows = await supabaseRest(
    env,
    `stripe_connected_accounts?select=*&account_id=eq.${encodeURIComponent(accountId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  return rows?.[0] ?? null;
}

async function connectedAccountForStripeAccount(env, stripeAccountId) {
  const rows = await supabaseRest(
    env,
    `stripe_connected_accounts?select=*&stripe_account_id=eq.${encodeURIComponent(stripeAccountId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  return rows?.[0] ?? null;
}

function requirementsDue(account) {
  return [...new Set([
    ...(account?.requirements?.currently_due || []),
    ...(account?.requirements?.past_due || []),
  ].filter(Boolean))];
}

async function saveConnectedAccount(env, accountId, account) {
  const row = {
    account_id: accountId,
    charges_enabled: account.charges_enabled === true,
    details_submitted: account.details_submitted === true,
    payouts_enabled: account.payouts_enabled === true,
    requirements_due: requirementsDue(account),
    stripe_account_id: account.id,
  };
  await supabaseRest(env, 'stripe_connected_accounts?on_conflict=account_id', {
    body: JSON.stringify(row),
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    method: 'POST',
  });
  return row;
}

function connectedAccountState(account) {
  if (!account) return 'not_connected';
  if (account.charges_enabled === true && account.payouts_enabled === true) return 'active';
  if ((account.requirements?.past_due || []).length > 0) return 'restricted';
  return 'pending';
}

async function filmSalesSummary(env, accountId) {
  const rows = await supabaseRest(
    env,
    `video_unlock_purchases?select=amount_cents,platform_fee_cents,studio_payout_cents&account_id=eq.${encodeURIComponent(accountId)}&status=eq.complete&limit=10000`,
    { headers: { accept: 'application/json' } },
  );
  return (rows || []).reduce((summary, purchase) => ({
    grossCents: summary.grossCents + cents(purchase.amount_cents),
    lanternaFeeCents: summary.lanternaFeeCents + cents(purchase.platform_fee_cents),
    salesCount: summary.salesCount + 1,
    studioEarningsCents: summary.studioEarningsCents + cents(purchase.studio_payout_cents),
  }), { grossCents: 0, lanternaFeeCents: 0, salesCount: 0, studioEarningsCents: 0 });
}

export async function stripeConnectStatus(request, env) {
  const { accountId } = await accountContext(request, env);
  if (!filmSalesEnabled(env)) return json({
    available: false,
    chargesEnabled: false,
    detailsSubmitted: false,
    payoutsEnabled: false,
    requirementsDue: [],
    sales: { grossCents: 0, lanternaFeeCents: 0, salesCount: 0, studioEarningsCents: 0 },
    state: 'not_connected',
  });

  const sales = await filmSalesSummary(env, accountId);
  const saved = await connectedAccountForLanternaAccount(env, accountId);
  if (!saved) return json({
    available: true,
    chargesEnabled: false,
    detailsSubmitted: false,
    payoutsEnabled: false,
    requirementsDue: [],
    sales,
    state: 'not_connected',
  });

  const account = await stripeGet(env, `/accounts/${encodeURIComponent(saved.stripe_account_id)}`);
  await saveConnectedAccount(env, accountId, account);
  return json({
    available: true,
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    payoutsEnabled: account.payouts_enabled === true,
    requirementsDue: requirementsDue(account),
    sales,
    state: connectedAccountState(account),
  });
}

export async function startStripeConnectOnboarding(request, env) {
  const { accountId, user } = await accountContext(request, env, { ownerOnly: true });
  if (!filmSalesEnabled(env)) return filmSalesUnavailable();
  let saved = await connectedAccountForLanternaAccount(env, accountId);

  if (!saved) {
    try {
      const branding = await supabaseRest(
        env,
        `vendor_branding?select=studio_name&account_id=eq.${encodeURIComponent(accountId)}&limit=1`,
        { headers: { accept: 'application/json' } },
      );
      const account = await stripeRequest(env, '/accounts', {
        country: String(env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'US').toUpperCase(),
        email: normalizeEmail(user.email),
        'business_profile[name]': branding?.[0]?.studio_name || undefined,
        'business_profile[product_description]': 'Wedding film delivery and digital media sales',
        'capabilities[card_payments][requested]': true,
        'capabilities[transfers][requested]': true,
        'controller[fees][payer]': 'account',
        'controller[losses][payments]': 'stripe',
        'controller[requirement_collection]': 'stripe',
        'controller[stripe_dashboard][type]': 'full',
        'metadata[lanterna_account_id]': accountId,
      }, { idempotencyKey: `lanterna-connect-v2-${accountId}` });
      saved = await saveConnectedAccount(env, accountId, account);
    } catch (error) {
      console.error('Stripe Connect onboarding failed while creating the connected account.', error);
      throw error;
    }
  }

  try {
    const base = baseUrlFromRequest(request);
    const link = await stripeRequest(env, '/account_links', {
      account: saved.stripe_account_id,
      refresh_url: `${base}/?connect=refresh`,
      return_url: `${base}/?connect=return`,
      type: 'account_onboarding',
    });
    return json({ onboardingUrl: link.url });
  } catch (error) {
    console.error('Stripe Connect onboarding failed while creating the onboarding link.', error);
    throw error;
  }
}

async function paidVideoForGallery(env, gallery, videoId) {
  const rows = await supabaseRest(
    env,
    `videos?select=id,title,duration_seconds,r2_key,stream_uid,stream_ready,web_copy_r2_key,poster_r2_key,download_enabled,visible_in_gallery,paid_unlock_enabled,paid_unlock_price_cents,paid_unlock_currency,paid_unlock_label,paid_unlock_tagline&gallery_id=eq.${encodeURIComponent(gallery.id)}&id=eq.${encodeURIComponent(videoId)}&visible_in_gallery=eq.true&deleted_at=is.null&limit=1`,
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

async function createPendingPurchase(env, { amountCents, gallery, purchaseId, session, stripeAccountId, video }) {
  const { platformFeeCents, studioPayoutCents } = payoutFor(amountCents);

  await supabaseRest(env, 'video_unlock_purchases?on_conflict=stripe_checkout_session_id', {
    body: JSON.stringify({
      account_id: gallery.account_id,
      amount_cents: amountCents,
      buyer_email: null,
      currency: video.paid_unlock_currency || 'usd',
      gallery_id: gallery.id,
      id: purchaseId,
      platform_fee_cents: platformFeeCents,
      status: 'pending',
      stripe_checkout_session_id: session.id,
      stripe_connected_account_id: stripeAccountId || null,
      stripe_payment_intent_id: session.payment_intent || null,
      studio_payout_cents: studioPayoutCents,
      unlocked_at: null,
      video_id: video.id,
    }),
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    method: 'POST',
  });
}

export async function createPaidUnlockCheckout(request, env, slug) {
  if (!filmSalesEnabled(env)) return filmSalesUnavailable();
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);
  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;

  const body = await request.json().catch(() => ({}));
  const video = await paidVideoForGallery(env, gallery, String(body.videoId || ''));
  const amountCents = cents(video.paid_unlock_price_cents || 30000);
  if (amountCents < 50) throw new Error('Paid unlock price must be at least $0.50.');

  const connection = await connectedAccountForLanternaAccount(env, gallery.account_id);
  if (!connection) return errorJson('This studio has not finished setting up film sales.', 409, { code: 'film_sales_setup_required' });
  const connectedAccount = await stripeGet(env, `/accounts/${encodeURIComponent(connection.stripe_account_id)}`);
  await saveConnectedAccount(env, gallery.account_id, connectedAccount);
  if (connectedAccount.charges_enabled !== true || connectedAccount.payouts_enabled !== true) {
    return errorJson('Film sales are not available for this studio yet.', 409, { code: 'film_sales_setup_pending' });
  }
  if (!stripeConnectWebhookSecret(env)) {
    return errorJson('Film sales are temporarily unavailable.', 503, { code: 'film_sales_unavailable' });
  }

  const label = String(video.paid_unlock_label || video.title || 'Bonus film');
  const purchaseId = crypto.randomUUID();
  const { platformFeeCents } = payoutFor(amountCents);
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
    'metadata[purchase_id]': purchaseId,
    'metadata[video_id]': video.id,
    'metadata[kind]': 'video_unlock',
    'payment_intent_data[metadata][account_id]': gallery.account_id,
    'payment_intent_data[metadata][gallery_id]': gallery.id,
    'payment_intent_data[metadata][gallery_slug]': gallery.slug,
    'payment_intent_data[metadata][purchase_id]': purchaseId,
    'payment_intent_data[metadata][video_id]': video.id,
    'payment_intent_data[metadata][kind]': 'video_unlock',
    'payment_intent_data[application_fee_amount]': platformFeeCents,
  }, {
    idempotencyKey: `lanterna-unlock-${purchaseId}`,
    stripeAccount: connection.stripe_account_id,
  });

  await createPendingPurchase(env, {
    amountCents,
    gallery,
    purchaseId,
    session,
    stripeAccountId: connection.stripe_account_id,
    video,
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

async function verifyStripeWebhook(request, secret) {
  const rawBody = await request.text();
  const parts = stripeSignatureParts(request.headers.get('stripe-signature'));
  const timestamp = Number(parts.t?.[0] || 0);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error('Stripe webhook timestamp is outside tolerance.');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = await hmacHex(secret, signedPayload);
  const valid = (parts.v1 || []).some((signature) => timingSafeEqual(signature, expected));
  if (!valid) throw new Error('Stripe webhook signature verification failed.');
  return JSON.parse(rawBody);
}

async function purchaseForSession(env, sessionId) {
  const rows = await supabaseRest(
    env,
    `video_unlock_purchases?select=*&stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  return rows?.[0] ?? null;
}

async function upsertCompletedPurchase(env, session, stripeAccountId = null) {
  if (session?.metadata?.kind !== 'video_unlock') return;
  if (session.payment_status !== 'paid') return;

  const accountId = session.metadata.account_id;
  const galleryId = session.metadata.gallery_id;
  const videoId = session.metadata.video_id;
  const buyerEmail = normalizeEmail(session.customer_details?.email || session.customer_email);
  if (!accountId || !galleryId || !videoId || !buyerEmail) throw new Error('Stripe session is missing unlock metadata.');

  const amountCents = cents(session.amount_total);
  const { platformFeeCents, studioPayoutCents } = payoutFor(amountCents);
  const existing = await purchaseForSession(env, session.id);
  if (existing?.status === 'refunded') return;

  await supabaseRest(env, 'video_unlock_purchases?on_conflict=stripe_checkout_session_id', {
    body: JSON.stringify({
      account_id: accountId,
      amount_cents: amountCents,
      buyer_email: buyerEmail,
      currency: session.currency || 'usd',
      gallery_id: galleryId,
      ...(session.metadata.purchase_id ? { id: session.metadata.purchase_id } : {}),
      platform_fee_cents: platformFeeCents,
      status: 'complete',
      stripe_checkout_session_id: session.id,
      stripe_connected_account_id: stripeAccountId,
      stripe_payment_intent_id: session.payment_intent || null,
      studio_payout_cents: studioPayoutCents,
      unlocked_at: existing?.unlocked_at || new Date().toISOString(),
      video_id: videoId,
    }),
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    method: 'POST',
  });
}

async function markPurchaseFailed(env, session) {
  if (session?.metadata?.kind !== 'video_unlock' || !session.id) return;
  await supabaseRest(
    env,
    `video_unlock_purchases?stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&status=neq.complete`,
    {
      body: JSON.stringify({
        status: 'failed',
        stripe_payment_intent_id: session.payment_intent || null,
      }),
      headers: { prefer: 'return=minimal' },
      method: 'PATCH',
    },
  );
}

async function markPurchaseFailedFromPaymentIntent(env, paymentIntent) {
  if (paymentIntent?.metadata?.kind !== 'video_unlock' || !paymentIntent.metadata.purchase_id) return;
  await supabaseRest(
    env,
    `video_unlock_purchases?id=eq.${encodeURIComponent(paymentIntent.metadata.purchase_id)}&status=neq.complete`,
    {
      body: JSON.stringify({
        status: 'failed',
        stripe_payment_intent_id: paymentIntent.id || null,
      }),
      headers: { prefer: 'return=minimal' },
      method: 'PATCH',
    },
  );
}

async function markPurchaseRefunded(env, charge, stripeAccountId = null) {
  const paymentIntentId = typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id;
  if (!paymentIntentId) return false;
  const rows = await supabaseRest(
    env,
    `video_unlock_purchases?select=id&stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&status=eq.complete`,
    { headers: { accept: 'application/json' } },
  );
  let purchaseIds = (rows || []).map((row) => row.id);
  if (!purchaseIds.length) {
    const paymentIntent = await stripeGet(env, `/payment_intents/${encodeURIComponent(paymentIntentId)}`, stripeAccountId ? { stripeAccount: stripeAccountId } : {});
    if (paymentIntent?.metadata?.kind === 'video_unlock' && paymentIntent.metadata.purchase_id) {
      purchaseIds = [paymentIntent.metadata.purchase_id];
    }
  }
  if (!purchaseIds.length) return false;
  await supabaseRest(env, `video_unlock_purchases?id=in.(${purchaseIds.join(',')})`, {
    body: JSON.stringify({ status: 'refunded', stripe_payment_intent_id: paymentIntentId }),
    headers: { prefer: 'return=minimal' },
    method: 'PATCH',
  });
  return true;
}

export async function stripeWebhook(request, env) {
  let event;
  try {
    requireEnv({ ...env, STRIPE_WEBHOOK_SECRET: stripeWebhookSecret(env) }, ['STRIPE_WEBHOOK_SECRET']);
    event = await verifyStripeWebhook(request, stripeWebhookSecret(env));
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : 'Invalid Stripe webhook.', 400);
  }

  if (await handlePlatformBillingStripeEvent(event, env)) {
    return json({ ok: true });
  }

  if (event.type === 'checkout.session.completed') {
    await upsertCompletedPurchase(env, event.data?.object);
  } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    await markPurchaseFailed(env, event.data?.object);
  } else if (event.type === 'payment_intent.payment_failed') {
    await markPurchaseFailedFromPaymentIntent(env, event.data?.object);
  } else if (event.type === 'charge.refunded') {
    await markPurchaseRefunded(env, event.data?.object);
  }

  return json({ ok: true });
}

export async function stripeConnectWebhook(request, env) {
  let event;
  try {
    requireEnv(
      { ...env, STRIPE_CONNECT_WEBHOOK_SECRET: stripeConnectWebhookSecret(env) },
      ['STRIPE_CONNECT_WEBHOOK_SECRET'],
    );
    event = await verifyStripeWebhook(request, stripeConnectWebhookSecret(env));
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : 'Invalid Stripe webhook.', 400);
  }

  const stripeAccountId = String(event.account || '').trim();
  if (!stripeAccountId) return errorJson('Connected account event is missing its account.', 400);
  const connection = await connectedAccountForStripeAccount(env, stripeAccountId);
  if (!connection) return json({ ignored: true, ok: true });

  if (event.type === 'account.updated') {
    await saveConnectedAccount(env, connection.account_id, event.data?.object || {});
  } else if (event.type === 'checkout.session.completed') {
    await upsertCompletedPurchase(env, event.data?.object, stripeAccountId);
  } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    await markPurchaseFailed(env, event.data?.object);
  } else if (event.type === 'payment_intent.payment_failed') {
    await markPurchaseFailedFromPaymentIntent(env, event.data?.object);
  } else if (event.type === 'charge.refunded') {
    await markPurchaseRefunded(env, event.data?.object, stripeAccountId);
  }

  return json({ ok: true });
}

function sessionUnlockMediaKeys(video, downloadAllowed) {
  return [downloadAllowed ? video.r2_key : null, video.web_copy_r2_key, video.poster_r2_key].filter(Boolean);
}

function paidVideoDownloadFileName(video) {
  const objectName = String(video.r2_key || '').split('/').pop() || '';
  const extension = objectName.includes('.') ? objectName.split('.').pop() : '';
  const baseName = safeSlug(video.title || 'wedding-film') || 'wedding-film';
  return extension ? `${baseName}.${safeSlug(extension)}` : baseName;
}

async function downloadSettingsForGallery(env, gallery) {
  const [design, branding] = await Promise.all([
    supabaseRest(
      env,
      `gallery_design?select=allow_downloads&gallery_id=eq.${encodeURIComponent(gallery.id)}&limit=1`,
      { headers: { accept: 'application/json' } },
    ),
    supabaseRest(
      env,
      `vendor_branding?select=default_downloads&account_id=eq.${encodeURIComponent(gallery.account_id)}&limit=1`,
      { headers: { accept: 'application/json' } },
    ),
  ]);

  return {
    galleryAllowDownloads: design?.[0]?.allow_downloads,
    vendorDefaultDownloads: branding?.[0]?.default_downloads,
  };
}

async function unlockPayloadForPurchase(env, gallery, purchase) {
  if (!purchase || purchase.status !== 'complete') return null;
  const video = await paidVideoForGallery(env, gallery, purchase.video_id);
  const settings = await downloadSettingsForGallery(env, gallery);
  const downloadAllowed = sourceFilesAvailable(gallery) && resolveVideoDownloadPermission(
    video.download_enabled,
    settings.galleryAllowDownloads,
    settings.vendorDefaultDownloads,
  );
  const media = {};
  for (const key of sessionUnlockMediaKeys(video, downloadAllowed)) {
    media[key] = await createR2PresignedGetUrl(env, { expiresInSeconds: 900, key });
  }
  const download = downloadAllowed && video.r2_key
    ? await createR2PresignedGetUrl(env, {
      expiresInSeconds: 900,
      key: video.r2_key,
      responseContentDisposition: `attachment; filename="${paidVideoDownloadFileName(video)}"`,
    })
    : null;
  const stream = video.stream_uid && video.stream_ready !== false && env.CLOUDFLARE_STREAM_SIGNING_KEY_ID && env.CLOUDFLARE_STREAM_SIGNING_JWK
    ? { [video.stream_uid]: await createStreamPlayback(env, video.stream_uid, { expiresInSeconds: 900 }) }
    : {};

  return {
    buyerEmail: purchase.buyer_email || null,
    download,
    downloadAllowed,
    media,
    stream,
    videoId: video.id,
  };
}

export async function paidUnlockSession(request, env, slug) {
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);
  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;

  const url = new URL(request.url);
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  if (!sessionId) return errorJson('session_id is required.', 400);

  const purchase = await purchaseForSession(env, sessionId);
  if (!purchase) return errorJson('Unlock purchase was not found.', 404);
  const session = await stripeGet(
    env,
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    purchase.stripe_connected_account_id ? { stripeAccount: purchase.stripe_connected_account_id } : {},
  );
  if (session.payment_status !== 'paid') return errorJson('Payment has not completed yet.', 402);
  if (
    session.metadata?.account_id !== gallery.account_id
    || session.metadata?.gallery_id !== gallery.id
    || session.metadata?.kind !== 'video_unlock'
  ) {
    return errorJson('Unlock session does not match this gallery.', 403);
  }

  const unlock = await unlockPayloadForPurchase(env, gallery, purchase);
  if (!unlock) return errorJson('Payment is confirmed. Waiting for Stripe to finish the unlock.', 409, { code: 'unlock_pending_webhook' });

  return json(unlock);
}

export async function recoverPaidUnlock(request, env, slug) {
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);
  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const videoId = String(body.videoId || '').trim();
  if (!email) return errorJson('Enter the email used at checkout.', 400);
  if (!videoId) return errorJson('videoId is required.', 400);

  const rows = await supabaseRest(
    env,
    `video_unlock_purchases?select=*&gallery_id=eq.${encodeURIComponent(gallery.id)}&video_id=eq.${encodeURIComponent(videoId)}&status=eq.complete&buyer_email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const purchase = rows?.[0] ?? null;
  if (purchase) {
    const recent = await supabaseRest(
      env,
      `video_unlock_recovery_tokens?select=id&purchase_id=eq.${encodeURIComponent(purchase.id)}&created_at=gt.${encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString())}&limit=1`,
      { headers: { accept: 'application/json' } },
    );
    if (!recent?.length) {
      const token = randomToken();
      const recoveryUrl = new URL(`/g/${encodeURIComponent(gallery.slug)}`, baseUrlFromRequest(request));
      recoveryUrl.searchParams.set('unlock_recovery', token);
      await supabaseRest(env, 'video_unlock_recovery_tokens', {
        body: JSON.stringify({
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          gallery_id: gallery.id,
          purchase_id: purchase.id,
          token_hash: await sha256(token),
        }),
        headers: { prefer: 'return=minimal' },
        method: 'POST',
      });
      await sendTransactionalEmail(env, {
        html: `<p>Use this secure link to restore your paid film in ${gallery.name}:</p><p><a href="${recoveryUrl.toString()}">Restore film access</a></p><p>This link expires in 30 minutes and can be used once.</p>`,
        subject: `Restore your film in ${gallery.name}`,
        text: `Restore your paid film: ${recoveryUrl.toString()}\n\nThis link expires in 30 minutes and can be used once.`,
        to: email,
      });
    }
  }

  return json({ message: 'If a completed unlock matches that email, a secure recovery link is on its way.' });
}

export async function confirmPaidUnlockRecovery(request, env, slug) {
  const gallery = await publicGalleryBySlug(env, slug);
  if (!gallery) return errorJson('Gallery not found.', 404);
  const accessError = publicGalleryAccessError(gallery);
  if (accessError) return accessError;
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '').trim();
  if (token.length < 32) return errorJson('Recovery link is invalid.', 400);
  const rows = await supabaseRest(
    env,
    `video_unlock_recovery_tokens?select=id,purchase_id,expires_at,used_at&gallery_id=eq.${encodeURIComponent(gallery.id)}&token_hash=eq.${encodeURIComponent(await sha256(token))}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const recovery = rows?.[0];
  if (!recovery || recovery.used_at || Date.parse(recovery.expires_at) <= Date.now()) {
    return errorJson('Recovery link is invalid or expired.', 410);
  }
  const purchases = await supabaseRest(env, `video_unlock_purchases?select=*&id=eq.${encodeURIComponent(recovery.purchase_id)}&gallery_id=eq.${encodeURIComponent(gallery.id)}&status=eq.complete&limit=1`, { headers: { accept: 'application/json' } });
  const unlock = await unlockPayloadForPurchase(env, gallery, purchases?.[0] ?? null);
  if (!unlock) return errorJson('This paid unlock is no longer available.', 410);
  await supabaseRest(env, `video_unlock_recovery_tokens?id=eq.${encodeURIComponent(recovery.id)}&used_at=is.null`, {
    body: JSON.stringify({ used_at: new Date().toISOString() }),
    headers: { prefer: 'return=minimal' },
    method: 'PATCH',
  });
  return json(unlock);
}
