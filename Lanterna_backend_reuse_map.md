# Lanterna Backend Reuse Map

This repo starts from the Lanterna source-of-truth docs, not the old Bower Deliver app.

Primary build inputs:

- `Lanterna_schema_spec.md` owns the Supabase schema, RLS shape, retention model, upload allowance model, and table boundaries.
- `Lanterna_infrastructure_SOP.md` owns the Supabase/Cloudflare operational boundary.
- `design_handoff_lanterna_dashboard/Lanterna Dashboard.dc.html` and its screenshots own the vendor UI behavior and visual design.

`SALVAGE.md` and `ARCHIVE_NOTE.md` are backend reference material only. Do not reuse the old product shell, CSS, mockups, screenshots, or UI state model.

## What maps cleanly

### Workspace/auth model

Old Bower Deliver pieces:

- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/supabaseAuth.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryAuth.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/supabaseDeliveryDataAdapter.js`

Lanterna target:

- `users`
- `accounts`
- `account_members`
- `account_invites`

Reuse the session-restore, bearer-token, and workspace lookup patterns. Rename the domain from `studio` / `workspace` to `account`, and make every privileged query account-scoped through membership. Do not use user-owned row access as the security model; the schema spec requires account-scoped RLS.

### API route and adapter boundary

Old Bower Deliver pieces:

- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryApiClient.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryApiRoutes.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryDataAdapter.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryRepository.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/functions/api/[[path]].js`

Lanterna target:

- UI client calls a single app API client.
- API routes own auth, validation, provider calls, and Supabase writes.
- Repository/adapter owns row mapping between camelCase UI models and snake_case schema rows.
- Cloudflare Pages/Workers function entry can keep the same small adapter shape.

This is the highest-value reuse. The old route names should not be copied directly; rebuild route contracts around Lanterna nouns: accounts, galleries, gallery_design, videos, albums, photos, deliveries, delivery_recipients, delivery_events, upload_jobs, and media_tasks.

### Direct-to-R2 uploads

Old Bower Deliver pieces:

- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/r2Signing.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryServices.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryProviderServices.server.js`

Lanterna target:

- `upload_jobs`
- `videos.r2_key`
- `photos.r2_key`
- `vendor_branding.logo_r2_key`
- `gallery_design.background_r2_key`
- `gallery_design.music_track_r2_key`

Reuse the AWS SigV4 R2 presigned URL implementation and the provider-service abstraction. Change object keys to Lanterna paths, for example account/gallery/media-scoped keys instead of old `deliveries/.../chapters` keys. Add multipart/resumable handling only when the upload flow needs it; the old signer is a good single-part baseline.

### Provider and webhook boundaries

Old Bower Deliver pieces:

- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryProviderServices.server.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryWebhooks.js`
- `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryEmail.server.js`

Lanterna target:

- `media_tasks`
- `videos.processing_status`
- `videos.stream_uid`
- `videos.stream_ready`
- `videos.web_copy_r2_key`
- `delivery_events`
- `deliveries`
- `delivery_recipients`

Reuse the boundary style, not the provider details. Bower Deliver used Mux-shaped video workflows; Lanterna uses Cloudflare Stream plus R2. Webhooks should normalize provider events into `media_tasks` updates and append-only `delivery_events`, then reconcile Cloudflare usage into `account_usage`.

### Delivery proof

Old Bower Deliver pieces:

- `delivery_events` table concept in `/Users/cliftonlawson/Desktop/BOWER DELIVER/database/schema.sql`
- event helpers in `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/deliveryRepository.js`
- public delivery payload patterns in `/Users/cliftonlawson/Desktop/BOWER DELIVER/src/publicDeliveryPayload.js`

Lanterna target:

- `deliveries`
- `delivery_recipients`
- `delivery_events`

Reuse the append-only event idea. Lanterna’s proof model is more explicit: one `deliveries` row per send action, denormalized recipient status for list reads, and immutable event history for truth.

## What needs translation

### Old deliveries are not Lanterna galleries one-to-one

Bower Deliver’s `deliveries` entity mixes what Lanterna separates into:

- `galleries`
- `gallery_design`
- `videos`
- `albums`
- `photos`
- `deliveries`
- `delivery_recipients`
- `delivery_events`

Do not copy the old delivery row shape into Lanterna. Use it only as a reference for route flow and adapter structure.

### Old chapters do not match Lanterna v1

Bower Deliver had `delivery_chapters`. Lanterna’s spec models films as `videos` inside a gallery. If chapters/sections return later, they should be a new Lanterna feature, not a hidden carryover.

### Old media assets split into videos and photos

Bower Deliver’s `media_assets` maps into separate Lanterna tables:

- film records -> `videos`
- image records -> `photos`
- album organization -> `albums`

Keep the old media mapping utilities as a shape reference, but write new converters against the schema spec.

### Old branding/settings split differently now

Bower Deliver’s studio settings and design migrations map into:

- `vendor_branding` for account-wide client-facing brand defaults
- `gallery_design` for per-gallery heading, layout, background, music, style, top buttons, featured film, and download override

Do not put gallery-specific design state on the account branding row.

### Billing and usage are a new Lanterna model

Bower Deliver’s Stripe/entitlement concepts are useful as integration references, but Lanterna’s schema locks a different model:

- upload allowance gates new uploads
- `account_usage` caches Cloudflare-reported physical usage
- `usage_events` records metered usage changes
- `subscriptions` and `entitlements` determine plan limits and extensions

Keep billing provider code behind a service boundary so the app can enforce upload allowance without confusing it with Cloudflare cost reconciliation.

## First backend build order

1. Keep the current Lanterna migration aligned to `Lanterna_schema_spec.md`.
2. Add a typed data adapter that maps schema rows to UI models without leaking old Bower names.
3. Add account auth/session lookup and account-scoped API context.
4. Build gallery CRUD, gallery design updates, and media metadata writes.
5. Add direct-to-R2 upload URL generation and `upload_jobs`.
6. Add Cloudflare Stream/media task lifecycle.
7. Add delivery send/proof routes and client delivery Worker access checks.
8. Add billing/entitlement enforcement after the core delivery path works.

## Reuse warnings

The Bower Deliver visual shell is retired. The old CSS, `App.jsx`, mock API screens, generated `dist`, and old one-off mockups should stay out of Lanterna.

The useful backend pieces should be copied only after they are renamed and remapped against `Lanterna_schema_spec.md`. If a piece cannot be explained in Lanterna terms, it is not ready to reuse.
