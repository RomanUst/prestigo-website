-- 063: Google Calendar sync for accepted bookings
--
-- After a booking is inserted/updated (or its driver assignment changes),
-- POST {booking_id} to the site's /api/webhooks/booking-calendar endpoint via
-- pg_net (async, never blocks or fails the write). The endpoint re-reads the
-- booking and upserts or deletes the matching Google Calendar event.
--
-- Booking trigger fires only when the booking is in an accepted status now, or
-- was before (so cancellations / reverts remove the event); unpaid/pending
-- churn is ignored. The endpoint decides the final outcome, so extra calls are
-- harmless.
--
-- Endpoint URL and shared secret live in Supabase Vault:
--   gcal_sync_url    e.g. https://rideprestigo.com/api/webhooks/booking-calendar
--   gcal_sync_secret must equal GCAL_SYNC_SECRET in Vercel
-- If either is missing the triggers are no-ops.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Shared sender ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gcal_sync_post(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sync_url text;
  sync_secret text;
BEGIN
  SELECT decrypted_secret INTO sync_url
    FROM vault.decrypted_secrets WHERE name = 'gcal_sync_url';
  SELECT decrypted_secret INTO sync_secret
    FROM vault.decrypted_secrets WHERE name = 'gcal_sync_secret';

  IF sync_url IS NULL OR sync_secret IS NULL OR p_booking_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := sync_url,
    body := jsonb_build_object('booking_id', p_booking_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || sync_secret
    ),
    timeout_milliseconds := 10000
  );
END;
$$;

-- ── bookings ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_booking_gcal_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  active constant text[] := ARRAY['confirmed','assigned','en_route','on_location','completed'];
BEGIN
  IF NEW.status = ANY (active)
     OR (TG_OP = 'UPDATE' AND OLD.status = ANY (active)) THEN
    PERFORM public.gcal_sync_post(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ── driver_assignments (driver accepted / declined → refresh driver line) ──
CREATE OR REPLACE FUNCTION public.notify_assignment_gcal_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.gcal_sync_post(NEW.booking_id);
  RETURN NEW;
END;
$$;

-- SECURITY DEFINER functions get PUBLIC EXECUTE by default — revoke it.
REVOKE EXECUTE ON FUNCTION public.gcal_sync_post(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_booking_gcal_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_assignment_gcal_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_gcal_sync ON public.bookings;
CREATE TRIGGER bookings_gcal_sync
  AFTER INSERT OR UPDATE OF
    status, pickup_utc, pickup_date, pickup_time, hours, distance_km,
    origin_address, destination_address, vehicle_class, passengers, luggage,
    client_first_name, client_last_name, client_phone, client_email,
    flight_number, terminal, special_requests, operator_notes,
    extra_child_seat, extra_meet_greet, driver_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_gcal_sync();

DROP TRIGGER IF EXISTS driver_assignments_gcal_sync ON public.driver_assignments;
CREATE TRIGGER driver_assignments_gcal_sync
  AFTER INSERT OR UPDATE OF status
  ON public.driver_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_assignment_gcal_sync();
