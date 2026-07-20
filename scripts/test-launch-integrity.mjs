import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/lanternaApi.js');
const auth = read('../src/pages/Auth.tsx');
const app = read('../src/App.tsx');
const contact = read('../src/components/ContactModal.tsx');
const context = read('../src/contexts/AuthContext.tsx');
const headers = read('../public/_headers');
const html = read('../index.html');
const landing = read('../src/pages/Landing.tsx');
const migration = read('../supabase/migrations/20260720120000_launch_integrity_hardening.sql');
const platformBilling = read('../src/server/platformBilling.js');
const publicGallery = read('../src/pages/PublicGalleryPage.tsx');
const stripe = read('../src/server/stripeCheckout.js');

assert.match(context, /resetPasswordForEmail/);
assert.match(context, /PASSWORD_RECOVERY/);
assert.match(context, /updateUser/);
assert.match(auth, /Forgot your password/);
assert.match(auth, /Terms/);
assert.match(auth, /Privacy Notice/);

assert.match(landing, /href="\/privacy"/);
assert.match(landing, /href="\/terms"/);
assert.match(landing, /ContactModal/);
assert.match(contact, /team@hellobower\.com/);
assert.match(contact, /aria-modal="true"/);
assert.match(app, /window\.location\.pathname === '\/support'/);
assert.match(headers, /Strict-Transport-Security/);
assert.match(headers, /Content-Security-Policy/);
assert.match(headers, /X-Content-Type-Options: nosniff/);
assert.match(html, /https:\/\/lanterna\.video\/social\/lanterna-share\.png/);
assert.match(html, /LANTERNA — Illuminate Every Film Delivery/);
assert.doesNotMatch(html, /og:image[^>]+lumen-hero/);

assert.match(api, /path === 'storage\/status'/);
assert.match(api, /path === 'account\/delete'/);
assert.match(api, /purgeGalleryResources/);
assert.match(api, /deleteSupabaseAuthUser/);
assert.match(api, /consume_public_rate_limit/);
assert.match(api, /path === 'contact'/);
assert.match(api, /p_scope: 'contact_form'/);
assert.match(api, /CONTACT_EMAIL/);
assert.match(migration, /public_api_rate_limits/);

assert.match(migration, /video_unlock_recovery_tokens/);
assert.match(stripe, /sendTransactionalEmail/);
assert.match(stripe, /confirmPaidUnlockRecovery/);
assert.match(publicGallery, /unlock_recovery/);
assert.match(migration, /reverse_one_time_billing/);
assert.match(platformBilling, /event\.type === 'charge\.refunded'/);
assert.match(stripe, /markPurchaseRefunded/);
assert.match(stripe, /FILM_SALES_ENABLED/);
assert.match(stripe, /film_sales_coming_soon/);
assert.match(landing, /Coming soon/);

console.log('launch integrity checks passed');
