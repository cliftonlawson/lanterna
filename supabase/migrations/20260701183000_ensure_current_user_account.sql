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

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;

  SELECT account_id
  INTO existing_account_id
  FROM public.account_members
  WHERE user_id = current_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF existing_account_id IS NOT NULL THEN
    RETURN existing_account_id;
  END IF;

  SELECT email, COALESCE(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'name', split_part(email, '@', 1))
  INTO current_email, current_display
  FROM auth.users
  WHERE id = current_user_id;

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

  INSERT INTO public.account_usage (account_id, allowance_used_gb, allowance_total_gb, synced_at)
  VALUES (new_account_id, 0, 50, now())
  ON CONFLICT (account_id) DO NOTHING;

  RETURN new_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_current_user_account() TO authenticated;
