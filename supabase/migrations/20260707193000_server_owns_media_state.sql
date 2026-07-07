/*
# Server-owned media and upload-job state

Studio clients may edit media presentation metadata, but asset/readiness fields
are server-verified truth. Upload job reservations are also server-owned.
*/

ALTER TABLE public.photos
  ALTER COLUMN r2_key DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_client_video_asset_state_change()
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
    IF NEW.r2_key IS NOT NULL
      OR NEW.r2_bytes IS DISTINCT FROM 0
      OR NEW.stream_uid IS NOT NULL
      OR NEW.stream_ready IS DISTINCT FROM false
      OR NEW.web_copy_r2_key IS NOT NULL
      OR NEW.poster_r2_key IS NOT NULL
      OR NEW.processing_status IS DISTINCT FROM 'uploading'
    THEN
      RAISE EXCEPTION 'Video asset state must be changed through the Lanterna API.';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.r2_key IS DISTINCT FROM OLD.r2_key
    OR NEW.r2_bytes IS DISTINCT FROM OLD.r2_bytes
    OR NEW.stream_uid IS DISTINCT FROM OLD.stream_uid
    OR NEW.stream_ready IS DISTINCT FROM OLD.stream_ready
    OR NEW.web_copy_r2_key IS DISTINCT FROM OLD.web_copy_r2_key
    OR NEW.poster_r2_key IS DISTINCT FROM OLD.poster_r2_key
    OR NEW.processing_status IS DISTINCT FROM OLD.processing_status
  THEN
    RAISE EXCEPTION 'Video asset state must be changed through the Lanterna API.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_client_photo_asset_state_change()
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
    IF NEW.r2_key IS NOT NULL
      OR NEW.r2_bytes IS DISTINCT FROM 0
      OR NEW.processing_status IS DISTINCT FROM 'uploading'
    THEN
      RAISE EXCEPTION 'Photo asset state must be changed through the Lanterna API.';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.r2_key IS DISTINCT FROM OLD.r2_key
    OR NEW.r2_bytes IS DISTINCT FROM OLD.r2_bytes
    OR NEW.processing_status IS DISTINCT FROM OLD.processing_status
  THEN
    RAISE EXCEPTION 'Photo asset state must be changed through the Lanterna API.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videos_prevent_client_asset_state_change ON public.videos;
CREATE TRIGGER videos_prevent_client_asset_state_change
  BEFORE INSERT OR UPDATE OF r2_key, r2_bytes, stream_uid, stream_ready, web_copy_r2_key, poster_r2_key, processing_status ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_video_asset_state_change();

DROP TRIGGER IF EXISTS photos_prevent_client_asset_state_change ON public.photos;
CREATE TRIGGER photos_prevent_client_asset_state_change
  BEFORE INSERT OR UPDATE OF r2_key, r2_bytes, processing_status ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_photo_asset_state_change();

DROP POLICY IF EXISTS "members can manage upload jobs" ON public.upload_jobs;
DROP POLICY IF EXISTS "members can read upload jobs" ON public.upload_jobs;
CREATE POLICY "members can read upload jobs" ON public.upload_jobs
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));
