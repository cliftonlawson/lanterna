# Lanterna — Infrastructure SOP

Standard operating procedure for the storage, transcoding, delivery, and access infrastructure behind Lanterna. Written around the product as designed: per-client galleries, films and photos in one gallery, password / public / private access, a storage quota shown to the vendor, client downloads, a studio watermark, and a proof-of-delivery record.

Pricing and limits below were verified mid-2026. They drift, so treat every dollar figure as "check the live calculator before committing," not gospel. The architecture and procedures are the durable part.

---

## 1. Purpose and scope

This document covers how media gets into Lanterna, where it lives, how it is processed, how it reaches clients, and how the team operates it day to day. It does not cover application code, the design system, or the vendor-side UI flows (see the design handoff and the flow-fix specs for those).

The infrastructure has to do four jobs well:

1. Accept very large uploads (multi-GB film masters, raw photo sets) without falling over.
2. Store originals durably and cheaply, and never surprise anyone with a bandwidth bill.
3. Stream films to clients with adaptive quality, and serve original-quality downloads when allowed.
4. Enforce per-gallery access (public, password, private) and track delivery.

---

## 2. Recommended stack

Lanterna is an egress-heavy media workload: files are written once and read many times by clients who may be anywhere. That profile is exactly what makes a zero-egress storage provider the right anchor, because on a traditional provider the bandwidth line scales 1:1 with how popular a wedding film gets, and you do not control that.

Anchor on Cloudflare because the egress story removes the scariest variable, and because the pieces integrate without glue code:

- **Cloudflare R2** — object storage for original film masters, original photos, and derived assets (thumbnails, web-size photos). S3-compatible, zero egress fees, single storage class for hot data.
- **Cloudflare Stream** — managed video pipeline. Handles transcoding to adaptive bitrate (HLS/DASH), the player, and signed playback. This is what clients watch in the gallery.
- **Image (Media) Transformations** — on-the-fly photo resizing and thumbnail/still generation, served from R2 originals. Avoids storing a dozen derivative sizes per photo.
- **Cloudflare Workers** — the edge layer that mints signed URLs, checks gallery access (password / private), proxies downloads, and runs upload orchestration. Also where custom-domain routing for delivery links lives.
- **A primary database** — gallery, film, photo, recipient, and delivery records. D1 (Cloudflare's SQLite) keeps everything on one platform for a small-to-mid studio; a managed Postgres is the safer call if you expect heavy relational querying or want a more standard ops story. Pick one and document it.
- **Cloudflare Queues** (or equivalent) — decouples "upload finished" from "kick off processing," so a flaky client connection never blocks transcoding.

Why both R2 and Stream, rather than one: Stream is the right tool for *playback* (it owns transcoding, the rendition ladder, and the player) but it is not where you keep the deliverable the client paid for. Wedding clients download original-quality masters. Those originals live in R2 and are served as downloads through a Worker. Stream holds the streamable copy; R2 holds the source of truth. Keep that split clear in your head and in the data model.

---

## 3. How the money actually works

Know the cost shape before you design, because it dictates the data model.

R2 storage is about $0.015 per GB-month for standard (hot) data, with zero egress. Operations are metered: Class A (writes, mutations, listings) at roughly $4.50 per million, Class B (reads) at roughly $0.36 per million. There is a free monthly allotment (on the order of 10 GB storage, 1M Class A, 10M Class B — verify current). An Infrequent Access class drops storage to about $0.01 per GB-month but adds a per-GB retrieval fee and a 30-day minimum, which makes it a fit for old delivered galleries, not active ones. Objects under ~100 MiB upload in a single Class A operation; larger objects use multipart and bill multiple Class A ops.

Stream bills on two axes: storage at $5 per 1,000 minutes stored (prepaid, billed by video *duration*, not file size or rendition count) and delivery at $1 per 1,000 minutes *delivered to viewers*. Ingest and encoding are free, and delivery has no separate egress charge. Max source file size is 30 GB. Note the delivery meter is viewer-minutes: a popular film watched start-to-finish by many clients is where the bill lives, not storage.

Image / Media Transformations bill per operation (roughly $0.50 per 1,000 after the late-2025 beta), and a generated still counts as one transformation.

The practical consequence: storage is cheap and predictable, delivery is the variable you watch, and the duration of films (not their file size) drives Stream storage. This is why the Lanterna storage quota shown to vendors should be measured against R2 bytes for originals and Stream minutes for streamable films, tracked separately (see section 9).

---

## 4. Bucket and storage layout

Use one R2 bucket per environment (`lanterna-prod`, `lanterna-staging`, `lanterna-dev`), never one bucket per gallery. Namespace inside the bucket with a stable, opaque key scheme so a gallery rename or slug change never forces a file move:

```
{gallery_id}/films/{film_id}/master.{ext}
{gallery_id}/films/{film_id}/poster.jpg
{gallery_id}/photos/{photo_id}/original.{ext}
{gallery_id}/photos/{photo_id}/derived/{size}.jpg     (optional cache of common sizes)
{gallery_id}/branding/logo.{ext}
```

Rules:

- Keys use immutable IDs, not human names or slugs. The slug lives in the database and on the delivery URL, never in the storage key.
- Never let a client-facing URL point straight at an R2 object. All client access goes through a Worker that checks access and signs a short-lived URL (section 7).
- Albums are metadata, not folders. A photo's album is a column in the database, so moving a photo between albums (a core Lanterna flow) is a row update, not a file copy.

---

## 5. Upload pipeline

This is the riskiest path because the files are huge and the network is not reliable. Match it to the upload-queue states already in the Lanterna UI (uploading, paused, processing, done).

### Films

1. Client requests an upload slot. A Worker creates the film record (status `uploading`) and returns either a Stream Direct Creator Upload URL (TUS-based) or, for the R2 master, a multipart upload session with presigned part URLs.
2. The browser uploads directly to Cloudflare, not through your server. Use TUS / multipart so the transfer is resumable. A dropped connection resumes from the last completed part rather than restarting the multi-GB file. This is what makes the UI's pause/resume real, and what the README's "auto-resume on disconnect" depends on.
3. On completion, the upload target fires a notification (Stream webhook or your own "complete multipart" call) that enqueues a processing job.
4. Processing: Stream transcodes to the adaptive ladder (free), a poster/still is generated, the master is confirmed in R2, and the film record flips `processing → done`. Only now is the film clickable in the gallery.
5. If encoding errors, mark the film `errored`, release any reserved Stream storage, and surface a retry. Do not leave half-processed films that count against quota.

### Photos

Same direct-to-R2 multipart pattern, but smaller files, so single-PUT for anything under ~100 MiB. Photos do not go through Stream. Generate thumbnails and web sizes lazily via Image Transformations on first request rather than pre-rendering every size at upload. The "Add to album" selection is written as the photo's album column at this step.

### Hard rules

- Uploads always go browser-to-Cloudflare directly. Never proxy multi-GB bodies through your application server.
- Every presigned URL is short-lived (minutes) and scoped to exactly one object and operation.
- The "complete" step is server-authoritative. A client claiming "done" is not done until the backend verifies the object and (for films) processing succeeds.

---

## 6. Transcoding and playback vs download

Two different deliverables, two different paths:

- **Watch in gallery** → Stream playback URL, signed per-session (section 7). Adaptive bitrate, plays everywhere, no original-file exposure.
- **Download original** → only when the gallery's "allow downloads" toggle is on. The Worker checks the gallery's download permission, then issues a short-lived presigned R2 URL (or streams the bytes through the Worker if you want to force the watermark or log the download for the delivery record). Downloads should be logged so they can show up in per-film stats.

The studio watermark applies to the streamed/preview experience, not the paid original master (unless the studio explicitly wants watermarked downloads). Decide and document which deliverables carry the watermark; the toggle exists in the vendor settings, so the infrastructure must honor it per gallery.

---

## 7. Access control and delivery links

Lanterna galleries are public, password-protected, or private, and the delivery link is the product. Enforcement must be at the edge, never in the client.

- **Private**: no client access at all. Only authenticated vendor sessions can read. Useful for drafts before delivery.
- **Password**: the Worker validates the gallery password (stored hashed, never plaintext, and set via the Settings/create flow), issues a signed session token (short-lived, gallery-scoped), and only then mints signed Stream playback URLs and presigned photo/download URLs. The password is set by the vendor; an unset password must block publish (this ties to the pre-flight gate in the flow-fix spec).
- **Public**: still goes through the Worker and still uses signed asset URLs, just without the password challenge. "Public" means no password, not "objects are world-readable."

Signed-URL discipline:

- Stream uses signed playback tokens with a short TTL. Never expose a raw Stream UID that allows unsigned playback.
- R2 access is always via presigned URLs minted server-side, or via a Worker binding. Bucket is private; there is no public `r2.dev` exposure for client media in production.
- Auto-expire galleries (a Lanterna setting) are enforced by the Worker refusing to mint new signed URLs past the expiry date, not by deleting files.

Custom domains (e.g. `deliver.studioname.com`) route through Cloudflare for SaaS / custom hostnames, pointing at the delivery Worker. The slug in the path maps to a gallery ID in the database.

---

## 8. Security and key management

- R2 API tokens are scoped to the minimum needed and differ per environment. The production token can write to `lanterna-prod` and nothing else. No single token has account-wide access.
- No long-lived cloud credentials ever reach the browser. Browsers get presigned URLs and signed tokens only.
- Secrets (R2 keys, Stream API token, DB credentials, signing secrets) live in the platform secret store (Workers secrets / environment bindings), never in the repo, never in client bundles.
- CORS on the bucket allows only your application origins and the upload flow, not `*`.
- Rotate signing secrets and API tokens on a schedule and immediately on any suspected exposure (runbook in section 12).
- Hash gallery passwords. Treat client email addresses in the delivery record as personal data: access-controlled, and deletable when a gallery is deleted.

---

## 9. Storage quota, durability, lifecycle, and backups

### Quota (the vendor-facing storage stat)

The "Storage used / plan" panel in Lanterna must be backed by real metering. Track two numbers per account: R2 bytes stored (originals + photos + derivatives) and Stream minutes stored (streamable films). Sum and compare against the plan limit. Wire the near-cap warning and the over-cap upload block in the UI to these real figures. When over cap, the upload-slot Worker refuses new slots with a clear reason, which is the behavior the Account/billing spec calls for.

### Durability and backups

R2 is durable, but durable is not the same as backed up. Durability protects against disk failure; it does not protect against an accidental delete, a bad migration, or a compromised token wiping a bucket. So:

- Enable object versioning (or a write-once pattern) on the production bucket so an overwrite or delete is recoverable.
- Run a periodic copy of originals to a second location in a different account or provider for true disaster recovery. Originals are the irreplaceable asset; a couple cannot re-shoot their wedding. Derivatives and Stream renditions are regenerable and do not need the same protection.
- Test a restore at least quarterly. A backup you have never restored is a hope, not a backup.

### Lifecycle

- Active and recently delivered galleries stay in R2 Standard.
- Galleries past a long inactivity threshold (e.g. delivered and untouched for N months) are candidates for the Infrequent Access class to cut storage cost, accepting the retrieval fee on the rare later access. Automate this with a lifecycle rule, and keep it well clear of the 30-day minimum-duration trap.
- "Delete gallery" in the app should soft-delete first (recoverable window, matching the undo affordance in the flow spec), then hard-delete originals, Stream videos, and derivatives together so nothing is orphaned and still billing.

---

## 10. Environments and infrastructure-as-code

- Three environments: dev, staging, prod, each with its own bucket, Stream scope, database, and tokens. No shared state across environments.
- Define all of it as code (Terraform or Wrangler config): buckets, bindings, Workers, queues, custom hostnames, lifecycle rules. Provisioning a new environment should be a command, not a wiki page of clicks.
- Promotion path: change lands in dev, is verified in staging with production-like data volume, then deploys to prod. Schema migrations are versioned and run forward-only with a tested rollback.

---

## 11. Observability and alerting

Watch the things that either cost money or break delivery:

- Stream delivery minutes per day, with an alert on an abnormal spike (a single film going viral, or an abuse case).
- R2 Class A/B operation counts and storage growth, alerting before a plan or budget threshold.
- Upload success rate and average processing time. A drop in success rate or a climb in stuck-`processing` films is the earliest signal of a pipeline problem.
- Worker error rate on the access/signing path. Errors here mean clients cannot open galleries.
- Per-account storage approaching plan limits, feeding both the in-app warning and an internal alert.

Log every delivery send and every download against the gallery so the delivery record and per-film stats are real, not decorative.

---

## 12. Runbooks

### Stuck or failed upload
Find films in `uploading` or `processing` past a sane timeout. Re-trigger the completion check; if the master is present in R2, re-enqueue processing. If the master is incomplete, mark `errored`, release reserved Stream storage, and prompt the vendor to retry. Never leave reserved-but-unused Stream minutes counting against quota.

### Storage cap reached for an account
Confirm against real metered numbers. The upload-slot Worker should already be refusing new slots. Communicate the upgrade path (the Account/billing screen). Enterprise-style soft-landing (allow the in-flight upload to finish, block new ones) is friendlier than a hard mid-upload cut.

### Key or token compromise
Rotate the affected R2 token / Stream token / signing secret immediately. Invalidate outstanding signed sessions if the signing secret changed. Audit recent operations on the bucket for unexpected deletes or reads. Restore from versioning/backup if anything was tampered with. Document the incident.

### Restore a deleted gallery
Within the soft-delete window: flip the soft-delete flag back. Past it: restore originals from the DR copy, re-upload to Stream to regenerate playback, regenerate derivatives. This is why originals get a real backup and renditions do not.

### Delivery link not working for a client
Check gallery status (a draft link should not be live), access type, expiry date, and password state. Most "broken link" reports are a gallery that was never published, an expired auto-expire date, or a password that was never set. The pre-flight gate prevents the worst of these at send time.

### Cost spike investigation
Pull the delivery-minutes and operations breakdown by gallery. Identify the asset driving it. Decide whether it is legitimate (a popular delivery) or abuse (hotlinking, a leaked link), and respond with signed-URL TTL tightening or link rotation rather than taking the gallery down.

---

## 13. Pre-launch checklist

- Buckets, Stream, DB, queues provisioned per environment via IaC, prod isolated.
- All client media access goes through a Worker with signed URLs; no public bucket exposure.
- Multipart/TUS resumable uploads working browser-to-Cloudflare, with server-authoritative completion.
- Password galleries hash passwords; unset password blocks publish.
- Allow-download and watermark toggles honored per gallery in the actual delivery path.
- Storage metering feeds the vendor quota UI, near-cap warning, and over-cap block.
- Versioning on, off-account DR copy of originals running, a restore tested end to end.
- Alerts live for delivery minutes, operations, storage thresholds, upload success rate, and Worker errors.
- Secrets in the secret store, scoped tokens per environment, rotation procedure documented.

---

## 14. Open decisions to lock before build

1. Database: D1 (all-on-Cloudflare, simpler) vs managed Postgres (more standard, heavier querying). Pick and document.
2. Watermark scope: preview/stream only, or also on downloaded originals.
3. Download delivery: direct presigned R2 URL (cheaper, simpler) vs proxied through a Worker (lets you log every download and enforce watermark, at some compute cost).
4. Inactive-gallery lifecycle threshold and whether to use R2 Infrequent Access at all.
5. DR target: second R2 account, or a different provider entirely for true independence.
