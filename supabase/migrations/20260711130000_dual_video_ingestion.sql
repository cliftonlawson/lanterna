/*
# Dual R2 master + Stream playback ingestion

Video upload jobs retain the multipart/master state needed for resumability and
no-reupload Stream retries. Service-only RPCs make master attachment, allowance
accounting, and replacement swaps transactional and idempotent.
*/

ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS r2_key text,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS multipart_part_size bigint,
  ADD COLUMN IF NOT EXISTS upload_phase text,
  ADD COLUMN IF NOT EXISTS is_replacement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_bytes bigint,
  ADD COLUMN IF NOT EXISTS master_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_source_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_copy_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS copy_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'upload_jobs_upload_phase_check'
      AND conrelid = 'public.upload_jobs'::regclass
  ) THEN
    ALTER TABLE public.upload_jobs
      ADD CONSTRAINT upload_jobs_upload_phase_check
      CHECK (
        upload_phase IS NULL OR upload_phase IN (
          'uploading_master',
          'master_secured',
          'starting_playback',
          'preparing_playback',
          'copy_failed',
          'ready'
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS upload_jobs_video_phase_idx
  ON public.upload_jobs(account_id, gallery_id, upload_phase)
  WHERE target_type = 'video';

ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS upload_job_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS usage_events_upload_job_unique_idx
  ON public.usage_events(upload_job_id);

CREATE OR REPLACE FUNCTION public.secure_video_master_upload(
  p_account_id uuid,
  p_gallery_id uuid,
  p_video_id uuid,
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
  v_video public.videos%ROWTYPE;
  v_usage_inserted_count int := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Video master completion is server-owned.';
  END IF;

  SELECT *
  INTO v_job
  FROM public.upload_jobs
  WHERE id = p_upload_job_id
    AND account_id = p_account_id
    AND gallery_id = p_gallery_id
    AND target_type = 'video'
    AND target_id = p_video_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video upload job not found.';
  END IF;

  SELECT *
  INTO v_video
  FROM public.videos
  WHERE id = p_video_id
    AND gallery_id = p_gallery_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video upload target not found.';
  END IF;

  IF p_verified_bytes <= 0 THEN
    RAISE EXCEPTION 'Verified video size must be positive.';
  END IF;

  IF v_job.bytes_total IS DISTINCT FROM p_verified_bytes THEN
    RAISE EXCEPTION 'Verified video size does not match the reserved upload size.';
  END IF;

  IF v_job.master_verified_at IS NOT NULL THEN
    IF v_job.r2_key IS DISTINCT FROM p_r2_key
      OR v_job.verified_bytes IS DISTINCT FROM p_verified_bytes
    THEN
      RAISE EXCEPTION 'Completed video master does not match the existing upload result.';
    END IF;

    RETURN jsonb_build_object(
      'alreadyCompleted', true,
      'isReplacement', v_job.is_replacement,
      'r2Key', v_job.r2_key,
      'verifiedBytes', v_job.verified_bytes
    );
  END IF;

  IF v_job.r2_key IS DISTINCT FROM p_r2_key THEN
    RAISE EXCEPTION 'Verified video master key does not match the upload job.';
  END IF;

  IF v_job.content_type IS NOT NULL
    AND lower(v_job.content_type) IS DISTINCT FROM lower(p_content_type)
  THEN
    RAISE EXCEPTION 'Verified video content type does not match the upload slot.';
  END IF;

  UPDATE public.upload_jobs
  SET r2_key = p_r2_key,
      verified_bytes = p_verified_bytes,
      bytes_uploaded = p_verified_bytes,
      master_verified_at = now(),
      upload_phase = 'master_secured',
      status = 'processing',
      error_code = NULL,
      error_message = NULL
  WHERE id = v_job.id;

  IF NOT v_job.is_replacement THEN
    UPDATE public.videos
    SET r2_key = p_r2_key,
        r2_bytes = p_verified_bytes,
        stream_uid = NULL,
        stream_ready = false,
        processing_status = 'processing'
    WHERE id = p_video_id
      AND gallery_id = p_gallery_id;
  END IF;

  INSERT INTO public.usage_events (
    account_id,
    gallery_id,
    gb,
    upload_job_id,
    video_id
  )
  VALUES (
    p_account_id,
    p_gallery_id,
    p_verified_bytes::numeric / 1073741824::numeric,
    p_upload_job_id,
    p_video_id
  )
  ON CONFLICT (upload_job_id) DO NOTHING;

  GET DIAGNOSTICS v_usage_inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'alreadyCompleted', false,
    'isReplacement', v_job.is_replacement,
    'r2Key', p_r2_key,
    'usageRecorded', v_usage_inserted_count > 0,
    'verifiedBytes', p_verified_bytes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_video_stream_copy(
  p_account_id uuid,
  p_gallery_id uuid,
  p_upload_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.upload_jobs%ROWTYPE;
  v_previous_stream_uid text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Stream copy state is server-owned.';
  END IF;

  SELECT *
  INTO v_job
  FROM public.upload_jobs
  WHERE id = p_upload_job_id
    AND account_id = p_account_id
    AND gallery_id = p_gallery_id
    AND target_type = 'video'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video upload job not found.';
  END IF;

  IF v_job.master_verified_at IS NULL OR v_job.r2_key IS NULL THEN
    RAISE EXCEPTION 'Video master is not secured yet.';
  END IF;

  IF v_job.upload_phase = 'ready' AND v_job.stream_upload_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'alreadyReady', true,
      'streamUid', v_job.stream_upload_id
    );
  END IF;

  IF v_job.upload_phase = 'preparing_playback' AND v_job.stream_upload_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'alreadyStarted', true,
      'streamUid', v_job.stream_upload_id
    );
  END IF;

  IF v_job.upload_phase = 'starting_playback'
    AND v_job.stream_copy_started_at > now() - interval '5 minutes'
  THEN
    RETURN jsonb_build_object('inProgress', true);
  END IF;

  v_previous_stream_uid := v_job.stream_upload_id;

  UPDATE public.upload_jobs
  SET upload_phase = 'starting_playback',
      status = 'processing',
      stream_copy_started_at = now(),
      stream_upload_id = NULL,
      stream_source_expires_at = NULL,
      copy_attempts = copy_attempts + 1,
      error_code = NULL,
      error_message = NULL
  WHERE id = v_job.id;

  IF v_previous_stream_uid IS NOT NULL THEN
    INSERT INTO public.media_tasks (account_id, gallery_id, video_id, task_type, payload)
    VALUES (p_account_id, p_gallery_id, v_job.target_id, 'delete_stream', jsonb_build_object(
      'stream_uid', v_previous_stream_uid,
      'reason', 'stream_copy_retry'
    ));
  END IF;

  IF NOT v_job.is_replacement THEN
    UPDATE public.videos
    SET processing_status = 'processing',
        stream_ready = false,
        stream_uid = NULL
    WHERE id = v_job.target_id
      AND gallery_id = v_job.gallery_id
      AND deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'claimed', true,
    'contentType', v_job.content_type,
    'fileName', v_job.file_name,
    'isReplacement', v_job.is_replacement,
    'previousStreamUid', v_previous_stream_uid,
    'r2Key', v_job.r2_key,
    'targetId', v_job.target_id,
    'verifiedBytes', v_job.verified_bytes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_video_stream_copy(
  p_account_id uuid,
  p_gallery_id uuid,
  p_upload_job_id uuid,
  p_stream_uid text,
  p_source_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.upload_jobs%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Stream copy state is server-owned.';
  END IF;

  SELECT *
  INTO v_job
  FROM public.upload_jobs
  WHERE id = p_upload_job_id
    AND account_id = p_account_id
    AND gallery_id = p_gallery_id
    AND target_type = 'video'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video upload job not found.';
  END IF;

  IF v_job.stream_upload_id IS NOT NULL THEN
    IF v_job.stream_upload_id IS DISTINCT FROM p_stream_uid THEN
      RAISE EXCEPTION 'A different Stream copy is already attached to this upload job.';
    END IF;

    RETURN jsonb_build_object(
      'alreadyRecorded', true,
      'streamUid', v_job.stream_upload_id
    );
  END IF;

  IF v_job.upload_phase <> 'starting_playback' THEN
    RAISE EXCEPTION 'Video upload job is not waiting for a Stream copy.';
  END IF;

  UPDATE public.upload_jobs
  SET stream_upload_id = p_stream_uid,
      stream_source_expires_at = p_source_expires_at,
      upload_phase = 'preparing_playback',
      status = 'processing',
      error_code = NULL,
      error_message = NULL
  WHERE id = v_job.id;

  IF NOT v_job.is_replacement THEN
    UPDATE public.videos
    SET stream_uid = p_stream_uid,
        stream_ready = false,
        processing_status = 'processing'
    WHERE id = v_job.target_id
      AND gallery_id = v_job.gallery_id
      AND deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'alreadyRecorded', false,
    'streamUid', p_stream_uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_video_stream_copy(
  p_account_id uuid,
  p_gallery_id uuid,
  p_upload_job_id uuid,
  p_stream_uid text,
  p_duration_seconds int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.upload_jobs%ROWTYPE;
  v_video public.videos%ROWTYPE;
  v_cleanup_count int := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RAISE EXCEPTION 'Stream readiness is server-owned.';
  END IF;

  SELECT *
  INTO v_job
  FROM public.upload_jobs
  WHERE id = p_upload_job_id
    AND account_id = p_account_id
    AND gallery_id = p_gallery_id
    AND target_type = 'video'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video upload job not found.';
  END IF;

  IF v_job.upload_phase = 'ready' AND v_job.status = 'complete' THEN
    RETURN jsonb_build_object(
      'alreadyReady', true,
      'cleanupTasks', 0,
      'isReplacement', v_job.is_replacement,
      'streamUid', v_job.stream_upload_id
    );
  END IF;

  IF v_job.stream_upload_id IS DISTINCT FROM p_stream_uid
    OR v_job.upload_phase <> 'preparing_playback'
  THEN
    RAISE EXCEPTION 'Ready Stream video does not match this upload job.';
  END IF;

  SELECT *
  INTO v_video
  FROM public.videos
  WHERE id = v_job.target_id
    AND gallery_id = v_job.gallery_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video upload target not found.';
  END IF;

  IF v_job.is_replacement THEN
    IF v_video.r2_key IS NOT NULL AND v_video.r2_key IS DISTINCT FROM v_job.r2_key THEN
      INSERT INTO public.media_tasks (account_id, gallery_id, video_id, task_type, payload)
      VALUES (p_account_id, p_gallery_id, v_video.id, 'delete_r2', jsonb_build_object(
        'r2_key', v_video.r2_key,
        'reason', 'video_replacement'
      ));
      v_cleanup_count := v_cleanup_count + 1;
    END IF;

    IF v_video.web_copy_r2_key IS NOT NULL THEN
      INSERT INTO public.media_tasks (account_id, gallery_id, video_id, task_type, payload)
      VALUES (p_account_id, p_gallery_id, v_video.id, 'delete_r2', jsonb_build_object(
        'r2_key', v_video.web_copy_r2_key,
        'reason', 'video_replacement'
      ));
      v_cleanup_count := v_cleanup_count + 1;
    END IF;

    IF v_video.poster_r2_key IS NOT NULL THEN
      INSERT INTO public.media_tasks (account_id, gallery_id, video_id, task_type, payload)
      VALUES (p_account_id, p_gallery_id, v_video.id, 'delete_r2', jsonb_build_object(
        'r2_key', v_video.poster_r2_key,
        'reason', 'video_replacement'
      ));
      v_cleanup_count := v_cleanup_count + 1;
    END IF;

    IF v_video.stream_uid IS NOT NULL AND v_video.stream_uid IS DISTINCT FROM p_stream_uid THEN
      INSERT INTO public.media_tasks (account_id, gallery_id, video_id, task_type, payload)
      VALUES (p_account_id, p_gallery_id, v_video.id, 'delete_stream', jsonb_build_object(
        'stream_uid', v_video.stream_uid,
        'reason', 'video_replacement'
      ));
      v_cleanup_count := v_cleanup_count + 1;
    END IF;
  END IF;

  UPDATE public.videos
  SET r2_key = v_job.r2_key,
      r2_bytes = v_job.verified_bytes,
      stream_uid = p_stream_uid,
      stream_ready = true,
      processing_status = 'ready',
      duration_seconds = CASE
        WHEN p_duration_seconds > 0 THEN p_duration_seconds
        ELSE duration_seconds
      END,
      web_copy_r2_key = CASE WHEN v_job.is_replacement THEN NULL ELSE web_copy_r2_key END,
      poster_r2_key = CASE WHEN v_job.is_replacement THEN NULL ELSE poster_r2_key END
  WHERE id = v_video.id
    AND gallery_id = p_gallery_id;

  UPDATE public.upload_jobs
  SET upload_phase = 'ready',
      status = 'complete',
      bytes_uploaded = verified_bytes,
      completed_at = now(),
      error_code = NULL,
      error_message = NULL
  WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'alreadyReady', false,
    'cleanupTasks', v_cleanup_count,
    'isReplacement', v_job.is_replacement,
    'streamUid', p_stream_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.secure_video_master_upload(uuid, uuid, uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_video_stream_copy(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_video_stream_copy(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_video_stream_copy(uuid, uuid, uuid, text, int) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.secure_video_master_upload(uuid, uuid, uuid, uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_video_stream_copy(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_video_stream_copy(uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_video_stream_copy(uuid, uuid, uuid, text, int) TO service_role;
