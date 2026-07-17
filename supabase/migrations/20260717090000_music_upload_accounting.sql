/*
# Accounted gallery music uploads

Music uses the same provider-verified direct-upload ledger as other R2 media.
The upload counts against the account's period allowance exactly once, and a
replacement queues the previous object for physical cleanup.
*/

ALTER TABLE public.upload_jobs
  DROP CONSTRAINT IF EXISTS upload_jobs_target_type_check;

ALTER TABLE public.upload_jobs
  ADD CONSTRAINT upload_jobs_target_type_check
  CHECK (target_type IN ('video', 'photo', 'background', 'poster', 'music'));

ALTER TABLE public.gallery_design
  ADD COLUMN IF NOT EXISTS music_track_name text;

-- Remove the old UI-only filename that was incorrectly stored as an asset key.
UPDATE public.gallery_design
SET music_track_name = NULL,
    music_track_r2_key = NULL
WHERE music_track_r2_key IS NOT NULL
  AND music_track_r2_key NOT LIKE '%/%';

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
    IF NEW.background_r2_key IS NOT NULL
      OR NEW.music_track_r2_key IS NOT NULL
      OR NEW.music_track_name IS NOT NULL
    THEN
      RAISE EXCEPTION 'Gallery design asset state must be changed through the Lanterna API.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.background_r2_key IS DISTINCT FROM OLD.background_r2_key
    OR NEW.music_track_r2_key IS DISTINCT FROM OLD.music_track_r2_key
    OR NEW.music_track_name IS DISTINCT FROM OLD.music_track_name
  THEN
    RAISE EXCEPTION 'Gallery design asset state must be changed through the Lanterna API.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gallery_design_prevent_client_asset_state_change ON public.gallery_design;
CREATE TRIGGER gallery_design_prevent_client_asset_state_change
  BEFORE INSERT OR UPDATE OF background_r2_key, music_track_r2_key, music_track_name ON public.gallery_design
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_gallery_design_asset_state_change();

CREATE OR REPLACE FUNCTION public.complete_verified_music_upload(
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
  v_previous_r2_key text;
  v_usage_inserted int := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Music upload completion is server-owned.';
  END IF;

  SELECT *
  INTO v_job
  FROM public.upload_jobs
  WHERE id = p_upload_job_id
    AND account_id = p_account_id
    AND gallery_id = p_gallery_id
    AND target_type = 'music'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Music upload job not found.';
  END IF;

  IF v_job.target_id IS DISTINCT FROM p_gallery_id THEN
    RAISE EXCEPTION 'Music upload target does not match its gallery.';
  END IF;

  IF p_verified_bytes <= 0 THEN
    RAISE EXCEPTION 'Verified upload size must be positive.';
  END IF;

  IF v_job.r2_key IS DISTINCT FROM p_r2_key THEN
    RAISE EXCEPTION 'Verified R2 key does not match the music upload job.';
  END IF;

  IF v_job.bytes_total IS DISTINCT FROM p_verified_bytes THEN
    RAISE EXCEPTION 'Verified music size does not match the reserved upload size.';
  END IF;

  IF v_job.content_type IS NOT NULL
    AND lower(v_job.content_type) IS DISTINCT FROM lower(p_content_type)
  THEN
    RAISE EXCEPTION 'Verified music content type does not match the upload slot.';
  END IF;

  IF v_job.completed_at IS NOT NULL OR v_job.status = 'complete' THEN
    IF v_job.verified_bytes IS DISTINCT FROM p_verified_bytes THEN
      RAISE EXCEPTION 'Completed music upload does not match its original verification.';
    END IF;

    RETURN jsonb_build_object(
      'alreadyCompleted', true,
      'r2Key', v_job.r2_key,
      'targetType', v_job.target_type,
      'usageRecorded', false,
      'verifiedBytes', v_job.verified_bytes
    );
  END IF;

  SELECT music_track_r2_key
  INTO v_previous_r2_key
  FROM public.gallery_design
  WHERE gallery_id = p_gallery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gallery design no longer exists.';
  END IF;

  UPDATE public.gallery_design
  SET music_track_name = v_job.file_name,
      music_track_r2_key = p_r2_key
  WHERE gallery_id = p_gallery_id;

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
    NULL,
    p_upload_job_id,
    NULL
  )
  ON CONFLICT (upload_job_id) DO NOTHING;

  GET DIAGNOSTICS v_usage_inserted = ROW_COUNT;

  IF v_previous_r2_key IS NOT NULL AND v_previous_r2_key IS DISTINCT FROM p_r2_key THEN
    INSERT INTO public.media_tasks (
      account_id,
      gallery_id,
      payload,
      status,
      task_type
    ) VALUES (
      p_account_id,
      p_gallery_id,
      jsonb_build_object('r2_key', v_previous_r2_key, 'reason', 'music_replaced'),
      'pending',
      'delete_r2'
    );
  END IF;

  RETURN jsonb_build_object(
    'alreadyCompleted', false,
    'r2Key', p_r2_key,
    'targetType', v_job.target_type,
    'usageRecorded', v_usage_inserted > 0,
    'verifiedBytes', p_verified_bytes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_music_upload(uuid, uuid, uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_music_upload(uuid, uuid, uuid, text, bigint, text)
  TO service_role;
