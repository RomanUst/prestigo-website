-- 81-10 smoke: rolled-back proof of migration 068 (daily outbox sweep functions).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `068_outbox_sweep`
-- (file supabase/migrations/068_outbox_sweep.sql).
-- The whole block ends in RAISE EXCEPTION, so every row it creates (bookings, outbox rows and the
-- integration_config row) is rolled back. ONLY the message SMOKE_OK_81_10 means success; any other
-- exception message names the failed assertion.
--
-- The live DB has NO integration_config 'lead_capture_start' row before this runs (capture is off
-- until go-live, plan 81-11); the block inserts one inside its own transaction and the rollback
-- removes it again. The block aborts if the key already exists (capture is live).
--
-- Statuses stay 'unpaid' so the Phase 77 calendar trigger (confirmed) is never invoked.
-- Rows are marked with client_email 'smoke+81-10@rideprestigo.com'.
--
-- Past pickups are set through pickup_date / pickup_time (pickup_utc is DB-computed from them, same
-- as 81-09-smoke.sql). Because the capture start is set to 1 minute ago and the trigger
-- bookings_lead_outbox is live, each unpaid insert also gets a ':new' outbox row from the trigger;
-- those keys differ from the ':dead' / 'lead.purge' keys asserted here and do not affect the counts.
--
-- Columns filled = exactly the set 81-09-smoke.sql proved against the live schema.

DO $smoke$
DECLARE
  v_a      uuid;  -- (a) online unpaid outbound, pickup 2 days ago
  v_b      uuid;  -- (b) online unpaid outbound, pickup 91 days ago, no payment link
  v_c      uuid;  -- (c) manual unpaid, pickup 91 days ago
  v_d      uuid;  -- (d) online unpaid, payment_link_id set, pickup 91 days ago
  v_e      uuid;  -- (e) online unpaid, pickup 1 day in the future
  v_f      uuid;  -- (f) online unpaid RETURN leg, pickup 91 days ago
  v_h      uuid;  -- (h) online unpaid, pickup 91 days ago, created BEFORE the capture start
  v_n      integer;
  v_k1     text;  -- processing row with an expired lease
  v_k2     text;  -- processing row with a live lease
  v_k3     text;  -- pending row due in the future
  v_k4     text;  -- sent row
  v_keys   text[];
BEGIN
  -- ── Preconditions ─────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.integration_config WHERE key = 'lead_capture_start') THEN
    RAISE EXCEPTION 'FAIL pre: lead_capture_start is already set (capture is live); aborting smoke';
  END IF;
  IF to_regprocedure('public.outbox_enqueue_expired_unpaid()') IS NULL
     OR to_regprocedure('public.outbox_enqueue_abandoned_purge()') IS NULL
     OR to_regprocedure('public.outbox_due_keys(integer)') IS NULL THEN
    RAISE EXCEPTION 'FAIL pre: migration 068 functions are missing';
  END IF;

  -- ── Capture off: both enqueue functions return 0 ──────────────────────────
  IF public.outbox_enqueue_expired_unpaid() <> 0 OR public.outbox_enqueue_abandoned_purge() <> 0 THEN
    RAISE EXCEPTION 'FAIL off: enqueue functions must return 0 while lead_capture_start is absent';
  END IF;

  -- ── Capture on (rolled back at the end) ───────────────────────────────────
  INSERT INTO public.integration_config (key, value)
  VALUES ('lead_capture_start', (now() - interval '1 minute')::text);

  -- (a) online unpaid outbound, pickup 2 days ago
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-10-A', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, (current_date - 2), '10:00',
    'business', 1000, 40,
    'Smoke', 'A', 'smoke+81-10@rideprestigo.com', '+420000000101', gen_random_uuid()
  ) RETURNING id INTO v_a;

  -- (b) online unpaid outbound, pickup 91 days ago, no payment link
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-10-B', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, (current_date - 91), '10:00',
    'business', 1000, 40,
    'Smoke', 'B', 'smoke+81-10@rideprestigo.com', '+420000000102', gen_random_uuid()
  ) RETURNING id INTO v_b;

  -- (c) manual unpaid, pickup 91 days ago
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-10-C', NULL, 'outbound', 'confirmed', 'unpaid', 'manual', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, (current_date - 91), '10:00',
    'business', 1000, 40,
    'Smoke', 'C', 'smoke+81-10@rideprestigo.com', '+420000000103', gen_random_uuid()
  ) RETURNING id INTO v_c;

  -- (d) online unpaid with a payment link, pickup 91 days ago
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id, payment_link_id
  ) VALUES (
    'SMK-81-10-D', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, (current_date - 91), '10:00',
    'business', 1000, 40,
    'Smoke', 'D', 'smoke+81-10@rideprestigo.com', '+420000000104', gen_random_uuid(), 'smoke'
  ) RETURNING id INTO v_d;

  -- (e) online unpaid, pickup 1 day in the future
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-10-E', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, (current_date + 1), '10:00',
    'business', 1000, 40,
    'Smoke', 'E', 'smoke+81-10@rideprestigo.com', '+420000000105', gen_random_uuid()
  ) RETURNING id INTO v_e;

  -- (f) online unpaid RETURN leg, pickup 91 days ago (return legs are never selected)
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id
  ) VALUES (
    'SMK-81-10-F', NULL, 'return', 'confirmed', 'unpaid', 'online', 'round_trip',
    'Smoke destination', 'Smoke origin', 1, 0, (current_date - 91), '10:00',
    'business', 1000, NULL,
    'Smoke', 'F', 'smoke+81-10@rideprestigo.com', '+420000000106', gen_random_uuid()
  ) RETURNING id INTO v_f;

  -- (h) created BEFORE the capture start (forward-only, D-21), pickup 91 days ago
  INSERT INTO public.bookings (
    booking_reference, payment_intent_id, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone, attempt_id, created_at
  ) VALUES (
    'SMK-81-10-H', NULL, 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, (current_date - 91), '10:00',
    'business', 1000, 40,
    'Smoke', 'H', 'smoke+81-10@rideprestigo.com', '+420000000107', gen_random_uuid(),
    now() - interval '1 day'
  ) RETURNING id INTO v_h;

  -- ── Expired unpaid (D-03): exactly a, b, c, d ─────────────────────────────
  v_n := public.outbox_enqueue_expired_unpaid();
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL expired: expected 4 rows (a,b,c,d), got %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.integration_outbox
   WHERE idempotency_key IN (
     'lead.booking:' || v_a::text || ':dead',
     'lead.booking:' || v_b::text || ':dead',
     'lead.booking:' || v_c::text || ':dead',
     'lead.booking:' || v_d::text || ':dead'
   )
     AND event_type = 'lead.booking' AND aggregate_type = 'booking' AND status = 'pending';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL expired: the four :dead keys are not all present and pending (found %)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.integration_outbox
   WHERE idempotency_key IN (
     'lead.booking:' || v_e::text || ':dead',
     'lead.booking:' || v_f::text || ':dead',
     'lead.booking:' || v_h::text || ':dead'
   );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL expired: future pickup / return leg / pre-start booking got a :dead key (% rows)', v_n;
  END IF;

  IF public.outbox_enqueue_expired_unpaid() <> 0 THEN
    RAISE EXCEPTION 'FAIL expired: a second call must return 0 (idempotent)';
  END IF;

  -- ── Abandoned purge (D-15 / D-20): exactly b ──────────────────────────────
  v_n := public.outbox_enqueue_abandoned_purge();
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL purge: expected exactly 1 row (b), got %', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.integration_outbox
     WHERE idempotency_key = 'lead.purge:' || v_b::text
       AND event_type = 'lead.purge' AND aggregate_type = 'booking' AND aggregate_id = v_b
  ) THEN
    RAISE EXCEPTION 'FAIL purge: the purge key of b is missing';
  END IF;

  SELECT count(*) INTO v_n FROM public.integration_outbox
   WHERE idempotency_key IN (
     'lead.purge:' || v_a::text, 'lead.purge:' || v_c::text, 'lead.purge:' || v_d::text,
     'lead.purge:' || v_e::text, 'lead.purge:' || v_f::text, 'lead.purge:' || v_h::text
   );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL purge: a recent, manual, payment-link, future, return-leg or pre-start booking was selected (% rows)', v_n;
  END IF;

  IF public.outbox_enqueue_abandoned_purge() <> 0 THEN
    RAISE EXCEPTION 'FAIL purge: a second call must return 0 (idempotent)';
  END IF;

  -- ── Due keys ───────────────────────────────────────────────────────────────
  v_k1 := 'lead.inquiry:' || gen_random_uuid()::text;
  v_k2 := 'lead.inquiry:' || gen_random_uuid()::text;
  v_k3 := 'lead.inquiry:' || gen_random_uuid()::text;
  v_k4 := 'lead.inquiry:' || gen_random_uuid()::text;

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, status, lease_until, available_at)
  VALUES
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_k1, 'processing', now() - interval '1 minute', now() - interval '1 hour'),
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_k2, 'processing', now() + interval '1 hour',   now() - interval '1 hour'),
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_k3, 'pending',    NULL,                         now() + interval '1 hour'),
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_k4, 'sent',       NULL,                         now() - interval '1 hour');

  SELECT array_agg(k) INTO v_keys FROM public.outbox_due_keys(500) AS k;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION 'FAIL due: outbox_due_keys returned nothing';
  END IF;
  IF NOT ('lead.booking:' || v_a::text || ':dead') = ANY (v_keys) THEN
    RAISE EXCEPTION 'FAIL due: the :dead key of (a) is not due';
  END IF;
  IF NOT ('lead.purge:' || v_b::text) = ANY (v_keys) THEN
    RAISE EXCEPTION 'FAIL due: the purge key of (b) is not due';
  END IF;
  IF NOT v_k1 = ANY (v_keys) THEN
    RAISE EXCEPTION 'FAIL due: a processing row with an expired lease is not returned';
  END IF;
  IF v_k2 = ANY (v_keys) OR v_k3 = ANY (v_keys) OR v_k4 = ANY (v_keys) THEN
    RAISE EXCEPTION 'FAIL due: a live lease, a future pending row or a sent row was returned';
  END IF;

  SELECT count(*) INTO v_n FROM public.outbox_due_keys(0);
  IF v_n > 1 THEN
    RAISE EXCEPTION 'FAIL due: p_limit 0 must be raised to 1 (got % rows)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.outbox_due_keys(100000);
  IF v_n > 500 THEN
    RAISE EXCEPTION 'FAIL due: the cap of 500 is not applied (got % rows)', v_n;
  END IF;

  -- ── The sweep never touches bookings ───────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.bookings
   WHERE client_email = 'smoke+81-10@rideprestigo.com' AND status = 'unpaid';
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'FAIL bookings: expected the 7 smoke bookings to stay unpaid, found %', v_n;
  END IF;

  -- ── Privileges ─────────────────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.outbox_due_keys(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_due_keys(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.outbox_enqueue_expired_unpaid()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_enqueue_expired_unpaid()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.outbox_enqueue_abandoned_purge()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_enqueue_abandoned_purge()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL privileges: anon or authenticated can EXECUTE a 068 function';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.outbox_due_keys(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.outbox_enqueue_expired_unpaid()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.outbox_enqueue_abandoned_purge()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL privileges: service_role lost EXECUTE on a 068 function';
  END IF;

  -- Everything above passed: roll it all back and report success through the one agreed message.
  RAISE EXCEPTION 'SMOKE_OK_81_10';
END
$smoke$;

-- After the block (separate execute_sql calls):
--   select count(*) from public.integration_config where key = 'lead_capture_start';            -- expect 0 (capture stays off until 81-11)
--   select count(*) from public.bookings where client_email = 'smoke+81-10@rideprestigo.com';    -- expect 0 (rolled back)
--   select count(*) from public.integration_outbox where idempotency_key like 'lead.purge:%' or idempotency_key like 'lead.booking:%';  -- expect 0
--   mcp get_advisors (type: security): no ERROR naming outbox_enqueue_expired_unpaid, outbox_enqueue_abandoned_purge or outbox_due_keys
