# Lanterna

Lanterna is a video delivery dashboard for wedding and portrait studios. The current build is the Claude design handoff rebuilt in React, with local fallback state for demo mode and Supabase persistence ready behind environment variables.

## What Is Built

The dashboard currently supports the main studio workflow:

- gallery list, project filters, archived galleries, and upload allowance stats
- gallery studio with videos, photos, design controls, settings, and delivery preflight
- live client preview that updates from gallery design, media, and studio branding
- vendor dashboard and account surfaces backed by shared workspace state
- local upload simulation that creates upload jobs, processing media, and usage events
- Supabase repository mapping for galleries, design, videos, albums, photos, recipients, workspace branding, account usage, upload jobs, and delivery state

Without Supabase credentials, the app runs against localStorage so the design and workflow can be tested immediately.

## Local Dev

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

For Cloudflare Pages Functions locally, build first, then run Wrangler against `dist`:

```bash
npm run build
npx wrangler pages dev dist
```

## Supabase Setup

Create a Supabase project, then add these to `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Cloudflare Pages Functions also need server-only Supabase values. Set them as Wrangler/Pages secrets, not as `VITE_` variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Apply every migration in `supabase/migrations` in timestamp order:

```bash
supabase db push
```

or paste/run the SQL files in that directory in timestamp order.

The initial schema creates the account-scoped data model, RLS policies, and a first-login bootstrap trigger. The state-machine migration adds delivery clocks, recipient status syncing, and upload usage accounting.

## Cloudflare and Email Setup

The Cloudflare Pages Function at `functions/api/[[path]].js` exposes the backend boundary for provider-owned work:

```text
POST /api/upload/slot
POST /api/upload/complete
POST /api/delivery/notify
GET  /api/billing/status
POST /api/billing/checkout
POST /api/billing/portal
GET  /api/connect/status
POST /api/connect/onboarding
POST /api/stripe/webhook
POST /api/stripe/connect/webhook
POST /api/contact
GET  /api/public/gallery/:slug
```

Configure these as Cloudflare Pages secrets:

```bash
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=lanterna-dev
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_STREAM_API_TOKEN=your-stream-api-token
EMAIL_PROVIDER=resend
EMAIL_PROVIDER_API_KEY=your-resend-api-key
RESEND_READ_API_KEY=your-full-access-resend-api-key
EMAIL_FROM="Lanterna <deliver@lanterna.video>"
EMAIL_REPLY_TO=team@hellobower.com
CONTACT_EMAIL=team@hellobower.com
PUBLIC_DELIVERY_BASE_URL=https://deliver.your-domain.com
STRIPE_SECRET_KEY=your-stripe-platform-secret-key
STRIPE_WEBHOOK_SECRET=your-platform-webhook-signing-secret
STRIPE_CONNECT_WEBHOOK_SECRET=your-connect-webhook-signing-secret
FILM_SALES_ENABLED=false
```

`EMAIL_PROVIDER_API_KEY` should stay send-only in Resend. `RESEND_READ_API_KEY` is a separate server-only full-access key used only for provider-side delivery-status lookups. `EMAIL_PROVIDER=mock` keeps delivery email calls as previews while the rest of the delivery proof rows write to Supabase.

Film sales are launch-gated and default to off. Keep `FILM_SALES_ENABLED=false` until Stripe Connect approval and live paid-unlock acceptance testing are complete, then set it to `true`. Stripe Connect uses direct charges so the studio is the merchant of record. Create a Connect webhook for `https://app.lanterna.video/api/stripe/connect/webhook`, enable connected-account events, and subscribe to `account.updated`, `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `payment_intent.payment_failed`, and `charge.refunded`. Store that endpoint's signing secret separately as `STRIPE_CONNECT_WEBHOOK_SECRET`.

Platform subscriptions, upload blocks, top-ups, and white-label purchases use the platform webhook at `https://app.lanterna.video/api/stripe/webhook`. Subscribe it to `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, and `charge.refunded`. The same endpoint also receives platform paid-unlock events. Billing amounts and allowances come from `src/shared/billingCatalog.js`; Stripe Checkout receives those server-owned values and the webhook verifies them again before granting an entitlement.

## Next External Pieces

Before deploying platform billing, apply the latest Supabase migrations and add the platform webhook events listed above to the existing Stripe endpoint. Run the first subscription and one-time block purchases in Stripe test mode before switching the platform key to live mode.
