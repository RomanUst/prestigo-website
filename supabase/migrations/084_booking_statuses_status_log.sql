-- Migration 084: booking_statuses_status_log
-- Phase 87 — Status Service & Driver Step Flow (D-02, D-03, D-06, D-08, D-09, D-10, D-11, D-15)
--
-- Adds the two driver-flow statuses to bookings.status, the completion fact, the status log every
-- writer feeds, a compare-and-set RPC, the no-show request RPC and the no-show wait settings.
--
--   * on_board  — passenger is in the car (D-08). The driver's "I have arrived" step maps to the
--                 existing on_location status: there is no 'arrived' booking status.
--   * no_show   — terminal (D-09). VALID_TRANSITIONS.no_show is empty in lib/booking-transitions.ts.
--
-- The status list below must stay equal to BOOKING_STATUSES in lib/booking-status.ts
-- (tests/booking-status.test.ts reads the latest bookings_status_check and fails on drift).
--
-- 084 is purely additive for old code (wider CHECK, new table/columns/functions), so applying it
-- before the code merges is safe; the reverse order makes every on_board/RPC write fail.
--
-- Schema FILE only — live application is the [BLOCKING] Task 3 of plan 87-02, run by the
-- orchestrator via Supabase MCP.

-- ── 1. bookings_status_check: 10 values (DROP + RECREATE, pattern of 040/053) ──
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'unpaid',
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'assigned',
    'en_route',
    'on_location',
    'on_board',
    'no_show'
  ));

-- ── 2. Completion fact and no-show request flag (D-06, D-15) ───────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_requested_at timestamptz;

COMMENT ON COLUMN public.bookings.completed_at IS
  'Set by advance_booking_status on the compare-and-set that moves a booking to completed. NULL on a historic completed row means unknown, not not-completed.';
COMMENT ON COLUMN public.bookings.no_show_requested_at IS
  'The driver asked for a no-show once the wait threshold passed (D-15). No status change and no money; the office confirms or dismisses.';

-- ── 3. booking_status_log: who moved which booking from/to which status ─────────
-- Rows hold ids and actor ids only, no PII. Written by the trigger below (every writer) and by
-- set_no_show_request. Service role only: RLS deny-all, no table privileges for public keys.
CREATE TABLE IF NOT EXISTS public.booking_status_log (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id   uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event        text        NOT NULL DEFAULT 'status_change'
                           CHECK (event IN ('status_change', 'no_show_requested', 'no_show_cleared')),
  from_status  text,
  to_status    text,
  actor_type   text        NOT NULL CHECK (actor_type IN ('admin', 'driver', 'system')),
  actor_id     text        CHECK (actor_id IS NULL OR length(actor_id) <= 64),
  source       text        CHECK (source IS NULL OR source ~ '^[a-z_]{1,40}$'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_status_log_booking_idx
  ON public.booking_status_log (booking_id, created_at);

-- D-06: at most one completion fact per booking.
CREATE UNIQUE INDEX IF NOT EXISTS booking_status_log_one_completed
  ON public.booking_status_log (booking_id)
  WHERE event = 'status_change' AND to_status = 'completed';

REVOKE ALL ON public.booking_status_log FROM anon, authenticated;

ALTER TABLE public.booking_status_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_status_log_no_public_read ON public.booking_status_log;
CREATE POLICY booking_status_log_no_public_read
  ON public.booking_status_log FOR SELECT
  USING (false);

DROP POLICY IF EXISTS booking_status_log_no_public_insert ON public.booking_status_log;
CREATE POLICY booking_status_log_no_public_insert
  ON public.booking_status_log FOR INSERT
  WITH CHECK (false);

-- ── 4. Trigger: every bookings.status change is logged, whoever wrote it (PAYF-02) ──
-- advance_booking_status sets prestigo.actor_type / actor_id / source transaction-locally. Legacy
-- writers (Stripe webhook, GNet farm-in, payment-link, raw SQL) set nothing and are logged as
-- 'system'. An unknown actor type degrades to 'system' instead of failing the update.
CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_type text := current_setting('prestigo.actor_type', true);
  v_actor_id   text := current_setting('prestigo.actor_id', true);
  v_source     text := current_setting('prestigo.source', true);
BEGIN
  IF v_actor_type IS NULL OR v_actor_type NOT IN ('admin', 'driver', 'system') THEN
    v_actor_type := 'system';
  END IF;
  v_actor_id := NULLIF(left(COALESCE(v_actor_id, ''), 64), '');
  IF v_source IS NULL OR v_source !~ '^[a-z_]{1,40}$' THEN
    v_source := NULL;
  END IF;

  INSERT INTO public.booking_status_log
    (booking_id, event, from_status, to_status, actor_type, actor_id, source)
  VALUES
    (NEW.id, 'status_change', OLD.status, NEW.status, v_actor_type, v_actor_id, v_source)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_status_log ON public.bookings;
CREATE TRIGGER bookings_status_log
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_booking_status_change();

-- ── 5. advance_booking_status: atomic compare-and-set (PAYF-02, D-06) ──────────
-- UPDATE ... WHERE id = p_booking_id AND status = p_from: under READ COMMITTED a concurrent writer
-- waits, re-evaluates the WHERE and matches 0 rows, so exactly one of two racing callers wins.
-- Patch keys are an allowlist read with the ? operator (never jsonb_populate_record), so a caller
-- cannot mass-assign money columns. Applied: { applied: true, previous_status, booking }.
-- Not applied: { applied: false, current_status } (current_status is null when the booking is gone).
CREATE OR REPLACE FUNCTION public.advance_booking_status(
  p_booking_id  uuid,
  p_from        text,
  p_to          text,
  p_actor_type  text,
  p_actor_id    text,
  p_source      text,
  p_patch       jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row     public.bookings;
  v_applied boolean;
BEGIN
  IF p_actor_type IS NULL OR p_actor_type NOT IN ('admin', 'driver', 'system') THEN
    RAISE EXCEPTION 'invalid actor type';
  END IF;

  PERFORM set_config('prestigo.actor_type', p_actor_type, true);
  PERFORM set_config('prestigo.actor_id', COALESCE(p_actor_id, ''), true);
  PERFORM set_config('prestigo.source', COALESCE(p_source, ''), true);

  UPDATE public.bookings b SET
      status           = p_to,
      completed_at     = CASE WHEN p_to = 'completed' AND b.status IS DISTINCT FROM 'completed'
                              THEN now() ELSE b.completed_at END,
      operator_notes   = CASE WHEN p_patch ? 'operator_notes'
                              THEN p_patch->>'operator_notes' ELSE b.operator_notes END,
      driver_price_czk = CASE WHEN p_patch ? 'driver_price_czk'
                              THEN (p_patch->>'driver_price_czk')::integer ELSE b.driver_price_czk END,
      driver_id        = CASE WHEN p_patch ? 'driver_id'
                              THEN (p_patch->>'driver_id')::uuid ELSE b.driver_id END,
      payment_link_url = CASE WHEN p_patch ? 'clear_payment_link'
                               AND COALESCE((p_patch->>'clear_payment_link')::boolean, false)
                              THEN NULL ELSE b.payment_link_url END,
      payment_link_id  = CASE WHEN p_patch ? 'clear_payment_link'
                               AND COALESCE((p_patch->>'clear_payment_link')::boolean, false)
                              THEN NULL ELSE b.payment_link_id END
    WHERE b.id = p_booking_id
      AND b.status = p_from
    RETURNING b.* INTO v_row;
  v_applied := FOUND;

  -- The AFTER UPDATE trigger has run: do not leak the actor into later statements of this transaction.
  PERFORM set_config('prestigo.actor_type', '', true);
  PERFORM set_config('prestigo.actor_id', '', true);
  PERFORM set_config('prestigo.source', '', true);

  IF NOT v_applied THEN
    RETURN jsonb_build_object(
      'applied', false,
      'current_status', (SELECT x.status FROM public.bookings x WHERE x.id = p_booking_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'applied', true,
    'previous_status', p_from,
    'booking', to_jsonb(v_row)
  );
END;
$$;

-- ── 6. set_no_show_request: the driver's no-show request, no status change, no money (D-15) ──
-- 'request' sets no_show_requested_at only while the booking is on_location and nothing is pending;
-- 'clear' removes a pending request. Both log their own row (event no_show_requested/no_show_cleared).
CREATE OR REPLACE FUNCTION public.set_no_show_request(
  p_booking_id  uuid,
  p_action      text,
  p_actor_type  text,
  p_actor_id    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status   text;
  v_requested timestamptz;
  v_event    text;
  v_source   text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('request', 'clear') THEN
    RAISE EXCEPTION 'invalid no-show action';
  END IF;
  IF p_actor_type IS NULL OR p_actor_type NOT IN ('admin', 'driver', 'system') THEN
    RAISE EXCEPTION 'invalid actor type';
  END IF;

  v_source := CASE WHEN p_actor_type = 'driver' THEN 'driver_trip' ELSE 'admin_no_show' END;

  IF p_action = 'request' THEN
    v_event := 'no_show_requested';
    UPDATE public.bookings b
       SET no_show_requested_at = now()
     WHERE b.id = p_booking_id
       AND b.status = 'on_location'
       AND b.no_show_requested_at IS NULL
    RETURNING b.status, b.no_show_requested_at INTO v_status, v_requested;
  ELSE
    v_event := 'no_show_cleared';
    UPDATE public.bookings b
       SET no_show_requested_at = NULL
     WHERE b.id = p_booking_id
       AND b.no_show_requested_at IS NOT NULL
    RETURNING b.status, b.no_show_requested_at INTO v_status, v_requested;
  END IF;

  IF NOT FOUND THEN
    SELECT x.status, x.no_show_requested_at INTO v_status, v_requested
      FROM public.bookings x WHERE x.id = p_booking_id;
    RETURN jsonb_build_object(
      'applied', false,
      'no_show_requested_at', v_requested,
      'status', v_status
    );
  END IF;

  INSERT INTO public.booking_status_log
    (booking_id, event, from_status, to_status, actor_type, actor_id, source)
  VALUES
    (p_booking_id, v_event, v_status, v_status, p_actor_type,
     NULLIF(left(COALESCE(p_actor_id, ''), 64), ''), v_source);

  RETURN jsonb_build_object(
    'applied', true,
    'no_show_requested_at', v_requested,
    'status', v_status
  );
END;
$$;

-- ── 7. No-show wait settings, minutes (D-15; UI-SPEC bounds 1..240) ─────────────
ALTER TABLE public.pricing_globals
  ADD COLUMN IF NOT EXISTS noshow_wait_city_min integer NOT NULL DEFAULT 30
    CONSTRAINT pricing_globals_noshow_wait_city_min_range
    CHECK (noshow_wait_city_min > 0 AND noshow_wait_city_min <= 240),
  ADD COLUMN IF NOT EXISTS noshow_wait_airport_min integer NOT NULL DEFAULT 60
    CONSTRAINT pricing_globals_noshow_wait_airport_min_range
    CHECK (noshow_wait_airport_min > 0 AND noshow_wait_airport_min <= 240);

-- ── 8. booking_lead_status: on_board and no_show are converted (D-10) ───────────
-- Kept identical to BOOKING_LEAD_STATUS in lib/lead-mapping.ts.
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
    WHEN 'on_board'    THEN 'converted'
    WHEN 'completed'   THEN 'converted'
    WHEN 'no_show'     THEN 'converted'
    WHEN 'cancelled'   THEN 'dead'
    ELSE NULL
  END;
$$;

-- ── 9. notify_booking_gcal_sync: on_board and no_show keep their calendar event ─
CREATE OR REPLACE FUNCTION public.notify_booking_gcal_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  active constant text[] := ARRAY['confirmed','assigned','en_route','on_location','on_board','completed','no_show'];
BEGIN
  IF NEW.status = ANY (active)
     OR (TG_OP = 'UPDATE' AND OLD.status = ANY (active)) THEN
    PERFORM public.gcal_sync_post(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ── 10. panel_bookings: 080 verbatim, only the value list gains on_board (D-11) ─
-- no_show stays out of the value list; b.status <> 'cancelled' is kept so a no-show still counts as a trip.

CREATE OR REPLACE FUNCTION public.panel_bookings(
  p_email           text,
  p_phone           text,
  p_conversation_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email          text;
  v_phone          text;
  v_email_identity uuid;
  v_phone_identity uuid;
  v_phone_owners   integer;
  v_identity       uuid;
  v_erasing        timestamptz;
  v_mismatch       boolean := false;
  v_lead           text;
  v_total          integer := 0;
  v_trips          integer := 0;
  v_spent          integer := 0;
  v_rows           jsonb   := '[]'::jsonb;
BEGIN
  v_email := public.identity_normalize_email(p_email);
  v_phone := public.identity_normalize_phone(p_phone);

  -- A number flagged shared is never used (072).
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.phone_flags f WHERE f.phone = v_phone AND f.shared
  ) THEN
    v_phone := NULL;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT e.identity_id INTO v_email_identity
      FROM public.identity_emails e
     WHERE e.email = v_email;
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT count(DISTINCT p.identity_id) INTO v_phone_owners
      FROM public.identity_phones p
     WHERE p.phone = v_phone;
    IF v_phone_owners = 1 THEN
      SELECT p.identity_id INTO v_phone_identity
        FROM public.identity_phones p
       WHERE p.phone = v_phone
       LIMIT 1;
    END IF;
  END IF;

  v_identity := COALESCE(v_email_identity, v_phone_identity);

  IF v_email_identity IS NOT NULL
     AND v_phone_identity IS NOT NULL
     AND v_email_identity <> v_phone_identity THEN
    v_mismatch := true;
  END IF;

  IF v_identity IS NOT NULL THEN
    SELECT c.erasing_at INTO v_erasing
      FROM public.contact_identities c
     WHERE c.id = v_identity;
  END IF;

  -- A person under erasure: nothing leaves the function, not even a Lead id.
  IF v_identity IS NOT NULL AND v_erasing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'identity_found', false,
      'phone_mismatch', false,
      'espo_lead_id',   NULL,
      'total',          0,
      'trip_count',     0,
      'spent_eur',      0,
      'rows',           '[]'::jsonb
    );
  END IF;

  -- Lead pointer (D-08): the conversation's chat_lead when open, else the identity's newest open
  -- chat_lead. A Lead owned by an identity under erasure is never exposed.
  SELECT l.espo_lead_id INTO v_lead
    FROM public.chat_conversations cc
    JOIN public.chat_leads l ON l.id = cc.chat_lead_id
   WHERE cc.conversation_id = p_conversation_id
     AND l.open
     AND l.espo_lead_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.contact_identities x
        WHERE x.id = l.identity_id AND x.erasing_at IS NOT NULL
     );

  IF v_lead IS NULL AND v_identity IS NOT NULL THEN
    SELECT l.espo_lead_id INTO v_lead
      FROM public.chat_leads l
     WHERE l.identity_id = v_identity
       AND l.open
       AND l.espo_lead_id IS NOT NULL
     ORDER BY l.created_at DESC
     LIMIT 1;
  END IF;

  -- Unknown person: no bookings, but the conversation may still carry a Lead.
  IF v_identity IS NULL THEN
    RETURN jsonb_build_object(
      'identity_found', false,
      'phone_mismatch', false,
      'espo_lead_id',   v_lead,
      'total',          0,
      'trip_count',     0,
      'spent_eur',      0,
      'rows',           '[]'::jsonb
    );
  END IF;

  -- Totals over ALL eligible rows.
  SELECT
    count(*)::integer,
    (count(*) FILTER (
       WHERE b.leg IS DISTINCT FROM 'return' AND b.status <> 'cancelled'
     ))::integer,
    COALESCE(sum(
      COALESCE(
        b.amount_eur,
        CASE
          WHEN b.trip_type = 'round_trip'
           AND (b.outbound_amount_czk IS NOT NULL OR b.return_amount_czk IS NOT NULL)
          THEN round((COALESCE(b.outbound_amount_czk, 0) + COALESCE(b.return_amount_czk, 0)) * 0.04)::integer
        END
      )
    ) FILTER (
       WHERE b.leg IS DISTINCT FROM 'return'
         AND b.status <> 'cancelled'
         AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'on_board', 'completed')
     ), 0)::integer
    INTO v_total, v_trips, v_spent
    FROM public.booking_identity bi
    JOIN public.bookings b ON b.id = bi.booking_id
   WHERE bi.identity_id = v_identity
     AND b.anonymised_at IS NULL
     AND NOT public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id);

  -- Capped, allowlisted rows.
  SELECT COALESCE(jsonb_agg(s.j ORDER BY s.rn), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT
        jsonb_build_object(
          'id',                       b.id,
          'booking_reference',        b.booking_reference,
          'status',                   b.status,
          'leg',                      b.leg,
          'trip_type',                b.trip_type,
          'pickup_utc',               b.pickup_utc,
          'pickup_date',              b.pickup_date,
          'pickup_time',              b.pickup_time,
          'origin_address',           b.origin_address,
          'destination_address',      b.destination_address,
          'hours',                    b.hours,
          'vehicle_class',            b.vehicle_class,
          'passengers',               b.passengers,
          'luggage',                  b.luggage,
          'amount_eur',               b.amount_eur,
          'outbound_amount_czk',      b.outbound_amount_czk,
          'return_amount_czk',        b.return_amount_czk,
          'paid_at',                  b.paid_at,
          'payment_link_url',         b.payment_link_url,
          'flight_number',            b.flight_number,
          'special_requests',         b.special_requests,
          'driver_name',              acc.driver_name,
          'trip_progress',            acc.trip_progress,
          'trip_progress_updated_at', acc.trip_progress_updated_at
        ) AS j,
        row_number() OVER (
          ORDER BY b.pickup_utc DESC NULLS LAST, b.pickup_date DESC, b.pickup_time DESC, b.created_at DESC
        ) AS rn
        FROM public.booking_identity bi
        JOIN public.bookings b ON b.id = bi.booking_id
        LEFT JOIN LATERAL (
          SELECT dr.name AS driver_name, da.trip_progress, da.trip_progress_updated_at
            FROM public.driver_assignments da
            JOIN public.drivers dr ON dr.id = da.driver_id
           WHERE da.booking_id = b.id
             AND da.status = 'accepted'
           ORDER BY da.created_at DESC
           LIMIT 1
        ) acc ON true
       WHERE bi.identity_id = v_identity
         AND b.anonymised_at IS NULL
         AND NOT public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)
       ORDER BY b.pickup_utc DESC NULLS LAST, b.pickup_date DESC, b.pickup_time DESC, b.created_at DESC
       LIMIT 200
    ) s;

  RETURN jsonb_build_object(
    'identity_found', true,
    'phone_mismatch', v_mismatch,
    'espo_lead_id',   v_lead,
    'total',          v_total,
    'trip_count',     v_trips,
    'spent_eur',      v_spent,
    'rows',           v_rows
  );
END;
$$;

-- ── 11. stats_trips: 081 verbatim, only the status list gains on_board (D-11) ───
-- no_show is excluded from revenue until Phase 89 adds a "charged" fact.
-- ── stats_trips: one row per paid ORDER ─────────────────────────────────────
-- person_key is the identity uuid (as text) when the booking is linked, else 'e:' plus the normalised
-- booking email, else NULL (anonymised rows and GNet placeholder emails never match a person).
CREATE OR REPLACE FUNCTION public.stats_trips()
RETURNS TABLE (
  booking_id     uuid,
  person_key     text,
  user_id        uuid,
  booking_source text,
  lead_channel   text,
  created_at     timestamptz,
  pickup_date    text,
  amount_eur     integer,
  anonymised     boolean,
  client_name    text,
  client_email   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    b.id,
    CASE
      WHEN b.anonymised_at IS NOT NULL THEN NULL
      ELSE COALESCE(bi.identity_id::text, 'e:' || public.identity_normalize_email(b.client_email))
    END,
    b.user_id,
    b.booking_source,
    b.lead_channel,
    b.created_at,
    b.pickup_date,
    COALESCE(
      b.amount_eur,
      CASE
        WHEN b.trip_type = 'round_trip'
         AND (b.outbound_amount_czk IS NOT NULL OR b.return_amount_czk IS NOT NULL)
        THEN round((COALESCE(b.outbound_amount_czk, 0) + COALESCE(b.return_amount_czk, 0)) * 0.04)::integer
        ELSE round(b.amount_czk * 0.04)::integer
      END
    ),
    b.anonymised_at IS NOT NULL,
    btrim(b.client_first_name || ' ' || b.client_last_name),
    b.client_email
  FROM public.bookings b
  LEFT JOIN public.booking_identity bi ON bi.booking_id = b.id
  WHERE b.leg IS DISTINCT FROM 'return'
    AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'on_board', 'completed');
$$;

-- ── 12. Grants: a re-created SECURITY DEFINER function regains PUBLIC EXECUTE, always re-revoke ──
REVOKE EXECUTE ON FUNCTION public.log_booking_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_booking_status(uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_no_show_request(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.booking_lead_status(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_booking_gcal_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.panel_bookings(text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_trips() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.advance_booking_status(uuid, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_no_show_request(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_lead_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.panel_bookings(text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.stats_trips() TO service_role;
