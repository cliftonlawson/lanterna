export type BillingInterval = 'month' | 'year';
export type BillingKind = 'subscription' | 'block' | 'topup' | 'white_label';
export type PlanTier = 'starter' | 'pro' | 'studio';

export type BillingProduct = {
  allowanceGb?: number;
  amountCents: number;
  billingInterval?: BillingInterval;
  kind: BillingKind;
  name: string;
  plan?: PlanTier;
  seats?: number;
  sku: string;
  whiteLabel: boolean;
};

export type SubscriptionTier = {
  allowanceGb: number;
  annual: { amountCents: number; sku: string };
  description: string;
  featured: boolean;
  monthly: { amountCents: number; sku: string };
  name: string;
  plan: PlanTier;
  seats: number;
};

export type BlockProduct = {
  allowanceGb: number;
  amountCents: number;
  description: string;
  featured: boolean;
  name: string;
  sku: string;
};

export const WELCOME_ALLOWANCE_GB: 10;
export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[];
export const BLOCK_PRODUCTS: readonly BlockProduct[];
export const TOP_UP_PRODUCT: Readonly<BillingProduct>;
export const WHITE_LABEL_PRODUCT: Readonly<BillingProduct>;
export const BILLING_PRODUCTS: Readonly<Record<string, BillingProduct>>;
export function billingProduct(sku: string): BillingProduct | null;
export function formatCatalogMoney(amountCents: number): string;
export function formatAllowance(allowanceGb: number): string;
