/*
# Stripe Connect monetization

Stores the Stripe merchant account attached to each Lanterna workspace and
keeps direct-charge purchases tied to the Stripe account that owns them.
*/

CREATE TABLE IF NOT EXISTS public.stripe_connected_accounts (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  requirements_due text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_connected_accounts_stripe_id_idx
  ON public.stripe_connected_accounts(stripe_account_id);

ALTER TABLE public.stripe_connected_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can read their Stripe connection" ON public.stripe_connected_accounts;
CREATE POLICY "members can read their Stripe connection" ON public.stripe_connected_accounts
  FOR SELECT
  USING (public.is_account_member(account_id));

DROP TRIGGER IF EXISTS stripe_connected_accounts_set_updated_at ON public.stripe_connected_accounts;
CREATE TRIGGER stripe_connected_accounts_set_updated_at
  BEFORE UPDATE ON public.stripe_connected_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.video_unlock_purchases
  ADD COLUMN IF NOT EXISTS stripe_connected_account_id text;

CREATE INDEX IF NOT EXISTS video_unlock_purchases_connected_account_idx
  ON public.video_unlock_purchases(stripe_connected_account_id, created_at DESC)
  WHERE stripe_connected_account_id IS NOT NULL;

ALTER TABLE public.video_unlock_purchases
  DROP CONSTRAINT IF EXISTS video_unlock_purchases_connected_account_present;

ALTER TABLE public.video_unlock_purchases
  ADD CONSTRAINT video_unlock_purchases_connected_account_present
  CHECK (
    stripe_connected_account_id IS NULL
    OR length(btrim(stripe_connected_account_id)) > 0
  );
