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
Done when: sending a published gallery flips it to delivered with a timestamp, and resend doesn't regress it.

### 6. reconcile_usage: build the small worker or cut it explicitly
13 pending tasks and nothing drains them. Two acceptable outcomes: a minimal scheduled worker (or admin command) that processes the queue and updates `account_usage`, or a written decision that usage reconciliation is post-launch, with the task generation turned off so the queue stops growing. What's not acceptable is a queue that silently piles up, because that trains everyone to ignore the outbox, and the outbox is what makes media deletion safe later.
Done when: the pending count goes to zero and stays controlled, or generation is off and the deferral is written in the spec.

### 7. Upload allowance gate, verified
The allowance defaults migration exists. Verify the flow meter actually gates: an account at/over its allowance gets refused an upload slot with a clear reason. This is the billing model's one launch-critical enforcement point.
Done when: an over-allowance account cannot get an upload slot, and the refusal reason is surfaced in the UI.

---

## P2 — Paid unlocks, legitimized

### 8. Write the paid unlock spec
One page into `/docs`: the purchase flow, the `video_unlock_purchases` states, what a session verify does, what happens on webhook vs return-URL verification, refund behavior (even if "manual via Stripe dashboard, no product surface" for v1), and what an unlocked viewer can access (stream only, or download too). This exists so the next fix isn't archaeology.
Done when: the doc exists and matches the code, or the code is corrected to match the doc.

### 9. Stripe test-mode E2E
Full loop in Stripe test mode: locked film, checkout, payment, webhook delivery, return with `unlock_session`, verification, media unlocked. Include the failure paths: abandoned checkout, webhook retry, verify called twice (the session-uniqueness constraint exists, prove it holds).
Done when: the happy path and the three failure paths all behave, documented in the packet's verification section.

---

## P3 — Verification and hardening

### 10. Human file-picker tests (already queued in the packet)
Add files with a real video and poster, Replace video with a >200 MB file (proves the tus path), Replace thumbnail with JPG/PNG/WebP. Run `npm run smoke:gallery` after each.
Done when: all three pass by hand.

### 11. Production origins and access review
Finalize Cloudflare allowed origins for the production domain (not just 127.0.0.1), and do the password/private access review the packet defers: confirm password galleries actually gate, private galleries are unreachable publicly, and signed URL TTLs are short. Decide whether private galleries should 404 publicly instead of 403, since 403 confirms existence.
Done when: reviewed against the SOP's access-control section with findings written down.

### 12. Guardrail tests so this queue doesn't refill
The minimum set that catches regressions in the riskiest spots: a Playwright test for public gallery playback (poster-first, iframe only after play), a test that a draft gallery 404s publicly, and unit tests around `dashboardRepository.loadUploadJobs`. Plus the typed route-contract layer the packet suggests, which turns payload-shape bugs (like the paid-unlock R2 shape fix) into compile errors instead of runtime surprises.
Done when: tests run in CI (or at minimum on every branch before merge) and fail loudly.

---

## Explicitly deferred (written down so they're decisions, not holes)

- Two-clock retention jobs (hot to web at 2 years, web to archive at 10). No customers means no clocks expiring. Revisit at first paying studio. The clocks still get STAMPED at delivery (item 5) so history is correct when the jobs arrive.
- TV apps. Launch tier is cast/AirPlay-friendly player only, already in the SOP.
- Cold-tier tuning, extension pricing surface, monetization beyond paid unlocks.

## Queue rules

One item per branch. Commit per change. No item is done without its "done when." If a bug is found that isn't on this list, it gets added to the list and prioritized, not fixed inline while the tree is dirty. The queue is the process now.
