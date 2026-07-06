alter table public.videos
  add column if not exists paid_unlock_enabled boolean not null default false,
  add column if not exists paid_unlock_price_cents integer not null default 30000,
  add column if not exists paid_unlock_currency text not null default 'usd',
  add column if not exists paid_unlock_label text,
  add column if not exists paid_unlock_tagline text,
  add column if not exists paid_unlock_trailer boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'videos_paid_unlock_price_nonnegative'
  ) then
    alter table public.videos
      add constraint videos_paid_unlock_price_nonnegative
      check (paid_unlock_price_cents >= 0);
  end if;
end $$;

create table if not exists public.video_unlock_purchases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  buyer_email text not null,
  amount_cents integer not null,
  currency text not null default 'usd',
  platform_fee_cents integer not null default 0,
  studio_payout_cents integer not null default 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending',
  unlocked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists video_unlock_purchases_gallery_video_idx
  on public.video_unlock_purchases(gallery_id, video_id, status);

create index if not exists video_unlock_purchases_buyer_idx
  on public.video_unlock_purchases(gallery_id, buyer_email, status);

alter table public.video_unlock_purchases enable row level security;

drop policy if exists "members can read video unlock purchases" on public.video_unlock_purchases;
create policy "members can read video unlock purchases" on public.video_unlock_purchases
  for select
  using (public.is_account_member(account_id));

drop policy if exists "members can manage video unlock purchases" on public.video_unlock_purchases;
create policy "members can manage video unlock purchases" on public.video_unlock_purchases
  for all
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));
