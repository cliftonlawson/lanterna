# Lanterna — Pre-Launch Fix Queue

Ordered by risk, not by annoyance. Work top to bottom. Each item is one branch, one commit set, one review. Nothing new gets built until this queue is empty. Scope is frozen: if an idea shows up mid-queue, it gets written down in a `LATER.md`, not built.

Paid unlocks is now in scope, which means it gets the same treatment as everything else: a spec, tests, and a place in this queue. It stops being the thing that generates surprise bugs and starts being a feature with edges.

---

## P0 — Access and data integrity (fix before anything else)

### 1. Draft galleries must not be publicly viewable
The test gallery is `status: draft` with `access_type: public` and the public route serves it at `/g/test`. Per the schema spec, the share link goes live on publish, and pre-flight gates that transition. Fix: `GET /api/public/gallery/:slug` returns 404 (not 403, don't confirm existence) unless `status` is `published` or `delivered` and the gallery is not archived, not expired, not deleted. Then re-run the smoke test, which means publishing the test gallery properly through the pre-flight path. If pre-flight isn't enforced server-side yet, this is where it gets enforced.
Done when: a draft gallery 404s publicly, publish flips it live, and the smoke test passes against a published gallery.

### 1a. Published videos must all have valid playback assets
Found during item 1 verification: after `/g/test` was properly published, `npm run smoke:gallery -- test` picked `AD VIDEO HD 1080p` and the Stream iframe returned `500`, while the newer titled smoke fixture passed. A published gallery should not expose a ready video whose playback URL fails. Decide whether the bad row should be repaired, hidden, or treated as not-ready, then make the smoke check catch every visible ready public video instead of only one target.
Root cause found in item 1a: the old video was uploaded through the TUS path with malformed Cloudflare `allowedorigins` metadata (`["127.0.0.1:5173"` / `"localhost:5173"]` as literal origin strings); fix the TUS metadata format and include a production checklist scan/backfill for pre-fix Stream assets in item 11.
Done when: every visible ready video in the published smoke gallery has a working playback path or is excluded from the public payload for a clear server-side reason.

### 2. Kill slug-to-ID derivation
`galleryDatabaseId(slug)` derives database IDs from slugs and works by coincidence on the current test gallery. Carry the real database `id` through the UI gallery model (`model.ts`, `dashboardRepository.ts`, `schemaMapper.ts`) and make every API call use it. Slugs are for URLs, IDs are for data, per the spec. Audit `saveUploadJobs` and `clearUploadJob` in the same pass since the packet flags them under differing slug/id mappings.
Done when: no code path derives a database ID from a slug, and a renamed slug breaks nothing.

### 3. Pre-flight enforcement server-side
Related to item 1 but its own check: publish/deliver must be blocked server-side unless access is set, at least one video exists, a cover is chosen, and password access has a non-null hash. The UI gate already exists from the design rounds; the server must enforce the same rules so nothing (including future API callers) can skip them.
Done when: attempting to publish an empty or misconfigured gallery via the API fails with a reason.

---

## P1 — The specced core that got lapped

### 4. Delivery email, real send
Delivery notify is mock-only. Wire the actual provider (Resend per the SOP), send a real delivery to a real inbox, confirm the recipient row and `sent` event are written, and confirm the link in the email opens the published gallery. This is proof-of-delivery, the core product. It ships working or nothing ships.
Done when: one real email delivered, one recipient row with status, one event logged, link works.

### 5. Delivered status transition
First successful send advances gallery `status` to `delivered` and stamps `delivered_at` (which starts both retention clocks per the spec, even if the retention jobs themselves are deferred). Verify the state-machine trigger migration actually fires on a real send, not just in theory.
Verified live 2026-07-07: resend writes a new delivery row and `sent` event but does not restamp `delivered_at` or the retention clocks; no code change needed.
Done when: sending a published gallery flips it to delivered with a timestamp, and resend doesn't regress it.

### 6. reconcile_usage: build the small worker or cut it explicitly
13 pending tasks and nothing drains them. Two acceptable outcomes: a minimal scheduled worker (or admin command) that processes the queue and updates `account_usage`, or a written decision that usage reconciliation is post-launch, with the task generation turned off so the queue stops growing. What's not acceptable is a queue that silently piles up, because that trains everyone to ignore the outbox, and the outbox is what makes media deletion safe later.
Closed as written deferral 2026-07-07: `reconcile_usage` task generation is off, existing pending `reconcile_usage` rows were marked done, and stock-meter reconciliation is deferred until retention/cost automation work.
Done when: the pending count goes to zero and stays controlled, or generation is off and the deferral is written in the spec.

### 7. Upload allowance gate, verified
The allowance defaults migration exists. Verify the flow meter actually gates: an account at/over its allowance gets refused an upload slot with a clear reason. This is the billing model's one launch-critical enforcement point.
Scope: server-side gate in upload slot routes, usage recording from upload completion routes, RLS blocking direct client inserts to `usage_events`, and the client-side check kept only as friendly pre-flight UI.
Done when: an over-allowance account cannot get an upload slot with a surfaced reason, and an upload recorded through a raw API call increments `allowance_used_gb` without the client inserting usage.
Verification: live temp-account check passed 2026-07-07. Over-allowance `/api/upload/slot` returned 422 `upload_allowance_exceeded`; raw `/api/upload/complete` moved `allowance_used_gb` from 0 to 1; authenticated client insert into `usage_events` returned 403 from RLS.

Pricing fulfillment added 2026-07-18: new accounts receive one 10 GB welcome allowance with standard features and no paid entitlements. Server-owned Stripe Checkout covers the six monthly/annual subscription SKUs, three one-year blocks, the 5 GB top-up for active subscribers or block customers, and the $149/year white-label add-on. Verified webhooks grant catalog-matched entitlements, monthly billing keeps a separate annual allowance clock, top-ups share that clock, and annual renewal resets used allowance without rollover. The production database migrations and platform webhook event subscriptions must be applied before deployment.

### 7a. Stale upload-job expiry frees reservations
Item 7 reserves allowance from `upload_jobs` in `pending` or `uploading`, but there is no stale-job expiry yet. Add a timeout that marks abandoned active jobs `errored` so their reserved bytes stop blocking future upload slots. Keep it small: either a lazy sweep inside the slot gate before reserved allowance is calculated, or a tiny scheduled/admin check.
Done when: an old abandoned `pending` or `uploading` job is moved to `errored`, the next slot calculation no longer counts its `bytes_total`, and recent active jobs remain untouched.

### 7b. Orphan Stream asset cleanup
The provider-versus-database audit on 2026-07-14 found 19 Cloudflare Stream assets: 4 are represented by active `videos` rows and 15 are orphaned. Every orphan carries a Lanterna `targetId` or `videoId` whose video row no longer exists; the audit found zero recovery candidates and zero superseded current-video assets. Decision: delete all 15 from Cloudflare Stream rather than inventing database rows for disposable test media. Keep the cleanup explicit and provider-confirmed; do not infer success from a local row change.
Known orphan Stream UIDs: `43f14a747652f4809f558eee6a41846e`, `748396d55e63d794b27f8496f2e2fbed`, `9064e72eb9d327c23186002b5b2e741f`, `73e6f27d29665c62868bbabe3321d444`, `2f2658301a16fb68b9184ccd587e5094`, `72416013b8fd0c16f72f558ac246530b`, `c60ac066d42054a72c6bdd19234d9e1f`, `d34fc03506a64cad53f1f5fedfa47713`, `bec44a3be7558086d11e1e6212a4d0da`, `71a692be86bccc5b26ce252c5bda2787`, `5915536628f323a6632fb258c0e75a58`, `6dbb21cb191d301462fd7b20ad0db215`, `adf0c065a6516307c95fa4f0f4a382cd`, `165cfa568c046b597f6a89a7ca6f4315`, `f800442850340525fca3cc142dccb741`.
Live cleanup passed 2026-07-15: a fresh audit had to classify exactly this 15-UID allowlist as hard orphans, with zero recovery or superseded candidates, before deletion could run. Cloudflare accepted all 15 deletes; the independent post-delete audit reported 4 provider assets, 4 active-video matches, and zero orphan, recovery, superseded, deleted-row-cleanup, or unmanaged assets.
Done when: all 15 UIDs are absent from Cloudflare Stream and `npm run audit:stream-orphans` reports zero Lanterna-managed orphan assets.

---

## P2 — Paid unlocks, legitimized

### 8. Write the paid unlock spec
One page into `/docs`: the purchase flow, the `video_unlock_purchases` states, what a session verify does, what happens on webhook vs return-URL verification, refund behavior (even if "manual via Stripe dashboard, no product surface" for v1), and what an unlocked viewer can access (stream only, or download too). This exists so the next fix isn't archaeology.
Done when: the doc exists and matches the code, or the code is corrected to match the doc.
Verification: `docs/paid_unlock_spec.md` added 2026-07-07. It documents current code behavior, including the fact that checkout creation does not write a pending purchase row, refunds are manual-only for v1, unlock grants Stream plus R2 media when available, downloads still obey gallery/video download flags, and unlock state is browser-session-local after return verification.

### 8a. Paid unlock trailer toggle is not implemented publicly
The video drawer stores `paid_unlock_trailer` and tells studios the locked tile can show a teaser clip, but the public gallery intentionally withholds playback URLs for locked paid videos and only includes the poster. Decide whether this toggle should be removed from v1 or implemented as a real teaser asset/path.
Decision implemented 2026-07-15: remove the unfinished trailer toggle and its application payload plumbing from v1. Locked paid films show their poster until purchase; any future trailer feature must select or upload a distinct preview asset and must never reuse the locked master playback URL.
Done when: the studio UI no longer promises trailer behavior that the public gallery cannot provide, or locked paid videos receive an explicit teaser playback path that does not expose the full film.

### 9. Stripe test-mode E2E
Full loop in Stripe test mode: locked film, checkout, payment, webhook delivery, return with `unlock_session`, verification, media unlocked. Include the failure paths: abandoned checkout, webhook retry, verify called twice (the session-uniqueness constraint exists, prove it holds).

Verification: live Stripe test mode 2026-07-07. Checkout creation writes a pending `video_unlock_purchases` row before redirect. `checkout.session.completed` is the authoritative unlock path; return verification only reads the completed row and polls while the webhook catches up. Closed-tab payment unlocked through webhook without visiting the return URL. Email recovery restored the unlock from a second browser/device. Duplicate completed webhook and double session verify kept one purchase row and preserved `unlocked_at`. Abandoned checkout stayed pending with no unlock. Declined-card `payment_intent.payment_failed` marked the row failed with no unlock.
Done when: the happy path and the three failure paths all behave, documented in the packet's verification section.

---

## Active second-audit sequence — dependency order

The item numbers below preserve the audit references; execution follows this dependency order rather than numeric order. No real master uploads should be made until item 14 merges, because the current Stream-only path would create another masterless video.

### 15. Gallery lifecycle ownership
Reason for this position: lock down destructive gallery and retention state before adding more media paths that depend on gallery ownership.
Make lifecycle and retention columns server-write-only, block browser-authenticated hard deletes, and replace direct lifecycle writes with explicit server routes. Gallery deletion must be a recoverable soft-delete that atomically enqueues a pending `purge_gallery` outbox task. Archive and restore must remain explicit server-confirmed actions and must not masquerade as physical storage-tier changes.
Done when: live RLS probes reject direct lifecycle writes and hard deletes, while the legitimate archive/restore and soft-delete server paths work and a delete creates exactly one pending outbox task.

### 16. Signed-download enforcement
Reason for this position: downloads must be server-enforced before item 14 begins attaching retained R2 masters that the current public payload would otherwise sign even when downloads are disabled.
Resolve the effective download permission from the video, gallery, and vendor defaults before signing any original R2 URL. Apply the same rule to public gallery payloads and paid-unlock responses; a paid unlock grants viewing, not an override of studio download settings.
Done when: downloads-off responses contain no signed original URL through either the public or paid-unlock path, while downloads-on responses still receive a short-lived signed URL.

### 16a. Create-gallery persistence gate
Reason for this position: the gallery row must exist before item 14 starts multipart master ingestion, or the upload path can still fail with `Gallery not found for this account`.
Wait for a new gallery's server persistence to succeed before navigating into it or enabling uploads, surface a failed save honestly, and preserve globally safe slug handling until item 18b completes the database rule.
Done when: creating a gallery and immediately starting an upload cannot race the gallery insert, and a failed insert leaves no locally successful phantom gallery.

### 14. Dual Stream-plus-R2 ingestion
Reason for this position: after lifecycle, download, and creation prerequisites are safe, fix the compounding master-loss problem before any more real media is uploaded.
Upload the original master once to R2 multipart, verify it server-side, then have Cloudflare Stream ingest from a presigned R2 GET through `/stream/copy`. Upload completion means the verified master is secured; ready means Stream playback has encoded. A Stream failure must retain the master and support a no-reupload retry. Before implementation, prove with one real provider handshake that Stream can ingest the presigned R2 URL while signed playback and allowed origins remain intact; if that proof fails, stop and redesign.
Provider proof passed 2026-07-11: Stream ingested an R2 GET-signed source, retained signed-only playback and allowed origins, and played through the signed iframe. The source URL TTL is configurable and defaults to 24 hours; failed copy/encode state retains the verified R2 master for a no-reupload retry.
Live picker verification passed 2026-07-14: a 3,749,378,168-byte ceremony master completed multipart upload, matched the R2 `HEAD` byte count, produced a ready signed-only Stream asset, saved a captured JPEG poster, and recorded exactly one usage event without a reload.
Existing videos: re-upload the 2.41 GB ceremony through Replace Video after this pipeline lands. Mark disposable test clips as explicit Stream-only legacy and force downloads off. Do not relabel a Stream MP4 derivative as a retained original master.
Done when: a real upload produces a verified `r2_key` master and a ready Stream asset from the same source upload, failure after R2 completion is retryable without re-upload, and the legacy-video decisions are reflected in persisted state.

### 17. Truthful, idempotent upload accounting
Reason for this position: generalize accounting only after item 14 defines the final object-completion boundary and provides a real R2 object whose size can be verified.
At completion, obtain actual object size with R2 `HEAD`, record usage from the verified size rather than client `bytesTotal`, bind upload authorization to the intended object, and make completion idempotent so retries cannot double-count.
Implementation note: the generalized path covers photos, uploaded posters, and gallery backgrounds with server-owned jobs; captured Stream frames are also HEAD-verified. Exact bytes are retained and converted to decimal GB so small files do not round to zero.
Live verification passed 2026-07-14: browser-authenticated asset-state writes and completion RPC calls were rejected; raw photo, background, and poster uploads recorded exact provider-verified bytes once; completion replays added no usage; and a wrong-sized signed PUT returned 403 without creating an object.
Done when: a raw client cannot under-report bytes, completion records the provider-verified size, and repeated completion requests produce one usage increment.

### 18a. Password-gallery sentinel removal
Reason for this position: with storage and accounting integrity closed, repair the remaining launch access flow before production-origin review.
Remove the unusable password placeholder path, hash the studio's real password through the server-owned flow, and ensure no plaintext password is persisted or returned.
Live verification passed 2026-07-14: browser-authenticated password-hash/access writes and forged public inserts returned 400 while normal metadata remained editable; server-generated PBKDF2 passwords challenged public access, rejected the old/wrong password, accepted the replacement password, and returned no hash or plaintext.
Done when: a newly created password gallery unlocks with the actual password and rejects an incorrect one.

### 18b. Global slug uniqueness
Reason for this position: public lookup is global, so enforce global uniqueness while there is one studio and no known collision migration to resolve.
Replace per-account slug uniqueness with a global database constraint and keep slug generation/retry behavior honest under collisions.
Live verification passed 2026-07-14: the same slug persisted for one account and returned 409 from `galleries_slug_global_unique` for a second account, while an existing public delivery link continued to resolve with 200.
Done when: two accounts cannot persist the same public slug and existing public links still resolve.

### 19. Honest media-task ledger
Reason for this position: stop writing false completion history after the upload paths are settled, without pretending the deferred worker now exists.
Stop creating or marking `generate_web_copy` tasks done when no web-copy work occurred. Keep real work pending or stop generating it until a worker exists. Expand item 7b's reconciliation scope to all audited Cloudflare Stream assets without matching video rows, not only the two initially observed orphans.
Implementation decision: `process-ready` must not mutate outbox tasks at all. Historical `generate_web_copy` rows stay done only when their video carries a real `web_copy_r2_key`; unperformed work returns to pending, and tasks whose target no longer exists fail with an explicit reason. The worker remains deferred.
Live verification passed 2026-07-15: the repair left 4 existing-video tasks pending, marked 7 missing-target tasks failed with an explicit error, and left zero false `done` rows. A disposable `process-ready` call advanced its video to ready while an unrelated pending `delete_r2` task remained unchanged; all probe rows were removed afterward. The provider audit independently confirmed 19 Stream assets, 4 active matches, 0 recovery candidates, and the 15 deletion candidates recorded under item 7b.
Done when: no task is marked done without its work occurring, and the orphan reconciliation decision covers the full provider-versus-database inventory.

---

## P3 — Verification and hardening

### 10. Human file-picker tests (already queued in the packet)
Add files with a real video and poster, Replace video with a >200 MB file (proves the tus path), Replace thumbnail with JPG/PNG/WebP. Run `npm run smoke:gallery` after each.
Done when: all three pass by hand.

### 4a. Email deliverability: Lanterna sending domain
Lanterna delivery email now sends through Resend, but the first real item 4 delivery to `team@hellobower.com` landed in spam. Verify `lanterna.video` as the production sending domain and complete the deliverability pass before launch: SPF/DKIM/DMARC alignment, production from/reply-to, and inbox placement against Gmail and Outlook.
Done when: `lanterna.video` is verified in Resend, DNS is documented, production from/reply-to are configured, and test deliveries land in the inbox for Gmail and Outlook.

### 11. Production origins and access review
Finalize Cloudflare allowed origins for the production domain (not just 127.0.0.1), and do the password/private access review the packet defers: confirm password galleries actually gate, private galleries are unreachable publicly, and signed URL TTLs are short. Decide whether private galleries should 404 publicly instead of 403, since 403 confirms existence.
Done when: reviewed against the SOP's access-control section with findings written down.

### 12. Guardrail tests so this queue doesn't refill
The minimum set that catches regressions in the riskiest spots: a Playwright test for public gallery playback (poster-first, iframe only after play), a test that a draft gallery 404s publicly, and unit tests around `dashboardRepository.loadUploadJobs`. Plus the typed route-contract layer the packet suggests, which turns payload-shape bugs (like the paid-unlock R2 shape fix) into compile errors instead of runtime surprises.
Known smoke-harness gap found 2026-07-15: the default `test` slug now correctly 404s because that gallery is archived, while a locked-only published gallery can return `ok: true` with the contradictory message `Gallery smoke check failed` without exercising any playback URL. Item 12 must give the smoke run an intentional published fixture, distinguish an expected locked-only pass from a playable-video pass, and fail when playback coverage was expected but skipped.
Done when: tests run in CI (or at minimum on every branch before merge) and fail loudly.

### 13. Systematic client-trust audit
This queue found multiple pre-existing places where the browser was trusted to enforce rules the server should own: gallery status transitions, delivery success fallback, upload usage recording, and paid-unlock purchase reads. Do one deliberate pass instead of waiting for a fifth. Grep every table's RLS policies and every server route for client-trust assumptions: direct client writes, client-owned status transitions, client-inserted accounting rows, public routes that leak existence, and UI-only validation that should be enforced by service-role code.
Done when: each table and route has been checked, findings are written into the queue or a launch audit doc, and any launch-blocking trust gaps are queued or fixed on their own branches.

---

## Explicitly deferred (written down so they're decisions, not holes)

- Two-clock retention jobs (hot to web at 1 year, web to archive at 10). No customers means no clocks expiring. Revisit at first paying studio. The clocks still get STAMPED at delivery (item 5) so history is correct when the jobs arrive.
- TV apps. Launch tier is cast/AirPlay-friendly player only, already in the SOP.
- Cold-tier tuning, extension pricing surface, monetization beyond paid unlocks.
- Email-safe logo hosting for delivery emails. Current delivery email uses a text brand mark because `vendor_branding.logo_r2_key` is private signed-URL state and old emails would eventually show broken images. Add a stable email-safe logo URL or proxy before inserting studio logos into transactional emails.

## Queue rules

One item per branch. Commit per change. No item is done without its "done when." If a bug is found that isn't on this list, it gets added to the list and prioritized, not fixed inline while the tree is dirty. The queue is the process now.
