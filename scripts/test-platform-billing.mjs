import assert from 'node:assert/strict';
import { createPlatformBillingCheckout, createPlatformBillingPortal, handlePlatformBillingStripeEvent, platformBillingStatus } from '../src/server/platformBilling.js';

const requests = [];
let activeBillingSubscription = null;
let activeEntitlements = [];
let allowanceTotalGb = 0;
let stripeCustomerId = null;
const env = {
  APP_URL: 'https://app.lanterna.video',
  STRIPE_SECRET_KEY: 'sk_test_platform',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_URL: 'https://example.supabase.co',
};

const subscription = {
  cancel_at_period_end: false,
  current_period_end: 1810000000,
  current_period_start: 1778464000,
  customer: 'cus_platform',
  id: 'sub_starter',
  items: { data: [{ id: 'si_starter', price: { id: 'price_starter_monthly', metadata: { lanterna_sku: 'starter_monthly' }, product: 'prod_lanterna', recurring: { interval: 'month' }, unit_amount: 1900 } }] },
  metadata: { account_id: 'account-1', sku: 'starter_monthly' },
  status: 'active',
};

const catalogPrices = [
  ['starter_monthly', 1900, 'month'],
  ['starter_annual', 20900, 'year'],
  ['pro_monthly', 6900, 'month'],
  ['pro_annual', 75900, 'year'],
  ['studio_monthly', 16900, 'month'],
  ['studio_annual', 186000, 'year'],
].map(([sku, unitAmount, interval]) => ({
  id: `price_${sku}`,
  metadata: { lanterna_sku: sku },
  product: 'prod_lanterna',
  recurring: { interval },
  unit_amount: unitAmount,
}));

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method || 'GET';
  const body = init.body instanceof URLSearchParams ? init.body.toString() : init.body;
  requests.push({ body, method, url });

  if (url.endsWith('/auth/v1/user')) return response({ email: 'owner@example.com', id: 'user-1', user_metadata: { display_name: 'Owner' } });
  if (url.includes('/rest/v1/account_members?select=account_id')) return response([{ account_id: 'account-1' }]);
  if (url.includes('/rest/v1/account_members?select=role')) return response([{ role: 'owner' }]);
  if (url.endsWith('/rest/v1/rpc/refresh_account_billing_state')) return response({ allowanceTotalGb: 0 });
  if (url.includes('/rest/v1/vendor_branding?select=white_label_until')) return response([{ white_label_until: null }]);
  if (url.includes('/rest/v1/entitlements?select=')) return response(activeEntitlements);
  if (url.includes('/rest/v1/subscriptions?select=plan')) return response(activeBillingSubscription ? [activeBillingSubscription] : []);
  if (url.includes('/rest/v1/subscriptions?select=account_id&stripe_subscription_id=')) return response([{ account_id: 'account-1' }]);
  if (url.includes('/rest/v1/account_usage?select=allowance_used_gb')) return response([{ allowance_period_end: null, allowance_total_gb: allowanceTotalGb, allowance_used_gb: 0 }]);
  if (url.includes('/rest/v1/accounts?select=stripe_customer_id')) return response([{ stripe_customer_id: stripeCustomerId }]);
  if (url.endsWith('/v1/customers')) return response({ id: 'cus_platform' });
  if (url.endsWith('/v1/products?active=true&limit=100')) return response({ data: [{ id: 'prod_lanterna', metadata: { lanterna_catalog: 'lanterna_subscription_v1' } }] });
  if (url.includes('/v1/prices?active=true&limit=100&product=prod_lanterna&type=recurring')) return response({ data: catalogPrices });
  if (url.endsWith('/v1/billing_portal/configurations?active=true&limit=100')) return response({ data: [{ id: 'bpc_lanterna', metadata: { lanterna_catalog: 'lanterna_subscription_v1' } }] });
  if (url.endsWith('/v1/billing_portal/configurations/bpc_lanterna')) return response({ id: 'bpc_lanterna' });
  if (url.endsWith('/v1/billing_portal/sessions')) return response({ id: 'bps_lanterna', url: 'https://billing.stripe.com/lanterna' });
  if (url.includes('/rest/v1/accounts?id=eq.account-1')) return response(null);
  if (url.endsWith('/v1/checkout/sessions')) return response({ id: 'cs_platform', url: 'https://checkout.stripe.com/platform' });
  if (url.endsWith('/rest/v1/billing_checkout_sessions') && method === 'POST') return response(null);
  if (url.includes('/rest/v1/billing_checkout_sessions?select=') && url.includes('cs_platform')) {
    return response([{ account_id: 'account-1', amount_cents: 1900, sku: 'starter_monthly', status: 'pending', stripe_checkout_session_id: 'cs_platform' }]);
  }
  if (url.includes('/rest/v1/billing_checkout_sessions?select=') && url.includes('cs_block')) {
    return response([{ account_id: 'account-1', amount_cents: 5000, sku: 'block_50', status: 'pending', stripe_checkout_session_id: 'cs_block' }]);
  }
  if (url.includes('/rest/v1/billing_checkout_sessions?select=') && url.includes('cs_topup')) {
    return response([{ account_id: 'account-1', amount_cents: 500, sku: 'topup_5', status: 'pending', stripe_checkout_session_id: 'cs_topup' }]);
  }
  if (url.includes('/rest/v1/billing_checkout_sessions?select=') && url.includes('cs_white')) {
    return response([{ account_id: 'account-1', amount_cents: 14900, sku: 'white_label_annual', status: 'pending', stripe_checkout_session_id: 'cs_white' }]);
  }
  if (url.endsWith('/v1/subscriptions/sub_starter')) return response(subscription);
  if (url.endsWith('/rest/v1/rpc/fulfill_subscription_billing')) return response({ allowanceGb: 50 });
  if (url.endsWith('/rest/v1/rpc/fulfill_one_time_billing')) return response({ alreadyCompleted: false });

  throw new Error(`Unexpected request: ${method} ${url}`);
};

activeEntitlements = [{ gb_granted: 10, period_end: '2027-07-18T00:00:00.000Z', period_start: '2026-07-18T00:00:00.000Z', sku: 'welcome_10', source: 'welcome', status: 'active' }];
allowanceTotalGb = 10;
const welcomeStatus = await platformBillingStatus(new Request('https://app.lanterna.video/api/billing/status', {
  headers: { authorization: 'Bearer test-token' },
}), env);
const welcomePayload = await welcomeStatus.json();
assert.equal(welcomePayload.usage.allowanceTotalGb, 10);
assert.equal(welcomePayload.canBuyTopup, false);
assert.equal(welcomePayload.canBuyWhiteLabel, false);
assert.equal(welcomePayload.whiteLabel, false);
activeEntitlements = [];
allowanceTotalGb = 0;

const checkout = await createPlatformBillingCheckout(authRequest('/api/billing/checkout', { sku: 'starter_monthly' }), env);
assert.equal(checkout.status, 200);
assert.equal((await checkout.json()).checkoutUrl, 'https://checkout.stripe.com/platform');

const stripeCheckout = requests.find((request) => request.url.endsWith('/v1/checkout/sessions'));
const checkoutParams = new URLSearchParams(stripeCheckout.body);
assert.equal(checkoutParams.get('mode'), 'subscription');
assert.equal(checkoutParams.get('payment_method_types[0]'), 'card');
assert.equal(checkoutParams.get('automatic_tax[enabled]'), 'true');
assert.equal(checkoutParams.get('customer_update[address]'), 'auto');
assert.equal(checkoutParams.get('allow_promotion_codes'), 'true');
assert.equal(checkoutParams.get('line_items[0][price]'), 'price_starter_monthly');
assert.equal(checkoutParams.get('line_items[0][price_data][unit_amount]'), null);
assert.equal(checkoutParams.get('subscription_data[metadata][allowance_gb]'), '50');
assert.equal(checkoutParams.get('subscription_data[metadata][sku]'), 'starter_monthly');
assert.match(checkoutParams.get('success_url'), /billing=success/);

activeBillingSubscription = {
  allowance_period_end: '2027-07-18T00:00:00.000Z',
  billing_interval: 'month',
  cancel_at_period_end: false,
  current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  plan: 'starter',
  seats: 1,
  status: 'active',
  stripe_subscription_id: 'sub_starter',
};
const subscriberTopup = await createPlatformBillingCheckout(authRequest('/api/billing/checkout', { sku: 'topup_5' }), env);
assert.equal(subscriberTopup.status, 200);
const topupCheckout = [...requests].reverse().find((request) => request.url.endsWith('/v1/checkout/sessions'));
const topupParams = new URLSearchParams(topupCheckout.body);
assert.equal(topupParams.get('mode'), 'payment');
assert.equal(topupParams.get('allow_promotion_codes'), null);
assert.equal(topupParams.get('line_items[0][price_data][unit_amount]'), '500');
assert.equal(topupParams.get('metadata[sku]'), 'topup_5');
stripeCustomerId = 'cus_platform';
const portal = await createPlatformBillingPortal(authRequest('/api/billing/portal', {}), env);
assert.equal(portal.status, 200);
assert.equal((await portal.json()).portalUrl, 'https://billing.stripe.com/lanterna');
const portalConfiguration = [...requests].reverse().find((request) => request.url.endsWith('/v1/billing_portal/configurations/bpc_lanterna'));
const portalConfigurationParams = new URLSearchParams(portalConfiguration.body);
assert.equal(portalConfigurationParams.get('features[subscription_update][enabled]'), 'true');
assert.equal(portalConfigurationParams.get('features[subscription_update][default_allowed_updates][0]'), 'price');
assert.equal(portalConfigurationParams.get('features[subscription_update][products][0][product]'), 'prod_lanterna');
assert.equal(portalConfigurationParams.get('features[subscription_update][products][0][prices][5]'), 'price_studio_annual');
assert.equal(portalConfigurationParams.get('features[subscription_update][schedule_at_period_end][conditions][0][type]'), 'decreasing_item_amount');
const portalSession = [...requests].reverse().find((request) => request.url.endsWith('/v1/billing_portal/sessions'));
assert.equal(new URLSearchParams(portalSession.body).get('configuration'), 'bpc_lanterna');
stripeCustomerId = null;
activeBillingSubscription = null;

const handled = await handlePlatformBillingStripeEvent({
  data: { object: { amount_total: 100, customer: 'cus_platform', id: 'cs_platform', subscription: 'sub_starter' } },
  type: 'checkout.session.completed',
}, env);
assert.equal(handled, true);

const fulfillment = requests.find((request) => request.url.endsWith('/rest/v1/rpc/fulfill_subscription_billing'));
const fulfillmentBody = JSON.parse(fulfillment.body);
assert.equal(fulfillmentBody.p_allowance_gb, 50);
assert.equal(fulfillmentBody.p_billing_interval, 'month');
assert.equal(fulfillmentBody.p_plan, 'starter');
assert.equal(fulfillmentBody.p_seats, 1);
assert.equal(fulfillmentBody.p_sku, 'starter_monthly');

const planChangeHandled = await handlePlatformBillingStripeEvent({
  data: {
    object: {
      ...subscription,
      items: { data: [{ id: 'si_starter', price: { id: 'price_pro_monthly', metadata: { lanterna_sku: 'pro_monthly' }, product: 'prod_lanterna', recurring: { interval: 'month' }, unit_amount: 6900 } }] },
    },
  },
  type: 'customer.subscription.updated',
}, env);
assert.equal(planChangeHandled, true);
const planChangeFulfillment = [...requests].reverse().find((request) => request.url.endsWith('/rest/v1/rpc/fulfill_subscription_billing'));
const planChangeBody = JSON.parse(planChangeFulfillment.body);
assert.equal(planChangeBody.p_allowance_gb, 1000);
assert.equal(planChangeBody.p_plan, 'pro');
assert.equal(planChangeBody.p_sku, 'pro_monthly');

for (const purchase of [
  { allowanceGb: 50, amountCents: 5000, id: 'cs_block', kind: 'block' },
  { allowanceGb: 5, amountCents: 500, id: 'cs_topup', kind: 'topup' },
  { allowanceGb: 0, amountCents: 14900, id: 'cs_white', kind: 'white_label' },
]) {
  const before = requests.length;
  const purchaseHandled = await handlePlatformBillingStripeEvent({
    data: { object: { amount_total: purchase.amountCents, customer: 'cus_platform', id: purchase.id, payment_status: 'paid' } },
    type: 'checkout.session.completed',
  }, env);
  assert.equal(purchaseHandled, true);
  const oneTimeRequest = requests.slice(before).find((request) => request.url.endsWith('/rest/v1/rpc/fulfill_one_time_billing'));
  const oneTimeBody = JSON.parse(oneTimeRequest.body);
  assert.equal(oneTimeBody.p_allowance_gb, purchase.allowanceGb);
  assert.equal(oneTimeBody.p_kind, purchase.kind);
}

console.log('Platform subscription, block, top-up, and white-label fulfillment passed.');

function authRequest(path, body) {
  return new Request(`https://app.lanterna.video${path}`, {
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    method: 'POST',
  });
}

function response(payload, status = 200) {
  return new Response(payload == null ? '' : JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
