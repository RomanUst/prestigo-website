-- 067: bookings -> lead outbox (Phase 81, plan 81-09)
--
-- ONE capture point for every booking writer. An AFTER trigger on bookings
-- enqueues an ids-only outbox row whenever a booking is inserted or its status
-- changes into a different Lead status group, so the checkout capture, the
-- Stripe webhook, submit-quote, admin create/PATCH/cancel, GNet and plain SQL
-- all produce Leads WITHOUT any change to those call sites (D-07, LEAD-06).
--
-- Key shape: 'lead.booking:<booking id>:<new|in_process|converted|dead>'.
-- Rows become available 90 s after the change so a burst of writes (payment,
-- confirmation, assignment) settles before the dispatcher reads the booking.
--
-- Exception-safe by design (Pitfall 1 / D-18): the whole trigger body runs in
-- an exception block, and the pg_net kick runs in its own nested block. A
-- lead-capture problem (unreadable config, missing outbox, Vault trouble) is
-- reported as a WARNING and can never abort, delay or change a booking write.
--
-- The kick is optional: it wakes the dispatcher early through the site route
-- /api/integrations/kick. The daily sweep re-arms any row that stays pending,
-- so a lost kick only costs latency. The kick is a no-op until the Vault
-- secrets exist:
--   outbox_kick_url     e.g. https://rideprestigo.com/api/integrations/kick
--   outbox_kick_secret  must equal OUTBOX_KICK_SECRET in Vercel
--
-- Capture is OFF until go-live (plan 81-11) writes integration_config key
-- 'lead_capture_start'. While the key is absent nothing is enqueued, and
-- bookings created before that instant never become Leads, even when their
-- status changes later (D-21: forward-only).
--
-- Return legs never enqueue (D-19): the outbound row owns the round trip and
-- the dispatcher finds the return leg through the shared payment intent.
--
-- DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: the
-- REVOKE lines at the bottom must always be re-run.

-- ── Status mapping (kept identical to BOOKING_LEAD_STATUS in lib/lead-mapping.ts) ──
CREATE OR REPLACE FUNCTION public.booking_lead_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_status
    WHEN 'unpaid'      THEN 'new'
    WHEN 'pending'     THEN 'in_process'
    WHEN 'confirmed'   THEN 'converted'
    WHEN 'assigned'    THEN 'converted'
    WHEN 'en_route'    THEN 'converted'
    WHEN 'on_location' THEN 'converted'
    WHEN 'completed'   THEN 'converted'
    WHEN 'cancelled'   THEN 'dead'
    ELSE NULL
  END;
$$;

-- ── Optional wake-up of the dispatcher (pg_net, async, queued until COMMIT) ──
CREATE OR REPLACE FUNCTION public.outbox_kick(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'outbox_kick_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'outbox_kick_secret';

  IF v_url IS NULL OR v_secret IS NULL OR p_key IS NULL THEN
    RETURN;
  END IF;

  -- The body carries the key only (ids), never any personal data.
  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('key', p_key),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 5000
  );
END;
$$;

-- ── The capture trigger function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_booking_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new   text;
  v_start timestamptz;
  v_key   text;
BEGIN
  BEGIN
    v_new := public.booking_lead_status(NEW.status);
    IF v_new IS NULL THEN
      RETURN NEW;
    END IF;

    -- A status change inside the same Lead group (e.g. confirmed -> assigned) enqueues nothing.
    IF TG_OP = 'UPDATE' THEN
      IF v_new IS NOT DISTINCT FROM public.booking_lead_status(OLD.status) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- D-19: the return leg of a round trip never becomes a Lead of its own.
    IF NEW.leg = 'return' THEN
      RETURN NEW;
    END IF;

    -- D-21: capture is off until go-live writes the start instant.
    v_start := (
      SELECT c.value FROM public.integration_config c WHERE c.key = 'lead_capture_start'
    )::timestamptz;
    IF v_start IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.created_at < v_start THEN
      RETURN NEW;
    END IF;

    v_key := 'lead.booking:' || NEW.id::text || ':' || v_new;

    PERFORM public.outbox_enqueue(
      'lead.booking',
      'booking',
      NEW.id,
      v_key,
      now() + interval '90 seconds'
    );

    -- The kick must never undo the enqueue above.
    BEGIN
      PERFORM public.outbox_kick(v_key);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'enqueue_booking_lead kick failed: %', SQLERRM;
    END;
  EXCEPTION WHEN OTHERS THEN
    -- NEVER let lead-capture trouble abort a booking INSERT/UPDATE.
    RAISE WARNING 'enqueue_booking_lead failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- SECURITY DEFINER functions get PUBLIC EXECUTE by default: revoke it.
REVOKE EXECUTE ON FUNCTION public.booking_lead_status(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_kick(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_booking_lead() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.booking_lead_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_kick(text) TO service_role;

DROP TRIGGER IF EXISTS bookings_lead_outbox ON public.bookings;
CREATE TRIGGER bookings_lead_outbox
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_booking_lead();
