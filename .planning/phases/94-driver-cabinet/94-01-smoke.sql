-- 94-01 smoke: migration 100 (driver cabinet). Run by the ORCHESTRATOR with Supabase execute_sql against
-- project enakcryrtxlnjvjutfpv. Nothing here persists: the whole check is ONE DO block that always ends in
-- RAISE EXCEPTION, so every row it inserts is rolled back (a plain BEGIN ... ROLLBACK is not reliable through
-- execute_sql, which may return only the last statement). The expected outcome is therefore an ERROR whose message is
-- 'SMOKE_OK_94_01 {...json...}' (all checks true) or 'SMOKE_FAIL_94_01 {...json...}'. Read the JSON; every value must be true.
--
-- ---------------------------------------------------------------------------------------------------------------
-- STEP 0 (run BEFORE applying 100, read-only). Paste both outputs into the SUMMARY: they prove 100 leaves the
-- existing drivers / driver_assignments columns and the drivers / driver_assignments / bookings policies as they were.
--
--   SELECT table_name, column_name
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name IN ('drivers', 'driver_assignments')
--    ORDER BY table_name, ordinal_position;
--
--   SELECT tablename, policyname
--     FROM pg_policies
--    WHERE tablename IN ('drivers', 'driver_assignments', 'bookings')
--    ORDER BY tablename, policyname;
--
-- Expected: drivers(id, name, email, phone, vehicle_info, created_at) and driver_assignments(id, booking_id, driver_id,
-- status, token, token_expires_at, token_used_at, created_at, trip_token, trip_progress, trip_note,
-- trip_progress_updated_at); 4 + 4 + 5 policies.
-- ---------------------------------------------------------------------------------------------------------------
-- STEP 1 (run AFTER applying 100): the block below.
-- STEP 2 (after STEP 1): SELECT count(*) FROM public.drivers WHERE email = 'smoke-94@example.invalid';  -- expect 0
--         and re-run the pg_policies query of STEP 0 (expect the identical 13 rows).
-- ---------------------------------------------------------------------------------------------------------------

DO $smoke$
DECLARE
  r            jsonb := '{}'::jsonb;
  v_driver     uuid;
  v_code       uuid;
  v_code2      uuid;
  v_code3      uuid;
  v_good       text;
  v_wrong      text := repeat('0', 64);
  v_res        text;
  v_i          integer;
  v_all_wrong  boolean := true;
  v_ok         boolean;
  v_enabled    boolean;
  v_n          integer;
  v_tbl        text;
  v_fn         text := 'public.consume_driver_login_code(uuid,uuid,text)';
BEGIN
  -- 1. a temporary driver: not invited by default (D-06)
  INSERT INTO public.drivers (name, email, phone)
  VALUES ('Smoke 94', 'smoke-94@example.invalid', '')
  RETURNING id INTO v_driver;
  SELECT cabinet_enabled INTO v_enabled FROM public.drivers WHERE id = v_driver;
  r := r || jsonb_build_object('cabinet_enabled_defaults_false', v_enabled = false);

  -- 2. five wrong tries are all 'wrong', then even the right hash is 'dead' (5 attempts per code)
  v_code := gen_random_uuid();
  v_good := encode(sha256(convert_to(v_code::text || ':123456', 'UTF8')), 'hex');
  INSERT INTO public.driver_login_codes (id, driver_id, code_hash, expires_at)
  VALUES (v_code, v_driver, v_good, now() + interval '10 minutes');
  FOR v_i IN 1..5 LOOP
    v_res := public.consume_driver_login_code(v_driver, v_code, v_wrong);
    IF v_res IS DISTINCT FROM 'wrong' THEN v_all_wrong := false; END IF;
  END LOOP;
  r := r || jsonb_build_object('five_wrong_tries_answer_wrong', v_all_wrong);
  SELECT attempts INTO v_n FROM public.driver_login_codes WHERE id = v_code;
  r := r || jsonb_build_object('attempts_counted_to_5', v_n = 5);
  v_res := public.consume_driver_login_code(v_driver, v_code, v_good);
  r := r || jsonb_build_object('right_hash_after_5_attempts_is_dead', v_res = 'dead');

  -- 3. a fresh code: right hash is 'ok', replay is 'dead' (single use)
  v_code2 := gen_random_uuid();
  v_good := encode(sha256(convert_to(v_code2::text || ':123456', 'UTF8')), 'hex');
  INSERT INTO public.driver_login_codes (id, driver_id, code_hash, expires_at)
  VALUES (v_code2, v_driver, v_good, now() + interval '10 minutes');
  v_res := public.consume_driver_login_code(v_driver, v_code2, v_good);
  r := r || jsonb_build_object('right_hash_is_ok', v_res = 'ok');
  v_res := public.consume_driver_login_code(v_driver, v_code2, v_good);
  r := r || jsonb_build_object('replay_is_dead', v_res = 'dead');
  SELECT (consumed_at IS NOT NULL) INTO v_ok FROM public.driver_login_codes WHERE id = v_code2;
  r := r || jsonb_build_object('consumed_at_set', v_ok);

  -- 4. an expired code is 'dead' even with the right hash; so is another driver's id
  v_code3 := gen_random_uuid();
  v_good := encode(sha256(convert_to(v_code3::text || ':123456', 'UTF8')), 'hex');
  INSERT INTO public.driver_login_codes (id, driver_id, code_hash, expires_at)
  VALUES (v_code3, v_driver, v_good, now() - interval '1 minute');
  v_res := public.consume_driver_login_code(v_driver, v_code3, v_good);
  r := r || jsonb_build_object('expired_is_dead', v_res = 'dead');
  v_res := public.consume_driver_login_code(gen_random_uuid(), v_code3, v_good);
  r := r || jsonb_build_object('wrong_driver_is_dead', v_res = 'dead');

  -- 5. a duplicate session token_hash raises unique_violation
  INSERT INTO public.driver_sessions (driver_id, token_hash, expires_at)
  VALUES (v_driver, repeat('a', 64), now() + interval '30 days');
  v_ok := false;
  BEGIN
    INSERT INTO public.driver_sessions (driver_id, token_hash, expires_at)
    VALUES (v_driver, repeat('a', 64), now() + interval '30 days');
  EXCEPTION WHEN unique_violation THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('duplicate_token_hash_rejected', v_ok);

  -- a malformed token_hash is rejected by the hex check
  v_ok := false;
  BEGIN
    INSERT INTO public.driver_sessions (driver_id, token_hash, expires_at)
    VALUES (v_driver, 'not-hex', now() + interval '30 days');
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('non_hex_token_hash_rejected', v_ok);

  -- 6. a push endpoint must be https
  v_ok := false;
  BEGIN
    INSERT INTO public.driver_push_subscriptions (driver_id, endpoint, p256dh, auth)
    VALUES (v_driver, 'http://x', 'k', 'a');
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('http_endpoint_rejected', v_ok);
  INSERT INTO public.driver_push_subscriptions (driver_id, endpoint, p256dh, auth)
  VALUES (v_driver, 'https://push.example.invalid/smoke-94', 'k', 'a');

  -- 7. deleting the driver cascades to codes, sessions and subscriptions
  DELETE FROM public.drivers WHERE id = v_driver;
  SELECT (SELECT count(*) FROM public.driver_login_codes WHERE driver_id = v_driver)
       + (SELECT count(*) FROM public.driver_sessions WHERE driver_id = v_driver)
       + (SELECT count(*) FROM public.driver_push_subscriptions WHERE driver_id = v_driver)
    INTO v_n;
  r := r || jsonb_build_object('driver_delete_cascades_to_0', v_n = 0);

  -- 8. deny-all: anon and authenticated have no SELECT on the new tables, RLS is on
  FOREACH v_tbl IN ARRAY ARRAY['driver_login_codes', 'driver_sessions', 'driver_push_subscriptions'] LOOP
    r := r || jsonb_build_object(
      v_tbl || '_anon_no_select', NOT has_table_privilege('anon', 'public.' || v_tbl, 'SELECT'));
    r := r || jsonb_build_object(
      v_tbl || '_authenticated_no_select', NOT has_table_privilege('authenticated', 'public.' || v_tbl, 'SELECT'));
    r := r || jsonb_build_object(
      v_tbl || '_rls_on', (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_tbl)::regclass));
  END LOOP;

  -- 9. the RPC is callable by service_role only
  r := r || jsonb_build_object('rpc_anon_no_execute', NOT has_function_privilege('anon', v_fn, 'EXECUTE'));
  r := r || jsonb_build_object('rpc_authenticated_no_execute', NOT has_function_privilege('authenticated', v_fn, 'EXECUTE'));
  r := r || jsonb_build_object('rpc_service_role_execute', has_function_privilege('service_role', v_fn, 'EXECUTE'));

  -- 10. always roll back: SMOKE_OK_94_01 only when every value is true
  IF NOT EXISTS (SELECT 1 FROM jsonb_each(r) e WHERE e.value <> 'true'::jsonb) THEN
    RAISE EXCEPTION 'SMOKE_OK_94_01 %', r;
  ELSE
    RAISE EXCEPTION 'SMOKE_FAIL_94_01 %', r;
  END IF;
END
$smoke$;
