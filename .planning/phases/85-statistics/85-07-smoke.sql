-- 85-07 smoke: rolled-back proof of migration 083 (review WR-01: every paid booking of the period is
-- accounted for). Run with the Supabase MCP `execute_sql` AFTER `apply_migration`
-- `083_stats_conversion_period_totals`. Ends in RAISE EXCEPTION; ONLY SMOKE_OK_85_07 means success.
--
-- Scenario (period 2001-06-01..2001-06-30, nothing live exists in 2001):
--   W  contact inquiry 06-01, paid booking 06-10 (100), second paid booking 06-30 (40)
--      -> the funnel claims only the 06-10 booking; the 06-30 one was invisible before 083
--   X  paid booking 06-15 (25) with no inquiry -> direct
-- Expected: funnel revenue 100; direct 1 / 25; attributed_total 2 / 140; period_total 3 / 165
--           = attributed_total + direct_total.

DO $smoke$
DECLARE
  j jsonb;
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.bookings WHERE created_at >= '2001-01-01' AND created_at < '2003-01-01')
     OR EXISTS (SELECT 1 FROM public.inquiries WHERE created_at >= '2001-01-01' AND created_at < '2003-01-01') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre live rows exist in 2001..2002';
  END IF;

  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur, created_at,
    client_first_name, client_last_name, client_email, client_phone
  )
  SELECT v.ref, 'outbound', 'confirmed', 'confirmed', 'online', 'one_way',
         'Smoke origin', 'Smoke destination', 1, 0, '2030-01-01', '10:00',
         'business', v.eur * 25, v.eur, v.created,
         'Smoke', 'Fixture', v.email, v.phone
    FROM (VALUES
      ('SMK-85-07-W1', 100, '2001-06-10 10:00+02'::timestamptz, 'smoke-85-w@example.test', '+420700857001'),
      ('SMK-85-07-W2',  40, '2001-06-30 10:00+02'::timestamptz, 'smoke-85-w@example.test', '+420700857001'),
      ('SMK-85-07-X1',  25, '2001-06-15 10:00+02'::timestamptz, 'smoke-85-x@example.test', '+420700857002')
    ) AS v(ref, eur, created, email, phone);

  FOR r IN SELECT b.id, b.booking_reference FROM public.bookings b WHERE b.booking_reference LIKE 'SMK-85-07-%' LOOP
    PERFORM 1 FROM public.identity_resolve_booking(r.id) x WHERE x.outcome = 'resolved';
    IF NOT FOUND THEN RAISE EXCEPTION 'SMOKE_FAIL_fx % did not resolve', r.booking_reference; END IF;
  END LOOP;

  INSERT INTO public.inquiries (kind, email, created_at)
  VALUES ('contact', 'smoke-85-w@example.test', '2001-06-01 10:00+02');

  j := public.stats_conversion('2001-06-01', '2001-06-30');

  IF (j -> 'funnel_total' ->> 'converted')::integer <> 1 OR (j -> 'funnel_total' ->> 'revenue_eur')::integer <> 100 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_1 funnel changed %', j -> 'funnel_total';
  END IF;
  IF (j -> 'direct_total' ->> 'bookings')::integer <> 1 OR (j -> 'direct_total' ->> 'revenue_eur')::integer <> 25 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_2 direct %', j -> 'direct_total';
  END IF;
  IF (j -> 'attributed_total' ->> 'bookings')::integer <> 2 OR (j -> 'attributed_total' ->> 'revenue_eur')::integer <> 140 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_3 attributed_total (the second booking after the inquiry must count) %', j -> 'attributed_total';
  END IF;
  IF (j -> 'period_total' ->> 'bookings')::integer <> 3 OR (j -> 'period_total' ->> 'revenue_eur')::integer <> 165 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_4 period_total %', j -> 'period_total';
  END IF;
  IF (j -> 'period_total' ->> 'bookings')::integer
       <> (j -> 'attributed_total' ->> 'bookings')::integer + (j -> 'direct_total' ->> 'bookings')::integer
     OR (j -> 'period_total' ->> 'revenue_eur')::integer
       <> (j -> 'attributed_total' ->> 'revenue_eur')::integer + (j -> 'direct_total' ->> 'revenue_eur')::integer THEN
    RAISE EXCEPTION 'SMOKE_FAIL_5 period_total <> attributed_total + direct_total %', j;
  END IF;
  IF (j ->> 'trips_in_period')::integer <> (j -> 'period_total' ->> 'bookings')::integer
     OR (j ->> 'attributed_bookings')::integer <> (j -> 'attributed_total' ->> 'bookings')::integer THEN
    RAISE EXCEPTION 'SMOKE_FAIL_6 legacy counters disagree %', j;
  END IF;

  IF has_function_privilege('anon', 'public.stats_conversion(date,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.stats_conversion(date,date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.stats_conversion(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_7 privileges';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'public.stats_conversion(date,date)'::regprocedure
                   AND p.provolatile = 's' AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_8 not STABLE SECURITY DEFINER with pinned search_path';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_85_07';
END;
$smoke$;
