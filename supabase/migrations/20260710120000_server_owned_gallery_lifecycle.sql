/*
# Server-owned gallery lifecycle

Studio clients may edit gallery presentation metadata, but lifecycle and
retention fields represent server-confirmed state. Gallery deletion is a
recoverable soft-delete paired atomically with a durable purge outbox task.
*/

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
    IF NEW.source_file_window_days IS DISTINCT FROM 730
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

DROP TRIGGER IF EXISTS galleries_prevent_client_lifecycle_change ON public.galleries;
CREATE TRIGGER galleries_prevent_client_lifecycle_change
  BEFORE INSERT OR UPDATE OF
    source_file_window_days,
    source_file_expires_at,
    access_window_days,
    access_expires_at,
    storage_tier,
    is_extended,
    extended_until,
    published_at,
    delivered_at,
    archived_at,
    deleted_at
  OR DELETE ON public.galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_gallery_lifecycle_change();

DROP POLICY IF EXISTS "members can manage galleries" ON public.galleries;
DROP POLICY IF EXISTS "members can read galleries" ON public.galleries;
DROP POLICY IF EXISTS "members can create galleries" ON public.galleries;
DROP POLICY IF EXISTS "members can update galleries" ON public.galleries;
DROP POLICY IF EXISTS "members can delete galleries" ON public.galleries;

CREATE POLICY "members can read galleries" ON public.galleries
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY "members can create galleries" ON public.galleries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_account_member(account_id));

CREATE POLICY "members can update galleries" ON public.galleries
  FOR UPDATE TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));

CREATE OR REPLACE FUNCTION public.request_gallery_soft_delete(
  target_account_id uuid,
  target_gallery_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_deleted_at timestamptz;
  purge_task_id uuid;
  soft_deleted_at timestamptz;
BEGIN
  SELECT galleries.deleted_at
  INTO existing_deleted_at
  FROM public.galleries
  WHERE galleries.id = target_gallery_id
    AND galleries.account_id = target_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gallery not found for this account.';
  END IF;

  IF existing_deleted_at IS NOT NULL THEN
    SELECT media_tasks.id
    INTO purge_task_id
    FROM public.media_tasks
    WHERE media_tasks.account_id = target_account_id
      AND media_tasks.gallery_id = target_gallery_id
      AND media_tasks.task_type = 'purge_gallery'
      AND media_tasks.payload @> jsonb_build_object('deleted_at', existing_deleted_at)
    ORDER BY media_tasks.created_at DESC
    LIMIT 1;

    IF purge_task_id IS NULL THEN
      purge_task_id := gen_random_uuid();
      INSERT INTO public.media_tasks (
        id,
        account_id,
        task_type,
        gallery_id,
        payload,
        status
      ) VALUES (
        purge_task_id,
        target_account_id,
        'purge_gallery',
        target_gallery_id,
        jsonb_build_object('deleted_at', existing_deleted_at),
        'pending'
      );
    END IF;

    RETURN jsonb_build_object(
      'alreadyDeleted', true,
      'deletedAt', existing_deleted_at,
      'galleryId', target_gallery_id,
      'purgeTaskId', purge_task_id
    );
  END IF;

  soft_deleted_at := now();
  UPDATE public.galleries
  SET deleted_at = soft_deleted_at
  WHERE id = target_gallery_id
    AND account_id = target_account_id;

  purge_task_id := gen_random_uuid();
  INSERT INTO public.media_tasks (
    id,
    account_id,
    task_type,
    gallery_id,
    payload,
    status
  ) VALUES (
    purge_task_id,
    target_account_id,
    'purge_gallery',
    target_gallery_id,
    jsonb_build_object('deleted_at', soft_deleted_at),
    'pending'
  );

  RETURN jsonb_build_object(
    'alreadyDeleted', false,
    'deletedAt', soft_deleted_at,
    'galleryId', target_gallery_id,
    'purgeTaskId', purge_task_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_gallery_soft_delete(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_gallery_soft_delete(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.request_gallery_soft_delete(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_gallery_soft_delete(uuid, uuid) TO service_role;
