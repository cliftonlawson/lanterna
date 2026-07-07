/*
# Delivery email failure state

Delivery rows are send attempts; a gallery becomes delivered only after a sent
event is written. Provider failures are recorded on the recipient/event trail.
*/

ALTER TYPE public.recipient_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.delivery_event_type ADD VALUE IF NOT EXISTS 'failed';

DROP TRIGGER IF EXISTS deliveries_mark_gallery_delivered ON public.deliveries;

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

  IF NEW.event_type::text = 'opened' THEN
    UPDATE public.delivery_recipients
    SET
      status = NEW.event_type::text::public.recipient_status,
      first_opened_at = COALESCE(first_opened_at, NEW.occurred_at)
    WHERE id = NEW.recipient_id;
  ELSIF NEW.event_type::text = 'sent' THEN
    UPDATE public.delivery_recipients
    SET
      status = NEW.event_type::text::public.recipient_status,
      last_sent_at = NEW.occurred_at
    WHERE id = NEW.recipient_id;
  ELSIF NEW.event_type::text = 'failed' THEN
    UPDATE public.delivery_recipients
    SET status = NEW.event_type::text::public.recipient_status
    WHERE id = NEW.recipient_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_gallery_delivered_from_sent_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type::text = 'sent' THEN
    UPDATE public.galleries
    SET status = 'delivered'
    WHERE id = NEW.gallery_id
      AND status <> 'delivered';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_events_mark_gallery_delivered ON public.delivery_events;
CREATE TRIGGER delivery_events_mark_gallery_delivered
  AFTER INSERT ON public.delivery_events
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_gallery_delivered_from_sent_event();
