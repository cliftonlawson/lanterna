import assert from 'node:assert/strict';
import fs from 'node:fs';
import { billingProduct, BLOCK_PRODUCTS, SUBSCRIPTION_TIERS, TOP_UP_PRODUCT, WELCOME_ALLOWANCE_GB, WHITE_LABEL_PRODUCT } from '../src/shared/billingCatalog.js';
import { sourceFilesAvailable } from '../src/server/galleryAccess.js';

const landing = fs.readFileSync(new URL('../src/pages/Landing.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260718120000_retention_and_white_label_entitlements.sql', import.meta.url), 'utf8');
const billingMigration = fs.readFileSync(new URL('../supabase/migrations/20260718143000_platform_billing_fulfillment.sql', import.meta.url), 'utf8');
const publicGallery = fs.readFileSync(new URL('../src/pages/PublicGalleryPage.tsx', import.meta.url), 'utf8');
const publicApi = fs.readFileSync(new URL('../src/server/lanternaApi.js', import.meta.url), 'utf8');
const workspaceModel = fs.readFileSync(new URL('../src/pages/lanterna-dashboard/model.ts', import.meta.url), 'utf8');
const welcomeMigration = fs.readFileSync(new URL('../supabase/migrations/20260718142500_welcome_entitlement_source.sql', import.meta.url), 'utf8');

assert.deepEqual(SUBSCRIPTION_TIERS.map((tier) => ({
  allowanceGb: tier.allowanceGb,
  annual: tier.annual.amountCents,
  monthly: tier.monthly.amountCents,
})), [
  { allowanceGb: 50, annual: 20900, monthly: 1900 },
  { allowanceGb: 1000, annual: 75900, monthly: 6900 },
  { allowanceGb: 5000, annual: 186000, monthly: 16900 },
]);
assert.deepEqual(BLOCK_PRODUCTS.map((block) => [block.allowanceGb, block.amountCents]), [[50, 5000], [100, 10000], [500, 45000]]);
assert.deepEqual([TOP_UP_PRODUCT.allowanceGb, TOP_UP_PRODUCT.amountCents], [5, 500]);
assert.equal(WHITE_LABEL_PRODUCT.amountCents, 14900);
assert.equal(WELCOME_ALLOWANCE_GB, 10);
assert.equal(billingProduct('studio_annual')?.billingInterval, 'year');

for (const promise of [
  'SUBSCRIPTION_TIERS',
  'BLOCK_PRODUCTS',
  '$149/year',
  'Original-quality downloads are available for one year',
  'optimized client galleries remain accessible for 10 years',
]) {
  assert.ok(landing.includes(promise), `Landing pricing promise is missing: ${promise}`);
}

assert.match(migration, /source_file_window_days SET DEFAULT 365/);
assert.match(migration, /white_label_until timestamptz/);
assert.match(migration, /account_has_white_label/);
assert.match(migration, /current_period_end > now\(\)/);
assert.match(migration, /custom domain/i);
assert.match(billingMigration, /allowance_total_gb SET DEFAULT 0/);
assert.match(billingMigration, /fulfill_subscription_billing/);
assert.match(billingMigration, /fulfill_one_time_billing/);
assert.match(billingMigration, /refresh_account_billing_state/);
assert.match(billingMigration, /VALUES \(new_account_id, 0, 10, now\(\), now\(\) \+ interval '1 year', now\(\)\)/);
assert.match(billingMigration, /interval '1 year'/);
assert.match(billingMigration, /v_has_subscription AND NOT v_has_block/);
assert.match(billingMigration, /parent_reference = p_stripe_subscription_id/);
assert.match(billingMigration, /parent_reference text/);
assert.match(billingMigration, /new_account_id, 'welcome', 10/);
assert.match(welcomeMigration, /ADD VALUE IF NOT EXISTS 'welcome'/);
assert.match(workspaceModel, /allowanceTotalGb: WELCOME_ALLOWANCE_GB/);
assert.match(billingMigration, /p_allowance_gb \+ v_topup_gb/);

assert.match(publicApi, /whiteLabel/);
assert.match(publicApi, /status=eq\.active/);
assert.match(publicApi, /DEFAULT_UPLOAD_ALLOWANCE_GB = 0/);
assert.equal(sourceFilesAvailable({ source_file_expires_at: '2026-07-19T00:00:00.000Z' }, Date.parse('2026-07-18T00:00:00.000Z')), true);
assert.equal(sourceFilesAvailable({ source_file_expires_at: '2026-07-17T00:00:00.000Z' }, Date.parse('2026-07-18T00:00:00.000Z')), false);
assert.equal(sourceFilesAvailable({ source_file_expires_at: 'not-a-date' }, Date.parse('2026-07-18T00:00:00.000Z')), false);
assert.equal(sourceFilesAvailable({ source_file_expires_at: null }, Date.parse('2026-07-18T00:00:00.000Z')), true);
assert.match(publicGallery, /Powered by LANTERNA/);
assert.match(publicGallery, /!workspace\.whiteLabel/);

console.log('Pricing, retention, and white-label entitlement contract passed.');
