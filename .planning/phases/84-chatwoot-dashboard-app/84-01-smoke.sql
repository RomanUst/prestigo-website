-- 84-01 smoke: rolled-back proof of migration 080 (panel_bookings, the read-only Chatwoot Dashboard App RPC).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `080_panel_bookings`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (bookings, identities, drivers,
-- chat leads and conversations, the phone flag) is rolled back. ONLY the message SMOKE_OK_84_01
-- means success; any other exception message names the failed assertion (SMOKE_FAIL_<step>).
--
-- Identity rows are NOT created by the bookings trigger (069 only enqueues an outbox row, and only
-- when integration_config.crm_sync_start exists). The block therefore calls
-- public.identity_resolve_booking(id), the same resolver the sync uses, for every booking it needs
-- linked; the abandoned (F) and anonymised (G) rows are linked by hand so the RPC filters are tested
-- rather than the resolver's.
--
-- Fixture for identity A (client_email smoke-84-a@example.test, phone +420700900002):
--   A confirmed  one_way    amount_eur 120                      pickup now + 3 days
--   B completed  round_trip amount_eur NULL, 2500 + 2500 CZK    pickup now - 10 days
--   C confirmed  leg return amount_eur 50                       pickup now + 10 days
--   D cancelled  one_way    amount_eur 80                       pickup now + 1 day
--   E pending    one_way    amount_eur 90                       pickup_utc NULL (date 2031-01-01)
--   F unpaid online, no payment_link_id (abandoned checkout)    linked by hand, must not appear
--   G confirmed, anonymised_at set                              linked by hand, must not appear
-- Expected: total 5, trip_count 3 (A, B, E), spent_eur 320 (A 120 + B round(5000 * 0.04) = 200).
-- Identity H (smoke-84-b@example.test, phone +420700900001) has one booking, for the phone rules.
--
-- Columns filled = the 82-01 smoke list plus the panel columns; if the live schema reports another
-- NOT NULL bookings column without a default (82-LIVE-SCHEMA.md), add it to the INSERT lists.

DO $smoke$
DECLARE
  j        jsonb;
  v_a      uuid;
  v_f      uuid;
  v_g      uuid;
  v_h      uuid;
  v_ident  uuid;
  v_identb uuid;
  v_driver uuid;
  v_lead1  uuid;
  v_lead2  uuid;
  v_lead3  uuid;
  v_refs   text;
  r        record;
BEGIN
  -- ── Preconditions ─────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.chat_conversations WHERE conversation_id IN (9000001, 9000002, 9000003)) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre conversation ids 9000001..9000003 already exist';
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_emails WHERE email IN ('smoke-84-a@example.test', 'smoke-84-b@example.test')) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre smoke identities already exist';
  END IF;
  IF EXISTS (SELECT 1 FROM public.phone_flags WHERE phone IN ('+420700900001', '+420700900002')) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre smoke phones already flagged';
  END IF;

  -- ── (a) seed identity A: bookings A..G ────────────────────────────────────
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time, pickup_utc,
    vehicle_class, amount_czk, amount_eur, outbound_amount_czk, return_amount_czk,
    payment_link_id, anonymised_at, operator_notes, special_requests, flight_number,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES
    ('SMK-84-01-A', 'outbound', 'confirmed', 'confirmed', 'online', 'one_way',
     'Smoke origin', 'Smoke destination', 2, 1, '2030-01-15', '10:00', now() + interval '3 days',
     'business', 3000, 120, NULL, NULL,
     NULL, NULL, 'SMOKE-SECRET-NOTE', 'child seat', 'SM123',
     'Smokefirst', 'Smokelast', 'smoke-84-a@example.test', '+420700900002'),
    ('SMK-84-01-B', 'outbound', 'confirmed', 'completed', 'online', 'round_trip',
     'Smoke origin', 'Smoke destination', 2, 1, '2030-01-16', '10:00', now() - interval '10 days',
     'business', 5000, NULL, 2500, 2500,
     NULL, NULL, 'SMOKE-SECRET-NOTE', NULL, NULL,
     'Smokefirst', 'Smokelast', 'smoke-84-a@example.test', '+420700900002'),
    ('SMK-84-01-C', 'return', 'confirmed', 'confirmed', 'online', 'round_trip',
     'Smoke destination', 'Smoke origin', 2, 1, '2030-01-17', '10:00', now() + interval '10 days',
     'business', 2500, 50, NULL, NULL,
     NULL, NULL, 'SMOKE-SECRET-NOTE', NULL, NULL,
     'Smokefirst', 'Smokelast', 'smoke-84-a@example.test', '+420700900002'),
    ('SMK-84-01-D', 'outbound', 'confirmed', 'cancelled', 'online', 'one_way',
     'Smoke origin', 'Smoke destination', 2, 1, '2030-01-18', '10:00', now() + interval '1 day',
     'business', 2000, 80, NULL, NULL,
     NULL, NULL, 'SMOKE-SECRET-NOTE', NULL, NULL,
     'Smokefirst', 'Smokelast', 'smoke-84-a@example.test', '+420700900002'),
    ('SMK-84-01-E', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
     'Smoke origin', 'Smoke destination', 2, 1, '2031-01-01', '09:00', NULL,
     'business', 2250, 90, NULL, NULL,
     NULL, NULL, 'SMOKE-SECRET-NOTE', NULL, NULL,
     'Smokefirst', 'Smokelast', 'smoke-84-a@example.test', '+420700900002'),
    ('SMK-84-01-F', 'outbound', 'confirmed', 'unpaid', 'online', 'one_way',
     'Smoke origin', 'Smoke destination', 2, 1, '2030-01-19', '10:00', now() + interval '4 days',
     'business', 1000, 40, NULL, NULL,
     NULL, NULL, 'SMOKE-SECRET-NOTE', NULL, NULL,
     'Smokefirst', 'Smokelast', 'smoke-84-a@example.test', '+420700900002'),
    ('SMK-84-01-G', 'outbound', 'confirmed', 'confirmed', 'online', 'one_way',
     'Smoke origin', 'Smoke destination', 2, 1, '2030-01-20', '10:00', now() + interval '5 days',
     'business', 1000, 40, NULL, NULL,
     NULL, now(), 'SMOKE-SECRET-NOTE', NULL, NULL,
     'Smokefirst', 'Smokelast', 'smoke-84-a@example.test', '+420700900002');

  -- Resolve A..E through the real resolver; all five must land on one identity.
  FOR r IN
    SELECT b.id, b.booking_reference
      FROM public.bookings b
     WHERE b.booking_reference IN ('SMK-84-01-A', 'SMK-84-01-B', 'SMK-84-01-C', 'SMK-84-01-D', 'SMK-84-01-E')
     ORDER BY b.booking_reference
  LOOP
    PERFORM 1 FROM public.identity_resolve_booking(r.id) x WHERE x.outcome = 'resolved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SMOKE_FAIL_a1 % did not resolve', r.booking_reference;
    END IF;
  END LOOP;

  SELECT bi.identity_id INTO v_ident
    FROM public.booking_identity bi
    JOIN public.bookings b ON b.id = bi.booking_id
   WHERE b.booking_reference = 'SMK-84-01-A';
  IF v_ident IS NULL THEN RAISE EXCEPTION 'SMOKE_FAIL_a2 no identity for A'; END IF;

  -- F (abandoned) and G (anonymised) are linked by hand: the RPC itself must filter them out.
  SELECT id INTO v_f FROM public.bookings WHERE booking_reference = 'SMK-84-01-F';
  SELECT id INTO v_g FROM public.bookings WHERE booking_reference = 'SMK-84-01-G';
  INSERT INTO public.booking_identity (booking_id, identity_id) VALUES (v_f, v_ident), (v_g, v_ident);

  -- A driver on A: the accepted assignment wins over a newer pending one; only the name is projected.
  SELECT id INTO v_a FROM public.bookings WHERE booking_reference = 'SMK-84-01-A';
  INSERT INTO public.drivers (name, email, phone)
  VALUES ('Smoke Driver 84', 'smoke-84-driver@example.test', '+420700900099')
  RETURNING id INTO v_driver;
  INSERT INTO public.driver_assignments (booking_id, driver_id, status, trip_progress, trip_progress_updated_at, created_at)
  VALUES (v_a, v_driver, 'accepted', 'en_route', now(), now() - interval '2 hours');
  INSERT INTO public.driver_assignments (booking_id, driver_id, status, created_at)
  VALUES (v_a, v_driver, 'pending', now() - interval '1 hour');

  -- ── (b) email lookup in another spelling ──────────────────────────────────
  j := public.panel_bookings(' SMOKE-84-A@Example.test ', NULL, 9000001);
  IF (j ->> 'identity_found')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'SMOKE_FAIL_b1 identity_found %', j ->> 'identity_found'; END IF;
  IF (j ->> 'total')::integer <> 5 THEN RAISE EXCEPTION 'SMOKE_FAIL_b2 total %', j ->> 'total'; END IF;
  IF (j ->> 'trip_count')::integer <> 3 THEN RAISE EXCEPTION 'SMOKE_FAIL_b3 trip_count %', j ->> 'trip_count'; END IF;
  IF (j ->> 'spent_eur')::integer <> 320 THEN RAISE EXCEPTION 'SMOKE_FAIL_b4 spent_eur %', j ->> 'spent_eur'; END IF;
  IF jsonb_array_length(j -> 'rows') <> 5 THEN RAISE EXCEPTION 'SMOKE_FAIL_b5 rows %', jsonb_array_length(j -> 'rows'); END IF;
  IF (j ->> 'phone_mismatch')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'SMOKE_FAIL_b6 phone_mismatch'; END IF;

  SELECT string_agg(e ->> 'booking_reference', ',' ORDER BY ord)
    INTO v_refs
    FROM jsonb_array_elements(j -> 'rows') WITH ORDINALITY AS t(e, ord);
  IF v_refs <> 'SMK-84-01-C,SMK-84-01-A,SMK-84-01-D,SMK-84-01-B,SMK-84-01-E' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b7 order %', v_refs;
  END IF;
  IF v_refs LIKE '%-F%' OR v_refs LIKE '%-G%' THEN RAISE EXCEPTION 'SMOKE_FAIL_b8 abandoned/anonymised row leaked'; END IF;

  -- Allowlist: no contact data, notes, payment ids or driver contact anywhere in the payload.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(j -> 'rows') e
     WHERE jsonb_exists_any(e, ARRAY[
             'client_email', 'client_phone', 'client_first_name', 'client_last_name',
             'operator_notes', 'payment_intent_id', 'trip_token', 'driver_phone', 'driver_email'
           ])
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b9 forbidden key in a row';
  END IF;
  IF (SELECT count(DISTINCT k) FROM jsonb_array_elements(j -> 'rows') e, jsonb_object_keys(e) k) <> 24 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b10 row key count is not 24';
  END IF;
  IF j::text LIKE '%SMOKE-SECRET-NOTE%' OR j::text LIKE '%Smokefirst%' OR j::text LIKE '%+420700900099%'
     OR j::text LIKE '%smoke-84-driver%' OR j::text LIKE '%smoke-84-a@example.test%' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b11 sensitive value in payload';
  END IF;

  -- Driver projection: accepted assignment only, name and progress.
  SELECT e INTO j FROM jsonb_array_elements(public.panel_bookings('smoke-84-a@example.test', NULL, 9000001) -> 'rows') e
   WHERE e ->> 'booking_reference' = 'SMK-84-01-A';
  IF j ->> 'driver_name' IS DISTINCT FROM 'Smoke Driver 84' OR j ->> 'trip_progress' IS DISTINCT FROM 'en_route'
     OR j ->> 'trip_progress_updated_at' IS NULL OR j ->> 'special_requests' IS DISTINCT FROM 'child seat' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b12 driver or request projection %', j;
  END IF;
  SELECT e INTO j FROM jsonb_array_elements(public.panel_bookings('smoke-84-a@example.test', NULL, 9000001) -> 'rows') e
   WHERE e ->> 'booking_reference' = 'SMK-84-01-B';
  IF j -> 'driver_name' <> 'null'::jsonb OR j -> 'amount_eur' <> 'null'::jsonb OR (j ->> 'outbound_amount_czk')::integer <> 2500 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b13 null mapping %', j;
  END IF;

  -- ── (c) phone rules ───────────────────────────────────────────────────────
  -- Identity H: its own email and phone; the resolver attaches the number to H.
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time, pickup_utc,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-84-01-H', 'outbound', 'confirmed', 'confirmed', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-02-01', '10:00', now() + interval '2 days',
    'business', 1000, 40,
    'Smokeh', 'Smokeh', 'smoke-84-b@example.test', '+420700900001'
  ) RETURNING id INTO v_h;
  PERFORM 1 FROM public.identity_resolve_booking(v_h) x WHERE x.outcome = 'resolved';
  IF NOT FOUND THEN RAISE EXCEPTION 'SMOKE_FAIL_c0 H did not resolve'; END IF;
  SELECT identity_id INTO v_identb FROM public.booking_identity WHERE booking_id = v_h;
  IF v_identb IS NULL OR v_identb = v_ident THEN RAISE EXCEPTION 'SMOKE_FAIL_c0b H shares the identity of A'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.identity_phones WHERE identity_id = v_identb AND phone = '+420700900001') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c0c phone not attached to H';
  END IF;
  IF EXISTS (SELECT 1 FROM public.phone_flags WHERE phone = '+420700900001') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c0d phone already flagged shared';
  END IF;

  -- phone only -> H's rows
  j := public.panel_bookings(NULL, '+420700900001', 9000001);
  IF (j ->> 'identity_found')::boolean IS NOT TRUE OR (j ->> 'total')::integer <> 1
     OR j -> 'rows' -> 0 ->> 'booking_reference' <> 'SMK-84-01-H' OR (j ->> 'phone_mismatch')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c1 phone-only lookup %', j;
  END IF;

  -- a formatted number normalises to the same E.164 value; A owns +420700900002
  j := public.panel_bookings(NULL, '+420 700 900 002', 9000001);
  IF (j ->> 'total')::integer <> 5 OR (j ->> 'identity_found')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c2 formatted phone lookup %', j;
  END IF;

  -- email of A + phone of H -> A's rows, mismatch true, nothing of H
  j := public.panel_bookings('smoke-84-a@example.test', '+420700900001', 9000001);
  IF (j ->> 'total')::integer <> 5 OR (j ->> 'phone_mismatch')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c3 mismatch lookup %', j;
  END IF;
  IF j::text LIKE '%SMK-84-01-H%' OR j::text LIKE '%smoke-84-b@example.test%' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c4 identity H leaked into the result';
  END IF;

  -- email of A + phone of A -> no mismatch
  j := public.panel_bookings('smoke-84-a@example.test', '+420700900002', 9000001);
  IF (j ->> 'phone_mismatch')::boolean IS NOT FALSE OR (j ->> 'total')::integer <> 5 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c5 same-owner lookup %', j;
  END IF;

  -- unknown email, phone of H -> falls back to H
  j := public.panel_bookings('nobody-84@example.test', '+420700900001', 9000001);
  IF (j ->> 'total')::integer <> 1 OR (j ->> 'phone_mismatch')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c6 unknown email + phone fallback %', j;
  END IF;

  -- a number flagged shared is never used
  INSERT INTO public.phone_flags (phone, shared, source) VALUES ('+420700900001', true, 'manual');
  j := public.panel_bookings(NULL, '+420700900001', 9000001);
  IF (j ->> 'identity_found')::boolean IS NOT FALSE OR (j ->> 'total')::integer <> 0 OR jsonb_array_length(j -> 'rows') <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c7 shared phone used %', j;
  END IF;
  j := public.panel_bookings('smoke-84-a@example.test', '+420700900001', 9000001);
  IF (j ->> 'phone_mismatch')::boolean IS NOT FALSE OR (j ->> 'total')::integer <> 5 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c8 shared phone produced a mismatch %', j;
  END IF;

  -- nothing usable at all
  j := public.panel_bookings(NULL, NULL, 9000001);
  IF (j ->> 'identity_found')::boolean IS NOT FALSE OR jsonb_array_length(j -> 'rows') <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c9 empty lookup %', j;
  END IF;

  -- ── (d) Lead pointer ──────────────────────────────────────────────────────
  INSERT INTO public.chat_leads (lead_ref, person_key, identity_id, espo_lead_id, open)
  VALUES ('chat:' || gen_random_uuid()::text, 'i:' || v_ident::text, v_ident, 'aaaaaaaaaaaaaaaaa', true)
  RETURNING id INTO v_lead1;
  INSERT INTO public.chat_conversations (conversation_id, identity_id, chat_lead_id, espo_lead_id, outcome)
  VALUES (9000001, v_ident, v_lead1, 'aaaaaaaaaaaaaaaaa', 'lead_created');

  j := public.panel_bookings('smoke-84-a@example.test', NULL, 9000001);
  IF j ->> 'espo_lead_id' IS DISTINCT FROM 'aaaaaaaaaaaaaaaaa' THEN RAISE EXCEPTION 'SMOKE_FAIL_d1 conversation lead %', j ->> 'espo_lead_id'; END IF;
  -- no conversation row: the identity's newest open lead
  j := public.panel_bookings('smoke-84-a@example.test', NULL, 9000002);
  IF j ->> 'espo_lead_id' IS DISTINCT FROM 'aaaaaaaaaaaaaaaaa' THEN RAISE EXCEPTION 'SMOKE_FAIL_d2 identity lead %', j ->> 'espo_lead_id'; END IF;

  -- closed lead -> no pointer
  UPDATE public.chat_leads SET open = false, closed_reason = 'dead', closed_at = now() WHERE id = v_lead1;
  j := public.panel_bookings('smoke-84-a@example.test', NULL, 9000001);
  IF j -> 'espo_lead_id' <> 'null'::jsonb THEN RAISE EXCEPTION 'SMOKE_FAIL_d3 closed lead still returned %', j ->> 'espo_lead_id'; END IF;

  -- a newer open lead is found through the identity
  INSERT INTO public.chat_leads (lead_ref, person_key, identity_id, espo_lead_id, open)
  VALUES ('chat:' || gen_random_uuid()::text, 'i:' || v_ident::text, v_ident, 'ccccccccccccccccc', true)
  RETURNING id INTO v_lead2;
  j := public.panel_bookings('smoke-84-a@example.test', NULL, 9000002);
  IF j ->> 'espo_lead_id' IS DISTINCT FROM 'ccccccccccccccccc' THEN RAISE EXCEPTION 'SMOKE_FAIL_d4 newest lead %', j ->> 'espo_lead_id'; END IF;

  -- an unknown person with a chat Lead still gets the pointer, with no rows
  INSERT INTO public.chat_leads (lead_ref, person_key, identity_id, espo_lead_id, open)
  VALUES ('chat:' || gen_random_uuid()::text, 'c:9000003', NULL, 'bbbbbbbbbbbbbbbbb', true)
  RETURNING id INTO v_lead3;
  INSERT INTO public.chat_conversations (conversation_id, chat_lead_id, espo_lead_id, outcome)
  VALUES (9000003, v_lead3, 'bbbbbbbbbbbbbbbbb', 'lead_created');
  j := public.panel_bookings('nobody-84@example.test', NULL, 9000003);
  IF (j ->> 'identity_found')::boolean IS NOT FALSE OR j ->> 'espo_lead_id' IS DISTINCT FROM 'bbbbbbbbbbbbbbbbb'
     OR jsonb_array_length(j -> 'rows') <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_d5 lead-only person %', j;
  END IF;

  -- ── (e) erasing: nothing leaves, not even the Lead id ─────────────────────
  UPDATE public.chat_conversations SET chat_lead_id = v_lead2, espo_lead_id = 'ccccccccccccccccc' WHERE conversation_id = 9000001;
  UPDATE public.contact_identities SET erasing_at = now() WHERE id = v_ident;
  j := public.panel_bookings('smoke-84-a@example.test', NULL, 9000001);
  IF (j ->> 'identity_found')::boolean IS NOT FALSE OR (j ->> 'total')::integer <> 0 OR (j ->> 'trip_count')::integer <> 0
     OR (j ->> 'spent_eur')::integer <> 0 OR jsonb_array_length(j -> 'rows') <> 0 OR j -> 'espo_lead_id' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e1 erasing identity leaked %', j;
  END IF;
  -- the conversation lead of an erasing identity is not exposed through another contact either
  j := public.panel_bookings('nobody-84@example.test', NULL, 9000001);
  IF j -> 'espo_lead_id' <> 'null'::jsonb THEN RAISE EXCEPTION 'SMOKE_FAIL_e2 erasing lead exposed %', j ->> 'espo_lead_id'; END IF;
  -- phone path to an erasing identity
  j := public.panel_bookings(NULL, '+420700900002', 9000002);
  IF (j ->> 'identity_found')::boolean IS NOT FALSE OR (j ->> 'total')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e3 phone reached an erasing identity %', j;
  END IF;

  -- ── (f) privileges and shape ──────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.panel_bookings(text,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f1 anon can execute';
  END IF;
  IF has_function_privilege('authenticated', 'public.panel_bookings(text,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f2 authenticated can execute';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.panel_bookings(text,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f3 service_role cannot execute';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.panel_bookings(text,text,bigint)'::regprocedure
       AND p.provolatile = 's' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f4 not STABLE SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.panel_bookings(text,text,bigint)'::regprocedure
       AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f5 search_path is not pinned to empty';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_84_01';
END;
$smoke$;
