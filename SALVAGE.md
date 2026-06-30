# Bower Deliver Salvage Map

Archived on 2026-06-30.

This project is retired as a product UI, but parts of the backend and data model are worth reusing in the next build.

## Best Parts To Reuse

### Supabase Database Model

Files:

- `database/schema.sql`
- `database/2026-06-08-font-branding.sql`
- `database/2026-06-08-gallery-music.sql`
- `database/2026-06-08-hero-panel-colors.sql`
- `database/2026-06-08-secondary-theme-color.sql`
- `database/2026-06-10-bonus-unlock-description.sql`
- `database/2026-06-10-hero-focus.sql`
- `database/2026-06-10-logo-url.sql`

Useful concepts:

- studios/workspaces
- studio members
- deliveries
- delivery chapters
- media assets
- guest submissions
- bonus entitlements
- delivery events
- notifications
- domains
- TV sessions

Reuse this as a starting point, not as a blind copy. The new product should decide its entities from the design spec first, then map these tables into that shape.

### Supabase Auth And Session Wiring

Files:

- `src/supabaseAuth.js`
- `src/deliveryAuth.js`
- `src/supabaseDeliveryDataAdapter.js`

Useful concepts:

- Supabase Auth session restore
- studio membership lookup
- workspace-scoped data access
- API/local mode separation

The next project can reuse the auth approach if it also has vendor/studio accounts.

### API And Data Adapter Pattern

Files:

- `src/deliveryApiClient.js`
- `src/deliveryApiRoutes.js`
- `src/deliveryDataAdapter.js`
- `src/deliveryRepository.js`
- `functions/api/[[path]].js`

Useful concepts:

- one client adapter for UI calls
- route contracts that can work locally before full provider setup
- repository boundary between route handlers and data storage
- staged migration from local/demo data to real Supabase data

This is probably the most portable architecture from the project.

### Provider Service Shapes

Files:

- `src/deliveryServices.js`
- `src/deliveryProviderServices.server.js`
- `src/deliveryEmail.server.js`
- `src/r2Signing.js`
- `src/deliveryWebhooks.js`

Useful concepts:

- R2 upload targets
- Mux direct upload / playback workflow
- Stripe checkout and entitlement shape
- webhook handlers
- email notification boundaries

Carry these forward only after the new project confirms which providers it actually needs.

### Product Planning Docs

Files:

- `API_INTEGRATION_PLAN.md`
- `SUPABASE_SETUP.md`
- `PRE_LOGIN_READINESS_AUDIT.md`
- `SECRETS_ROTATION_CHECKLIST.md`
- `bower-deliver-sop.md`

These are useful as historical context and implementation checklists.

## Do Not Reuse By Default

- The old visual shell in `src/App.jsx`
- Most CSS in `src/styles.css`
- One-off HTML mockups
- Generated screenshots
- `dist/`
- `output/`
- `node_modules/`
- `.env.local`

The new product should treat the design spec as the source of truth and pull functionality forward only where it naturally fits.

## Migration Advice For The New Project

Start with the new project's user flows and data needs. Then copy the minimum viable backend pattern:

1. Auth/session model
2. Core database tables
3. Data adapter boundary
4. API route contracts
5. Provider integrations

Avoid importing old UI state shapes unless they match the new design. The old app had useful backend thinking, but the design and interaction model should stay retired.
