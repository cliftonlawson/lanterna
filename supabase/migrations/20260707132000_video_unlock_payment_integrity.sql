/*
# Paid unlock payment integrity

Checkout creation now writes pending purchases before Stripe collects buyer email.
Payment state is written by server-side Stripe routes only.
*/

ALTER TABLE public.video_unlock_purchases
  ALTER COLUMN buyer_email DROP NOT NULL;

ALTER TABLE public.video_unlock_purchases
  DROP CONSTRAINT IF EXISTS video_unlock_purchases_buyer_email_present;

ALTER TABLE public.video_unlock_purchases
  ADD CONSTRAINT video_unlock_purchases_buyer_email_required_when_complete
  CHECK (
    status IN ('pending', 'failed')
    OR length(btrim(coalesce(buyer_email, ''))) > 0
  );

CREATE INDEX IF NOT EXISTS video_unlock_purchases_recover_idx
  ON public.video_unlock_purchases(gallery_id, video_id, lower(buyer_email))
  WHERE status = 'complete' AND buyer_email IS NOT NULL;

DROP POLICY IF EXISTS "members can read video unlock purchases" ON public.video_unlock_purchases;
DROP POLICY IF EXISTS "members can manage video unlock purchases" ON public.video_unlock_purchases;
