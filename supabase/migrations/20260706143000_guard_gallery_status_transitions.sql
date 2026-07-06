/*
# Guard gallery status transitions

Studio clients can edit gallery metadata directly through Supabase, but publish
and delivery status changes must go through the service-role API preflight.
*/

CREATE OR REPLACE FUNCTION public.prevent_client_gallery_status_change()
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
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Gallery status must be changed through the Lanterna API preflight.';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Gallery status must be changed through the Lanterna API preflight.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS galleries_prevent_client_status_change ON public.galleries;
CREATE TRIGGER galleries_prevent_client_status_change
  BEFORE INSERT OR UPDATE OF status ON public.galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_gallery_status_change();

DROP POLICY IF EXISTS "members can manage deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "members can manage delivery recipients" ON public.delivery_recipients;
DROP POLICY IF EXISTS "members can manage delivery events" ON public.delivery_events;

CREATE POLICY "members can read deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can read delivery recipients" ON public.delivery_recipients
  FOR SELECT TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can read delivery events" ON public.delivery_events
  FOR SELECT TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)));
