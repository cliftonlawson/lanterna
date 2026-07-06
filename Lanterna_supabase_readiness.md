# Lanterna Supabase Readiness

This tracks the handoff point between local/dashboard wiring and provider-backed media delivery.

## Local Work Done

- React dashboard rebuilt from the Claude design handoff.
- Local fallback persistence works without Supabase credentials.
- Supabase repository layer maps UI state to the schema tables.
- Supabase URL and anon key are configured for the current local build.
- New auth users bootstrap into a user, account, account member, vendor branding row, and usage row.
- Existing auth users without account membership can self-heal through `public.ensure_current_user_account()`.
- Upload simulation records upload jobs and usage events.
- Delivery flow creates delivery records and recipient rows.
- Database triggers cover first-delivery windows, delivered status, recipient event syncing, and allowance usage increments.
- The in-app browser reload after the account bootstrap migration loaded Supabase galleries without console warnings or errors.
- A smoke gallery named `Codex Smoke 2026-07-02 00:33` was created, uploaded through the simulated media flow, delivered to `codex-smoke@example.com`, and reloaded from Supabase with its delivery history intact.
- Successful Supabase gallery reads now return an empty list when the account has no galleries instead of falling back to stale local/demo state.

## Current Verification

Supabase CRUD smoke is passing for gallery creation, simulated upload metadata, delivery send rows, recipient history, and reload hydration. Avoid destructive test data cleanup until the expected seeded/demo records are confirmed.

## Still Not Wired

- Cloudflare credentials are not installed yet, but the Pages Functions boundary exists for signed R2 upload slots, Cloudflare Stream direct uploads, delivery email notifications, and public gallery payload reads.
- Real browser-to-R2/Stream transfer UI still needs to replace the current upload simulation.
- Real background media processing workers still need provider credentials and queue processing.
- Transactional email is scaffolded through `EMAIL_PROVIDER=mock` or Resend; live sending needs provider secrets.
- Public client gallery routing now has an API payload route, but the client-facing gallery page and password session flow still need to be built.
