/*
# Server-owned media deletes

Media removal is a recoverable soft-delete through the Lanterna API. Studio
clients may request deletion, but browser-authenticated clients may not directly
write deleted_at or hard-delete media rows.
*/

CREATE OR REPLACE FUNCTION public.prevent_client_media_delete()
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
    RAISE EXCEPTION 'Media deletion must be requested through the Lanterna API.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Media deletion must be requested through the Lanterna API.';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Media deletion must be requested through the Lanterna API.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videos_prevent_client_media_delete ON public.videos;
CREATE TRIGGER videos_prevent_client_media_delete
  BEFORE INSERT OR UPDATE OF deleted_at OR DELETE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_media_delete();

DROP TRIGGER IF EXISTS photos_prevent_client_media_delete ON public.photos;
CREATE TRIGGER photos_prevent_client_media_delete
  BEFORE INSERT OR UPDATE OF deleted_at OR DELETE ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_media_delete();
