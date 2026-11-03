-- 82-03 smoke for migration 071 (admin_search_bookings also matches client_email).
-- Run by the orchestrator with the Supabase MCP execute_sql AFTER apply_migration.
-- The whole block ends in RAISE EXCEPTION, so everything it inserts is rolled back.
-- Expected result: an error whose message is exactly SMOKE_OK_82_03.
DO $smoke$
DECLARE
  v_ref    text := 'SMK82030001';
  v_email  text := 'smoke+82-03@rideprestigo.com';
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  INSERT INTO public.bookings (
    booking_reference, booking_type, trip_type, passengers, luggage,
    pickup_date, pickup_time, vehicle_class, amount_czk,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    v_ref, 'transfer', 'transfer', 1, 0,
    '2099-01-01', '10:00', 'business', 1000,
    'Smoke', 'Eightytwo', v_email, '+420000000000'
  );

  -- 1. search by the email finds exactly this booking
  SELECT s.total_count, s.rows INTO v_total, v_rows
  FROM public.admin_search_bookings(
    p_query => v_email, p_start_date => NULL, p_end_date => NULL,
    p_trip_type => NULL, p_status => NULL, p_sort => 'created_desc',
    p_offset => 0, p_limit => 20
  ) s;
  ASSERT v_total = 1, format('email search total_count expected 1, got %s', v_total);
  ASSERT v_rows -> 0 ->> 'booking_reference' = v_ref, 'email search returned the wrong row';

  -- 2. search by the booking reference still works
  SELECT s.total_count, s.rows INTO v_total, v_rows
  FROM public.admin_search_bookings(
    p_query => v_ref, p_start_date => NULL, p_end_date => NULL,
    p_trip_type => NULL, p_status => NULL, p_sort => 'created_desc',
    p_offset => 0, p_limit => 20
  ) s;
  ASSERT v_total = 1, format('reference search total_count expected 1, got %s', v_total);
  ASSERT v_rows -> 0 ->> 'booking_reference' = v_ref, 'reference search returned the wrong row';

  -- 3. a partial email (domain-less local part) matches too
  SELECT s.total_count INTO v_total
  FROM public.admin_search_bookings(
    p_query => 'smoke+82-03', p_start_date => NULL, p_end_date => NULL,
    p_trip_type => NULL, p_status => NULL, p_sort => 'created_desc',
    p_offset => 0, p_limit => 20
  ) s;
  ASSERT v_total = 1, format('partial email search total_count expected 1, got %s', v_total);

  -- 4. EXECUTE stays closed to anon, authenticated and PUBLIC (T-82-10)
  ASSERT NOT has_function_privilege('anon', 'public.admin_search_bookings(text,text,text,text,text,text,integer,integer)', 'EXECUTE'),
    'anon can execute admin_search_bookings';
  ASSERT NOT has_function_privilege('authenticated', 'public.admin_search_bookings(text,text,text,text,text,text,integer,integer)', 'EXECUTE'),
    'authenticated can execute admin_search_bookings';
  ASSERT has_function_privilege('service_role', 'public.admin_search_bookings(text,text,text,text,text,text,integer,integer)', 'EXECUTE'),
    'service_role cannot execute admin_search_bookings';

  RAISE EXCEPTION 'SMOKE_OK_82_03';
END
$smoke$;
