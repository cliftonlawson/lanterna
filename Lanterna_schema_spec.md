# Lanterna — Data Model & Schema Spec

The connective tissue between the design handoff, the infrastructure SOP, and the build. This is the document Codex builds migrations from. It locks the retention and billing model: upload-capacity billing (the flow meter), a 2-year originals-and-streaming window nested inside a 10-year web-viewing window, then archive with a cheap extend. It defines every table, enum, state machine, and the Supabase-versus-Cloudflare boundary.

Postgres types throughout (Supabase). Section 12 lists what is locked versus what is still open (none of the open items block the schema).

---

## 0. The one principle that prevents the expensive mistakes

There are two systems and they own different truths.

- **Supabase owns relational truth**: galleries, videos, photos, albums, recipients, events, entitlements, usage. Every metadata field, every relationship, every state machine lives here.
- **Cloudflare owns physical truth**: the actual bytes in R2 and the actual minutes in Stream. The app never computes "storage used" by summing `r2_bytes` rows and trusting it as the bill. It caches Cloudflare's reported figures into `account_usage` on a sync job. Supabase rows hold the *pointers* (`r2_key`, `stream_uid`) and the *intended* sizes; Cloudflare is the source of truth for what is actually stored and billed.

Corollary: deleting media is always a two-step, two-system operation. Soft-delete the Supabase row, then purge the R2 object and Stream video, then reconcile usage. Never delete one side and assume the other followed.

And the meter that gates uploads is **not** the meter that drives your cost. Track both, separately (section 6).

### 0a. Access control: RLS is account-scoped, client viewing is not RLS at all

Build-critical, because the repo is moving from user-owned rows to account-owned rows. Two separate access paths:

- **Studio/team access (Postgres RLS)**: every table is owned by an `account_id`, and row-level security keys off membership, not the row's creator. The policy shape is "the current user is a member of this row's account," i.e. an `exists` check against `account_members` for `auth.uid()` and the row's `account_id` — never `auth.uid() = user_id`. Tables without a direct `account_id` (videos, photos, albums, gallery_design, delivery_*) join up to their gallery's account. Apply this to every table; there is no row a logged-in user should reach outside their account.
- **Client gallery viewing (NOT RLS)**: clients are not authenticated Supabase users and must never be modeled as one. Public/password/private viewing runs entirely through the delivery Worker, which checks gallery access, validates the password, honors the retention clocks, and mints short-lived signed URLs. Do not try to express client viewing as a Postgres policy; that path does not touch RLS.

---

## 1. Accounts, users, teams

```
accounts                      -- the studio / billing entity / workspace
  id              uuid pk
  name            text                      -- studio name, e.g. "Retrosound Films"
  created_at      timestamptz default now()
  deleted_at      timestamptz null

users                         -- individuals; mirrors Supabase auth.users
  id              uuid pk                    -- = auth.users.id
  email           text unique
  display_name    text
  created_at      timestamptz default now()

account_members               -- join: who can act in which workspace
  account_id      uuid fk -> accounts.id
  user_id         uuid fk -> users.id
  role            member_role                -- owner | member
  created_at      timestamptz default now()
  pk (account_id, user_id)

account_invites               -- pending invites for people without an auth user yet
  id              uuid pk
  account_id      uuid fk -> accounts.id
  email           text
  role            member_role
  token           text unique               -- emailed invite link
  status          invite_status             -- pending | accepted | revoked | expired
  invited_by      uuid fk -> users.id
  expires_at      timestamptz
  accepted_at     timestamptz null
  created_at      timestamptz default now()
  index (account_id, status)
```

Seat limits (Starter/Pro = 1, Studio = 2) are enforced by counting `account_members` plus pending `account_invites` against the active subscription's `seats`. Invite Collaborator writes an `account_invites` row; on acceptance it converts into an `account_members` row and the invite is marked `accepted`.

---

## 2. Vendor branding

One row per account. This is what the Vendor Dashboard edits and what the client gallery renders.

```
vendor_branding
  account_id           uuid pk fk -> accounts.id
  studio_name          text
  tagline              text
  logo_r2_key          text null
  accent_color         text                  -- hex
  custom_domain        text null             -- e.g. deliver.studioname.com
  default_downloads    boolean default true  -- default allow-download for new galleries
  updated_at           timestamptz default now()
```

---

## 3. Galleries

The core deliverable. Status and archive are separate axes; do not collapse them.

```
galleries
  id                  uuid pk
  account_id          uuid fk -> accounts.id
  name                text
  client_name         text null
  event_date          date null
  project_type        project_type           -- wedding | engagement | portrait
  slug                text                    -- unique per account; used in delivery URL
  access_type         access_type            -- public | password | private
  password_hash       text null              -- required non-null when access_type = password
  status              gallery_status         -- draft | published | delivered
  cover_video_id      uuid null fk -> videos.id
  cover_photo_id      uuid null fk -> photos.id

  -- retention (two nested clocks)
  source_file_window_days  int default 730     -- 2 yr: originals + Stream playback guaranteed
  source_file_expires_at   timestamptz null    -- set on first delivery
  access_window_days       int default 3650    -- 10 yr: web-copy viewing window
  access_expires_at        timestamptz null    -- set on first delivery
  storage_tier             storage_tier        -- hot | web | cold | archived | purged
  is_extended              boolean default false
  extended_until           timestamptz null

  -- lifecycle timestamps
  published_at        timestamptz null
  delivered_at        timestamptz null
  archived_at         timestamptz null        -- archive is orthogonal to status
  created_at          timestamptz default now()
  updated_at          timestamptz default now()
  deleted_at          timestamptz null        -- soft delete (undo window)

  unique (account_id, slug)
  index (account_id, status, archived_at)
  index (access_expires_at) where deleted_at is null
```

Notes:
- `archived_at` is a flag, not a status value. A gallery can be `delivered` and archived at once. The old `active | archived` column maps to: status enum (new) + `archived_at` (new). This is the schema growth Codex called out.
- Two retention clocks, both started at first delivery (`delivered_at`): `source_file_expires_at` = `delivered_at + source_file_window_days` (2 yr, originals + Stream), and `access_expires_at` = `delivered_at + access_window_days` (10 yr, web-copy viewing). The access clock is the long, cheap promise; the source-file clock is the short, expensive one nested inside it.
- A Worker refuses to mint signed URLs once `now() > access_expires_at` unless `is_extended and now() < extended_until`. Between `source_file_expires_at` and `access_expires_at`, only the web copy is served (no master download, no Stream).
- Pre-flight gate (from the flow spec): publish/deliver is blocked unless `access_type` is set, at least one `video` exists, and a cover is chosen; `password` access requires non-null `password_hash`.

### 3a. Gallery design (the Studio editor state)

One row per gallery. Backs the Gallery Studio design tabs (heading, layout, background, music, styles, featured film, top buttons). Separate from `galleries` because it changes on its own cadence and keeps the core gallery row lean, and separate from `vendor_branding` because that is studio-wide while this is per-gallery.

```
gallery_design
  gallery_id           uuid pk fk -> galleries.id
  heading_title        text null            -- client-facing heading (distinct from galleries.name)
  heading_subtitle     text null
  layout_template      text                 -- template key
  background_type      background_type      -- image | video (no solid color, per handoff)
  background_r2_key    text null            -- image or video background
  theme                text                 -- client theme key (e.g. dark/light/custom)
  accent_color         text null            -- per-gallery override of studio accent
  typography           text null            -- font choice key
  music_track_r2_key   text null
  featured_video_id    uuid null fk -> videos.id
  enabled_buttons      jsonb                -- e.g. {"share":true,"embed":false,"download":true}
  allow_downloads      boolean null         -- per-gallery override; null = inherit vendor_branding
  updated_at           timestamptz default now()
```

Override precedence is gallery-then-studio: a non-null `gallery_design` value wins over the `vendor_branding` default; null means inherit. The client gallery resolves accent, downloads, and similar by checking `gallery_design` first, then `vendor_branding`. (Default chosen: per-gallery overrides studio. Flip only if you want studio settings to be hard, non-overridable.)

`enabled_buttons` is jsonb because it is a small, flexible set of UI toggles (share / embed / download and any future additions); this also covers the per-film "embed/share availability" Codex raised, handled at the gallery level rather than duplicated per video.

---

## 4. Media: videos, albums, photos

```
videos                          -- films; straddles Supabase + Cloudflare
  id                 uuid pk
  gallery_id         uuid fk -> galleries.id
  title              text
  sort_order         int
  r2_key             text null               -- master in R2 (download source of truth)
  r2_bytes           bigint default 0         -- intended size; reconcile vs Cloudflare
  duration_seconds   int default 0            -- drives Stream storage cost
  stream_uid         text null                -- Cloudflare Stream id (playback, dropped after source-file window)
  stream_ready       boolean default false
  web_copy_r2_key    text null                -- compressed MP4 for long-tail viewing; served from cold R2, no Stream
  web_copy_bytes     bigint default 0
  poster_r2_key      text null
  processing_status  processing_status        -- uploading | processing | ready | errored
  download_enabled   boolean null             -- null = inherit gallery/account default
  visible_in_gallery boolean default true     -- per-film show/hide in the client gallery
  tags               text[] default '{}'      -- drawer tags; array (low-stakes, no join table)
  created_at         timestamptz default now()
  updated_at         timestamptz default now()
  deleted_at         timestamptz null
  index (gallery_id, sort_order)

albums                          -- metadata grouping for photos; NOT folders
  id                 uuid pk
  gallery_id         uuid fk -> galleries.id
  name               text
  sort_order         int
  created_at         timestamptz default now()
  deleted_at         timestamptz null

photos
  id                 uuid pk
  gallery_id         uuid fk -> galleries.id
  album_id           uuid null fk -> albums.id   -- null = "All" / uncategorized
  r2_key             text
  r2_bytes           bigint default 0
  width              int null
  height             int null
  sort_order         int
  processing_status  processing_status
  created_at         timestamptz default now()
  deleted_at         timestamptz null
  index (gallery_id, album_id, sort_order)
```

Moving a photo between albums (a core flow) is an `album_id` update, never a file move. Deleting an album reassigns its photos to `null` (the "All" bucket); it does not delete photos. (Locked behavior.)

Replace Video is in-place: it swaps the file by overwriting the keys and resetting `processing_status`, keeping the same `videos` row, title, tags, and sort position. No version-history table in v1 (do not build versioning that was not asked for); the old master is cleaned up via a `media_tasks` delete once the replacement is `ready`.

---

## 5. Delivery record (append-only)

Proof of delivery is the product. A `deliveries` row is one send action (with its optional message); recipients carry current status (denormalized for cheap list reads); events are the immutable log of truth. Never overwrite the event history.

```
deliveries                      -- one send action; a gallery can have many
  id                 uuid pk
  gallery_id         uuid fk -> galleries.id
  message            text null               -- optional custom message from the Deliver screen
  sent_by            uuid fk -> users.id
  sent_at            timestamptz default now()
  index (gallery_id, sent_at)

delivery_recipients             -- one row per recipient per delivery
  id                 uuid pk
  delivery_id        uuid fk -> deliveries.id
  gallery_id         uuid fk -> galleries.id   -- denormalized for direct gallery queries
  email              text
  name               text null
  status             recipient_status        -- sent | opened | failed   (denormalized current state)
  last_sent_at       timestamptz             -- updated on resend
  first_opened_at    timestamptz null
  created_at         timestamptz default now()
  index (gallery_id)
  index (delivery_id)

delivery_events                 -- immutable; source of truth, powers per-film stats
  id                 uuid pk
  gallery_id         uuid fk -> galleries.id
  recipient_id       uuid null fk -> delivery_recipients.id
  video_id           uuid null fk -> videos.id
  event_type         delivery_event_type     -- sent | failed | opened | video_viewed | downloaded
  occurred_at        timestamptz default now()
  metadata           jsonb null
  index (gallery_id, occurred_at)
  index (video_id, event_type)
```

The denormalized `status`/`first_opened_at`/`last_sent_at` on `delivery_recipients` exist so the Deliver screen can list recipients with current state without aggregating the event log on every render; the events remain the source of truth and reconcile the denormalized fields. Per-film view and download counts are derived from `delivery_events`. Resend creates a new `deliveries` row (one message, many recipients) and writes new `sent` events; it never edits old ones. First delivery to at least one recipient advances gallery `status` to `delivered` and starts both retention clocks.

---

## 6. Billing: entitlements, usage, and the two meters

Do not hardcode three tiers and three block sizes. Model capacity generically as **grants**, sum the active ones, and let policy decide stacking. This makes a new tier or a promo a data row, not a migration.

```
subscriptions                   -- the recurring plan, if any
  id                      uuid pk
  account_id              uuid fk -> accounts.id
  plan                    plan_tier            -- starter | pro | studio
  status                  sub_status           -- active | past_due | canceled
  seats                   int
  current_period_start    timestamptz
  current_period_end      timestamptz
  stripe_subscription_id  text null
  created_at              timestamptz default now()

entitlements                    -- generic upload-capacity grants (the key abstraction)
  id              uuid pk
  account_id      uuid fk -> accounts.id
  source          entitlement_source    -- subscription | block | topup
  gb_granted      numeric(10,2)
  period_start    timestamptz
  period_end      timestamptz           -- subscription: = period end; block: purchase + 1 year; confirm
  status          entitlement_status    -- active | expired | consumed
  stripe_reference text null
  created_at      timestamptz default now()
  index (account_id, status, period_end)

usage_events                    -- append-only FLOW meter: allowance consumed on upload
  id              uuid pk
  account_id      uuid fk -> accounts.id
  entitlement_id  uuid null fk -> entitlements.id   -- which grant it drew from
  bytes           bigint                           -- provider-verified byte truth
  gb              numeric(18,9)                    -- decimal bytes / 1,000,000,000
  upload_job_id   uuid null                         -- unique when tied to a client upload
  gallery_id      uuid null fk -> galleries.id
  video_id        uuid null fk -> videos.id
  photo_id        uuid null fk -> photos.id
  occurred_at     timestamptz default now()
  index (account_id, occurred_at)

account_usage                   -- cached rollup; the dashboard reads this
  account_id              uuid pk fk -> accounts.id
  allowance_used_gb       numeric(18,9)   -- FLOW: decimal GB consumed this period
  allowance_total_gb      numeric(12,2)   -- sum of active entitlements
  hot_bytes_stored        bigint          -- STOCK: reconciled FROM Cloudflare R2
  cold_bytes_stored       bigint          -- STOCK: R2 Infrequent Access
  stream_minutes_stored   numeric(12,2)   -- STOCK: reconciled FROM Cloudflare Stream
  synced_at               timestamptz
```

The two meters, made explicit:

- **Flow meter** (`allowance_used_gb` vs `allowance_total_gb`): increments on every successful upload via a server-written `usage_events` row, resets/recomputes per entitlement period, and **does not decrease when a gallery is deleted**. Authenticated clients can read usage, but cannot insert usage events directly. This is what the upload-slot Worker checks and what gates new uploads. This is what the customer is buying.
- **Unit rule**: storage allowances use decimal GB (`1 GB = 1,000,000,000 bytes`). Exact provider-verified bytes are retained on every new event so small photos cannot round down to zero and the rollup can be reproduced without trusting display precision.
- **Stock meter** (`hot_bytes_stored`, `cold_bytes_stored`, `stream_minutes_stored`): the real bytes and minutes, reconciled from Cloudflare on a schedule. This drives *your* cost and your cold-tiering decisions, not the customer's allowance.
- **Launch deferral**: stock-meter reconciliation is post-launch. Do not enqueue `reconcile_usage` tasks until the Cloudflare reconciliation worker/admin command exists; the upload allowance gate uses the flow meter, not stock-meter reconciliation.

UI consequence (carry back to design): the dashboard label must read as **"upload allowance used this period,"** not "storage used." With a flow meter, a deleted gallery does not free allowance, and "storage used" wording would generate support tickets. The over-cap block message becomes "you've used your annual upload room," with the upgrade/buy-a-block path.

Upload gate logic (pseudocode):
```
reserved_gb = sum(upload_jobs.bytes_total where status in pending/uploading)
available = allowance_total_gb - allowance_used_gb - reserved_gb
if requested_gb > available: refuse slot, surface upgrade/block path
else: issue upload slot, write usage_event on success
```

Stacking policy (confirm): blocks are an alternative to a subscription, and 5GB top-ups ($5/yr) unlock only after a first block purchase. Model this as a rule over `entitlements`, not as structure.

---

## 7. Upload jobs (resumable pipeline)

Backs the upload-queue UI (uploading / paused / processing / done) and the resume-on-disconnect promise.

```
upload_jobs
  id                  uuid pk
  account_id          uuid fk -> accounts.id
  gallery_id          uuid fk -> galleries.id
  target_type         text                   -- video | photo | background | poster
  target_id           uuid null              -- media id; gallery id for a background
  status              job_status             -- pending | uploading | paused | processing | complete | errored
  bytes_total         bigint
  bytes_uploaded      bigint default 0
  multipart_upload_id text null              -- R2 multipart session
  multipart_part_size bigint null             -- fixed R2 part size for resume validation
  r2_key              text null               -- server-issued master key
  content_type        text null
  file_name           text null
  upload_phase        text null               -- uploading_master | master_secured | starting_playback | preparing_playback | copy_failed | ready
  is_replacement      boolean default false   -- derived server-side from existing video assets
  verified_bytes      bigint null             -- R2 HEAD result, never client-reported
  master_verified_at  timestamptz null
  stream_upload_id    text null               -- Stream UID created by /stream/copy
  stream_source_expires_at timestamptz null   -- expiry of the R2 GET handed to Stream
  stream_copy_started_at timestamptz null
  copy_attempts       int default 0
  error_code          text null
  error_message       text null
  completed_at        timestamptz null
  created_at          timestamptz default now()
  updated_at          timestamptz default now()
  index (account_id, status)
```

For direct PUT uploads (photos, backgrounds, and uploaded posters), the slot writes the expected key, byte count, content type, and target to `upload_jobs` before returning the presigned URL. The expected `Content-Length` is part of the R2 signature, preventing the issued URL from accepting a differently sized object. Completion accepts the job identity, performs an R2 `HEAD`, and calls one service-only transaction that attaches the object, completes the job, and inserts the uniquely keyed usage event. Client-reported keys and byte counts are never completion authority. `gallery_design.background_r2_key` and `music_track_r2_key` are server-owned asset pointers even though the remaining design fields stay studio-editable. Repeating completion returns the original result without incrementing allowance again.

Video ingestion is R2-first. The browser uploads the master once through the server-issued multipart session. The server completes the multipart upload, verifies actual bytes and content type with R2 `HEAD`, attaches the master and records allowance usage exactly once, then gives Stream a time-limited R2 GET through `/stream/copy`. `master_secured` means the retained original is safe; only `ready` means Stream playback is encoded. Copy or encode failure moves the job to `copy_failed` while retaining the verified master for a no-reupload retry. Replacement status is derived server-side, and the existing video row is not swapped until the replacement Stream copy is ready.

Completion is server-authoritative: a client claiming "done" is not done until the backend verifies the object and (for video) Stream processing succeeds. Errored pre-master jobs release their reservation after the stale-job timeout. A copy failure retains the already-consumed upload allowance because the verified master exists in R2.

### 7a. Media tasks (durable outbox for two-system operations)

Every operation that touches Cloudflare as well as Supabase needs a durable record of intent so cleanup work is never lost if a queue message drops or a step fails. Cloudflare Queues does the work; this table is the source of truth for what was requested and whether it finished.

```
media_tasks                     -- outbox / task ledger
  id              uuid pk
  account_id      uuid fk -> accounts.id
  task_type       media_task_type   -- generate_web_copy | delete_r2 | delete_stream | reconcile_usage | purge_gallery
  gallery_id      uuid null fk -> galleries.id
  video_id        uuid null fk -> videos.id
  payload         jsonb null        -- keys/ids the worker needs
  status          task_status       -- pending | running | done | failed
  attempts        int default 0
  last_error      text null
  run_after       timestamptz default now()   -- for backoff / scheduling
  created_at      timestamptz default now()
  updated_at      timestamptz default now()
  index (status, run_after)
```

This table is what makes "coordinated delete" and "generate the web copy before dropping the master" reliable rather than best-effort. Ordering rule worth enforcing in code: `generate_web_copy` must reach `done` before any `delete_stream`/`delete_r2` for that video's master runs. Losing the master before the web copy exists is the one expensive bug in this design.

---

## 8. Enums

```
member_role          = owner | member
project_type         = wedding | engagement | portrait
access_type          = public | password | private
gallery_status       = draft | published | delivered
storage_tier         = hot | web | cold | archived | purged
background_type      = image | video
invite_status        = pending | accepted | revoked | expired
processing_status    = uploading | processing | ready | errored
recipient_status     = sent | opened | failed
delivery_event_type  = sent | failed | opened | video_viewed | downloaded
plan_tier            = starter | pro | studio
sub_status           = active | past_due | canceled
entitlement_source   = subscription | block | topup
entitlement_status   = active | expired | consumed
upload_target        = video | photo
job_status           = pending | uploading | paused | processing | complete | errored
media_task_type      = generate_web_copy | delete_r2 | delete_stream | reconcile_usage | purge_gallery
task_status          = pending | running | done | failed
```

---

## 9. State machines

**Gallery status** (the publish lifecycle):
```
draft --publish--> published --first send--> delivered
```
`archived_at` is set/cleared independently at any status. Soft delete (`deleted_at`) is independent again, with an undo window before hard purge.

**Gallery storage lifecycle** (the two-clock retention model):
```
hot   --(now > source_file_expires_at, ~2 yr)-->  web
        (generate compressed web copy; drop Stream copy + master unless extended/archived)
web   --(now > access_expires_at, ~10 yr)-->      archived  (default) | purged
web   --(paid extend)-->                          web, extended_until pushed out
```
`hot` = master in R2 + Stream copy, full quality, originals downloadable. `web` = compressed MP4 in cold R2 served directly (no Stream, no master). `archived` = recoverable cold copy retained, restorable by extend; `purged` = removed everywhere. A Worker mints signed URLs only while a gallery is `hot` or `web` and not past its access clock (or extended-and-current). A scheduled job runs both transitions.

**Asset processing** (videos and photos):
```
uploading --> processing --> ready
                 \--> errored (release reserved Stream minutes)
```

---

## 10. Retention mechanics (the two-clock model, concretely)

1. On first delivery, set both clocks: `source_file_expires_at = delivered_at + source_file_window_days` (default 730, 2 yr) and `access_expires_at = delivered_at + access_window_days` (default 3650, 10 yr).
2. While in the source-file window, the gallery is `hot`: master in R2 plus a Stream copy, full quality, originals downloadable. This short window is the only expensive period.
3. A daily job finds galleries past `source_file_expires_at`: generate the compressed `web_copy` (single MP4, ~3-5 GB), move it to cold R2, drop the Stream copy and the master, set `storage_tier = web`. Keep the master only if `is_extended` or archived-for-originals. The gallery keeps streaming to clients from the web copy, no Stream involvement, no per-minute meter.
4. Notify ahead of `access_expires_at` (default ~30 days before): email the studio (and optionally client) with extend options, surfaced in-gallery too.
5. A daily job finds galleries past `access_expires_at`: default to `archived` (web copy retained in cold, link goes dark, restorable by a paid extend) with a grace clock; `purged` only after grace elapses with no extend. A paid extend sets `is_extended = true` and pushes `extended_until`/`access_expires_at` out, keeping the web copy live.
6. Purge: coordinated delete across R2, Stream (already gone), and Supabase soft-then-hard delete. Reconcile `account_usage` stock meters (not the flow meter).

Cost shape this produces: full cost only during the 2-year source-file window; the 8-year viewing tail is a ~4 GB cold file at roughly $0.48/gallery/year, well under $4 total per gallery across the whole tail.

Confirmed: clock starts at first delivery; access window 10 years; originals window 2 years; default end-state is archive (recoverable), not delete; no watermark anywhere. Still open: exact extension price, and the notify/grace day counts (defaults ~30 + ~30).

---

## 11. Migration from the current prototype

The repo today has `active | archived` and a thin gallery/video schema. The path:

1. Add the new enums.
2. Expand `galleries`: add `status` (backfill `active -> published`, infer `delivered` where delivery rows exist), add `archived_at` (backfill from the old archived flag), then drop the old combined column. Add slug, access, password_hash, both retention clocks, storage_tier, and lifecycle timestamp columns.
3. Add `albums`, `photos`, `delivery_recipients`, `delivery_events`, `vendor_branding`, `upload_jobs`.
4. Add the new tables from this round: `gallery_design`, `account_invites`, `deliveries`, `media_tasks`.
5. Add the billing set: `subscriptions`, `entitlements`, `usage_events`, `account_usage`.
6. Extend `videos` with Cloudflare pointer columns (`r2_key`, `stream_uid`, `web_copy_r2_key`, processing, duration, bytes), the download flag, `visible_in_gallery`, and `tags`.
7. Add the retention job: dual-clock transitions (hot to web at the source-file window, web to archive/purge at the access window) and the web-copy generation step, driven through `media_tasks`.
8. Wire the Cloudflare reconciliation job that populates `account_usage` stock fields.
9. Add RLS policies to every table, account-scoped via `account_members` (section 0a). Client viewing is the Worker path, not RLS.

Forward-only migrations, each with a tested rollback, per the SOP.

Ordering note for the circular reference: `galleries.cover_video_id`/`cover_photo_id` point at `videos`/`photos`, which point back at `galleries`. Create `galleries` first without the cover FK constraints, then create `videos`/`photos`/`gallery_design`, then add the cover foreign keys (and `gallery_design.featured_video_id`) as a follow-up `alter table`. Same applies to any other back-reference into media.

---

## 12. Decisions

**Locked:**
- Billing meters upload capacity (the flow meter), VidFlow-style. Past galleries do not count against new allowance.
- Both retention clocks start at first delivery (`delivered_at`).
- Originals + Stream playback guaranteed for 2 years (`source_file_window_days = 730`).
- Web-copy viewing window of 10 years (`access_window_days = 3650`).
- After the originals window, serve a compressed web copy from cold R2 directly; drop the Stream copy and master (master kept only if extended/archived).
- Default end-state at the access window is archive (recoverable cold copy), not delete.
- No watermark anywhere; the feature is removed from the schema and must also be removed from the UI build (Vendor Dashboard + Studio styles), so no dead toggle gets wired.
- Supabase Postgres is the relational store. RLS is account-scoped via `account_members`; client viewing is the Worker path, not RLS.
- Blocks valid 1 year from purchase; blocks are an alternative to a subscription; 5GB top-ups unlock after a first block.
- Deleting an album reassigns its photos to "All" (not blocked, not deleted).
- Per-gallery design lives in `gallery_design`; it overrides studio-wide `vendor_branding` (gallery-then-studio precedence). Background is image or video only (no solid color), faithful to the handoff.
- Video tags are a `text[]` array on `videos` (no join table in v1). Replace Video is in-place, no version history.
- Delivery is modeled as `deliveries` (one send + message) -> `delivery_recipients` (denormalized current status) -> `delivery_events` (immutable truth).
- Dashboard copy reads "upload allowance used," not "storage used" (carry to the design handoff and the over-cap message).

**Still open (do not block the schema; set before shipping retention to customers):**
1. Exact extension price and who can pay it (studio, client, or either). Working logic: cover cold cost plus margin, ~$15-25/gallery/year.
2. Notify-ahead and grace day counts (defaults ~30 days notice before access expiry, ~30 days grace before purge).
3. Customer-facing copy that states the two clocks separately: "gallery viewable 10 years; original-quality downloads guaranteed the first 2."
