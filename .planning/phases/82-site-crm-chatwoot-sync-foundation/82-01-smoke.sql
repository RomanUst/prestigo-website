-- 82-01 smoke: rolled-back proof of migration 069 (identity core + booking/signup sync capture).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `069_identity_core_sync_triggers`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (bookings, auth user, profile,
-- identities, outbox rows, the integration_config row) is rolled back. ONLY the message
-- SMOKE_OK_82_01 means success; any other exception message names the failed assertion.
--
-- pg_net requests queued by the kick (and by the 063 calendar trigger) are only sent after COMMIT,
-- so a rolled-back run sends nothing. Statuses 'pending' / 'unpaid' are used for the inserts anyway.
-- Rows are marked with addresses smoke+82-01-<n>@rideprestigo.com (identity_normalize_email accepts
-- that domain). now() is constant inside the transaction, so every trigger call sees one bucket.
--
-- Columns filled = what buildBookingRow (lib/supabase.ts) writes; if the live schema reports another
-- NOT NULL bookings column without a default (82-LIVE-SCHEMA.md), add it to the INSERT lists.

DO $smoke$
DECLARE
  r        record;
  j        jsonb;
  v_bucket bigint := floor(extract(epoch FROM now()) / 90)::bigint;
  v_a      uuid;  -- (a) capture off
  v_b1     uuid;  -- (b) first booking, email A
  v_b2     uuid;  -- (c) second booking, same email in other spelling
  v_gnet   uuid;  -- (d) GNet placeholder
  v_aband  uuid;  -- (d) abandoned checkout
  v_b3     uuid;  -- (f) booking of a frozen identity
  v_b4     uuid;  -- (g) booking with the signup email
  v_b5     uuid;  -- (i) booking while the gate value is unreadable
  v_ident  uuid;
  v_ident2 uuid;
  v_uid    uuid := gen_random_uuid();
  v_n      integer;
  v_n2     integer;
  v_avail  timestamptz;
BEGIN
  -- ── Preconditions ─────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.bookings'::regclass
       AND t.tgname = 'bookings_crm_sync' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL pre: trigger bookings_crm_sync is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.customer_profiles'::regclass
       AND t.tgname = 'customer_profiles_crm_sync' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL pre: trigger customer_profiles_crm_sync is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_config WHERE key = 'crm_sync_start') THEN
    RAISE EXCEPTION 'FAIL pre: crm_sync_start is already set (capture is live); aborting smoke';
  END IF;

  -- ── (a) capture off: an online outbound insert enqueues nothing ───────────
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-A', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'A', 'smoke+82-01-a@rideprestigo.com', '+420000000001'
  ) RETURNING id INTO v_a;

  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE idempotency_key LIKE 'sync.booking:' || v_a::text || ':%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (a): capture off but % sync.booking row(s) were created', v_n;
  END IF;

  -- ── (b) capture on: one bucketed row, available at or after the bucket end ─
  INSERT INTO public.integration_config (key, value)
  VALUES ('crm_sync_start', (now() - interval '1 minute')::text);

  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-B1', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'B1', 'smoke+82-01-1@rideprestigo.com', '+420000000002'
  ) RETURNING id INTO v_b1;

  SELECT count(*), max(available_at) INTO v_n, v_avail
    FROM public.integration_outbox
   WHERE idempotency_key = 'sync.booking:' || v_b1::text || ':' || v_bucket::text
     AND event_type = 'sync.booking' AND aggregate_type = 'booking' AND aggregate_id = v_b1;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b): expected exactly one sync.booking row, found %', v_n;
  END IF;
  IF v_avail < to_timestamp((v_bucket + 1) * 90) THEN
    RAISE EXCEPTION 'FAIL (b): row available at % before the bucket end', v_avail;
  END IF;

  -- An UPDATE re-sending identical values enqueues nothing new.
  UPDATE public.bookings SET client_first_name = client_first_name, status = status WHERE id = v_b1;
  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE idempotency_key LIKE 'sync.booking:' || v_b1::text || ':%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b): identical-value UPDATE changed the row count to %', v_n;
  END IF;

  -- A real change in the same bucket reuses the pending row (one row, none lost).
  UPDATE public.bookings SET client_phone = '+420000000003' WHERE id = v_b1;
  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE idempotency_key LIKE 'sync.booking:' || v_b1::text || ':%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (b): same-bucket change produced % rows, expected 1', v_n;
  END IF;

  -- ── (c) resolver: same address in another spelling -> same identity ───────
  SELECT * INTO r FROM public.identity_resolve_booking(v_b1);
  IF r.outcome IS DISTINCT FROM 'resolved' OR r.identity_id IS NULL THEN
    RAISE EXCEPTION 'FAIL (c): B1 resolved to % / %', r.outcome, r.identity_id;
  END IF;
  v_ident := r.identity_id;

  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-B2', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'B2', '  SMOKE+82-01-1@RIDEPRESTIGO.COM ', '+420000000004'
  ) RETURNING id INTO v_b2;

  SELECT * INTO r FROM public.identity_resolve_booking(v_b2);
  IF r.outcome IS DISTINCT FROM 'resolved' OR r.identity_id IS DISTINCT FROM v_ident THEN
    RAISE EXCEPTION 'FAIL (c): B2 did not join identity % (got % / %)', v_ident, r.outcome, r.identity_id;
  END IF;
  SELECT count(*) INTO v_n FROM public.booking_identity WHERE identity_id = v_ident AND booking_id IN (v_b1, v_b2);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FAIL (c): booking_identity holds % of the 2 links', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.contact_identities WHERE id IN (
    SELECT identity_id FROM public.identity_emails WHERE email = 'smoke+82-01-1@rideprestigo.com');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (c): % identities hold the address', v_n;
  END IF;

  -- ── (h) read contracts (before B2 is anonymised in (e)) ───────────────────
  j := public.identity_person(v_ident);
  IF j IS NULL
     OR jsonb_array_length(j -> 'emails') <> 1
     OR (j -> 'emails' -> 0 ->> 'email') IS DISTINCT FROM 'smoke+82-01-1@rideprestigo.com'
     OR jsonb_array_length(j -> 'bookings') <> 2
     OR jsonb_array_length(j -> 'phones') <> 0
     OR jsonb_typeof(j -> 'profile') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'FAIL (h): identity_person shape unexpected';
  END IF;
  j := public.crm_booking(v_b1);
  IF j IS NULL OR NOT (j ? 'driver_name') OR NOT (j ? 'abandoned') OR (j ->> 'abandoned') <> 'false' THEN
    RAISE EXCEPTION 'FAIL (h): crm_booking is missing driver_name / abandoned';
  END IF;
  IF public.crm_booking(gen_random_uuid()) IS NOT NULL OR public.identity_person(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (h): a missing id must return NULL';
  END IF;

  -- ── (d) no usable email / abandoned checkout ──────────────────────────────
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-G', 'outbound', 'confirmed', 'pending', 'gnet', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'GNet', 'noreply@gnet.local', 'unknown'
  ) RETURNING id INTO v_gnet;
  SELECT * INTO r FROM public.identity_resolve_booking(v_gnet);
  IF r.outcome IS DISTINCT FROM 'no_identity' OR r.identity_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (d): GNet placeholder resolved to % / %', r.outcome, r.identity_id;
  END IF;

  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-AB', 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'Abandoned', 'smoke+82-01-ab@rideprestigo.com', '+420000000005'
  ) RETURNING id INTO v_aband;
  SELECT * INTO r FROM public.identity_resolve_booking(v_aband);
  IF r.outcome IS DISTINCT FROM 'abandoned' OR r.identity_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (d): abandoned checkout resolved to % / %', r.outcome, r.identity_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_emails WHERE email = 'smoke+82-01-ab@rideprestigo.com') THEN
    RAISE EXCEPTION 'FAIL (d): an abandoned checkout created an identity';
  END IF;

  -- ── (e) anonymised booking: no new row, link dropped ──────────────────────
  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE idempotency_key LIKE 'sync.booking:' || v_b2::text || ':%';
  UPDATE public.bookings
     SET client_email = 'erased-' || v_b2::text || '@erased.invalid', anonymised_at = now()
   WHERE id = v_b2;
  SELECT count(*) INTO v_n2 FROM public.integration_outbox WHERE idempotency_key LIKE 'sync.booking:' || v_b2::text || ':%';
  IF v_n2 <> v_n THEN
    RAISE EXCEPTION 'FAIL (e): anonymising B2 changed the outbox rows from % to %', v_n, v_n2;
  END IF;
  SELECT * INTO r FROM public.identity_resolve_booking(v_b2);
  IF r.outcome IS DISTINCT FROM 'no_identity' OR r.previous_identity_id IS DISTINCT FROM v_ident THEN
    RAISE EXCEPTION 'FAIL (e): anonymised B2 resolved to % (previous %)', r.outcome, r.previous_identity_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_identity WHERE booking_id = v_b2) THEN
    RAISE EXCEPTION 'FAIL (e): the booking_identity row of B2 is still there';
  END IF;

  -- ── (f) erasure freeze: a frozen identity neither links nor drops ─────────
  UPDATE public.contact_identities SET erasing_at = now() WHERE id = v_ident;
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-B3', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'B3', 'smoke+82-01-1@rideprestigo.com', '+420000000006'
  ) RETURNING id INTO v_b3;
  SELECT * INTO r FROM public.identity_resolve_booking(v_b3);
  IF r.outcome IS DISTINCT FROM 'erasing' OR r.identity_id IS DISTINCT FROM v_ident THEN
    RAISE EXCEPTION 'FAIL (f): frozen identity resolved to % / %', r.outcome, r.identity_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_identity WHERE booking_id = v_b3) THEN
    RAISE EXCEPTION 'FAIL (f): a booking was linked to a frozen identity';
  END IF;

  -- ── (g) signup capture + user resolver ────────────────────────────────────
  INSERT INTO auth.users (
    id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_uid, 'authenticated', 'authenticated', 'smoke+82-01-c@rideprestigo.com', '', '', '', ''
  );
  INSERT INTO public.customer_profiles (user_id, full_name) VALUES (v_uid, 'Smoke C');

  SELECT count(*) INTO v_n
    FROM public.integration_outbox
   WHERE idempotency_key = 'sync.signup:' || v_uid::text || ':' || v_bucket::text
     AND event_type = 'sync.signup' AND aggregate_type = 'user' AND aggregate_id = v_uid;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (g): expected exactly one sync.signup row, found %', v_n;
  END IF;

  SELECT * INTO r FROM public.identity_resolve_user(v_uid);
  IF r.outcome IS DISTINCT FROM 'resolved' OR r.identity_id IS NULL THEN
    RAISE EXCEPTION 'FAIL (g): user resolved to % / %', r.outcome, r.identity_id;
  END IF;
  v_ident2 := r.identity_id;
  IF NOT EXISTS (SELECT 1 FROM public.contact_identities WHERE id = v_ident2 AND user_id = v_uid) THEN
    RAISE EXCEPTION 'FAIL (g): contact_identities.user_id was not set';
  END IF;

  -- booking-after-signup with the same address joins the signup identity.
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-B4', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'B4', 'Smoke+82-01-C@rideprestigo.com', '+420000000007'
  ) RETURNING id INTO v_b4;
  SELECT * INTO r FROM public.identity_resolve_booking(v_b4);
  IF r.outcome IS DISTINCT FROM 'resolved' OR r.identity_id IS DISTINCT FROM v_ident2 THEN
    RAISE EXCEPTION 'FAIL (g): booking-after-signup did not join the signup identity (got % / %)', r.outcome, r.identity_id;
  END IF;

  -- ── (i) a broken gate value never fails the write ─────────────────────────
  UPDATE public.integration_config SET value = 'not-a-date' WHERE key = 'crm_sync_start';
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-01-B5', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'B5', 'smoke+82-01-5@rideprestigo.com', '+420000000008'
  ) RETURNING id INTO v_b5;
  SELECT count(*) INTO v_n FROM public.integration_outbox WHERE idempotency_key LIKE 'sync.booking:' || v_b5::text || ':%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (i): an unreadable crm_sync_start still enqueued % row(s)', v_n;
  END IF;
  UPDATE public.customer_profiles SET full_name = 'Smoke C2' WHERE user_id = v_uid;

  -- ── (j) privileges: nobody but service_role ───────────────────────────────
  IF has_function_privilege('anon', 'public.identity_resolve_booking(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_resolve_booking(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.identity_resolve_user(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_resolve_user(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.identity_person(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_person(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.crm_booking(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.identity_resolve_core(text, text, text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_resolve_core(text, text, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.enqueue_booking_sync()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.enqueue_profile_sync()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL (j): anon/authenticated can execute a 069 function';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.identity_resolve_booking(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL (j): service_role cannot execute identity_resolve_booking';
  END IF;
  IF has_table_privilege('anon', 'public.contact_identities', 'SELECT')
     OR has_table_privilege('authenticated', 'public.contact_identities', 'SELECT')
     OR has_table_privilege('anon', 'public.identity_emails', 'SELECT')
     OR has_table_privilege('authenticated', 'public.booking_identity', 'SELECT')
     OR has_table_privilege('authenticated', 'public.phone_flags', 'SELECT')
     OR has_table_privilege('authenticated', 'public.identity_phones', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL (j): anon/authenticated can read an identity table';
  END IF;

  -- Everything above is rolled back by this exception.
  RAISE EXCEPTION 'SMOKE_OK_82_01';
END
$smoke$;
