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
GET  /api/connect/status
POST /api/connect/onboarding
POST /api/stripe/connect/webhook
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
PUBLIC_DELIVERY_BASE_URL=https://deliver.your-domain.com
STRIPE_SECRET_KEY=your-stripe-platform-secret-key
STRIPE_WEBHOOK_SECRET=your-platform-webhook-signing-secret
STRIPE_CONNECT_WEBHOOK_SECRET=your-connect-webhook-signing-secret
```

`EMAIL_PROVIDER_API_KEY` should stay send-only in Resend. `RESEND_READ_API_KEY` is a separate server-only full-access key used only for provider-side delivery-status lookups. `EMAIL_PROVIDER=mock` keeps delivery email calls as previews while the rest of the delivery proof rows write to Supabase.

Stripe Connect uses direct charges so the studio is the merchant of record. Create a Connect webhook for `https://app.lanterna.video/api/stripe/connect/webhook`, enable connected-account events, and subscribe to `account.updated`, `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`, and `payment_intent.payment_failed`. Store that endpoint's signing secret separately as `STRIPE_CONNECT_WEBHOOK_SECRET`.

## Next External Pieces

Supabase CRUD is wired and smoke-tested. The next live integration step is adding real Cloudflare credentials, running the Pages Function locally or in Cloudflare, and replacing the current upload simulation with browser-to-R2/Stream transfers.
