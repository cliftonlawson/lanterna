/*
# Server-owned gallery access and passwords

Gallery access changes pass through the authenticated API so password hashes
are always generated server-side and cannot be forged by a browser client.
*/

CREATE OR REPLACE FUNCTION public.prevent_client_gallery_access_change()
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

  IF TG_OP = 'INSERT' THEN
    IF NEW.password_hash IS NOT NULL OR NEW.access_type <> 'private' THEN
      RAISE EXCEPTION 'Gallery access must be changed through the Lanterna API.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.access_type IS DISTINCT FROM OLD.access_type
    OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
  THEN
    RAISE EXCEPTION 'Gallery access must be changed through the Lanterna API.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS galleries_prevent_client_access_change ON public.galleries;
CREATE TRIGGER galleries_prevent_client_access_change
  BEFORE INSERT OR UPDATE OF access_type, password_hash ON public.galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_gallery_access_change();
