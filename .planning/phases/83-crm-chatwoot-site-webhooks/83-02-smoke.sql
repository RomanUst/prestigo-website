-- 83-02 smoke: rolled-back proof of migration 077 (identity_chat). Run with the Supabase MCP
-- execute_sql AFTER apply_migration name 077_identity_chat. The whole block ends in
-- RAISE EXCEPTION, so every row it creates is rolled back (the booking insert fires the live sync
-- triggers, but pg_net requests are only sent after COMMIT). ONLY the message SMOKE_OK_83_02 means
-- success; any other message names the failed assertion (FAIL ...).
-- Marker addresses smoke+83-02-<n>@example.org, test phones +420700000083..85. Never sets the
-- GENERATED column bookings.pickup_utc.
DO $$
DECLARE
  i   uuid;
  j   uuid;
  b   uuid;
  r   record;
  n   integer;
  fn  text;
BEGIN
  -- (a) exactly one basis CHECK and it lists 'chat'
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.identity_emails'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%basis%';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL (a) basis constraint count %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.identity_emails'::regclass AND contype = 'c'
                    AND pg_get_constraintdef(oid) LIKE '%basis%'
                    AND pg_get_constraintdef(oid) LIKE '%chat%') THEN
    RAISE EXCEPTION 'FAIL (a) basis constraint does not list chat';
  END IF;

  -- (b) a stranger email -> new identity, basis chat, not a customer; lookup normalises
  SELECT * INTO r FROM public.identity_resolve_chat('smoke+83-02-1@example.org', NULL);
  IF r.outcome IS DISTINCT FROM 'resolved' OR r.identity_id IS NULL OR r.customer IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL (b) resolve_chat stranger: % % %', r.outcome, r.identity_id, r.customer;
  END IF;
  i := r.identity_id;
  IF NOT EXISTS (SELECT 1 FROM public.identity_emails e
                  WHERE e.email = 'smoke+83-02-1@example.org' AND e.identity_id = i AND e.basis = 'chat') THEN
    RAISE EXCEPTION 'FAIL (b) email row is not basis chat';
  END IF;
  SELECT * INTO r FROM public.identity_chat_lookup('  SMOKE+83-02-1@Example.ORG ');
  IF r.identity_id IS DISTINCT FROM i OR r.customer IS DISTINCT FROM false OR r.erasing IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL (b) chat_lookup mismatch: % % %', r.identity_id, r.customer, r.erasing;
  END IF;
  SELECT * INTO r FROM public.identity_resolve_chat(NULL, '+420700000083');
  IF r.outcome IS DISTINCT FROM 'no_identity' OR r.identity_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (b) a phone alone created an identity: %', r.outcome;
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_chat_lookup('smoke+83-02-unknown@example.org')) THEN
    RAISE EXCEPTION 'FAIL (b) lookup of an unknown email returned a row';
  END IF;

  -- (c) an email that already belongs to a booking identity -> that identity, customer true, no new row
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-83-02-1', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', '83-02', 'smoke+83-02-2@example.org', '+420700000099'
  ) RETURNING id INTO b;
  INSERT INTO public.contact_identities DEFAULT VALUES RETURNING id INTO j;
  INSERT INTO public.identity_emails (email, identity_id, basis) VALUES ('smoke+83-02-2@example.org', j, 'email');
  INSERT INTO public.booking_identity (booking_id, identity_id) VALUES (b, j);
  SELECT * INTO r FROM public.identity_resolve_chat('smoke+83-02-2@example.org', NULL);
  IF r.identity_id IS DISTINCT FROM j OR r.outcome IS DISTINCT FROM 'resolved' OR r.customer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL (c) booking identity: % % %', r.identity_id, r.outcome, r.customer;
  END IF;
  SELECT count(*) INTO n FROM public.identity_emails e WHERE e.identity_id = j;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL (c) email rows for the booking identity: %', n; END IF;
  SELECT * INTO r FROM public.identity_chat_lookup('smoke+83-02-2@example.org');
  IF r.identity_id IS DISTINCT FROM j OR r.customer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL (c) lookup of the booking identity: % %', r.identity_id, r.customer;
  END IF;

  -- (d) attach: an email owned elsewhere is skipped; a fresh email + phone attach
  SELECT * INTO r FROM public.identity_attach_chat_contact(i, 'smoke+83-02-2@example.org', NULL);
  IF r.email_outcome IS DISTINCT FROM 'owned_elsewhere' OR r.phone_outcome IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'FAIL (d) owned_elsewhere: % %', r.email_outcome, r.phone_outcome;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.identity_emails e
                  WHERE e.email = 'smoke+83-02-2@example.org' AND e.identity_id = j) THEN
    RAISE EXCEPTION 'FAIL (d) the email moved away from its owner';
  END IF;
  SELECT * INTO r FROM public.identity_attach_chat_contact(i, 'smoke+83-02-3@example.org', '+420700000083');
  IF r.email_outcome IS DISTINCT FROM 'attached' OR r.phone_outcome IS DISTINCT FROM 'attached' THEN
    RAISE EXCEPTION 'FAIL (d) attach: % %', r.email_outcome, r.phone_outcome;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.identity_emails e
                  WHERE e.email = 'smoke+83-02-3@example.org' AND e.identity_id = i AND e.basis = 'chat') THEN
    RAISE EXCEPTION 'FAIL (d) attached email is not basis chat';
  END IF;
  SELECT * INTO r FROM public.identity_attach_chat_contact(i, 'smoke+83-02-3@example.org', '+420 700 000 083');
  IF r.email_outcome IS DISTINCT FROM 'unchanged' OR r.phone_outcome IS DISTINCT FROM 'unchanged' THEN
    RAISE EXCEPTION 'FAIL (d) re-attach: % %', r.email_outcome, r.phone_outcome;
  END IF;
  SELECT * INTO r FROM public.identity_attach_chat_contact(j, NULL, '+420700000083');
  IF r.phone_outcome IS DISTINCT FROM 'owned_elsewhere' THEN
    RAISE EXCEPTION 'FAIL (d) phone owned elsewhere: %', r.phone_outcome;
  END IF;
  IF EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = '+420700000083') THEN
    RAISE EXCEPTION 'FAIL (d) attach wrote phone_flags';
  END IF;
  SELECT * INTO r FROM public.identity_attach_chat_contact(gen_random_uuid(), 'smoke+83-02-5@example.org', NULL);
  IF r.email_outcome IS DISTINCT FROM 'identity_missing' THEN
    RAISE EXCEPTION 'FAIL (d) identity_missing: %', r.email_outcome;
  END IF;

  -- (e) shared numbers never key a chat Contact
  INSERT INTO public.phone_flags (phone, shared, source) VALUES ('+420700000084', true, 'manual');
  IF public.identity_phone_usable('+420 700 000 084') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (e) a shared number is usable';
  END IF;
  IF public.identity_phone_usable('+420700000085') IS DISTINCT FROM '+420700000085' THEN
    RAISE EXCEPTION 'FAIL (e) a plain number is not usable';
  END IF;
  IF public.identity_phone_usable(NULL) IS NOT NULL OR public.identity_phone_usable('nope') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (e) junk phone is usable';
  END IF;
  SELECT * INTO r FROM public.identity_attach_chat_contact(i, NULL, '+420700000084');
  IF r.phone_outcome IS DISTINCT FROM 'shared' THEN
    RAISE EXCEPTION 'FAIL (e) attach of a shared phone: %', r.phone_outcome;
  END IF;

  -- (f) lookup by Chatwoot contact id
  UPDATE public.contact_identities SET chatwoot_contact_id = 9000083 WHERE id = i;
  SELECT count(*) INTO n FROM public.identity_by_chatwoot_contact(9000083);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL (f) by_chatwoot_contact rows: %', n; END IF;
  SELECT * INTO r FROM public.identity_by_chatwoot_contact(9000083);
  IF r.identity_id IS DISTINCT FROM i OR r.customer IS DISTINCT FROM false OR cardinality(r.emails) <> 2 THEN
    RAISE EXCEPTION 'FAIL (f) by_chatwoot_contact row: % % %', r.identity_id, r.customer, r.emails;
  END IF;

  -- (g) a basis outside the list is rejected
  BEGIN
    INSERT INTO public.identity_emails (email, identity_id, basis) VALUES ('smoke+83-02-4@example.org', i, 'bogus');
    RAISE EXCEPTION 'FAIL (g) bogus basis accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- (h) nobody but service_role
  FOREACH fn IN ARRAY ARRAY[
    'public.identity_resolve_chat(text,text)',
    'public.identity_attach_chat_contact(uuid,text,text)',
    'public.identity_chat_lookup(text)',
    'public.identity_by_chatwoot_contact(bigint)',
    'public.identity_phone_usable(text)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL (h) anon/authenticated can execute %', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL (h) service_role cannot execute %', fn;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'SMOKE_OK_83_02';
END;
$$;
