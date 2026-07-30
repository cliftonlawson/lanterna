/*
# One-year originals and white-label entitlements

New deliveries retain source files for one year while preserving the ten-year
optimized-gallery window. Existing delivered galleries keep the retention
clock they were promised. White label is included with active subscriptions
and can also be granted through a time-bounded add-on.
*/

ALTER TABLE public.galleries
  ALTER COLUMN source_file_window_days SET DEFAULT 365;

UPDATE public.galleries
SET source_file_window_days = 365
WHERE delivered_at IS NULL
  AND source_file_expires_at IS NULL;

ALTER TABLE public.vendor_branding
  ADD COLUMN IF NOT EXISTS white_label_until timestamptz;

COMMENT ON COLUMN public.vendor_branding.white_label_until IS
  'Paid white-label add-on expiry. Active subscriptions include white label independently.';

-- Preserve any custom domain that was configured before entitlement gating.
UPDATE public.vendor_branding
SET white_label_until = '9999-12-31 23:59:59+00'
WHERE custom_domain IS NOT NULL
  AND white_label_until IS NULL;

CREATE OR REPLACE FUNCTION public.account_has_white_label(target_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      auth.role() = 'service_role'
      OR public.is_account_member(target_account_id)
    )
    AND (
      COALESCE(
        (SELECT white_label_until > now()
         FROM public.vendor_branding
         WHERE account_id = target_account_id),
        false
      )
      OR EXISTS (
        SELECT 1
        FROM public.subscriptions
        WHERE account_id = target_account_id
          AND status = 'active'
          AND current_period_end > now()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.account_has_white_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_has_white_label(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_client_white_label_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.white_label_until IS NOT NULL THEN
    RAISE EXCEPTION 'White-label access must be changed through LANTERNA billing.';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.white_label_until IS DISTINCT FROM OLD.white_label_until
  THEN
    RAISE EXCEPTION 'White-label access must be changed through LANTERNA billing.';
  END IF;

  IF NEW.custom_domain IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.custom_domain IS DISTINCT FROM OLD.custom_domain)
    AND NOT public.account_has_white_label(NEW.account_id)
  THEN
    RAISE EXCEPTION 'A subscription or white-label add-on is required for a custom domain.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_branding_prevent_client_white_label_change ON public.vendor_branding;
CREATE TRIGGER vendor_branding_prevent_client_white_label_change
  BEFORE INSERT OR UPDATE OF white_label_until, custom_domain ON public.vendor_branding
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_white_label_change();

CREATE OR REPLACE FUNCTION public.prevent_client_gallery_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Gallery deletion must be requested through the Lanterna API.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.source_file_window_days IS DISTINCT FROM 365
      OR NEW.source_file_expires_at IS NOT NULL
      OR NEW.access_window_days IS DISTINCT FROM 3650
      OR NEW.access_expires_at IS NOT NULL
      OR NEW.storage_tier IS DISTINCT FROM 'hot'
      OR NEW.is_extended IS DISTINCT FROM false
      OR NEW.extended_until IS NOT NULL
      OR NEW.published_at IS NOT NULL
      OR NEW.delivered_at IS NOT NULL
      OR NEW.archived_at IS NOT NULL
      OR NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'Gallery lifecycle state must be changed through the Lanterna API.';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.source_file_window_days IS DISTINCT FROM OLD.source_file_window_days
    OR NEW.source_file_expires_at IS DISTINCT FROM OLD.source_file_expires_at
    OR NEW.access_window_days IS DISTINCT FROM OLD.access_window_days
    OR NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at
    OR NEW.storage_tier IS DISTINCT FROM OLD.storage_tier
    OR NEW.is_extended IS DISTINCT FROM OLD.is_extended
    OR NEW.extended_until IS DISTINCT FROM OLD.extended_until
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
    OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  THEN
    RAISE EXCEPTION 'Gallery lifecycle state must be changed through the Lanterna API.';
  END IF;

  RETURN NEW;
END;
$$;
