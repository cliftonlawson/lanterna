import assert from 'node:assert/strict';
import {
  createPaidUnlockCheckout,
  startStripeConnectOnboarding,
  stripeConnectStatus,
  stripeConnectWebhook,
} from '../src/server/stripeCheckout.js';

const env = {
  FILM_SALES_ENABLED: 'true',
  STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect_test',
  STRIPE_SECRET_KEY: 'sk_test_lanterna',
  SUPABASE_ANON_KEY: 'anon_test',
  SUPABASE_SERVICE_ROLE_KEY: 'service_test',
  SUPABASE_URL: 'https://supabase.example',
};
const accountId = '11111111-1111-4111-8111-111111111111';
const galleryId = '22222222-2222-4222-8222-222222222222';
const videoId = '33333333-3333-4333-8333-333333333333';
const stripeAccountId = 'acct_connected_test';
const sessionId = 'cs_test_connected';
const requests = [];
let savedConnection = null;
let savedPurchase = null;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method || 'GET';
  const headers = new Headers(init.headers || {});
  const body = init.body ? String(init.body) : '';
  requests.push({ body, headers, method, url });

  if (url === 'https://supabase.example/auth/v1/user') {
    return response({ email: 'owner@example.com', id: 'user-owner' });
  }
  if (url.includes('/rest/v1/account_members?select=account_id')) return response([{ account_id: accountId }]);
  if (url.includes('/rest/v1/account_members?select=role')) return response([{ role: 'owner' }]);
  if (url.includes('/rest/v1/vendor_branding?')) return response([{ studio_name: 'Northstar Films' }]);
  if (url.includes('/rest/v1/video_unlock_purchases?select=amount_cents')) return response([]);
  if (url.includes('/rest/v1/stripe_connected_accounts?select=*&account_id=')) {
    return response(savedConnection ? [savedConnection] : []);
  }
  if (url.includes('/rest/v1/stripe_connected_accounts?select=*&stripe_account_id=')) {
    return response(savedConnection ? [savedConnection] : []);
  }
  if (url.includes('/rest/v1/stripe_connected_accounts?on_conflict=account_id') && method === 'POST') {
    savedConnection = JSON.parse(body);
    return response(null);
  }
  if (url.endsWith('/v1/accounts') && method === 'POST') {
    return response(stripeAccount());
  }
  if (url.endsWith(`/v1/accounts/${stripeAccountId}`)) return response(stripeAccount());
  if (url.endsWith('/v1/account_links') && method === 'POST') {
    return response({ url: 'https://connect.stripe.com/setup/test' });
  }
  if (url.includes('/rest/v1/galleries?')) {
    return response([{
      access_type: 'public',
      account_id: accountId,
      archived_at: null,
      id: galleryId,
      name: 'Alexa and Nick',
      slug: 'alexa-and-nick',
      status: 'published',
    }]);
  }
  if (url.includes('/rest/v1/videos?')) {
    return response([{
      download_enabled: true,
      duration_seconds: 90,
      id: videoId,
      paid_unlock_currency: 'usd',
      paid_unlock_enabled: true,
      paid_unlock_label: 'Full Ceremony',
      paid_unlock_price_cents: 30000,
      paid_unlock_tagline: 'Every vow and toast',
      poster_r2_key: null,
      r2_key: `${accountId}/film.mp4`,
      stream_ready: true,
      stream_uid: 'stream-test',
      title: 'Full Ceremony',
      visible_in_gallery: true,
      web_copy_r2_key: null,
    }]);
  }
  if (url.endsWith('/v1/checkout/sessions') && method === 'POST') {
    return response({ id: sessionId, payment_intent: null, url: 'https://checkout.stripe.com/test' });
  }
  if (url.includes('/rest/v1/video_unlock_purchases?on_conflict=stripe_checkout_session_id') && method === 'POST') {
    savedPurchase = JSON.parse(body);
    return response(null);
  }
  if (url.includes('/rest/v1/video_unlock_purchases?select=*&stripe_checkout_session_id=')) {
    return response(savedPurchase ? [savedPurchase] : []);
  }

  throw new Error(`Unhandled request: ${method} ${url}`);
};

try {
  const comingSoon = await createPaidUnlockCheckout(
    new Request('https://deliver.lanterna.video/api/public/gallery/alexa-and-nick/paid-unlock/checkout', {
      body: JSON.stringify({ videoId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
    { ...env, FILM_SALES_ENABLED: 'false' },
    'alexa-and-nick',
  );
  assert.equal(comingSoon.status, 503);
  assert.equal((await comingSoon.json()).details.code, 'film_sales_coming_soon');

  const disabledStatus = await stripeConnectStatus(
    new Request('https://app.lanterna.video/api/connect/status', {
      headers: { authorization: 'Bearer user-session' },
    }),
    { ...env, FILM_SALES_ENABLED: 'false' },
  );
  assert.equal(disabledStatus.status, 200);
  assert.equal((await disabledStatus.json()).available, false);

  const disabledOnboarding = await startStripeConnectOnboarding(
    authenticatedRequest('https://app.lanterna.video/api/connect/onboarding'),
    { ...env, FILM_SALES_ENABLED: 'false' },
  );
  assert.equal(disabledOnboarding.status, 503);
  assert.equal((await disabledOnboarding.json()).details.code, 'film_sales_coming_soon');

  const onboarding = await startStripeConnectOnboarding(authenticatedRequest('https://app.lanterna.video/api/connect/onboarding'), env);
  assert.equal(onboarding.status, 200);
  assert.equal((await onboarding.json()).onboardingUrl, 'https://connect.stripe.com/setup/test');
  const accountCreate = requests.find((entry) => entry.url.endsWith('/v1/accounts') && entry.method === 'POST');
  const accountParams = new URLSearchParams(accountCreate.body);
  assert.equal(accountParams.get('controller[fees][payer]'), 'account');
  assert.equal(accountParams.get('controller[losses][payments]'), 'stripe');
  assert.equal(accountParams.get('controller[requirement_collection]'), 'stripe');
  assert.equal(accountParams.get('controller[stripe_dashboard][type]'), 'full');
  assert.equal(accountParams.get('capabilities[card_payments][requested]'), 'true');

  const checkout = await createPaidUnlockCheckout(
    new Request('https://deliver.lanterna.video/api/public/gallery/alexa-and-nick/paid-unlock/checkout', {
      body: JSON.stringify({ videoId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
    env,
    'alexa-and-nick',
  );
  assert.equal(checkout.status, 200);
  const checkoutRequest = requests.find((entry) => entry.url.endsWith('/v1/checkout/sessions'));
  const checkoutParams = new URLSearchParams(checkoutRequest.body);
  assert.equal(checkoutRequest.headers.get('stripe-account'), stripeAccountId);
  assert.equal(checkoutParams.get('payment_intent_data[application_fee_amount]'), '3000');
  assert.equal(savedPurchase.stripe_connected_account_id, stripeAccountId);
  assert.equal(savedPurchase.studio_payout_cents, 27000);

  const event = {
    account: stripeAccountId,
    data: {
      object: {
        amount_total: 30000,
        currency: 'usd',
        customer_details: { email: 'couple@example.com' },
        id: sessionId,
        metadata: {
          account_id: accountId,
          gallery_id: galleryId,
          kind: 'video_unlock',
          purchase_id: savedPurchase.id,
          video_id: videoId,
        },
        payment_intent: 'pi_connected_test',
        payment_status: 'paid',
      },
    },
    type: 'checkout.session.completed',
  };
  const webhook = await stripeConnectWebhook(await signedWebhook(event, env.STRIPE_CONNECT_WEBHOOK_SECRET), env);
  assert.equal(webhook.status, 200);
  assert.equal(savedPurchase.status, 'complete');
  assert.equal(savedPurchase.buyer_email, 'couple@example.com');
  assert.equal(savedPurchase.stripe_connected_account_id, stripeAccountId);

  console.log('Stripe Connect onboarding, direct charge, fee, and connected webhook checks passed');
} finally {
  globalThis.fetch = originalFetch;
}

function stripeAccount() {
  return {
    charges_enabled: true,
    details_submitted: true,
    id: stripeAccountId,
    payouts_enabled: true,
    requirements: { currently_due: [], past_due: [] },
  };
}

function authenticatedRequest(url) {
  return new Request(url, {
    body: '{}',
    headers: { authorization: 'Bearer user-session', 'content-type': 'application/json' },
    method: 'POST',
  });
}

async function signedWebhook(event, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(event);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://app.lanterna.video/api/stripe/connect/webhook', {
    body: rawBody,
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${hex}` },
    method: 'POST',
  });
}

function response(payload, status = 200) {
  return new Response(payload === null ? '' : JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
