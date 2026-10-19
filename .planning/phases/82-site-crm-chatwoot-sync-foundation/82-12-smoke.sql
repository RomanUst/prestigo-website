-- 82-12 smoke: rolled-back proof of migration 075 (GDPR erasure: scope, preview, confirm/freeze, anonymise, audit).
-- Run with the Supabase MCP execute_sql AFTER apply_migration name 075_erasure. One DO block; it ends in
-- RAISE EXCEPTION, so every row (auth user, bookings, identity, outbox, audit) is rolled back. ONLY the
-- message SMOKE_OK_82_12 means success; any other message names the failed assertion (FAIL <label>).
-- Precondition: integration_config crm_sync_start absent. Marker data: smoke+82-12@rideprestigo.com.
DO $smoke$
DECLARE
  e text := 'smoke+82-12@rideprestigo.com';
  hm text := repeat('a', 64);
  ph text := '+420777912001';
  actor uuid := gen_random_uuid();
  uid uuid := gen_random_uuid();
  sc jsonb; cn jsonb; r record; ident uuid; bk uuid; bk2 uuid; req uuid; req2 uuid; ok boolean := false; sig text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.integration_config WHERE key = 'crm_sync_start') THEN
    RAISE EXCEPTION 'FAIL pre: crm_sync_start is set';
  END IF;
  IF to_regprocedure('public.erasure_anonymise_person(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL pre: apply 075 first';
  END IF;

  -- Fixture: account, one upcoming booking with every personal field, inquiry, quote request, audit rows.
  INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES (uid, 'authenticated', 'authenticated', e, '', '', '', '');
  INSERT INTO public.customer_profiles (user_id, full_name) VALUES (uid, 'Smoke Erase');
  INSERT INTO public.bookings (booking_reference, leg, booking_type, status, booking_source, trip_type, origin_address,
    destination_address, origin_lat, origin_lng, passengers, luggage, pickup_date, pickup_time, vehicle_class,
    amount_czk, amount_eur, client_first_name, client_last_name, client_email, client_phone, flight_number,
    special_requests, operator_notes, user_id)
  VALUES ('SMK-82-12', 'outbound', 'confirmed', 'pending', 'online', 'one_way', 'Smoke street 1', 'Smoke street 2',
    50.1, 14.4, 1, 0, '2030-01-15', '10:00', 'business', 1000, 40, 'Smoke', 'Erase',
    e, ph, 'OK123', 'wheelchair', 'calls twice', uid) RETURNING id INTO bk;
  INSERT INTO public.inquiries (kind, email, name, phone, payload) VALUES ('contact', e, 'Smoke Erase', ph, '{"m":"hi"}');
  INSERT INTO public.quote_leads (email, quote_payload) VALUES (e, '{"x":1}');
  INSERT INTO public.booking_edit_audit_log (booking_id, field, old_value, new_value)
  VALUES (bk, 'client_phone', ph, '+420777912002'), (bk, 'amount_czk', '900', '1000');
  INSERT INTO public.email_log (booking_id, email_type, recipient) VALUES (bk, 'confirmation', e);
  INSERT INTO public.gnet_bookings (booking_id, gnet_res_no, transaction_id, raw_payload)
  VALUES (bk, 'SMK-GNET-82-12', 'SMK-TX-82-12', '{"name":"Smoke"}');

  SELECT * INTO r FROM public.identity_resolve_booking(bk);
  IF r.outcome <> 'resolved' THEN RAISE EXCEPTION 'FAIL resolve booking %', r.outcome; END IF;
  ident := r.identity_id;
  SELECT * INTO r FROM public.identity_resolve_user(uid);
  IF r.identity_id IS DISTINCT FROM ident THEN RAISE EXCEPTION 'FAIL resolve user joins the identity'; END IF;

  -- Scope (email and phone searches, invalid input, shared number).
  sc := public.erasure_scope(e, NULL);
  IF sc ->> 'outcome' <> 'ok' OR (sc #>> '{counts,bookings}')::int <> 1 OR (sc #>> '{counts,inquiries}')::int <> 1
     OR (sc #>> '{counts,upcoming}')::int <> 1 OR (sc #>> '{counts,quote_leads}')::int <> 1
     OR (sc #>> '{counts,has_account}')::boolean IS NOT TRUE OR sc ->> 'identity_id' <> ident::text
     OR NOT jsonb_exists(sc -> 'emails', e) OR NOT jsonb_exists(sc -> 'phones', ph) THEN
    RAISE EXCEPTION 'FAIL scope by email: %', sc;
  END IF;
  IF public.erasure_scope(NULL, ph) ->> 'outcome' <> 'ok' THEN RAISE EXCEPTION 'FAIL scope by phone'; END IF;
  IF public.erasure_scope('nope', NULL) ->> 'outcome' <> 'invalid' THEN RAISE EXCEPTION 'FAIL scope invalid'; END IF;
  IF public.erasure_scope('smoke+82-12-none@rideprestigo.com', NULL) ->> 'outcome' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL scope not_found';
  END IF;
  INSERT INTO public.phone_flags (phone, shared, source) VALUES ('+420777912999', true, 'manual');
  IF public.erasure_scope(NULL, '+420777912999') ->> 'outcome' <> 'shared_phone' THEN RAISE EXCEPTION 'FAIL shared phone'; END IF;

  -- Preview (TTL capped at 1 h) and confirm (actor, freeze, enqueue).
  req := public.erasure_preview_create(actor, hm, sc, 999999);
  IF (SELECT expires_at FROM public.erasure_requests WHERE id = req) > now() + interval '3601 seconds' THEN
    RAISE EXCEPTION 'FAIL ttl cap';
  END IF;
  IF public.erasure_confirm(req, gen_random_uuid()) <> 'actor_mismatch' THEN RAISE EXCEPTION 'FAIL actor_mismatch'; END IF;
  IF public.erasure_confirm(req, actor) <> 'confirmed' THEN RAISE EXCEPTION 'FAIL confirm'; END IF;
  req2 := public.erasure_preview_create(actor, repeat('b', 64), sc, 600);
  IF public.erasure_confirm(req2, actor) <> 'already_in_progress' THEN RAISE EXCEPTION 'FAIL second confirm'; END IF;
  IF public.erasure_scope(e, NULL) ->> 'outcome' <> 'already_in_progress' THEN RAISE EXCEPTION 'FAIL scope in progress'; END IF;
  IF (SELECT erasing_at FROM public.contact_identities WHERE id = ident) IS NULL THEN RAISE EXCEPTION 'FAIL freeze'; END IF;
  IF (SELECT count(*) FROM public.integration_outbox WHERE idempotency_key = 'erase.person:' || req
        AND event_type = 'erase.person' AND aggregate_type = 'person' AND aggregate_id = ident) <> 1 THEN
    RAISE EXCEPTION 'FAIL erase.person outbox row';
  END IF;
  INSERT INTO public.bookings (booking_reference, leg, booking_type, status, booking_source, trip_type, origin_address,
    destination_address, passengers, luggage, pickup_date, pickup_time, vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone)
  VALUES ('SMK-82-12-B', 'outbound', 'confirmed', 'pending', 'online', 'one_way', 'x', 'y', 1, 0, '2030-02-01', '09:00',
    'business', 500, 20, 'Smoke', 'Late', e, ph) RETURNING id INTO bk2;
  SELECT * INTO r FROM public.identity_resolve_booking(bk2);
  IF r.outcome <> 'erasing' THEN RAISE EXCEPTION 'FAIL resolver while erasing: %', r.outcome; END IF;

  -- The database refuses to anonymise before the CRM steps and a verified verify pass are recorded.
  BEGIN
    PERFORM public.erasure_anonymise_person(req);
    ok := true;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CRM steps%' THEN RAISE; END IF;
  END;
  IF ok THEN RAISE EXCEPTION 'FAIL anonymise ran before the CRM steps'; END IF;
  PERFORM public.erasure_record_step(req, 'chatwoot', '{"chatwoot_contacts_deleted":1}');
  PERFORM public.erasure_record_step(req, 'espocrm', '{"espo_contacts_deleted":1}');
  PERFORM public.erasure_record_step(req, 'verify', '{"verified":true,"verify_remaining":0}');
  IF (SELECT status FROM public.erasure_requests WHERE id = req) <> 'running' THEN RAISE EXCEPTION 'FAIL running'; END IF;

  -- Anonymise (both bookings of the email), then every assertion on what stays and what goes.
  cn := public.erasure_anonymise_person(req);
  IF (cn ->> 'bookings_anonymised')::int <> 2 OR (cn ->> 'inquiries_deleted')::int <> 1
     OR (cn ->> 'quote_leads_deleted')::int <> 1 OR (cn ->> 'identity_deleted')::int <> 1
     OR (cn ->> 'audit_values_scrubbed')::int <> 1 OR (cn ->> 'email_log_scrubbed')::int <> 1
     OR (cn ->> 'gnet_payloads_scrubbed')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL counts %', cn;
  END IF;
  SELECT * INTO r FROM public.bookings WHERE id = bk;
  IF r.anonymised_at IS NULL OR r.client_email NOT LIKE 'erased-%@erased.invalid' OR r.client_first_name <> ''
     OR r.client_last_name <> '' OR r.client_phone <> '' OR r.special_requests IS NOT NULL OR r.operator_notes IS NOT NULL
     OR r.origin_address IS NOT NULL OR r.destination_address IS NOT NULL OR r.origin_lat IS NOT NULL
     OR r.flight_number IS NOT NULL OR r.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL booking not anonymised';
  END IF;
  IF r.booking_reference <> 'SMK-82-12' OR r.amount_czk <> 1000 OR r.amount_eur <> 40 OR r.vehicle_class <> 'business'
     OR r.pickup_date <> '2030-01-15' THEN
    RAISE EXCEPTION 'FAIL accounting columns changed';
  END IF;
  IF (SELECT count(*) FROM public.integration_outbox WHERE idempotency_key LIKE 'sync.booking:' || bk || '%') <> 0 THEN
    RAISE EXCEPTION 'FAIL sync.booking row after anonymising';
  END IF;
  IF (SELECT count(*) FROM public.inquiries WHERE email_normalized = e) <> 0
     OR (SELECT count(*) FROM public.quote_leads WHERE email = e) <> 0 THEN
    RAISE EXCEPTION 'FAIL inquiry or quote_lead left';
  END IF;
  IF (SELECT count(*) FROM public.booking_edit_audit_log WHERE booking_id = bk AND field = 'client_phone'
        AND old_value IS NULL AND new_value IS NULL) <> 1
     OR (SELECT count(*) FROM public.booking_edit_audit_log WHERE booking_id = bk AND field = 'amount_czk'
        AND old_value = '900' AND new_value = '1000') <> 1 THEN
    RAISE EXCEPTION 'FAIL audit values';
  END IF;
  IF (SELECT recipient FROM public.email_log WHERE booking_id = bk) <> 'erased@erased.invalid'
     OR (SELECT raw_payload FROM public.gnet_bookings WHERE booking_id = bk) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL email_log or gnet payload';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contact_identities WHERE id = ident)
     OR EXISTS (SELECT 1 FROM public.identity_emails WHERE email = e)
     OR EXISTS (SELECT 1 FROM public.identity_phones WHERE phone = ph)
     OR EXISTS (SELECT 1 FROM public.booking_identity WHERE booking_id IN (bk, bk2)) THEN
    RAISE EXCEPTION 'FAIL identity rows left';
  END IF;
  IF public.erasure_anonymise_person(req) <> cn THEN RAISE EXCEPTION 'FAIL repeat anonymise is not idempotent'; END IF;

  -- Audit completion: only the hash, dates, steps, counts and verified flag remain.
  PERFORM public.erasure_record_step(req, 'auth', '{"account_deleted":1}');
  PERFORM public.erasure_complete(req, true, cn, 'completed');
  SELECT * INTO r FROM public.erasure_requests WHERE id = req;
  IF r.status <> 'completed' OR r.booking_ids <> '{}' OR r.inquiry_ids <> '{}' OR r.subject_emails <> '{}'
     OR r.subject_phones <> '{}' OR r.identity_id IS NOT NULL OR r.user_id IS NOT NULL OR r.email_hmac <> hm
     OR r.verified IS NOT TRUE OR r.completed_at IS NULL OR r.steps -> 'supabase' IS NULL THEN
    RAISE EXCEPTION 'FAIL audit row after completion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.erasure_log(10) l WHERE l.reference = left(hm, 10) AND l.reference ~ '^[0-9a-f]{10}$') THEN
    RAISE EXCEPTION 'FAIL erasure_log';
  END IF;

  -- Privileges and RLS.
  FOREACH sig IN ARRAY ARRAY['erasure_scope(text,text)', 'erasure_preview_create(uuid,text,jsonb,integer)',
    'erasure_confirm(uuid,uuid)', 'erasure_load(uuid)', 'erasure_record_step(uuid,text,jsonb)',
    'erasure_anonymise_person(uuid)', 'erasure_complete(uuid,boolean,jsonb,text)', 'erasure_log(integer)',
    'erasure_booking_ids(uuid,uuid,text[])', 'erasure_inquiry_ids(text[])'] LOOP
    IF has_function_privilege('anon', 'public.' || sig, 'EXECUTE') OR has_function_privilege('authenticated', 'public.' || sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL public execute on %', sig;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.erasure_confirm(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role grant';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.erasure_requests'::regclass) THEN
    RAISE EXCEPTION 'FAIL rls';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_82_12';
END
$smoke$;
