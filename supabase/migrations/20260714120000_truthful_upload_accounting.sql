/*
# Truthful, idempotent direct-upload accounting

All direct R2 uploads get a server-owned upload job. Completion attaches only
the exact object issued for that job, records provider-verified bytes once, and
uses decimal GB while retaining byte-level truth for small files.
*/

DROP INDEX IF EXISTS public.upload_jobs_video_phase_idx;

ALTER TABLE public.upload_jobs
  ALTER COLUMN target_type TYPE text USING target_type::text;

ALTER TABLE public.upload_jobs
  DROP CONSTRAINT IF EXISTS upload_jobs_target_type_check;

ALTER TABLE public.upload_jobs
  ADD CONSTRAINT upload_jobs_target_type_check
  CHECK (target_type IN ('video', 'photo', 'background', 'poster'));

CREATE INDEX IF NOT EXISTS upload_jobs_video_phase_idx
  ON public.upload_jobs(account_id, gallery_id, upload_phase)
  WHERE target_type = 'video';

CREATE OR REPLACE FUNCTION public.prevent_client_gallery_design_asset_state_change()
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
    IF NEW.background_r2_key IS NOT NULL OR NEW.music_track_r2_key IS NOT NULL THEN
      RAISE EXCEPTION 'Gallery design asset state must be changed through the Lanterna API.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.background_r2_key IS DISTINCT FROM OLD.background_r2_key
    OR NEW.music_track_r2_key IS DISTINCT FROM OLD.music_track_r2_key
  THEN
    RAISE EXCEPTION 'Gallery design asset state must be changed through the Lanterna API.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gallery_design_prevent_client_asset_state_change ON public.gallery_design;
CREATE TRIGGER gallery_design_prevent_client_asset_state_change
  BEFORE INSERT OR UPDATE OF background_r2_key, music_track_r2_key ON public.gallery_design
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_gallery_design_asset_state_change();

ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS bytes bigint;

ALTER TABLE public.usage_events
  ALTER COLUMN gb TYPE numeric(18,9) USING gb::numeric;

ALTER TABLE public.account_usage
  ALTER COLUMN allowance_used_gb TYPE numeric(18,9) USING allowance_used_gb::numeric;

-- Recover exact values where item 14 already tied usage to a verified job.
UPDATE public.usage_events AS event
SET bytes = job.verified_bytes
FROM public.upload_jobs AS job
WHERE event.upload_job_id = job.id
  AND job.verified_bytes IS NOT NULL
  AND job.verified_bytes > 0;

-- Older events were stored as GiB rounded to two decimals. Preserve the best
-- available historical estimate, then normalize all accounting to decimal GB.
UPDATE public.usage_events
SET bytes = round(gb * 1073741824::numeric)::bigint
WHERE bytes IS NULL;

UPDATE public.usage_events
SET gb = bytes::numeric / 1000000000::numeric;

ALTER TABLE public.usage_events
  ALTER COLUMN bytes SET DEFAULT 0,
  ALTER COLUMN bytes SET NOT NULL;

ALTER TABLE public.usage_events
  DROP CONSTRAINT IF EXISTS usage_events_bytes_nonnegative;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_bytes_nonnegative CHECK (bytes >= 0);

CREATE OR REPLACE FUNCTION public.normalize_usage_event_bytes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  verified_job_bytes bigint;
BEGIN
  IF NEW.upload_job_id IS NOT NULL THEN
    SELECT verified_bytes
    INTO verified_job_bytes
    FROM public.upload_jobs
    WHERE id = NEW.upload_job_id;

    IF verified_job_bytes IS NOT NULL AND verified_job_bytes > 0 THEN
      NEW.bytes := verified_job_bytes;
    END IF;
  END IF;

  IF NEW.bytes > 0 THEN
    NEW.gb := NEW.bytes::numeric / 1000000000::numeric;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usage_events_normalize_bytes ON public.usage_events;
CREATE TRIGGER usage_events_normalize_bytes
  BEFORE INSERT OR UPDATE OF bytes, gb, upload_job_id ON public.usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_usage_event_bytes();

-- The flow meter remains event-derived; recalculate it after unit conversion.
UPDATE public.account_usage AS usage
SET allowance_used_gb = COALESCE((
      SELECT sum(event.gb)
      FROM public.usage_events AS event
      WHERE event.account_id = usage.account_id
    ), 0),
    synced_at = now();

CREATE OR REPLACE FUNCTION public.complete_verified_r2_upload(
  p_account_id uuid,
  p_gallery_id uuid,
  p_upload_job_id uuid,
  p_r2_key text,
  p_verified_bytes bigint,
  p_content_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.upload_jobs%ROWTYPE;
  v_target_updated int := 0;
  v_usage_inserted int := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'R2 upload completion is server-owned.';
  END IF;

  SELECT *
  INTO v_job
  FROM public.upload_jobs
  WHERE id = p_upload_job_id
    AND account_id = p_account_id
    AND gallery_id = p_gallery_id
    AND target_type IN ('photo', 'background', 'poster')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct R2 upload job not found.';
  END IF;

  IF p_verified_bytes <= 0 THEN
    RAISE EXCEPTION 'Verified upload size must be positive.';
  END IF;

  IF v_job.r2_key IS DISTINCT FROM p_r2_key THEN
    RAISE EXCEPTION 'Verified R2 key does not match the upload job.';
  END IF;

  IF v_job.bytes_total IS DISTINCT FROM p_verified_bytes THEN
    RAISE EXCEPTION 'Verified upload size does not match the reserved upload size.';
  END IF;

  IF v_job.content_type IS NOT NULL
    AND lower(v_job.content_type) IS DISTINCT FROM lower(p_content_type)
  THEN
    RAISE EXCEPTION 'Verified upload content type does not match the upload slot.';
  END IF;

  IF v_job.completed_at IS NOT NULL OR v_job.status = 'complete' THEN
    IF v_job.verified_bytes IS DISTINCT FROM p_verified_bytes THEN
      RAISE EXCEPTION 'Completed upload does not match its original verification.';
    END IF;

    RETURN jsonb_build_object(
      'alreadyCompleted', true,
      'r2Key', v_job.r2_key,
      'targetType', v_job.target_type,
      'usageRecorded', false,
      'verifiedBytes', v_job.verified_bytes
    );
  END IF;

  IF v_job.target_type = 'photo' THEN
    UPDATE public.photos
    SET r2_key = p_r2_key,
        r2_bytes = p_verified_bytes,
        processing_status = 'ready'
    WHERE id = v_job.target_id
      AND gallery_id = p_gallery_id
      AND deleted_at IS NULL;
  ELSIF v_job.target_type = 'background' THEN
    IF v_job.target_id IS DISTINCT FROM p_gallery_id THEN
      RAISE EXCEPTION 'Background upload target does not match its gallery.';
    END IF;

    UPDATE public.gallery_design
    SET background_r2_key = p_r2_key,
        background_type = 'image'
    WHERE gallery_id = p_gallery_id;
  ELSE
    UPDATE public.videos
    SET poster_r2_key = p_r2_key
    WHERE id = v_job.target_id
      AND gallery_id = p_gallery_id
      AND deleted_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_target_updated = ROW_COUNT;
  IF v_target_updated <> 1 THEN
    RAISE EXCEPTION 'R2 upload target no longer exists.';
  END IF;

  UPDATE public.upload_jobs
  SET bytes_uploaded = p_verified_bytes,
      completed_at = now(),
      error_code = NULL,
      error_message = NULL,
      status = 'complete',
      upload_phase = 'ready',
      verified_bytes = p_verified_bytes
  WHERE id = v_job.id;

  INSERT INTO public.usage_events (
    account_id,
    bytes,
    gallery_id,
    gb,
    photo_id,
    upload_job_id,
    video_id
  )
  VALUES (
    p_account_id,
    p_verified_bytes,
    p_gallery_id,
    p_verified_bytes::numeric / 1000000000::numeric,
    CASE WHEN v_job.target_type = 'photo' THEN v_job.target_id ELSE NULL END,
    p_upload_job_id,
    CASE WHEN v_job.target_type = 'poster' THEN v_job.target_id ELSE NULL END
  )
  ON CONFLICT (upload_job_id) DO NOTHING;

  GET DIAGNOSTICS v_usage_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'alreadyCompleted', false,
    'r2Key', p_r2_key,
    'targetType', v_job.target_type,
    'usageRecorded', v_usage_inserted > 0,
    'verifiedBytes', p_verified_bytes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_r2_upload(uuid, uuid, uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_r2_upload(uuid, uuid, uuid, text, bigint, text)
  TO service_role;
