-- 85-03 smoke: rolled-back proof of migration 082 (stats_customers, stats_b2b).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `082_stats_customers_b2b`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (auth users, customer profiles,
-- bookings, identities) is rolled back. ONLY the message SMOKE_OK_85_03 means success; any other
-- exception message names the failed assertion (SMOKE_FAIL_<step>).
--
-- Isolation: every booking fixture has a pickup_date in 2001 or 2002 (the RPCs filter on pickup_date, and
-- no live trip lies there; checked in step pre). Persons have a unique email smoke-85-<x>@example.test
-- and a unique phone +4207008530NN. Paid, non-GNet, non-anonymised customer fixtures are linked through
-- the real resolver public.identity_resolve_booking(id), as 85-01 does. The corporate fixtures (refs
-- SMK-85-03-U*) are not linked: stats_b2b attributes by user_id / account email, not by identity.
-- pickup_utc is generated and never inserted.
--
-- Customers (stats_customers), amounts in EUR
--   A  round trip 900000 (outbound + a return leg with NULL amount, one payment) pickup 2001-05-10,
--      then a completed one-way 1 pickup 2002-01-10 (newest trip, name 'Alice Newest')   -> repeat
--   B  one trip 70 on 2001-06-01                                                          -> not repeat
--   C  one online trip 80 on 2001-07-01 + a GNet booking with C's real email 2001-07-02   -> not repeat
--   D  one trip 60 on 2001-08-01 + an anonymised trip 500                                 -> not repeat
--   E, F  two trips each in 2002 (400000 + 400000), equal last_trip                       -> repeat, tie
--   2001 expectation: customers 4 (A B C D), repeat_customers 1 (A), repeat_revenue 900000,
--                     revenue 900000 + 70 + 80 + 60, repeat_customers_all_time +3 (A E F).
--
-- Corporate accounts (stats_b2b), period 2001-04-01..2001-04-30
--   U1 corporate: confirmed 300 (user_id), guest completed 100 with email ' SMOKE-85-CORP@Example.test '
--      and NULL user_id (D-19), confirmed amount 0, cancelled 500, confirmed 77 in May
--   U2 personal:  confirmed 200 whose email is U1's address (user_id precedence keeps it on U2)
--   U3 corporate without a trip; one confirmed GNet booking 50
--   expectation: U1 bookings 3, revenue 400, avg 133, last_trip 2001-04-12, without_amount 1;
--                b2b 3 / 400; all 5 / 650; accounts_total = before + 2.
--
-- If the live schema reports another NOT NULL bookings column without a default (82-LIVE-SCHEMA.md),
-- add it to the INSERT column list.

DO $smoke$
DECLARE
  j       jsonb;
  j2003   jsonb;
  f       jsonb;
  r       record;
  v_u1    uuid := gen_random_uuid();
  v_u2    uuid := gen_random_uuid();
  v_u3    uuid := gen_random_uuid();
  v_acc0  integer;
  v_rep0  integer;
  v_msg   text;
BEGIN
  -- ── pre: nothing live in 2001..2002, no smoke rows ────────────────────────
  IF EXISTS (SELECT 1 FROM public.bookings
              WHERE (created_at >= '2001-01-01' AND created_at < '2003-01-01')
                 OR (pickup_date >= '2001-01-01' AND pickup_date <= '2003-12-31')) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre live bookings exist in 2001..2003';
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_emails WHERE email LIKE 'smoke-85-%@example.test')
     OR EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'smoke-85-%@example.test') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre smoke identities or users already exist';
  END IF;

  -- Baselines read before any fixture exists.
  v_acc0 := (public.stats_b2b('2001-04-01', '2001-04-30') ->> 'accounts_total')::integer;
  v_rep0 := (public.stats_customers('2001-01-01', '2001-12-31') ->> 'repeat_customers_all_time')::integer;
  IF (SELECT count(*) FROM public.customer_profiles WHERE account_type = 'corporate') <> v_acc0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre accounts_total % is not the corporate profile count', v_acc0;
  END IF;

  -- ── fixture: accounts ─────────────────────────────────────────────────────
  INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES
    (v_u1, 'authenticated', 'authenticated', 'smoke-85-corp@example.test',  '', '', '', ''),
    (v_u2, 'authenticated', 'authenticated', 'smoke-85-pers@example.test',  '', '', '', ''),
    (v_u3, 'authenticated', 'authenticated', 'smoke-85-corp3@example.test', '', '', '', '');
  -- A signup trigger may already have created the profile rows: upsert.
  INSERT INTO public.customer_profiles (user_id, account_type, company_name, full_name)
  VALUES
    (v_u1, 'corporate', 'Smoke Corp',      'Smoke Owner One'),
    (v_u2, 'personal',  NULL,              'Smoke Personal'),
    (v_u3, 'corporate', 'Smoke Corp Idle', 'Smoke Owner Three')
  ON CONFLICT (user_id) DO UPDATE
    SET account_type = EXCLUDED.account_type,
        company_name = EXCLUDED.company_name,
        full_name    = EXCLUDED.full_name;

  -- ── fixture: bookings ─────────────────────────────────────────────────────
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur, payment_intent_id, anonymised_at, user_id, created_at,
    client_first_name, client_last_name, client_email, client_phone
  )
  SELECT v.ref, v.leg, 'confirmed', v.status, v.src, v.trip_type,
         'Smoke origin', 'Smoke destination', 1, 0, v.pickup, '10:00',
         'business', COALESCE(v.eur, 0) * 25, v.eur, v.pi, v.anon, v.uid, v.created,
         v.fname, v.lname, v.email, v.phone
    FROM (VALUES
      -- A: a round trip (outbound + return leg, one payment) and a later one-way
      ('SMK-85-03-A1',  'outbound', 'confirmed', 'online', 'round_trip', 900000, 'pi_smoke_85_03_a', NULL::timestamptz, NULL::uuid, '2001-05-10', '2001-05-01 10:00+02'::timestamptz, 'Alice', 'Old',    'smoke-85-a@example.test', '+420700853001'),
      ('SMK-85-03-A1R', 'return',   'confirmed', 'online', 'round_trip', NULL::integer, 'pi_smoke_85_03_a', NULL, NULL, '2001-05-17', '2001-05-01 10:00+02', 'Alice', 'Old',    'smoke-85-a@example.test', '+420700853001'),
      ('SMK-85-03-A2',  'outbound', 'completed', 'online', 'one_way',    1,      NULL,               NULL, NULL, '2002-01-10', '2002-01-05 10:00+01', 'Alice', 'Newest', 'smoke-85-a@example.test', '+420700853001'),
      -- B: a single trip
      ('SMK-85-03-B1',  'outbound', 'confirmed', 'online', 'one_way',    70,     NULL,               NULL, NULL, '2001-06-01', '2001-05-20 10:00+02', 'Bob',   'Single', 'smoke-85-b@example.test', '+420700853002'),
      -- C: one online trip and a GNet booking that carries C's real email
      ('SMK-85-03-C1',  'outbound', 'confirmed', 'online', 'one_way',    80,     NULL,               NULL, NULL, '2001-07-01', '2001-06-20 10:00+02', 'Cora',  'Online', 'smoke-85-c@example.test', '+420700853003'),
      ('SMK-85-03-C2',  'outbound', 'confirmed', 'gnet',   'one_way',    90,     NULL,               NULL, NULL, '2001-07-02', '2001-06-21 10:00+02', 'Cora',  'Gnet',   'smoke-85-c@example.test', '+420700853099'),
      -- D: one trip and an anonymised trip
      ('SMK-85-03-D1',  'outbound', 'confirmed', 'online', 'one_way',    60,     NULL,               NULL, NULL, '2001-08-01', '2001-07-20 10:00+02', 'Dina',  'Plain',  'smoke-85-d@example.test', '+420700853004'),
      ('SMK-85-03-D2',  'outbound', 'confirmed', 'online', 'one_way',    500,    NULL,               '2001-09-01 10:00+02'::timestamptz, NULL, '2001-08-03', '2001-07-21 10:00+02', 'Dina', 'Erased', 'smoke-85-d@example.test', '+420700853004'),
      -- E and F: two trips each, equal totals and equal last_trip
      ('SMK-85-03-E1',  'outbound', 'confirmed', 'online', 'one_way',    400000, NULL,               NULL, NULL, '2002-03-01', '2002-02-20 10:00+01', 'Eve',   'Tie',    'smoke-85-e@example.test', '+420700853005'),
      ('SMK-85-03-E2',  'outbound', 'confirmed', 'online', 'one_way',    400000, NULL,               NULL, NULL, '2002-04-01', '2002-03-20 10:00+01', 'Eve',   'Tie',    'smoke-85-e@example.test', '+420700853005'),
      ('SMK-85-03-F1',  'outbound', 'confirmed', 'online', 'one_way',    400000, NULL,               NULL, NULL, '2002-03-02', '2002-02-21 10:00+01', 'Finn',  'Tie',    'smoke-85-f@example.test', '+420700853006'),
      ('SMK-85-03-F2',  'outbound', 'confirmed', 'online', 'one_way',    400000, NULL,               NULL, NULL, '2002-04-01', '2002-03-21 10:00+01', 'Finn',  'Tie',    'smoke-85-f@example.test', '+420700853006')
    ) AS v(ref, leg, status, src, trip_type, eur, pi, anon, uid, pickup, created, fname, lname, email, phone);

  -- Link every paid, non-GNet, non-anonymised customer fixture through the real resolver.
  FOR r IN
    SELECT b.id, b.booking_reference
      FROM public.bookings b
     WHERE b.booking_reference LIKE 'SMK-85-03-%'
       AND b.booking_reference NOT LIKE 'SMK-85-03-U%'
       AND b.leg = 'outbound'
       AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'completed')
       AND b.booking_source <> 'gnet'
       AND b.anonymised_at IS NULL
     ORDER BY b.booking_reference
  LOOP
    PERFORM 1 FROM public.identity_resolve_booking(r.id) x WHERE x.outcome = 'resolved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SMOKE_FAIL_fx % did not resolve', r.booking_reference;
    END IF;
  END LOOP;

  -- ── shape and guards ──────────────────────────────────────────────────────
  j := public.stats_customers('2001-01-01', '2001-12-31');
  FOR r IN SELECT k FROM unnest(ARRAY['from', 'to', 'customers', 'repeat_customers', 'revenue_eur',
                                      'repeat_revenue_eur', 'repeat_customers_all_time', 'top']) AS k
  LOOP
    IF NOT (j ? r.k) THEN RAISE EXCEPTION 'SMOKE_FAIL_shape1 stats_customers lacks key %', r.k; END IF;
  END LOOP;
  IF j ->> 'from' <> '2001-01-01' OR j ->> 'to' <> '2001-12-31' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_shape2 period echo %', j ->> 'from';
  END IF;
  j := public.stats_b2b('2001-04-01', '2001-04-30');
  FOR r IN SELECT k FROM unnest(ARRAY['from', 'to', 'accounts_total', 'b2b_bookings', 'b2b_revenue_eur',
                                      'all_bookings', 'all_revenue_eur', 'accounts']) AS k
  LOOP
    IF NOT (j ? r.k) THEN RAISE EXCEPTION 'SMOKE_FAIL_shape3 stats_b2b lacks key %', r.k; END IF;
  END LOOP;

  BEGIN
    PERFORM public.stats_customers(NULL, '2001-12-31');
    RAISE EXCEPTION 'SMOKE_FAIL_shape4 NULL period accepted by stats_customers';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'invalid period' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.stats_customers('2001-02-01', '2001-01-31');
    RAISE EXCEPTION 'SMOKE_FAIL_shape5 inverted period accepted by stats_customers';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'invalid period' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.stats_b2b('2001-04-01', NULL);
    RAISE EXCEPTION 'SMOKE_FAIL_shape6 NULL period accepted by stats_b2b';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'invalid period' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.stats_b2b('2001-05-01', '2001-04-30');
    RAISE EXCEPTION 'SMOKE_FAIL_shape7 inverted period accepted by stats_b2b';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'invalid period' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;

  -- ── customers: 2001 ───────────────────────────────────────────────────────
  j := public.stats_customers('2001-01-01', '2001-12-31');
  IF (j ->> 'customers')::integer <> 4 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c1 customers % (expected A B C D; GNet and anonymised rows add none)', j ->> 'customers';
  END IF;
  IF (j ->> 'repeat_customers')::integer <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c2 repeat_customers % (A has a 2002 trip; B C D have one)', j ->> 'repeat_customers';
  END IF;
  IF (j ->> 'repeat_revenue_eur')::integer <> 900000 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c3 repeat_revenue_eur % (the round trip is one 900000 trip, the 2002 trip is outside)', j ->> 'repeat_revenue_eur';
  END IF;
  IF (j ->> 'revenue_eur')::integer <> 900000 + 70 + 80 + 60 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c4 revenue_eur % (GNet 90 and anonymised 500 must be excluded)', j ->> 'revenue_eur';
  END IF;
  IF (j ->> 'repeat_customers_all_time')::integer <> v_rep0 + 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c5 repeat_customers_all_time % expected % (A E F)', j ->> 'repeat_customers_all_time', v_rep0 + 3;
  END IF;

  -- top: A first, then E before F (equal revenue, trips, last_trip: email order), no one-trip persons
  f := j -> 'top' -> 0;
  IF f ->> 'email' <> 'smoke-85-a@example.test' OR (f ->> 'trips')::integer <> 2
     OR (f ->> 'revenue_eur')::integer <> 900001
     OR f ->> 'first_trip' <> '2001-05-10' OR f ->> 'last_trip' <> '2002-01-10' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c6 top[0] %', f;
  END IF;
  IF f ->> 'name' <> 'Alice Newest' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c7 name must come from the newest trip, got %', f ->> 'name';
  END IF;
  IF j -> 'top' -> 1 ->> 'email' <> 'smoke-85-e@example.test' OR (j -> 'top' -> 1 ->> 'revenue_eur')::integer <> 800000
     OR j -> 'top' -> 2 ->> 'email' <> 'smoke-85-f@example.test' OR (j -> 'top' -> 2 ->> 'revenue_eur')::integer <> 800000 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c8 tie order top[1]=% top[2]=%', j -> 'top' -> 1, j -> 'top' -> 2;
  END IF;
  IF jsonb_array_length(j -> 'top') > 10 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c9 top longer than 10';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(j -> 'top') e
     WHERE e ->> 'email' IN ('smoke-85-b@example.test', 'smoke-85-c@example.test', 'smoke-85-d@example.test')
        OR (e ->> 'trips')::integer < 2
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c10 a one-trip person is in the top list %', j -> 'top';
  END IF;

  -- ── customers: 2002 (E and F in the period, A with one period trip) ───────
  j := public.stats_customers('2002-01-01', '2002-12-31');
  IF (j ->> 'customers')::integer <> 3 OR (j ->> 'repeat_customers')::integer <> 3
     OR (j ->> 'revenue_eur')::integer <> 1 + 800000 + 800000
     OR (j ->> 'repeat_revenue_eur')::integer <> 1 + 800000 + 800000 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c11 2002 period %', j;
  END IF;

  -- ── customers: an empty period keeps the all-time top list ────────────────
  j2003 := public.stats_customers('2003-01-01', '2003-12-31');
  IF (j2003 ->> 'customers')::integer <> 0 OR (j2003 ->> 'repeat_customers')::integer <> 0
     OR (j2003 ->> 'revenue_eur')::integer <> 0 OR (j2003 ->> 'repeat_revenue_eur')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c12 empty period %', j2003;
  END IF;
  IF (j2003 -> 'top') IS DISTINCT FROM ((public.stats_customers('2001-01-01', '2001-12-31')) -> 'top') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c13 the all-time top list changed with the period';
  END IF;
  IF (j2003 ->> 'repeat_customers_all_time')::integer <> v_rep0 + 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c14 repeat_customers_all_time depends on the period';
  END IF;

  -- ── fixture: corporate bookings (inserted AFTER the customer assertions: they share one email on purpose,
  --    and that one 'person' would otherwise change the customer counts) ──────────────────────────────────
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur, payment_intent_id, anonymised_at, user_id, created_at,
    client_first_name, client_last_name, client_email, client_phone
  )
  SELECT v.ref, v.leg, 'confirmed', v.status, v.src, v.trip_type,
         'Smoke origin', 'Smoke destination', 1, 0, v.pickup, '10:00',
         'business', COALESCE(v.eur, 0) * 25, v.eur, v.pi, v.anon, v.uid, v.created,
         v.fname, v.lname, v.email, v.phone
    FROM (VALUES
      ('SMK-85-03-UA',  'outbound', 'confirmed', 'online', 'one_way',    300,    NULL::text,         NULL::timestamptz, v_u1, '2001-04-05', '2001-03-20 10:00+01', 'Una',   'Corp',   'smoke-85-corp@example.test', '+420700853011'),
      ('SMK-85-03-UB',  'outbound', 'completed', 'online', 'one_way',    100,    NULL,               NULL, NULL, '2001-04-10', '2001-03-21 10:00+01', 'Guest', 'Corp',   ' SMOKE-85-CORP@Example.test ', '+420700853012'),
      ('SMK-85-03-UC',  'outbound', 'confirmed', 'online', 'one_way',    0,      NULL,               NULL, v_u1, '2001-04-12', '2001-03-22 10:00+01', 'Una',   'Group',  'smoke-85-corp@example.test', '+420700853011'),
      ('SMK-85-03-UD',  'outbound', 'cancelled', 'online', 'one_way',    500,    NULL,               NULL, v_u1, '2001-04-15', '2001-03-23 10:00+01', 'Una',   'Cancel', 'smoke-85-corp@example.test', '+420700853011'),
      ('SMK-85-03-UE',  'outbound', 'confirmed', 'online', 'one_way',    77,     NULL,               NULL, v_u1, '2001-05-02', '2001-04-20 10:00+02', 'Una',   'May',    'smoke-85-corp@example.test', '+420700853011'),
      ('SMK-85-03-UF',  'outbound', 'confirmed', 'online', 'one_way',    200,    NULL,               NULL, v_u2, '2001-04-06', '2001-03-24 10:00+01', 'Pia',   'Personal', 'smoke-85-corp@example.test', '+420700853013'),
      ('SMK-85-03-UG',  'outbound', 'confirmed', 'gnet',   'one_way',    50,     NULL,               NULL, NULL, '2001-04-07', '2001-03-25 10:00+01', 'Gnet',  'Pax',    'noreply@gnet.local',        '+420700853014')
    ) AS v(ref, leg, status, src, trip_type, eur, pi, anon, uid, pickup, created, fname, lname, email, phone);

  -- ── b2b: April 2001 ───────────────────────────────────────────────────────
  j := public.stats_b2b('2001-04-01', '2001-04-30');
  IF jsonb_array_length(j -> 'accounts') <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b1 accounts % (only U1 has a corporate trip; U2 is personal, U3 has none)', j -> 'accounts';
  END IF;
  f := j -> 'accounts' -> 0;
  IF f ->> 'user_id' <> v_u1::text OR f ->> 'company_name' <> 'Smoke Corp'
     OR f ->> 'full_name' <> 'Smoke Owner One' OR f ->> 'email' <> 'smoke-85-corp@example.test' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b2 account identity %', f;
  END IF;
  IF (f ->> 'bookings')::integer <> 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b3 bookings % (user_id trip + guest-email trip + zero-amount trip; the cancelled one is out)', f ->> 'bookings';
  END IF;
  IF (f ->> 'revenue_eur')::integer <> 400 OR (f ->> 'avg_eur')::integer <> 133 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b4 revenue/avg % / %', f ->> 'revenue_eur', f ->> 'avg_eur';
  END IF;
  IF f ->> 'last_trip' <> '2001-04-12' OR (f ->> 'without_amount')::integer <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b5 last_trip / without_amount % / %', f ->> 'last_trip', f ->> 'without_amount';
  END IF;
  IF (j ->> 'b2b_bookings')::integer <> 3 OR (j ->> 'b2b_revenue_eur')::integer <> 400 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b6 b2b totals %', j;
  END IF;
  -- all sources: U1 3 trips (400) + U2 200 + GNet 50 (the cancelled booking is no trip)
  IF (j ->> 'all_bookings')::integer <> 5 OR (j ->> 'all_revenue_eur')::integer <> 650 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b7 all-source totals % / %', j ->> 'all_bookings', j ->> 'all_revenue_eur';
  END IF;
  IF (j ->> 'accounts_total')::integer <> v_acc0 + 2 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b8 accounts_total % expected % (U1 and U3 are corporate)', j ->> 'accounts_total', v_acc0 + 2;
  END IF;

  -- ── b2b: May 2001 (one corporate trip + A's round trip counted once) ──────
  j := public.stats_b2b('2001-05-01', '2001-05-31');
  IF jsonb_array_length(j -> 'accounts') <> 1
     OR (j -> 'accounts' -> 0 ->> 'bookings')::integer <> 1
     OR (j -> 'accounts' -> 0 ->> 'revenue_eur')::integer <> 77
     OR (j -> 'accounts' -> 0 ->> 'avg_eur')::integer <> 77
     OR (j -> 'accounts' -> 0 ->> 'without_amount')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b9 May account row %', j -> 'accounts';
  END IF;
  IF (j ->> 'all_bookings')::integer <> 2 OR (j ->> 'all_revenue_eur')::integer <> 900077 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b10 May all-source totals % / % (the return leg must not count)', j ->> 'all_bookings', j ->> 'all_revenue_eur';
  END IF;

  -- ── b2b: a period with no trips ───────────────────────────────────────────
  j := public.stats_b2b('2001-11-01', '2001-11-30');
  IF j -> 'accounts' IS DISTINCT FROM '[]'::jsonb
     OR (j ->> 'b2b_bookings')::integer <> 0 OR (j ->> 'b2b_revenue_eur')::integer <> 0
     OR (j ->> 'all_bookings')::integer <> 0 OR (j ->> 'all_revenue_eur')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b11 empty period %', j;
  END IF;
  IF (j ->> 'accounts_total')::integer <> v_acc0 + 2 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b12 accounts_total must not depend on the period';
  END IF;

  -- ── privileges and shape ──────────────────────────────────────────────────
  FOR r IN
    SELECT s FROM unnest(ARRAY[
      'public.stats_customers(date,date)',
      'public.stats_b2b(date,date)'
    ]) AS s
  LOOP
    IF has_function_privilege('anon', r.s, 'EXECUTE') THEN RAISE EXCEPTION 'SMOKE_FAIL_p1 anon can execute %', r.s; END IF;
    IF has_function_privilege('authenticated', r.s, 'EXECUTE') THEN RAISE EXCEPTION 'SMOKE_FAIL_p2 authenticated can execute %', r.s; END IF;
    IF NOT has_function_privilege('service_role', r.s, 'EXECUTE') THEN RAISE EXCEPTION 'SMOKE_FAIL_p3 service_role cannot execute %', r.s; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = r.s::regprocedure
         AND p.provolatile = 's'
         AND p.prosecdef
         AND p.proconfig @> ARRAY['search_path=""']
    ) THEN
      RAISE EXCEPTION 'SMOKE_FAIL_p4 % is not STABLE SECURITY DEFINER with a pinned search_path', r.s;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'SMOKE_OK_85_03';
END;
$smoke$;
