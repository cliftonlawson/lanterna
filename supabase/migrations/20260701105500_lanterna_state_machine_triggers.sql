/*
# Lanterna State Machine Triggers

Adds server-side guards for the behaviors the app should not have to remember:
- first delivery starts both retention clocks
- delivery events reconcile recipient current status
- upload usage is a flow meter and only increments account allowance usage
*/

CREATE OR REPLACE FUNCTION public.start_gallery_delivery_windows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivered_time timestamptz;
BEGIN
  IF NEW.status = 'delivered' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'delivered') THEN
    delivered_time := COALESCE(NEW.delivered_at, now());
    NEW.delivered_at := delivered_time;
    NEW.source_file_expires_at := COALESCE(
      NEW.source_file_expires_at,
      delivered_time + make_interval(days => NEW.source_file_window_days)
    );
    NEW.access_expires_at := COALESCE(
      NEW.access_expires_at,
      delivered_time + make_interval(days => NEW.access_window_days)
    );
    NEW.storage_tier := COALESCE(NEW.storage_tier, 'hot');
  END IF;

  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS galleries_start_delivery_windows ON public.galleries;
CREATE TRIGGER galleries_start_delivery_windows
  BEFORE INSERT OR UPDATE ON public.galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.start_gallery_delivery_windows();

CREATE OR REPLACE FUNCTION public.mark_gallery_delivered_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.galleries
  SET status = 'delivered'
  WHERE id = NEW.gallery_id
    AND status <> 'delivered';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliveries_mark_gallery_delivered ON public.deliveries;
CREATE TRIGGER deliveries_mark_gallery_delivered
  AFTER INSERT ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_gallery_delivered_from_delivery();

CREATE OR REPLACE FUNCTION public.sync_delivery_recipient_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'opened' THEN
    UPDATE public.delivery_recipients
    SET
      status = 'opened',
      first_opened_at = COALESCE(first_opened_at, NEW.occurred_at)
    WHERE id = NEW.recipient_id;
  ELSIF NEW.event_type = 'sent' THEN
    UPDATE public.delivery_recipients
    SET
      last_sent_at = NEW.occurred_at
    WHERE id = NEW.recipient_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_events_sync_recipient ON public.delivery_events;
CREATE TRIGGER delivery_events_sync_recipient
  AFTER INSERT ON public.delivery_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_delivery_recipient_from_event();

CREATE OR REPLACE FUNCTION public.increment_account_usage_from_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.account_usage (
    account_id,
    allowance_used_gb,
    allowance_total_gb,
    hot_bytes_stored,
    cold_bytes_stored,
    stream_minutes_stored,
    synced_at
  )
  VALUES (
    NEW.account_id,
    NEW.gb,
    0,
    0,
    0,
    0,
    now()
  )
  ON CONFLICT (account_id) DO UPDATE
  SET
    allowance_used_gb = public.account_usage.allowance_used_gb + EXCLUDED.allowance_used_gb,
    synced_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usage_events_increment_account_usage ON public.usage_events;
CREATE TRIGGER usage_events_increment_account_usage
  AFTER INSERT ON public.usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_account_usage_from_upload();
