/*
# Platform billing fulfillment

Makes the public pricing catalog enforceable: paid subscriptions grant an
annual upload allowance while billing monthly or annually, one-time blocks are
valid for one year, top-ups share the active subscription or block expiry, and white label is a
separate annual add-on for block accounts. New accounts receive one 10 GB
welcome allowance, valid for one year, without receiving paid-plan features.
*/

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_stripe_customer_unique_idx
  ON public.accounts(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS allowance_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS allowance_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_interval_check
  CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_unique_idx
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_per_account_idx
  ON public.subscriptions(account_id)
  WHERE status IN ('active', 'past_due');

ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS parent_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_stripe_reference_unique_idx
  ON public.entitlements(stripe_reference)
  WHERE stripe_reference IS NOT NULL;

ALTER TABLE public.account_usage
  ADD COLUMN IF NOT EXISTS allowance_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS allowance_period_end timestamptz;

ALTER TABLE public.account_usage
  ALTER COLUMN allowance_total_gb SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.billing_checkout_sessions (
  stripe_checkout_session_id text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  sku text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed')),
  stripe_customer_id text,
  stripe_subscription_id text,
  amount_cents int NOT NULL CHECK (amount_cents >= 0),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_checkout_sessions_account_created_idx
  ON public.billing_checkout_sessions(account_id, created_at DESC);

ALTER TABLE public.billing_checkout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can read billing checkout sessions" ON public.billing_checkout_sessions;
CREATE POLICY "members can read billing checkout sessions" ON public.billing_checkout_sessions
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

DROP TRIGGER IF EXISTS billing_checkout_sessions_set_updated_at ON public.billing_checkout_sessions;
CREATE TRIGGER billing_checkout_sessions_set_updated_at
  BEFORE UPDATE ON public.billing_checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.fulfill_subscription_billing(
  p_account_id uuid,
  p_plan plan_tier,
  p_seats int,
  p_allowance_gb numeric,
  p_sku text,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_stripe_checkout_session_id text,
  p_billing_interval text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean DEFAULT false,
  p_effective_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.subscriptions%ROWTYPE;
  v_usage public.account_usage%ROWTYPE;
  v_subscription_id uuid;
  v_allowance_start timestamptz;
  v_allowance_end timestamptz;
  v_topup_gb numeric := 0;
  v_reset boolean := false;
  v_reference text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Subscription fulfillment is server-owned.';
  END IF;

  IF p_allowance_gb <= 0 OR p_seats <= 0 OR p_billing_interval NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'Invalid subscription entitlement.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));

  SELECT * INTO v_existing
  FROM public.subscriptions
  WHERE stripe_subscription_id = p_stripe_subscription_id
  FOR UPDATE;

  IF FOUND THEN
    v_subscription_id := v_existing.id;
    v_allowance_start := v_existing.allowance_period_start;
    v_allowance_end := v_existing.allowance_period_end;

    IF v_allowance_start IS NULL OR v_allowance_end IS NULL THEN
      v_allowance_start := p_effective_at;
      v_allowance_end := p_effective_at + interval '1 year';
      v_reset := true;
    END IF;

    WHILE v_allowance_end <= p_effective_at LOOP
      v_allowance_start := v_allowance_end;
      v_allowance_end := v_allowance_end + interval '1 year';
      v_reset := true;
    END LOOP;

    UPDATE public.subscriptions
    SET plan = p_plan,
        status = 'active',
        seats = p_seats,
        current_period_start = p_current_period_start,
        current_period_end = p_current_period_end,
        stripe_customer_id = p_stripe_customer_id,
        stripe_checkout_session_id = COALESCE(p_stripe_checkout_session_id, stripe_checkout_session_id),
        billing_interval = p_billing_interval,
        allowance_period_start = v_allowance_start,
        allowance_period_end = v_allowance_end,
        cancel_at_period_end = p_cancel_at_period_end
    WHERE id = v_subscription_id;
  ELSE
    UPDATE public.subscriptions
    SET status = 'canceled'
    WHERE account_id = p_account_id
      AND status IN ('active', 'past_due');

    SELECT * INTO v_usage
    FROM public.account_usage
    WHERE account_id = p_account_id
    FOR UPDATE;

    IF FOUND
      AND v_usage.allowance_period_start IS NOT NULL
      AND v_usage.allowance_period_end > p_effective_at
      AND EXISTS (
        SELECT 1 FROM public.entitlements
        WHERE account_id = p_account_id AND source = 'subscription'
      )
    THEN
      -- Canceling and re-subscribing cannot mint a fresh annual allowance.
      v_allowance_start := v_usage.allowance_period_start;
      v_allowance_end := v_usage.allowance_period_end;
    ELSE
      v_allowance_start := p_effective_at;
      v_allowance_end := p_effective_at + interval '1 year';
      v_reset := true;
    END IF;

    INSERT INTO public.subscriptions (
      account_id, plan, status, seats, current_period_start, current_period_end,
      stripe_subscription_id, stripe_customer_id, stripe_checkout_session_id,
      billing_interval, allowance_period_start, allowance_period_end, cancel_at_period_end
    ) VALUES (
      p_account_id, p_plan, 'active', p_seats, p_current_period_start, p_current_period_end,
      p_stripe_subscription_id, p_stripe_customer_id, p_stripe_checkout_session_id,
      p_billing_interval, v_allowance_start, v_allowance_end, p_cancel_at_period_end
    ) RETURNING id INTO v_subscription_id;
  END IF;

  UPDATE public.accounts
  SET stripe_customer_id = p_stripe_customer_id
  WHERE id = p_account_id;

  UPDATE public.entitlements
  SET status = 'expired'
  WHERE account_id = p_account_id
    AND source IN ('block', 'welcome')
    AND status = 'active';

  UPDATE public.entitlements
  SET status = 'expired'
  WHERE account_id = p_account_id
    AND source = 'topup'
    AND status = 'active'
    AND (
      parent_reference IS DISTINCT FROM p_stripe_subscription_id
      OR period_start IS DISTINCT FROM v_allowance_start
      OR period_end IS DISTINCT FROM v_allowance_end
    );

  UPDATE public.entitlements
  SET status = 'expired'
  WHERE account_id = p_account_id
    AND source = 'subscription'
    AND status = 'active'
    AND period_start IS DISTINCT FROM v_allowance_start;

  v_reference := p_stripe_subscription_id || ':' || extract(epoch FROM v_allowance_start)::bigint::text;
  INSERT INTO public.entitlements (
    account_id, source, gb_granted, period_start, period_end, status, stripe_reference, sku
  ) VALUES (
    p_account_id, 'subscription', p_allowance_gb, v_allowance_start, v_allowance_end, 'active', v_reference, p_sku
  )
  ON CONFLICT (stripe_reference) WHERE stripe_reference IS NOT NULL DO UPDATE
  SET gb_granted = EXCLUDED.gb_granted,
      period_end = EXCLUDED.period_end,
      status = 'active',
      sku = EXCLUDED.sku;

  SELECT COALESCE(sum(gb_granted), 0) INTO v_topup_gb
  FROM public.entitlements
  WHERE account_id = p_account_id
    AND source = 'topup'
    AND status = 'active'
    AND parent_reference = p_stripe_subscription_id
    AND period_start = v_allowance_start
    AND period_end = v_allowance_end;

  INSERT INTO public.account_usage (
    account_id, allowance_used_gb, allowance_total_gb,
    allowance_period_start, allowance_period_end, synced_at
  ) VALUES (
    p_account_id, 0, p_allowance_gb + v_topup_gb,
    v_allowance_start, v_allowance_end, now()
  )
  ON CONFLICT (account_id) DO UPDATE
  SET allowance_used_gb = CASE WHEN v_reset THEN 0 ELSE public.account_usage.allowance_used_gb END,
      allowance_total_gb = p_allowance_gb + v_topup_gb,
      allowance_period_start = v_allowance_start,
      allowance_period_end = v_allowance_end,
      synced_at = now();

  UPDATE public.billing_checkout_sessions
  SET status = 'complete',
      stripe_customer_id = p_stripe_customer_id,
      stripe_subscription_id = p_stripe_subscription_id,
      completed_at = COALESCE(completed_at, now())
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;

  RETURN jsonb_build_object(
    'allowanceGb', p_allowance_gb,
    'allowancePeriodEnd', v_allowance_end,
    'reset', v_reset,
    'subscriptionId', v_subscription_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_one_time_billing(
  p_account_id uuid,
  p_sku text,
  p_kind text,
  p_allowance_gb numeric,
  p_stripe_checkout_session_id text,
  p_stripe_customer_id text,
  p_effective_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block public.entitlements%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_has_block boolean := false;
  v_has_subscription boolean := false;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Billing fulfillment is server-owned.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.billing_checkout_sessions
    WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
      AND status = 'complete'
  ) THEN
    RETURN jsonb_build_object('alreadyCompleted', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));

  SELECT * INTO v_subscription
  FROM public.subscriptions
    WHERE account_id = p_account_id
      AND status IN ('active', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  v_has_subscription := FOUND;

  SELECT * INTO v_block
  FROM public.entitlements
  WHERE account_id = p_account_id
    AND source = 'block'
    AND status = 'active'
    AND period_end > p_effective_at
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;
  v_has_block := FOUND;

  IF p_kind = 'block' THEN
    IF v_has_subscription THEN
      RAISE EXCEPTION 'Upload blocks are only available without a subscription.';
    END IF;
    IF v_has_block THEN
      RAISE EXCEPTION 'An upload block is already active. Add a 5 GB top-up instead.';
    END IF;
    IF p_allowance_gb <= 0 THEN RAISE EXCEPTION 'Invalid block allowance.'; END IF;

    v_period_start := p_effective_at;
    v_period_end := p_effective_at + interval '1 year';

    UPDATE public.entitlements
    SET status = 'expired'
    WHERE account_id = p_account_id AND status = 'active';

    INSERT INTO public.entitlements (
      account_id, source, gb_granted, period_start, period_end, status, stripe_reference, sku
    ) VALUES (
      p_account_id, 'block', p_allowance_gb, v_period_start, v_period_end,
      'active', p_stripe_checkout_session_id, p_sku
    );

    INSERT INTO public.account_usage (
      account_id, allowance_used_gb, allowance_total_gb,
      allowance_period_start, allowance_period_end, synced_at
    ) VALUES (
      p_account_id, 0, p_allowance_gb, v_period_start, v_period_end, now()
    )
    ON CONFLICT (account_id) DO UPDATE
    SET allowance_used_gb = 0,
        allowance_total_gb = p_allowance_gb,
        allowance_period_start = v_period_start,
        allowance_period_end = v_period_end,
        synced_at = now();
  ELSIF p_kind = 'topup' THEN
    IF v_has_subscription AND v_subscription.status <> 'active' THEN
      RAISE EXCEPTION 'Bring the subscription billing current before adding a top-up.';
    END IF;
    IF NOT v_has_subscription AND NOT v_has_block THEN
      RAISE EXCEPTION 'Choose a subscription or upload block before adding a top-up.';
    END IF;
    IF p_allowance_gb <= 0 THEN RAISE EXCEPTION 'Invalid top-up allowance.'; END IF;

    IF v_has_subscription THEN
      v_period_start := v_subscription.allowance_period_start;
      v_period_end := v_subscription.allowance_period_end;
    ELSE
      v_period_start := v_block.period_start;
      v_period_end := v_block.period_end;
    END IF;

    IF v_period_start IS NULL OR v_period_end IS NULL OR v_period_end <= p_effective_at THEN
      RAISE EXCEPTION 'The active allowance period could not be found.';
    END IF;
    INSERT INTO public.entitlements (
      account_id, source, gb_granted, period_start, period_end, status, stripe_reference, sku, parent_reference
    ) VALUES (
      p_account_id, 'topup', p_allowance_gb, v_period_start, v_period_end,
      'active', p_stripe_checkout_session_id, p_sku,
      CASE WHEN v_has_subscription THEN v_subscription.stripe_subscription_id ELSE v_block.stripe_reference END
    );

    UPDATE public.account_usage
    SET allowance_total_gb = allowance_total_gb + p_allowance_gb,
        synced_at = now()
    WHERE account_id = p_account_id;
  ELSIF p_kind = 'white_label' THEN
    IF v_has_subscription THEN RAISE EXCEPTION 'White label is already included with the subscription.'; END IF;
    IF NOT v_has_block THEN RAISE EXCEPTION 'Buy an upload block before adding white label.'; END IF;

    UPDATE public.vendor_branding
    SET white_label_until = GREATEST(COALESCE(white_label_until, p_effective_at), p_effective_at) + interval '1 year'
    WHERE account_id = p_account_id;
  ELSE
    RAISE EXCEPTION 'Unsupported one-time billing product.';
  END IF;

  UPDATE public.accounts
  SET stripe_customer_id = p_stripe_customer_id
  WHERE id = p_account_id;

  UPDATE public.billing_checkout_sessions
  SET status = 'complete',
      stripe_customer_id = p_stripe_customer_id,
      completed_at = COALESCE(completed_at, now())
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;

  RETURN jsonb_build_object('alreadyCompleted', false, 'periodEnd', v_period_end);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_subscription_billing_status(
  p_stripe_subscription_id text,
  p_status sub_status,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_allowance_start timestamptz;
  v_allowance_end timestamptz;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Subscription status is server-owned.';
  END IF;

  UPDATE public.subscriptions
  SET status = p_status,
      current_period_end = p_current_period_end,
      cancel_at_period_end = p_cancel_at_period_end
  WHERE stripe_subscription_id = p_stripe_subscription_id
  RETURNING account_id, allowance_period_start, allowance_period_end
  INTO v_account_id, v_allowance_start, v_allowance_end;

  IF v_account_id IS NOT NULL AND p_status = 'canceled' THEN
    UPDATE public.entitlements
    SET status = 'expired'
    WHERE account_id = v_account_id
      AND status = 'active'
      AND (
        (source = 'subscription' AND stripe_reference LIKE p_stripe_subscription_id || ':%')
        OR (
          source = 'topup'
          AND parent_reference = p_stripe_subscription_id
        )
      );

    IF NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE account_id = v_account_id
        AND stripe_subscription_id <> p_stripe_subscription_id
        AND status = 'active'
        AND current_period_end > now()
    ) THEN
      UPDATE public.account_usage
      SET allowance_total_gb = 0, synced_at = now()
      WHERE account_id = v_account_id;
    END IF;
  ELSIF v_account_id IS NOT NULL AND p_status = 'past_due' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE account_id = v_account_id
        AND stripe_subscription_id <> p_stripe_subscription_id
        AND status = 'active'
        AND current_period_end > now()
    ) THEN
      UPDATE public.account_usage
      SET allowance_total_gb = 0, synced_at = now()
      WHERE account_id = v_account_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_account_billing_state(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Billing refresh is server-owned.';
  END IF;

  UPDATE public.entitlements
  SET status = 'expired'
  WHERE account_id = p_account_id
    AND status = 'active'
    AND period_end <= now();

  UPDATE public.entitlements
  SET status = 'expired'
  WHERE account_id = p_account_id
    AND source = 'subscription'
    AND status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE account_id = p_account_id
        AND (status = 'past_due' OR (status = 'active' AND current_period_end > now()))
    );

  SELECT COALESCE(sum(gb_granted), 0), min(period_start), max(period_end)
  INTO v_total, v_period_start, v_period_end
  FROM public.entitlements
  WHERE account_id = p_account_id
    AND status = 'active'
    AND period_start <= now()
    AND period_end > now();

  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE account_id = p_account_id
      AND (status = 'past_due' OR (status = 'active' AND current_period_end <= now()))
  ) THEN
    v_total := 0;
  END IF;

  INSERT INTO public.account_usage (
    account_id, allowance_used_gb, allowance_total_gb,
    allowance_period_start, allowance_period_end, synced_at
  ) VALUES (
    p_account_id, 0, v_total, v_period_start, v_period_end, now()
  )
  ON CONFLICT (account_id) DO UPDATE
  SET allowance_total_gb = v_total,
      allowance_period_start = v_period_start,
      allowance_period_end = v_period_end,
      synced_at = now();

  RETURN jsonb_build_object(
    'allowanceTotalGb', v_total,
    'periodStart', v_period_start,
    'periodEnd', v_period_end
  );
END;
$$;

ALTER TABLE public.account_usage ALTER COLUMN allowance_total_gb SET DEFAULT 0;

UPDATE public.account_usage AS usage
SET allowance_total_gb = COALESCE((
      SELECT sum(entitlement.gb_granted)
      FROM public.entitlements AS entitlement
      WHERE entitlement.account_id = usage.account_id
        AND entitlement.status = 'active'
        AND entitlement.period_start <= now()
        AND entitlement.period_end > now()
    ), 0),
    synced_at = now();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_account_id uuid;
  display text;
BEGIN
  display := COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1));

  INSERT INTO public.users (id, email, display_name)
  VALUES (NEW.id, NEW.email, display)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.users.display_name, EXCLUDED.display_name);

  INSERT INTO public.accounts (name)
  VALUES (COALESCE(display, 'Lanterna Studio'))
  RETURNING id INTO new_account_id;

  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner');

  INSERT INTO public.vendor_branding (account_id, studio_name, tagline)
  VALUES (new_account_id, COALESCE(display, 'Lanterna Studio'), 'Wedding films, delivered beautifully');

  INSERT INTO public.entitlements (
    account_id, source, gb_granted, period_start, period_end, status, stripe_reference, sku
  ) VALUES (
    new_account_id, 'welcome', 10, now(), now() + interval '1 year', 'active',
    'welcome:' || NEW.id::text, 'welcome_10'
  );

  INSERT INTO public.account_usage (
    account_id, allowance_used_gb, allowance_total_gb,
    allowance_period_start, allowance_period_end, synced_at
  ) VALUES (new_account_id, 0, 10, now(), now() + interval '1 year', now());

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_current_user_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  current_email text;
  current_display text;
  existing_account_id uuid;
  new_account_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'No authenticated user'; END IF;

  SELECT account_id INTO existing_account_id
  FROM public.account_members
  WHERE user_id = current_user_id
  ORDER BY created_at ASC
  LIMIT 1;
  IF existing_account_id IS NOT NULL THEN RETURN existing_account_id; END IF;

  SELECT email, COALESCE(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'name', split_part(email, '@', 1))
  INTO current_email, current_display
  FROM auth.users WHERE id = current_user_id;

  INSERT INTO public.users (id, email, display_name)
  VALUES (current_user_id, current_email, current_display)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.users.display_name, EXCLUDED.display_name);

  INSERT INTO public.accounts (name)
  VALUES (COALESCE(current_display, 'Lanterna Studio'))
  RETURNING id INTO new_account_id;

  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (new_account_id, current_user_id, 'owner');

  INSERT INTO public.vendor_branding (account_id, studio_name, tagline)
  VALUES (new_account_id, COALESCE(current_display, 'Lanterna Studio'), 'Wedding films, delivered beautifully')
  ON CONFLICT (account_id) DO NOTHING;

  INSERT INTO public.entitlements (
    account_id, source, gb_granted, period_start, period_end, status, stripe_reference, sku
  ) VALUES (
    new_account_id, 'welcome', 10, now(), now() + interval '1 year', 'active',
    'welcome:' || current_user_id::text, 'welcome_10'
  )
  ON CONFLICT (stripe_reference) WHERE stripe_reference IS NOT NULL DO NOTHING;

  INSERT INTO public.account_usage (
    account_id, allowance_used_gb, allowance_total_gb,
    allowance_period_start, allowance_period_end, synced_at
  ) VALUES (new_account_id, 0, 10, now(), now() + interval '1 year', now())
  ON CONFLICT (account_id) DO NOTHING;

  RETURN new_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_current_user_account() TO authenticated;

REVOKE ALL ON FUNCTION public.fulfill_subscription_billing(uuid, plan_tier, int, numeric, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_one_time_billing(uuid, text, text, numeric, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_subscription_billing_status(text, sub_status, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_account_billing_state(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fulfill_subscription_billing(uuid, plan_tier, int, numeric, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_one_time_billing(uuid, text, text, numeric, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_subscription_billing_status(text, sub_status, timestamptz, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_account_billing_state(uuid) TO service_role;
