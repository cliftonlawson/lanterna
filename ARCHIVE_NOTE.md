# Bower Deliver Archive Note

Archived on 2026-06-30.

Bower Deliver is retired as the active product direction. The UI and product shell should not be carried forward by default.

The project remains useful as a reference for:

- Supabase schema and workspace model
- auth/session wiring
- delivery data adapters
- API route contracts
- R2/Mux/Stripe/email provider boundaries
- integration planning docs

Local secrets are intentionally not part of the source archive. Use `.env.example`, `.env.server.example`, `SUPABASE_SETUP.md`, and `SECRETS_ROTATION_CHECKLIST.md` to recreate or rotate environment variables if needed.

Before fully decommissioning any live services, check:

- Supabase project status and keys
- Cloudflare Pages project and environment variables
- R2 buckets and access keys
- Mux token/webhook status
- Stripe products/webhooks/test data
- any public deploy URLs

For reuse guidance, read `SALVAGE.md` first.
