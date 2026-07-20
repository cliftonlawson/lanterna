/*
# Launch integrity hardening

Adds one-time paid-film recovery tokens and makes one-time billing refunds
revoke the entitlement they originally granted.
*/

CREATE TABLE IF NOT EXISTS public.video_unlock_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.video_unlock_purchases(id) ON DELETE CASCADE,
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_unlock_recovery_purchase_idx
  ON public.video_unlock_recovery_tokens(purchase_id, created_at DESC);

CREATE INDEX IF NOT EXISTS video_unlock_recovery_expiry_idx
  ON public.video_unlock_recovery_tokens(expires_at);

ALTER TABLE public.video_unlock_recovery_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.public_api_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, key_hash)
);

ALTER TABLE public.public_api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS public_api_rate_limits_window_idx
  ON public.public_api_rate_limits(window_started_at);

CREATE OR REPLACE FUNCTION public.consume_public_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.public_api_rate_limits%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Rate limits are server-owned.';
  END IF;
  IF p_limit < 1 OR p_window_seconds < 1 THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key_hash, 0));
  SELECT * INTO v_row FROM public.public_api_rate_limits
    WHERE scope = p_scope AND key_hash = p_key_hash FOR UPDATE;
  IF NOT FOUND OR v_row.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN
    INSERT INTO public.public_api_rate_limits(scope, key_hash, window_started_at, attempts)
    VALUES (p_scope, p_key_hash, now(), 1)
    ON CONFLICT (scope, key_hash) DO UPDATE
      SET window_started_at = now(), attempts = 1;
    RETURN true;
  END IF;
  IF v_row.attempts >= p_limit THEN RETURN false; END IF;
  UPDATE public.public_api_rate_limits SET attempts = attempts + 1
    WHERE scope = p_scope AND key_hash = p_key_hash;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_public_rate_limit(text, text, integer, integer) TO service_role;

ALTER TABLE public.billing_checkout_sessions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.billing_checkout_sessions
  DROP CONSTRAINT IF EXISTS billing_checkout_sessions_status_check;

ALTER TABLE public.billing_checkout_sessions
  ADD CONSTRAINT billing_checkout_sessions_status_check
  CHECK (status IN ('pending', 'complete', 'failed', 'refunded'));

CREATE INDEX IF NOT EXISTS billing_checkout_sessions_payment_intent_idx
  ON public.billing_checkout_sessions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reverse_one_time_billing(
  p_stripe_payment_intent_id text,
  p_effective_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkout public.billing_checkout_sessions%ROWTYPE;
  v_period public.entitlements%ROWTYPE;
  v_total numeric := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Billing reversal is server-owned.';
  END IF;

  SELECT * INTO v_checkout
  FROM public.billing_checkout_sessions
  WHERE stripe_payment_intent_id = p_stripe_payment_intent_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_checkout.status = 'refunded' THEN RETURN true; END IF;
  IF v_checkout.status <> 'complete' THEN RETURN false; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_checkout.account_id::text, 0));

  IF v_checkout.sku LIKE 'block_%' THEN
    UPDATE public.entitlements
    SET status = 'expired', period_end = LEAST(period_end, p_effective_at)
    WHERE account_id = v_checkout.account_id
      AND status = 'active'
      AND (stripe_reference = v_checkout.stripe_checkout_session_id
        OR parent_reference = v_checkout.stripe_checkout_session_id);
  ELSIF v_checkout.sku = 'topup_5' THEN
    UPDATE public.entitlements
    SET status = 'expired', period_end = LEAST(period_end, p_effective_at)
    WHERE account_id = v_checkout.account_id
      AND status = 'active'
      AND stripe_reference = v_checkout.stripe_checkout_session_id;
  ELSIF v_checkout.sku = 'white_label_annual' THEN
    UPDATE public.vendor_branding
    SET white_label_until = LEAST(COALESCE(white_label_until, p_effective_at), p_effective_at)
    WHERE account_id = v_checkout.account_id;
  ELSE
    RETURN false;
  END IF;

  SELECT COALESCE(sum(gb_granted), 0) INTO v_total
  FROM public.entitlements
  WHERE account_id = v_checkout.account_id
    AND status = 'active'
    AND period_end > p_effective_at;

  SELECT * INTO v_period
  FROM public.entitlements
  WHERE account_id = v_checkout.account_id
    AND status = 'active'
    AND period_end > p_effective_at
    AND source IN ('subscription', 'block', 'welcome')
  ORDER BY period_end DESC
  LIMIT 1;

  UPDATE public.account_usage
  SET allowance_total_gb = v_total,
      allowance_period_start = v_period.period_start,
      allowance_period_end = v_period.period_end,
      synced_at = now()
  WHERE account_id = v_checkout.account_id;

  UPDATE public.billing_checkout_sessions
  SET status = 'refunded', refunded_at = p_effective_at
  WHERE stripe_checkout_session_id = v_checkout.stripe_checkout_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_one_time_billing(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_one_time_billing(text, timestamptz) TO service_role;
