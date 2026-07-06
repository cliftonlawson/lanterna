/*
# Lanterna Usage Allowance Defaults

Corrects early dev accounts created with a zero upload allowance and allows
authenticated account members to write usage events for the upload accounting trigger.
*/

ALTER TABLE public.account_usage
  ALTER COLUMN allowance_total_gb SET DEFAULT 50;

UPDATE public.account_usage
SET
  allowance_total_gb = 50,
  synced_at = now()
WHERE allowance_total_gb = 0;

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

  INSERT INTO public.account_usage (account_id, allowance_used_gb, allowance_total_gb, synced_at)
  VALUES (new_account_id, 0, 50, now());

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "members can insert usage events" ON public.usage_events;
CREATE POLICY "members can insert usage events" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_account_member(account_id));
