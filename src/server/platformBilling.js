import { BILLING_PRODUCTS, billingProduct } from '../shared/billingCatalog.js';
import { errorJson, json, readJson, requireEnv } from './http.js';
import { stripeMutationsEnabled } from './stripeMode.js';
import { accountForUser, currentUser, supabaseRest } from './supabaseRest.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const SUBSCRIPTION_CATALOG_KEY = 'lanterna_subscription_v1';

function stripeSecretKey(env) {
  return env.STRIPE_SECRET_KEY;
}

function encodedForm(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    body.set(key, String(value));
  }
  return body;
}

async function stripeRequest(env, path, params, idempotencyKey) {
  requireEnv({ ...env, STRIPE_SECRET_KEY: stripeSecretKey(env) }, ['STRIPE_SECRET_KEY']);
  const headers = {
    authorization: `Bearer ${stripeSecretKey(env)}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    body: encodedForm(params),
    headers,
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Stripe request failed with ${response.status}`);
  return payload;
}

async function stripeGet(env, path) {
  requireEnv({ ...env, STRIPE_SECRET_KEY: stripeSecretKey(env) }, ['STRIPE_SECRET_KEY']);
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${stripeSecretKey(env)}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Stripe request failed with ${response.status}`);
  return payload;
}

async function billingAccountContext(request, env) {
  const user = await currentUser(request, env);
  const accountId = await accountForUser(env, user.id);
  const memberships = await supabaseRest(
    env,
    `account_members?select=role&account_id=eq.${encodeURIComponent(accountId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  if (memberships?.[0]?.role !== 'owner') throw new Error('Only the workspace owner can manage billing.');
  return { accountId, user };
}

function appBaseUrl(env) {
  return String(env.APP_URL || 'https://app.lanterna.video').replace(/\/+$/, '');
}

async function stripeCustomerForAccount(env, accountId, user) {
  const accounts = await supabaseRest(
    env,
    `accounts?select=stripe_customer_id&id=eq.${encodeURIComponent(accountId)}&limit=1`,
    { headers: { accept: 'application/json' } },
  );
  const existing = accounts?.[0]?.stripe_customer_id;
  if (existing) return existing;

  const customer = await stripeRequest(env, '/customers', {
    email: user.email,
    'metadata[account_id]': accountId,
    'metadata[lanterna_billing]': 'platform',
    name: user.user_metadata?.display_name || user.user_metadata?.name || undefined,
  }, `lanterna-customer-${accountId}`);

  await supabaseRest(env, `accounts?id=eq.${encodeURIComponent(accountId)}`, {
    body: JSON.stringify({ stripe_customer_id: customer.id }),
    headers: { prefer: 'return=minimal' },
    method: 'PATCH',
  });
  return customer.id;
}

function stripeProductName(product) {
  if (product.kind === 'subscription') return String(product.plan || 'Plan').replace(/^./, (letter) => letter.toUpperCase());
  if (product.kind === 'white_label') return 'White label';
  if (product.kind === 'topup') return '5 GB top-up';
  return `${product.allowanceGb} GB block`;
}

function subscriptionProducts() {
  return Object.values(BILLING_PRODUCTS).filter((product) => product.kind === 'subscription');
}

function subscriptionProductForRow(subscription) {
  return subscriptionProducts().find((product) => (
    product.plan === subscription?.plan
    && product.billingInterval === subscription?.billing_interval
  )) || null;
}

async function ensureSubscriptionCatalog(env) {
  const listedProducts = await stripeGet(env, '/products?active=true&limit=100');
  let catalogProduct = listedProducts?.data?.find((product) => product.metadata?.lanterna_catalog === SUBSCRIPTION_CATALOG_KEY);
  if (!catalogProduct) {
    catalogProduct = await stripeRequest(env, '/products', {
      description: 'Wedding-film delivery subscription with an annual upload allowance and white-label galleries.',
      'metadata[lanterna_catalog]': SUBSCRIPTION_CATALOG_KEY,
      name: 'LANTERNA subscription',
    }, SUBSCRIPTION_CATALOG_KEY);
  }

  const listedPrices = await stripeGet(env, `/prices?active=true&limit=100&product=${encodeURIComponent(catalogProduct.id)}&type=recurring`);
  const prices = {};
  for (const product of subscriptionProducts()) {
    let price = listedPrices?.data?.find((candidate) => (
      candidate.metadata?.lanterna_sku === product.sku
      && Number(candidate.unit_amount) === product.amountCents
      && candidate.recurring?.interval === product.billingInterval
    ));
    if (!price) {
      price = await stripeRequest(env, '/prices', {
        currency: 'usd',
        'metadata[allowance_gb]': product.allowanceGb,
        'metadata[billing_interval]': product.billingInterval,
        'metadata[lanterna_sku]': product.sku,
        'metadata[plan]': product.plan,
        nickname: product.name,
        product: catalogProduct.id,
        'recurring[interval]': product.billingInterval,
        unit_amount: product.amountCents,
      }, `${SUBSCRIPTION_CATALOG_KEY}-${product.sku}`);
    }
    prices[product.sku] = price;
  }
  return { prices, product: catalogProduct };
}

async function ensureBillingPortalConfiguration(env, catalog) {
  const listed = await stripeGet(env, '/billing_portal/configurations?active=true&limit=100');
  const existing = listed?.data?.find((configuration) => configuration.metadata?.lanterna_catalog === SUBSCRIPTION_CATALOG_KEY);
  const params = {
    active: true,
    'business_profile[headline]': 'Manage your LANTERNA plan and billing.',
    'business_profile[privacy_policy_url]': 'https://lanterna.video/privacy',
    'business_profile[terms_of_service_url]': 'https://lanterna.video/terms',
    default_return_url: `${appBaseUrl(env)}/`,
    'features[customer_update][allowed_updates][0]': 'address',
    'features[customer_update][allowed_updates][1]': 'email',
    'features[customer_update][allowed_updates][2]': 'name',
    'features[customer_update][enabled]': true,
    'features[invoice_history][enabled]': true,
    'features[payment_method_update][enabled]': true,
    'features[subscription_cancel][cancellation_reason][enabled]': true,
    'features[subscription_cancel][cancellation_reason][options][0]': 'too_expensive',
    'features[subscription_cancel][cancellation_reason][options][1]': 'unused',
    'features[subscription_cancel][cancellation_reason][options][2]': 'missing_features',
    'features[subscription_cancel][cancellation_reason][options][3]': 'other',
    'features[subscription_cancel][enabled]': true,
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[subscription_cancel][proration_behavior]': 'none',
    'features[subscription_update][billing_cycle_anchor]': 'unchanged',
    'features[subscription_update][default_allowed_updates][0]': 'price',
    'features[subscription_update][default_allowed_updates][1]': 'promotion_code',
    'features[subscription_update][enabled]': true,
    'features[subscription_update][proration_behavior]': 'always_invoice',
    'features[subscription_update][products][0][product]': catalog.product.id,
    'features[subscription_update][schedule_at_period_end][conditions][0][type]': 'decreasing_item_amount',
    'features[subscription_update][schedule_at_period_end][conditions][1][type]': 'shortening_interval',
    'metadata[lanterna_catalog]': SUBSCRIPTION_CATALOG_KEY,
  };
  subscriptionProducts().forEach((product, index) => {
    params[`features[subscription_update][products][0][prices][${index}]`] = catalog.prices[product.sku].id;
  });

  if (existing) return stripeRequest(env, `/billing_portal/configurations/${encodeURIComponent(existing.id)}`, params);
  return stripeRequest(env, '/billing_portal/configurations', {
    ...params,
    name: 'LANTERNA subscription management',
  }, `${SUBSCRIPTION_CATALOG_KEY}-portal`);
}

async function currentBillingRows(env, accountId) {
  await supabaseRest(env, 'rpc/refresh_account_billing_state', {
    body: JSON.stringify({ p_account_id: accountId }),
    method: 'POST',
  });

  const [branding, entitlements, subscriptions, usage] = await Promise.all([
    supabaseRest(env, `vendor_branding?select=white_label_until&account_id=eq.${encodeURIComponent(accountId)}&limit=1`, { headers: { accept: 'application/json' } }),
    supabaseRest(env, `entitlements?select=source,gb_granted,period_start,period_end,sku,status&account_id=eq.${encodeURIComponent(accountId)}&status=eq.active&period_end=gt.${encodeURIComponent(new Date().toISOString())}&order=period_end.desc`, { headers: { accept: 'application/json' } }),
    supabaseRest(env, `subscriptions?select=plan,status,seats,current_period_end,billing_interval,allowance_period_start,allowance_period_end,cancel_at_period_end,stripe_subscription_id&account_id=eq.${encodeURIComponent(accountId)}&status=in.(active,past_due)&order=created_at.desc&limit=1`, { headers: { accept: 'application/json' } }),
    supabaseRest(env, `account_usage?select=allowance_used_gb,allowance_total_gb,allowance_period_start,allowance_period_end&account_id=eq.${encodeURIComponent(accountId)}&limit=1`, { headers: { accept: 'application/json' } }),
  ]);

  return {
    branding: branding?.[0] ?? null,
    entitlements: entitlements || [],
    subscription: subscriptions?.[0] ?? null,
    usage: usage?.[0] ?? null,
  };
}

function billingStatusPayload(rows) {
  const block = rows.entitlements.find((entitlement) => entitlement.source === 'block');
  const whiteLabelUntil = rows.branding?.white_label_until ? Date.parse(rows.branding.white_label_until) : 0;
  const subscriptionPeriodEnd = rows.subscription?.current_period_end ? Date.parse(rows.subscription.current_period_end) : 0;
  const subscriptionActive = rows.subscription?.status === 'active'
    && Number.isFinite(subscriptionPeriodEnd)
    && subscriptionPeriodEnd > Date.now();
  const subscription = rows.subscription && !subscriptionActive && rows.subscription.status === 'active'
    ? { ...rows.subscription, status: 'past_due' }
    : rows.subscription;
  return {
    blockActive: Boolean(block),
    canBuyBlock: !rows.subscription && !block,
    canBuyTopup: subscriptionActive || Boolean(block),
    canBuyWhiteLabel: !rows.subscription && Boolean(block) && !(Number.isFinite(whiteLabelUntil) && whiteLabelUntil > Date.now()),
    periodEnd: rows.usage?.allowance_period_end ?? null,
    subscription,
    usage: {
      allowanceTotalGb: Number(rows.usage?.allowance_total_gb ?? 0),
      allowanceUsedGb: Number(rows.usage?.allowance_used_gb ?? 0),
    },
    whiteLabel: subscriptionActive || (Number.isFinite(whiteLabelUntil) && whiteLabelUntil > Date.now()),
    whiteLabelUntil: rows.branding?.white_label_until ?? null,
  };
}

export async function platformBillingStatus(request, env) {
  const { accountId } = await billingAccountContext(request, env);
  return json(billingStatusPayload(await currentBillingRows(env, accountId)));
}

export async function createPlatformBillingCheckout(request, env) {
  if (!stripeMutationsEnabled(env)) {
    return errorJson('Payments are not available until Stripe live mode is configured.', 503, { code: 'stripe_live_mode_required' });
  }
  const { accountId, user } = await billingAccountContext(request, env);
  const body = await readJson(request);
  const product = billingProduct(body.sku);
  if (!product) return errorJson('Choose a valid LANTERNA plan or add-on.', 422);

  const status = billingStatusPayload(await currentBillingRows(env, accountId));
  if (product.kind === 'subscription' && (status.subscription || status.blockActive)) {
    return errorJson(status.subscription
      ? 'Manage your current subscription before choosing another plan.'
      : 'Your upload block stays active until its expiry. Choose a subscription after that date.', 409);
  }
  if (product.kind === 'block' && !status.canBuyBlock) return errorJson(status.subscription ? 'Upload blocks are only available without a subscription.' : 'An upload block is already active. Add a top-up instead.', 409);
  if (product.kind === 'topup' && !status.canBuyTopup) return errorJson('Choose a subscription or upload block before adding a top-up.', 409);
  if (product.kind === 'white_label' && !status.canBuyWhiteLabel) return errorJson(status.whiteLabel ? 'White label is already active.' : 'Buy an upload block before adding white label.', 409);

  const customerId = await stripeCustomerForAccount(env, accountId, user);
  const recurring = product.kind === 'subscription';
  const catalog = recurring ? await ensureSubscriptionCatalog(env) : null;
  const metadata = {
    account_id: accountId,
    allowance_gb: product.allowanceGb ?? 0,
    billing_interval: product.billingInterval,
    billing_kind: product.kind,
    lanterna_billing: 'platform',
    plan: product.plan,
    seats: product.seats,
    sku: product.sku,
  };
  const params = {
    client_reference_id: accountId,
    customer: customerId,
    mode: recurring ? 'subscription' : 'payment',
    'automatic_tax[enabled]': true,
    'customer_update[address]': 'auto',
    'payment_method_types[0]': 'card',
    success_url: `${appBaseUrl(env)}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl(env)}/?billing=cancelled`,
    submit_type: recurring ? 'subscribe' : 'pay',
    'line_items[0][quantity]': 1,
    ...(recurring ? {
      'line_items[0][price]': catalog.prices[product.sku].id,
    } : {
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': stripeProductName(product),
      'line_items[0][price_data][unit_amount]': product.amountCents,
    }),
    ...Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`metadata[${key}]`, value])),
  };
  if (recurring) {
    params.allow_promotion_codes = true;
    for (const [key, value] of Object.entries(metadata)) params[`subscription_data[metadata][${key}]`] = value;
  } else {
    for (const [key, value] of Object.entries(metadata)) params[`payment_intent_data[metadata][${key}]`] = value;
  }

  const session = await stripeRequest(
    env,
    '/checkout/sessions',
    params,
    `lanterna-checkout-${accountId}-${product.sku}-${Date.now()}`,
  );

  await supabaseRest(env, 'billing_checkout_sessions', {
    body: JSON.stringify({
      account_id: accountId,
      amount_cents: product.amountCents,
      sku: product.sku,
      stripe_checkout_session_id: session.id,
      stripe_customer_id: customerId,
    }),
    headers: { prefer: 'return=minimal' },
    method: 'POST',
  });

  return json({ checkoutUrl: session.url, sessionId: session.id });
}

export async function createPlatformBillingPortal(request, env) {
  if (!stripeMutationsEnabled(env)) {
    return errorJson('Billing management is not available until Stripe live mode is configured.', 503, { code: 'stripe_live_mode_required' });
  }
  const { accountId } = await billingAccountContext(request, env);
  const [accounts, rows] = await Promise.all([
    supabaseRest(env, `accounts?select=stripe_customer_id&id=eq.${encodeURIComponent(accountId)}&limit=1`, { headers: { accept: 'application/json' } }),
    currentBillingRows(env, accountId),
  ]);
  const customerId = accounts?.[0]?.stripe_customer_id;
  if (!customerId) return errorJson('No billing account is available yet.', 409);
  let configuration;
  if (rows.subscription?.stripe_subscription_id) {
    const product = subscriptionProductForRow(rows.subscription);
    if (!product) return errorJson('Your current plan could not be matched to the billing catalog.', 409);
    const catalog = await ensureSubscriptionCatalog(env);
    const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(rows.subscription.stripe_subscription_id)}`);
    const item = subscription?.items?.data?.[0];
    if (!item?.id) return errorJson('Your current plan could not be opened in billing.', 409);
    const catalogPrice = catalog.prices[product.sku];
    if (item.price?.id !== catalogPrice.id) {
      await stripeRequest(env, `/subscriptions/${encodeURIComponent(subscription.id)}`, {
        'items[0][id]': item.id,
        'items[0][price]': catalogPrice.id,
        'items[0][quantity]': 1,
        'metadata[account_id]': accountId,
        'metadata[allowance_gb]': product.allowanceGb,
        'metadata[billing_interval]': product.billingInterval,
        'metadata[billing_kind]': product.kind,
        'metadata[lanterna_billing]': 'platform',
        'metadata[plan]': product.plan,
        'metadata[seats]': product.seats,
        'metadata[sku]': product.sku,
        proration_behavior: 'none',
      }, `${SUBSCRIPTION_CATALOG_KEY}-migrate-${subscription.id}-${product.sku}`);
    }
    configuration = await ensureBillingPortalConfiguration(env, catalog);
  }
  const session = await stripeRequest(env, '/billing_portal/sessions', {
    configuration: configuration?.id,
    customer: customerId,
    return_url: `${appBaseUrl(env)}/`,
  });
  return json({ portalUrl: session.url });
}

async function billingCheckoutRow(env, sessionId) {
  const rows = await supabaseRest(env, `billing_checkout_sessions?select=*&stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&limit=1`, { headers: { accept: 'application/json' } });
  return rows?.[0] ?? null;
}

function secondsToIso(value, fallback = Date.now()) {
  const milliseconds = Number(value) * 1000;
  return new Date(Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : fallback).toISOString();
}

function subscriptionPeriod(subscription) {
  const item = subscription?.items?.data?.[0];
  return {
    end: secondsToIso(subscription?.current_period_end ?? item?.current_period_end),
    start: secondsToIso(subscription?.current_period_start ?? item?.current_period_start),
  };
}

async function fulfillSubscription(env, accountId, checkoutSessionId, stripeCustomerId, subscription) {
  const item = subscription?.items?.data?.[0];
  const product = billingProduct(item?.price?.metadata?.lanterna_sku || subscription?.metadata?.sku);
  if (!product || product.kind !== 'subscription') throw new Error('Stripe subscription metadata does not match the LANTERNA catalog.');
  if (Number(item?.price?.unit_amount) !== product.amountCents || item?.price?.recurring?.interval !== product.billingInterval) {
    throw new Error('Stripe subscription price does not match the LANTERNA catalog.');
  }
  const period = subscriptionPeriod(subscription);
  await supabaseRest(env, 'rpc/fulfill_subscription_billing', {
    body: JSON.stringify({
      p_account_id: accountId,
      p_allowance_gb: product.allowanceGb,
      p_billing_interval: product.billingInterval,
      p_cancel_at_period_end: subscription.cancel_at_period_end === true,
      p_current_period_end: period.end,
      p_current_period_start: period.start,
      p_effective_at: new Date().toISOString(),
      p_plan: product.plan,
      p_seats: product.seats,
      p_sku: product.sku,
      p_stripe_checkout_session_id: checkoutSessionId,
      p_stripe_customer_id: stripeCustomerId || subscription.customer,
      p_stripe_subscription_id: subscription.id,
    }),
    method: 'POST',
  });
}

async function syncSubscriptionEvent(env, subscription) {
  const existing = await supabaseRest(env, `subscriptions?select=account_id&stripe_subscription_id=eq.${encodeURIComponent(subscription.id)}&limit=1`, { headers: { accept: 'application/json' } });
  const accountId = existing?.[0]?.account_id || subscription?.metadata?.account_id;
  if (!accountId) return false;

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    await fulfillSubscription(env, accountId, null, subscription.customer, subscription);
  } else {
    const mappedStatus = subscription.status === 'canceled' ? 'canceled' : 'past_due';
    await supabaseRest(env, 'rpc/set_subscription_billing_status', {
      body: JSON.stringify({
        p_cancel_at_period_end: subscription.cancel_at_period_end === true,
        p_current_period_end: subscriptionPeriod(subscription).end,
        p_status: mappedStatus,
        p_stripe_subscription_id: subscription.id,
      }),
      method: 'POST',
    });
  }
  return true;
}

export async function handlePlatformBillingStripeEvent(event, env) {
  const object = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const row = await billingCheckoutRow(env, object.id);
    if (!row) return false;
    if (row.status === 'refunded') return true;
    const product = billingProduct(row.sku);
    if (!product || Number(row.amount_cents) !== product.amountCents) {
      throw new Error('Stripe checkout amount does not match the LANTERNA catalog.');
    }
    if (product.kind === 'subscription') {
      const amountTotal = Number(object.amount_total);
      if (!Number.isFinite(amountTotal) || amountTotal < 0 || amountTotal > product.amountCents) {
        throw new Error('Stripe checkout amount does not match the LANTERNA catalog.');
      }
      const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(object.subscription)}`);
      await fulfillSubscription(env, row.account_id, object.id, object.customer, subscription);
    } else {
      if (Number(object.amount_total) !== product.amountCents) {
        throw new Error('Stripe checkout amount does not match the LANTERNA catalog.');
      }
      if (object.payment_status !== 'paid') throw new Error('Stripe checkout is not paid.');
      await supabaseRest(env, 'rpc/fulfill_one_time_billing', {
        body: JSON.stringify({
          p_account_id: row.account_id,
          p_allowance_gb: product.allowanceGb ?? 0,
          p_effective_at: new Date().toISOString(),
          p_kind: product.kind,
          p_sku: product.sku,
          p_stripe_checkout_session_id: object.id,
          p_stripe_customer_id: object.customer,
        }),
        method: 'POST',
      });
      if (object.payment_intent) {
        await supabaseRest(env, `billing_checkout_sessions?stripe_checkout_session_id=eq.${encodeURIComponent(object.id)}`, {
          body: JSON.stringify({ stripe_payment_intent_id: object.payment_intent }),
          headers: { prefer: 'return=minimal' },
          method: 'PATCH',
        });
      }
    }
    return true;
  }

  if (event.type === 'charge.refunded' && object.payment_intent) {
    const reversed = await supabaseRest(env, 'rpc/reverse_one_time_billing', {
      body: JSON.stringify({
        p_effective_at: new Date().toISOString(),
        p_stripe_payment_intent_id: object.payment_intent,
      }),
      method: 'POST',
    });
    if (reversed) return true;
    const sessions = await stripeGet(env, `/checkout/sessions?payment_intent=${encodeURIComponent(object.payment_intent)}&limit=1`);
    const sessionId = sessions?.data?.[0]?.id;
    const row = sessionId ? await billingCheckoutRow(env, sessionId) : null;
    if (!row) return false;
    const refundedAt = new Date().toISOString();
    await supabaseRest(env, `billing_checkout_sessions?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}`, {
      body: JSON.stringify(row.status === 'complete'
        ? { stripe_payment_intent_id: object.payment_intent }
        : { refunded_at: refundedAt, status: 'refunded', stripe_payment_intent_id: object.payment_intent }),
      headers: { prefer: 'return=minimal' },
      method: 'PATCH',
    });
    if (row.status === 'complete') {
      await supabaseRest(env, 'rpc/reverse_one_time_billing', {
        body: JSON.stringify({ p_effective_at: refundedAt, p_stripe_payment_intent_id: object.payment_intent }),
        method: 'POST',
      });
    }
    return true;
  }

  if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    const row = await billingCheckoutRow(env, object.id);
    if (!row) return false;
    await supabaseRest(env, `billing_checkout_sessions?stripe_checkout_session_id=eq.${encodeURIComponent(object.id)}&status=eq.pending`, {
      body: JSON.stringify({ status: 'failed' }),
      headers: { prefer: 'return=minimal' },
      method: 'PATCH',
    });
    return true;
  }

  if (event.type === 'customer.subscription.created'
    || event.type === 'customer.subscription.updated'
    || event.type === 'customer.subscription.deleted') {
    return syncSubscriptionEvent(env, object);
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subscriptionId = object.subscription || object.parent?.subscription_details?.subscription;
    if (!subscriptionId) return false;
    const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    return syncSubscriptionEvent(env, subscription);
  }

  return false;
}
