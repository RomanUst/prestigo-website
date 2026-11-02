-- 81-09 smoke: rolled-back proof of migration 067 (bookings -> lead outbox trigger).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `067_bookings_lead_outbox`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (bookings, outbox rows, the
-- integration_config row) is rolled back. ONLY the message SMOKE_OK_81_09 means success; any other
-- exception message names the failed assertion.
--
-- Confirmed statuses are avoided on purpose: they would invoke the Phase 77 calendar trigger.
-- Rows are marked with client_email 'smoke+81-09@rideprestigo.com'.
--
-- Columns filled = exactly what buildBookingRow / buildBookingRows (lib/supabase.ts) write, which is the
-- set the live schema accepts. pickup_utc is DB-computed from pickup_date/pickup_time. If the live
-- schema reports another NOT NULL column without a default (check `list_tables` for public.bookings),
-- add it to the column lists below: the assertions do not depend on it.

DO $smoke$
DECLARE
  v_a      uuid;  -- (a) capture off
  v_b      uuid;  -- (b) capture on, unpaid
  v_b2     uuid;  -- (b2) created exactly at the capture start
  v_p      uuid;  -- (b3) pending quote
  v_ret    uuid;  -- (c) return leg
  v_old    uuid;  -- (d) created before the capture start
  v_bad    uuid;  -- (e) malformed capture start
  v_n      integer;
  v_avail  timestamptz;
BEGIN
  -- ── Preconditions ─────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.bookings'::regclass
       AND t.tgname = 'bookings_lead_outbox'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL pre: trigger bookings_lead_outbox is missing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.integration_config WHERE key = 'lead_capture_start') THEN
    RAISE EXCEPTION 'FAIL pre: lead_capture_start is already set (capture is live); aborting smoke';
  END IF;

  -- ── (a) capture off: an unpaid insert enqueues nothing ────────────────────
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-09-A', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'A', 'smoke+81-09@rideprestigo.com', '+420000000001', gen_random_uuid()
  ) RETURNING id INTO v_a;

  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE aggregate_id = v_a;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (a): capture off but % outbox row(s) were created', v_n;
  END IF;

  -- ── (b) capture on: unpaid insert enqueues :new, 90 s out ──────────────────
  INSERT INTO public.integration_config (key, value)
  VALUES ('lead_capture_start', (now() - interval '1 minute')::text);

  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-09-B', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'B', 'smoke+81-09@rideprestigo.com', '+420000000002', gen_random_uuid()
  ) RETURNING id INTO v_b;

  SELECT count(*), max(available_at) INTO v_n, v_avail
    FROM public.integration_outbox
   WHERE aggregate_id = v_b AND idempotency_key = 'lead.booking:' || v_b::text || ':new';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b): expected exactly one :new outbox row, found %', v_n;
  END IF;
  IF v_avail <= now() THEN
    RAISE EXCEPTION 'FAIL (b): :new row is not delayed (available_at % <= now())', v_avail;
  END IF;

  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE aggregate_id = v_b;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b): expected exactly one outbox row for the booking, found %', v_n;
  END IF;

  -- cancellation enqueues :dead
  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_b;
  SELECT count(*) INTO v_n
    FROM public.integration_outbox
   WHERE idempotency_key = 'lead.booking:' || v_b::text || ':dead';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b): cancel did not enqueue :dead (found %)', v_n;
  END IF;

  -- a repeated identical status write enqueues nothing new
  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_b;
  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE aggregate_id = v_b;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FAIL (b): expected 2 outbox rows (new, dead) after a no-op update, found %', v_n;
  END IF;

  -- ── (b2) boundary: created_at exactly equal to the capture start is captured ─
  UPDATE public.integration_config SET value = now()::text WHERE key = 'lead_capture_start';
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-09-B2', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'B2', 'smoke+81-09@rideprestigo.com', '+420000000003', gen_random_uuid()
  ) RETURNING id INTO v_b2;

  SELECT count(*) INTO v_n
    FROM public.integration_outbox
   WHERE idempotency_key = 'lead.booking:' || v_b2::text || ':new';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b2): created_at = capture start must be captured (>=), found % rows', v_n;
  END IF;

  -- ── (b3) a pending quote maps to :in_process ──────────────────────────────
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-81-09-P', NULL, 'outbound', 'quote', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 0, NULL,
    'Smoke', 'P', 'smoke+81-09@rideprestigo.com', '+420000000004'
  ) RETURNING id INTO v_p;

  SELECT count(*) INTO v_n
    FROM public.integration_outbox
   WHERE idempotency_key = 'lead.booking:' || v_p::text || ':in_process';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b3): pending quote did not enqueue :in_process (found %)', v_n;
  END IF;

  -- ── (c) a return leg never enqueues ───────────────────────────────────────
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-09-R', NULL, 'return', 'confirmed', 'unpaid', 'online', 'round_trip',
    'Smoke destination', 'Smoke origin', 1, 0, '2030-01-20', '10:00',
    'business', 1000, NULL,
    'Smoke', 'R', 'smoke+81-09@rideprestigo.com', '+420000000005', gen_random_uuid()
  ) RETURNING id INTO v_ret;

  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE aggregate_id = v_ret;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (c): return leg enqueued % row(s)', v_n;
  END IF;

  -- ── (d) a row created before the capture start never enqueues ─────────────
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id, created_at
  ) VALUES (
    'SMK-81-09-OLD', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'OLD', 'smoke+81-09@rideprestigo.com', '+420000000006', gen_random_uuid(),
    now() - interval '1 day'
  ) RETURNING id INTO v_old;

  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE aggregate_id = v_old;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (d): pre-start insert enqueued % row(s)', v_n;
  END IF;

  -- ... and a later status change of that row does not enqueue either (forward-only, D-21)
  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_old;
  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE aggregate_id = v_old;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (d): pre-start status change enqueued % row(s)', v_n;
  END IF;

  -- ── (e) a malformed capture start must NOT abort the booking insert ───────
  UPDATE public.integration_config SET value = 'not-a-date' WHERE key = 'lead_capture_start';

  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-09-BAD', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'BAD', 'smoke+81-09@rideprestigo.com', '+420000000007', gen_random_uuid()
  ) RETURNING id INTO v_bad;

  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = v_bad) THEN
    RAISE EXCEPTION 'FAIL (e): booking insert did not survive a malformed capture start';
  END IF;
  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE aggregate_id = v_bad;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (e): malformed capture start still enqueued % row(s)', v_n;
  END IF;

  -- ── (f) status mapping ────────────────────────────────────────────────────
  IF public.booking_lead_status('en_route') IS DISTINCT FROM 'converted' THEN
    RAISE EXCEPTION 'FAIL (f): booking_lead_status(en_route) is not converted';
  END IF;
  IF public.booking_lead_status('unpaid') IS DISTINCT FROM 'new'
     OR public.booking_lead_status('pending') IS DISTINCT FROM 'in_process'
     OR public.booking_lead_status('cancelled') IS DISTINCT FROM 'dead' THEN
    RAISE EXCEPTION 'FAIL (f): booking_lead_status mapping drifted';
  END IF;
  IF public.booking_lead_status('weird') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (f): booking_lead_status(weird) is not NULL';
  END IF;

  -- ── (g) privileges ────────────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.outbox_kick(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_kick(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.enqueue_booking_lead()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.enqueue_booking_lead()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.booking_lead_status(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.booking_lead_status(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL (g): anon or authenticated can EXECUTE a 067 function';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.outbox_kick(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.booking_lead_status(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL (g): service_role lost EXECUTE on a helper function';
  END IF;

  -- Everything above passed: roll it all back and report success through the one agreed message.
  RAISE EXCEPTION 'SMOKE_OK_81_09';
END
$smoke$;

-- After the block (separate execute_sql calls):
--   select count(*) from public.integration_config where key = 'lead_capture_start';           -- expect 0 (capture stays off until 81-11)
--   select count(*) from public.bookings where client_email = 'smoke+81-09@rideprestigo.com';   -- expect 0 (rolled back)
--   select count(*) from public.integration_outbox where idempotency_key like 'lead.booking:%'; -- expect 0
--   mcp get_advisors (type: security): no ERROR naming booking_lead_status, outbox_kick or enqueue_booking_lead
