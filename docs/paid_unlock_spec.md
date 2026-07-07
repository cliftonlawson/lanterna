# Paid Unlock Spec

Paid unlocks let a studio mark a visible gallery film as a paid bonus. The public gallery still shows the locked film tile, but playback is blocked until Stripe confirms a one-time payment.

## Studio Setup

The studio enables paid unlocks per video in the video drawer. A paid video keeps its normal title, duration, poster, and gallery position, plus these fields:

- `paid_unlock_enabled`: locks the film behind checkout.
- `paid_unlock_price_cents`: one-time unlock price in cents. The API refuses checkout below $0.50.
- `paid_unlock_currency`: currently `usd`.
- `paid_unlock_label`: checkout/product label; falls back to the video title.
- `paid_unlock_tagline`: checkout/product description; falls back to a gallery bonus-film description.
- `paid_unlock_trailer`: stored today, but not honored by public playback yet.

The studio payout model in code is 90% studio payout and 10% Lanterna platform fee. Those values are calculated server-side from `amount_total`.

## Public Purchase Flow

When a viewer clicks a locked film, the public gallery opens a paid unlock modal. The modal calls:

`POST /api/public/gallery/:slug/paid-unlock/checkout`

The server validates that the gallery is publicly accessible, the video belongs to that gallery, the video is visible, and `paid_unlock_enabled` is true. It then creates a Stripe Checkout Session with metadata for `account_id`, `gallery_id`, `gallery_slug`, `video_id`, and `kind=video_unlock`.

Current behavior: checkout creation does not write a `video_unlock_purchases` row. The first database write happens only after Stripe reports a paid session through webhook or return-URL verification. That means abandoned checkout sessions are currently visible only in Stripe, not in Lanterna tables.

Stripe success returns to:

`/g/:slug?unlock_session={CHECKOUT_SESSION_ID}`

Stripe cancel returns to:

`/g/:slug?unlock_cancelled=true`

The current public UI does not display a special cancelled-checkout message.

## Verification And Unlock

The public page detects `unlock_session` in the URL and calls:

`GET /api/public/gallery/:slug/paid-unlock/session?session_id=:sessionId`

The server fetches the Checkout Session from Stripe, requires `payment_status=paid`, verifies the Stripe metadata matches the current gallery, upserts a completed `video_unlock_purchases` row, then returns unlocked media for that video.

The Stripe webhook route also handles `checkout.session.completed`, verifies the webhook signature, and upserts the same completed purchase row. Return-URL verification and webhook delivery are intentionally idempotent through the unique `stripe_checkout_session_id` index.

## Purchase States

`video_unlock_purchases.status` allows `pending`, `complete`, `refunded`, and `failed`.

Implemented today:

- `complete`: written by webhook or return-URL verification when Stripe payment status is paid.

Allowed but not currently written by application code:

- `pending`: no row is created when checkout starts.
- `failed`: no failed-payment or expired-session handler writes this.
- `refunded`: no refund webhook handler writes this.

For v1, Lanterna treats Stripe as the source of truth for non-complete payment attempts. Item 9 should decide whether abandoned/failed sessions need Lanterna rows.

## Unlocked Access

Before unlock, public gallery payloads include only the paid video's poster key. The paid video's R2 playback keys and Stream playback token are withheld.

After unlock, the session verification response returns:

- signed R2 URLs for `r2_key`, `web_copy_r2_key`, and `poster_r2_key` when present;
- signed Cloudflare Stream playback when `stream_uid` is present and ready;
- the unlocked `videoId`, used by the public page to open the player.

Unlocked playback behaves like normal public playback. Stream is preferred when available, with R2 fallback. Download appears only if the gallery allows downloads and the video has not disabled downloads.

Unlock state is held in the viewer's current browser session. The app does not currently create a durable viewer account or email-based re-unlock flow.

## Refunds

Refunds are manual via Stripe Dashboard for v1. Lanterna does not currently listen for refund webhooks, change `video_unlock_purchases.status` to `refunded`, revoke a viewer's already-returned signed URLs, or show refund state in the studio dashboard.

If refunds become a product surface, add a Stripe refund webhook handler and decide whether refund revokes future re-verification for the same checkout session.

## Known Gaps

- `paid_unlock_trailer` is stored and the studio UI promises a locked preview trailer, but public locked videos do not currently receive teaser playback URLs. The locked tile is visible; the film itself is not playable until purchase.
- Abandoned checkout is not written to Lanterna. Stripe has the session; Supabase does not.
- Completed unlock access is session-local in the browser after return verification. There is no resend/recover-unlock flow by buyer email.
