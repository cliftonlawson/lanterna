create unique index if not exists video_unlock_purchases_stripe_session_uidx
  on public.video_unlock_purchases(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.video_unlock_purchases'::regclass
      and conname = 'video_unlock_purchases_amount_nonnegative'
  ) then
    alter table public.video_unlock_purchases
      add constraint video_unlock_purchases_amount_nonnegative
      check (amount_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.video_unlock_purchases'::regclass
      and conname = 'video_unlock_purchases_fees_nonnegative'
  ) then
    alter table public.video_unlock_purchases
      add constraint video_unlock_purchases_fees_nonnegative
      check (platform_fee_cents >= 0 and studio_payout_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.video_unlock_purchases'::regclass
      and conname = 'video_unlock_purchases_fees_within_amount'
  ) then
    alter table public.video_unlock_purchases
      add constraint video_unlock_purchases_fees_within_amount
      check (platform_fee_cents + studio_payout_cents <= amount_cents);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.video_unlock_purchases'::regclass
      and conname = 'video_unlock_purchases_status_valid'
  ) then
    alter table public.video_unlock_purchases
      add constraint video_unlock_purchases_status_valid
      check (status in ('pending', 'complete', 'refunded', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.video_unlock_purchases'::regclass
      and conname = 'video_unlock_purchases_currency_valid'
  ) then
    alter table public.video_unlock_purchases
      add constraint video_unlock_purchases_currency_valid
      check (currency ~ '^[a-z]{3}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.video_unlock_purchases'::regclass
      and conname = 'video_unlock_purchases_buyer_email_present'
  ) then
    alter table public.video_unlock_purchases
      add constraint video_unlock_purchases_buyer_email_present
      check (length(btrim(buyer_email)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.video_unlock_purchases'::regclass
      and conname = 'video_unlock_purchases_stripe_ids_present'
  ) then
    alter table public.video_unlock_purchases
      add constraint video_unlock_purchases_stripe_ids_present
      check (
        (stripe_checkout_session_id is null or length(btrim(stripe_checkout_session_id)) > 0)
        and (stripe_payment_intent_id is null or length(btrim(stripe_payment_intent_id)) > 0)
      );
  end if;
end $$;
