drop index if exists public.video_unlock_purchases_stripe_session_uidx;

create unique index if not exists video_unlock_purchases_stripe_session_uidx
  on public.video_unlock_purchases(stripe_checkout_session_id);
