-- Quick task quote-tour-line smoke: migration 096 (tour quote lines, client descriptions, bookings.tour_description).
-- Run by the ORCHESTRATOR with Supabase execute_sql against the production project, AFTER applying 096 and BEFORE the
-- code that writes title / description ships. Nothing here persists: the whole check is ONE DO block that always ends in
-- RAISE EXCEPTION, so every row it inserts is rolled back (a plain BEGIN ... ROLLBACK is not reliable through
-- execute_sql). The expected outcome is an ERROR whose message is 'SMOKE_OK {...json...}' (all checks true) or
-- 'SMOKE_FAIL {...json...}'. Read the JSON: every key ending in _must_be_false must be false, informational keys
-- (trip_type_check_def, convert_result, convert_error) are not judged, every other key must be true.
--
-- BEFORE applying 096, confirm the live name of the trip_type CHECK (096 drops quote_version_lines_trip_type_check):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.quote_version_lines'::regclass AND contype = 'c'
--      AND pg_get_constraintdef(oid) LIKE '%trip_type%';
--   -- expected before 096: ONE row, quote_version_lines_trip_type_check, without 'tour'
--   -- expected after 096:  quote_version_lines_trip_type_check WITH 'tour', and quote_version_lines_tour_complete_check
--
-- Checks:
--   1. exactly one trip_type CHECK on quote_version_lines, and it allows 'tour'
--   2. a tour line with title and hours is accepted; a tour line without title, or without hours, is refused
--   3. title length 1..200, description length <= 4000 (4000 accepted, 4001 refused); a transfer may carry a description
--   4. bookings.tour_description exists, is text, and caps at 4000
--   5. quote_convert_to_bookings turns an accepted, paid quote with a tour line and a transfer line into a tour booking
--      (trip_type 'tour', tour_title = title, hours, tour_id NULL, tour_description = description) and a transfer
--      booking with tour_title and tour_description NULL
--   6. quote_convert_to_bookings and erasure_anonymise_person: SECURITY DEFINER, empty search_path, not executable by
--      PUBLIC, anon or authenticated; executable by service_role
--
-- The rows use the reserved address smoke-quote-tour-096@example.invalid and references Q-20270601-SMK96x.

DO $smoke$
DECLARE
  r          jsonb := '{}'::jsonb;
  v_q        uuid;
  v_v        uuid;
  v_q2       uuid;
  v_v2       uuid;
  v_ok       boolean;
  v_n        integer;
  v_res      jsonb;
  v_tour     record;
  v_transfer record;
BEGIN
  -- 1. the trip_type CHECK
  SELECT count(*) INTO v_n
    FROM pg_constraint
   WHERE conrelid = 'public.quote_version_lines'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%trip_type%IN%';
  r := r || jsonb_build_object('one_trip_type_in_check', v_n = 1);
  r := r || jsonb_build_object('trip_type_check_def', (
    SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ')
      FROM pg_constraint
     WHERE conrelid = 'public.quote_version_lines'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%trip_type%'));
  r := r || jsonb_build_object('tour_complete_check_exists', EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.quote_version_lines'::regclass AND conname = 'quote_version_lines_tour_complete_check'));

  -- A draft quote with an unfrozen version to hold the test lines.
  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20270601-SMK961', 'Smoke', 'Test', 'smoke-quote-tour-096@example.invalid', 'email')
  RETURNING id INTO v_q;
  INSERT INTO public.quote_versions (quote_id, version_no, locale, currency)
  VALUES (v_q, 1, 'en', 'eur')
  RETURNING id INTO v_v;

  -- 2. a complete tour line is accepted
  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor,
       hours, title, description)
    VALUES (v_v, 1, 'tour', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 65000,
       8, 'Private day trip: smoke test', E'Line one\nLine two');
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
    r := r || jsonb_build_object('tour_line_error', SQLERRM);
  END;
  r := r || jsonb_build_object('tour_line_accepted', v_ok);

  -- a tour without a title is refused
  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor, hours)
    VALUES (v_v, 2, 'tour', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 65000, 8);
    v_ok := true;
  EXCEPTION WHEN check_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('tour_without_title_accepted_must_be_false', v_ok);

  -- a tour without hours is refused
  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor, title)
    VALUES (v_v, 3, 'tour', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 65000, 'No hours');
    v_ok := true;
  EXCEPTION WHEN check_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('tour_without_hours_accepted_must_be_false', v_ok);

  -- an unknown trip type is still refused
  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor)
    VALUES (v_v, 4, 'cruise', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 65000);
    v_ok := true;
  EXCEPTION WHEN check_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('unknown_trip_type_accepted_must_be_false', v_ok);

  -- 3. title and description limits
  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor, hours, title)
    VALUES (v_v, 5, 'tour', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 65000, 8, repeat('t', 201));
    v_ok := true;
  EXCEPTION WHEN check_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('title_201_accepted_must_be_false', v_ok);

  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor, hours, title)
    VALUES (v_v, 6, 'tour', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 65000, 8, '');
    v_ok := true;
  EXCEPTION WHEN check_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('empty_title_accepted_must_be_false', v_ok);

  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor, description)
    VALUES (v_v, 7, 'transfer', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 30000, repeat('d', 4001));
    v_ok := true;
  EXCEPTION WHEN check_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('description_4001_accepted_must_be_false', v_ok);

  BEGIN
    INSERT INTO public.quote_version_lines
      (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor, description)
    VALUES (v_v, 8, 'transfer', '2027-06-01', '08:00', 'Smoke hotel, Prague', 'business', 2, 30000, repeat('d', 4000));
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('transfer_description_4000_accepted', v_ok);

  -- 4. bookings.tour_description
  r := r || jsonb_build_object('bookings_tour_description_is_text', EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'tour_description' AND data_type = 'text'));
  r := r || jsonb_build_object('bookings_tour_description_capped', EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bookings'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%tour_description%4000%'));

  -- 5. conversion of an accepted, paid quote with a tour line (position 1) and a transfer line (position 2).
  --    Payment link remainder: both bookings are quote-mode (no Stripe ids needed). Lines go in before the freeze.
  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20270601-SMK962', 'Smoke', 'Convert', 'smoke-quote-tour-096@example.invalid', 'email')
  RETURNING id INTO v_q2;
  INSERT INTO public.quote_versions (quote_id, version_no, locale, currency)
  VALUES (v_q2, 1, 'en', 'eur')
  RETURNING id INTO v_v2;
  INSERT INTO public.quote_version_lines
    (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor,
     hours, title, description, deposit_share_minor, remainder_minor, amount_eur, amount_czk)
  VALUES
    (v_v2, 1, 'tour', '2027-06-02', '08:00', 'Smoke hotel, Prague', 'business', 2, 65000,
     9, 'Private day trip: Kutná Hora (smoke)', E'Kutná Hora\nLunch not included', 19500, 45500, 650, 16250),
    (v_v2, 2, 'transfer', '2027-06-03', '10:00', 'Smoke hotel, Prague', 'business', 2, 30000,
     NULL, NULL, 'Water on board', 9000, 21000, 300, 7500);
  UPDATE public.quote_versions
     SET total_minor = 95000, deposit_kind = 'percent', deposit_value = 30, deposit_minor = 28500,
         remainder_method = 'payment_link', cancel_policy = '{"freeHours": 48, "feePercent": 100}'::jsonb,
         cancel_policy_version = 'quote-policy-smoke', terms_version = 'quote-smoke', frozen_at = now()
   WHERE id = v_v2;
  INSERT INTO public.quote_acceptances
    (quote_id, version_id, locale, terms_version, terms_sha256, terms_rendered, deposit_minor, currency, payment_intent_id)
  VALUES (v_q2, v_v2, 'en', 'quote-smoke', repeat('a', 64), 'Smoke terms.', 28500, 'eur', 'pi_smoke_096');
  UPDATE public.quotes
     SET status = 'accepted', current_version_id = v_v2, accepted_version_id = v_v2, accepted_at = now(),
         deposit_payment_intent_id = 'pi_smoke_096'
   WHERE id = v_q2;

  BEGIN
    v_res := public.quote_convert_to_bookings(
      v_q2, v_v2, 'pi_smoke_096', NULL, NULL,
      '[{"position": 1, "booking_reference": "PRG-SMK096-T1"}, {"position": 2, "booking_reference": "PRG-SMK096-T2"}]'::jsonb,
      'system', 'smoke-096');
  EXCEPTION WHEN others THEN
    r := r || jsonb_build_object('convert_error', SQLERRM);
    v_res := NULL;
  END;
  r := r || jsonb_build_object('convert_result', v_res);
  r := r || jsonb_build_object('converted', coalesce((v_res ->> 'converted')::boolean, false));

  SELECT b.trip_type, b.tour_id, b.tour_title, b.tour_description, b.hours INTO v_tour
    FROM public.bookings b JOIN public.quote_version_lines l ON l.id = b.quote_line_id
   WHERE b.quote_id = v_q2 AND l.position = 1;
  SELECT b.trip_type, b.tour_id, b.tour_title, b.tour_description INTO v_transfer
    FROM public.bookings b JOIN public.quote_version_lines l ON l.id = b.quote_line_id
   WHERE b.quote_id = v_q2 AND l.position = 2;
  r := r || jsonb_build_object(
    'tour_booking_trip_type_tour', coalesce(v_tour.trip_type = 'tour', false),
    'tour_booking_tour_id_null', v_tour.trip_type IS NOT NULL AND v_tour.tour_id IS NULL,
    'tour_booking_title_copied', coalesce(v_tour.tour_title = 'Private day trip: Kutná Hora (smoke)', false),
    'tour_booking_description_copied', coalesce(v_tour.tour_description = E'Kutná Hora\nLunch not included', false),
    'tour_booking_hours_copied', coalesce(v_tour.hours = 9, false),
    'transfer_booking_trip_type_transfer', coalesce(v_transfer.trip_type = 'transfer', false),
    'transfer_booking_tour_fields_null', v_transfer.trip_type IS NOT NULL AND v_transfer.tour_title IS NULL
                                          AND v_transfer.tour_description IS NULL AND v_transfer.tour_id IS NULL);

  -- 6. privileges of the two re-created SECURITY DEFINER functions
  r := r || jsonb_build_object(
    'convert_anon_exec_must_be_false', has_function_privilege('anon', 'public.quote_convert_to_bookings(uuid,uuid,text,text,text,jsonb,text,text)', 'EXECUTE'),
    'convert_authenticated_exec_must_be_false', has_function_privilege('authenticated', 'public.quote_convert_to_bookings(uuid,uuid,text,text,text,jsonb,text,text)', 'EXECUTE'),
    'convert_service_role_exec', has_function_privilege('service_role', 'public.quote_convert_to_bookings(uuid,uuid,text,text,text,jsonb,text,text)', 'EXECUTE'),
    'erasure_anon_exec_must_be_false', has_function_privilege('anon', 'public.erasure_anonymise_person(uuid)', 'EXECUTE'),
    'erasure_authenticated_exec_must_be_false', has_function_privilege('authenticated', 'public.erasure_anonymise_person(uuid)', 'EXECUTE'),
    'erasure_service_role_exec', has_function_privilege('service_role', 'public.erasure_anonymise_person(uuid)', 'EXECUTE'));
  r := r || jsonb_build_object(
    'convert_public_grant_must_be_false', EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.quote_convert_to_bookings(uuid,uuid,text,text,text,jsonb,text,text)'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
    'erasure_public_grant_must_be_false', EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.erasure_anonymise_person(uuid)'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'));
  r := r || jsonb_build_object(
    'functions_security_definer_with_empty_search_path', (
      SELECT count(*) = 2 FROM pg_proc p
       WHERE p.oid IN ('public.quote_convert_to_bookings(uuid,uuid,text,text,text,jsonb,text,text)'::regprocedure,
                       'public.erasure_anonymise_person(uuid)'::regprocedure)
         AND p.prosecdef
         AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']));
  r := r || jsonb_build_object(
    'erasure_clears_description', (
      SELECT pg_get_functiondef('public.erasure_anonymise_person(uuid)'::regprocedure) LIKE '%SET description = NULL%'
         AND pg_get_functiondef('public.erasure_anonymise_person(uuid)'::regprocedure) LIKE '%SET tour_description = NULL%'));

  -- verdict; the exception rolls back every row inserted above
  IF (SELECT bool_and(
        CASE
          WHEN key LIKE '%\_must\_be\_false' THEN value = 'false'::jsonb
          WHEN key IN ('trip_type_check_def', 'convert_result', 'convert_error', 'tour_line_error') THEN true
          ELSE value = 'true'::jsonb
        END)
        FROM jsonb_each(r)) THEN
    RAISE EXCEPTION 'SMOKE_OK %', r;
  ELSE
    RAISE EXCEPTION 'SMOKE_FAIL %', r;
  END IF;
END
$smoke$;

-- STEP 2 (after the block): confirm nothing remains. Both must return 0.
--   SELECT count(*) FROM public.quotes WHERE reference LIKE 'Q-20270601-SMK96%';
--   SELECT count(*) FROM public.bookings WHERE booking_reference LIKE 'PRG-SMK096-%';
