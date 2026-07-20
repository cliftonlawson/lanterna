export const WELCOME_ALLOWANCE_GB = 10;

export const SUBSCRIPTION_TIERS = Object.freeze([
  Object.freeze({
    allowanceGb: 50,
    annual: Object.freeze({ amountCents: 20900, sku: 'starter_annual' }),
    description: 'For solo studios shipping a handful of polished deliveries.',
    featured: false,
    monthly: Object.freeze({ amountCents: 1900, sku: 'starter_monthly' }),
    name: 'Starter',
    plan: 'starter',
    seats: 1,
  }),
  Object.freeze({
    allowanceGb: 1000,
    annual: Object.freeze({ amountCents: 75900, sku: 'pro_annual' }),
    description: 'For steady wedding seasons with room for films, photos, and guest media.',
    featured: true,
    monthly: Object.freeze({ amountCents: 6900, sku: 'pro_monthly' }),
    name: 'Pro',
    plan: 'pro',
    seats: 1,
  }),
  Object.freeze({
    allowanceGb: 5000,
    annual: Object.freeze({ amountCents: 186000, sku: 'studio_annual' }),
    description: 'For high-volume studios that need the largest annual upload allowance.',
    featured: false,
    monthly: Object.freeze({ amountCents: 16900, sku: 'studio_monthly' }),
    name: 'Studio',
    plan: 'studio',
    seats: 1,
  }),
]);

export const BLOCK_PRODUCTS = Object.freeze([
  Object.freeze({ allowanceGb: 50, amountCents: 5000, description: 'For one-off projects and quieter seasons.', featured: false, name: '50 GB block', sku: 'block_50' }),
  Object.freeze({ allowanceGb: 100, amountCents: 10000, description: 'A flexible block for several film-first deliveries.', featured: true, name: '100 GB block', sku: 'block_100' }),
  Object.freeze({ allowanceGb: 500, amountCents: 45000, description: 'Best value for a busy season without a subscription.', featured: false, name: '500 GB block', sku: 'block_500' }),
]);

export const TOP_UP_PRODUCT = Object.freeze({ allowanceGb: 5, amountCents: 500, name: '5 GB top-up', sku: 'topup_5' });
export const WHITE_LABEL_PRODUCT = Object.freeze({ amountCents: 14900, name: 'White label', sku: 'white_label_annual' });

const products = [
  ...SUBSCRIPTION_TIERS.flatMap((tier) => [
    {
      allowanceGb: tier.allowanceGb,
      amountCents: tier.monthly.amountCents,
      billingInterval: 'month',
      kind: 'subscription',
      name: `${tier.name} monthly`,
      plan: tier.plan,
      seats: tier.seats,
      sku: tier.monthly.sku,
      whiteLabel: true,
    },
    {
      allowanceGb: tier.allowanceGb,
      amountCents: tier.annual.amountCents,
      billingInterval: 'year',
      kind: 'subscription',
      name: `${tier.name} annual`,
      plan: tier.plan,
      seats: tier.seats,
      sku: tier.annual.sku,
      whiteLabel: true,
    },
  ]),
  ...BLOCK_PRODUCTS.map((block) => ({ ...block, kind: 'block', whiteLabel: false })),
  { ...TOP_UP_PRODUCT, kind: 'topup', whiteLabel: false },
  { ...WHITE_LABEL_PRODUCT, kind: 'white_label', whiteLabel: true },
];

export const BILLING_PRODUCTS = Object.freeze(Object.fromEntries(products.map((product) => [product.sku, Object.freeze(product)])));

export function billingProduct(sku) {
  return BILLING_PRODUCTS[String(sku || '').trim()] ?? null;
}

export function formatCatalogMoney(amountCents) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amountCents / 100);
}

export function formatAllowance(allowanceGb) {
  return allowanceGb >= 1000 ? `${allowanceGb / 1000} TB` : `${allowanceGb} GB`;
}
