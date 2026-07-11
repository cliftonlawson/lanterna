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

Product decision: a paid unlock grants viewing. Download continues to follow the gallery-level and video-level download flags, so the studio decides whether a buyer can download.

## Public Purchase Flow

When a viewer clicks a locked film, the public gallery opens a paid unlock modal. The modal calls:

`POST /api/public/gallery/:slug/paid-unlock/checkout`

The server validates that the gallery is publicly accessible, the video belongs to that gallery, the video is visible, and `paid_unlock_enabled` is true. It then creates a Stripe Checkout Session with metadata for `account_id`, `gallery_id`, `gallery_slug`, `video_id`, `purchase_id`, and `kind=video_unlock`. The same metadata is also attached to the Stripe PaymentIntent so payment-failure webhooks can resolve the pending purchase.

Before the checkout URL is returned to the browser, Lanterna writes a `video_unlock_purchases` row with `status='pending'`, the Stripe Checkout Session id, amount, currency, fee split, gallery id, video id, and account id. Buyer email is unknown until Stripe collects it, so pending rows may have `buyer_email=null`.

Stripe success returns to:

`/g/:slug?unlock_session={CHECKOUT_SESSION_ID}`

Stripe cancel returns to:

`/g/:slug?unlock_cancelled=true`

The current public UI does not display a special cancelled-checkout message. The pending row remains pending until a Stripe webhook completes or fails it.

## Verification And Unlock

The public page detects `unlock_session` in the URL and calls:

`GET /api/public/gallery/:slug/paid-unlock/session?session_id=:sessionId`

The server fetches the Checkout Session from Stripe, requires `payment_status=paid`, verifies the Stripe metadata matches the current gallery, then looks for a completed `video_unlock_purchases` row. Return-URL verification does not grant the unlock by itself; it is a fast convenience path that polls briefly and returns media after the Stripe webhook has completed the purchase.

The Stripe webhook route handles `checkout.session.completed`, verifies the webhook signature, and upserts the completed purchase row. This is the authoritative path that grants unlock access, including when a buyer pays and closes the tab before returning to Lanterna. Webhook delivery is idempotent through the unique `stripe_checkout_session_id` index. Duplicate completed webhooks keep the original `unlocked_at` timestamp.

## Purchase States

`video_unlock_purchases.status` allows `pending`, `complete`, `refunded`, and `failed`.

Implemented today:

- `pending`: written immediately after Stripe Checkout Session creation, before redirecting the viewer to Stripe.
- `complete`: written by the Stripe webhook when payment status is paid.
- `failed`: written by webhook for expired or async-failed Checkout Sessions, and for `payment_intent.payment_failed` when a card is declined.

Allowed but not currently written by application code:

- `refunded`: no refund webhook handler writes this.

For v1, Lanterna treats Stripe as the source of truth for refunds. Abandoned checkout remains pending until Stripe sends an expiration/failure event.

## Unlocked Access

Before unlock, public gallery payloads include only the paid video's poster key. The paid video's R2 playback keys and Stream playback token are withheld.

After unlock, the session verification response returns:

- signed R2 URLs for `r2_key`, `web_copy_r2_key`, and `poster_r2_key` when present;
- signed Cloudflare Stream playback when `stream_uid` is present and ready;
- the unlocked `videoId`, used by the public page to open the player.

Unlocked playback behaves like normal public playback. Stream is preferred when available, with the derived `web_copy_r2_key` as the R2 playback fallback. Download permission resolves in this order: a non-null video `download_enabled` override wins, otherwise the gallery `allow_downloads` value wins when non-null, otherwise the vendor `default_downloads` value applies. The original `r2_key` is signed only when that resolved permission is true; paid unlock grants viewing and does not bypass it.

Unlock state is a server-side purchase fact. The buyer can restore an unlock from another browser or device by entering the email address Stripe collected at checkout. No viewer account is created.

## Refunds

Refunds are manual via Stripe Dashboard for v1. Lanterna does not currently listen for refund webhooks, change `video_unlock_purchases.status` to `refunded`, revoke a viewer's already-returned signed URLs, or show refund state in the studio dashboard.

If refunds become a product surface, add a Stripe refund webhook handler and decide whether refund revokes future re-verification for the same checkout session.

## Known Gaps

- `paid_unlock_trailer` is stored and the studio UI promises a locked preview trailer, but public locked videos do not currently receive teaser playback URLs. The locked tile is visible; the film itself is not playable until purchase.
- Abandoned checkout remains `pending` unless Stripe sends an expiration/failure webhook.
