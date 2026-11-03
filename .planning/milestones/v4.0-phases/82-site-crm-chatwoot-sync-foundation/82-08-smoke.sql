-- 82-08 smoke: rolled-back proof of migration 073 (identities admin: merges, shared numbers, split).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `073_identity_admin`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (bookings, auth user, identities,
-- phone flags, outbox rows, audit rows) is rolled back. ONLY the message SMOKE_OK_82_08 means
-- success; any other exception message names the failed assertion.
--
-- crm_sync_start must NOT exist (capture off): the inserts below then enqueue no sync.booking rows,
-- and the booking_identity links are written by hand, exactly as the resolver would. Addresses are
-- smoke+82-08-<x>@rideprestigo.com, phones +420777908001 / +420777908002 / +420777908003.

DO $smoke$
DECLARE
  j       jsonb;
  v_i     uuid;   -- identity I: a (email) + b (phone merge)
  v_b_a   uuid;   -- booking placed with a
  v_b_b   uuid;   -- booking placed with b
  v_actor uuid := gen_random_uuid();
  v_new   uuid;
  v_n     integer;
  v_s     text;
  r       record;
  -- account scenario
  v_i2    uuid;
  v_uid   uuid := gen_random_uuid();
  v_new2  uuid;
BEGIN
  -- ── Preconditions ─────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.integration_config WHERE key = 'crm_sync_start') THEN
    RAISE EXCEPTION 'FAIL pre: crm_sync_start is already set (capture is live); aborting smoke';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'identity_split') THEN
    RAISE EXCEPTION 'FAIL pre: identity_split is missing (apply 073 first)';
  END IF;

  -- ── Fixture: identity I with a (basis email) and b (basis phone via +420777908001) ──
  INSERT INTO public.contact_identities DEFAULT VALUES RETURNING id INTO v_i;
  INSERT INTO public.identity_emails (email, identity_id, basis) VALUES ('smoke+82-08-a@rideprestigo.com', v_i, 'email');
  INSERT INTO public.identity_emails (email, identity_id, basis, via_phone)
  VALUES ('smoke+82-08-b@rideprestigo.com', v_i, 'phone', '+420777908001');
  INSERT INTO public.identity_phones (identity_id, phone) VALUES (v_i, '+420777908001');
  INSERT INTO public.phone_flags (phone, shared, source) VALUES ('+420777908001', true, 'auto');

  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-08-A', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-15', '10:00',
    'business', 1000, 40,
    'Smoke', 'A', 'smoke+82-08-a@rideprestigo.com', '+420777908001'
  ) RETURNING id INTO v_b_a;
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur,
    client_first_name, client_last_name, client_email, client_phone
  ) VALUES (
    'SMK-82-08-B', 'outbound', 'confirmed', 'pending', 'online', 'one_way',
    'Smoke origin', 'Smoke destination', 1, 0, '2030-01-16', '10:00',
    'business', 1000, 40,
    'Smoke', 'B', 'smoke+82-08-b@rideprestigo.com', '+420777908001'
  ) RETURNING id INTO v_b_b;
  INSERT INTO public.booking_identity (booking_id, identity_id) VALUES (v_b_a, v_i), (v_b_b, v_i);

  -- ── (1) identity_phone_merges lists b with contact a and one booking ──────
  SELECT * INTO r FROM public.identity_phone_merges() m WHERE m.merged_email = 'smoke+82-08-b@rideprestigo.com';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL (1): identity_phone_merges does not list the phone-merged email';
  END IF;
  IF r.contact_email IS DISTINCT FROM 'smoke+82-08-a@rideprestigo.com' THEN
    RAISE EXCEPTION 'FAIL (1): contact_email is %, expected a', r.contact_email;
  END IF;
  IF r.bookings IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FAIL (1): bookings is %, expected 1', r.bookings;
  END IF;
  IF r.phone IS DISTINCT FROM '+420777908001' OR r.identity_id IS DISTINCT FROM v_i THEN
    RAISE EXCEPTION 'FAIL (1): phone or identity_id wrong';
  END IF;
  SELECT count(*) INTO v_n FROM public.identity_phone_merges() m WHERE m.merged_email = 'smoke+82-08-a@rideprestigo.com';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (1): a basis-email address must not be listed as a phone merge';
  END IF;

  -- ── (2) a basis-email address cannot be split ─────────────────────────────
  j := public.identity_split('smoke+82-08-a@rideprestigo.com', v_actor);
  IF j->>'outcome' <> 'not_phone_merge' THEN
    RAISE EXCEPTION 'FAIL (2): split of a basis-email address answered %', j->>'outcome';
  END IF;
  j := public.identity_split('smoke+82-08-nobody@rideprestigo.com', v_actor);
  IF j->>'outcome' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL (2): split of an unknown address answered %', j->>'outcome';
  END IF;
  -- ── (3) the split itself ──────────────────────────────────────────────────
  j := public.identity_split('SMOKE+82-08-B@rideprestigo.com', v_actor);
  IF j->>'outcome' <> 'split' THEN
    RAISE EXCEPTION 'FAIL (3): split answered %', j->>'outcome';
  END IF;
  v_new := (j->>'new_identity_id')::uuid;
  IF v_new IS NULL OR (j->>'old_identity_id')::uuid IS DISTINCT FROM v_i THEN
    RAISE EXCEPTION 'FAIL (3): identity ids wrong in %', j;
  END IF;
  IF jsonb_array_length(j->'keys') <> 4 THEN
    RAISE EXCEPTION 'FAIL (3): expected 4 keys, got %', j->'keys';
  END IF;

  SELECT e.identity_id, e.basis INTO r FROM public.identity_emails e WHERE e.email = 'smoke+82-08-b@rideprestigo.com';
  IF r.identity_id IS DISTINCT FROM v_new OR r.basis <> 'split' THEN
    RAISE EXCEPTION 'FAIL (3): b should belong to the new identity with basis split';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.identity_emails e WHERE e.email = 'smoke+82-08-a@rideprestigo.com' AND e.identity_id = v_i) THEN
    RAISE EXCEPTION 'FAIL (3): a must stay with the old identity';
  END IF;

  IF (SELECT bi.identity_id FROM public.booking_identity bi WHERE bi.booking_id = v_b_b) IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION 'FAIL (3): the booking placed with b did not follow b';
  END IF;
  IF (SELECT bi.identity_id FROM public.booking_identity bi WHERE bi.booking_id = v_b_a) IS DISTINCT FROM v_i THEN
    RAISE EXCEPTION 'FAIL (3): the booking placed with a must stay';
  END IF;

  SELECT f.source, f.shared INTO r FROM public.phone_flags f WHERE f.phone = '+420777908001';
  IF r.source <> 'split' OR NOT r.shared THEN
    RAISE EXCEPTION 'FAIL (3): phone flag is % / %, expected split / true', r.source, r.shared;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.integration_outbox o
   WHERE o.idempotency_key IN (SELECT jsonb_array_elements_text(j->'keys'))
     AND o.status = 'pending';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL (3): expected 4 pending sync rows for the returned keys, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.integration_outbox o
   WHERE o.event_type IN ('sync.espo', 'sync.chatwoot') AND o.aggregate_type = 'person'
     AND o.aggregate_id IN (v_i, v_new) AND o.idempotency_key ~ '^sync\.(espo|chatwoot):[0-9a-f-]{36}:s[0-9]{1,20}$';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL (3): expected 4 well-formed sync.% rows, found %', 'espo/chatwoot', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.identity_admin_log l WHERE l.action = 'split' AND l.actor = v_actor AND l.identity_id = v_new;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL (3): expected 1 audit row for the split, found %', v_n;
  END IF;

  -- the split email no longer appears in the merged list; a second split is refused
  SELECT count(*) INTO v_n FROM public.identity_phone_merges() m WHERE m.merged_email = 'smoke+82-08-b@rideprestigo.com';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (3): the split email is still listed as a phone merge';
  END IF;
  j := public.identity_split('smoke+82-08-b@rideprestigo.com', v_actor);
  IF j->>'outcome' <> 'not_phone_merge' THEN
    RAISE EXCEPTION 'FAIL (3): a second split answered %', j->>'outcome';
  END IF;

  -- ── (4) shared list shows the number with both emails ─────────────────────
  SELECT * INTO r FROM public.identity_shared_phones() s WHERE s.phone = '+420777908001';
  IF NOT FOUND OR r.source <> 'split' THEN
    RAISE EXCEPTION 'FAIL (4): identity_shared_phones does not list the split number';
  END IF;
  IF NOT ('smoke+82-08-b@rideprestigo.com' = ANY (r.emails)) THEN
    RAISE EXCEPTION 'FAIL (4): emails of the shared number do not include b: %', r.emails;
  END IF;

  -- ── (5) mark shared ───────────────────────────────────────────────────────
  v_s := public.identity_mark_shared('+420777908002', 'smoke desk', v_actor);
  IF v_s <> 'marked' THEN RAISE EXCEPTION 'FAIL (5): first mark answered %', v_s; END IF;
  v_s := public.identity_mark_shared('+420777908002', 'again', v_actor);
  IF v_s <> 'already_shared' THEN RAISE EXCEPTION 'FAIL (5): second mark answered %', v_s; END IF;
  v_s := public.identity_mark_shared('777908002', NULL, v_actor);
  IF v_s <> 'invalid' THEN RAISE EXCEPTION 'FAIL (5): local number answered %', v_s; END IF;
  v_s := public.identity_mark_shared(NULL, NULL, v_actor);
  IF v_s <> 'invalid' THEN RAISE EXCEPTION 'FAIL (5): NULL phone answered %', v_s; END IF;
  SELECT f.source, f.note, f.created_by INTO r FROM public.phone_flags f WHERE f.phone = '+420777908002';
  IF r.source <> 'manual' OR r.note <> 'smoke desk' OR r.created_by <> v_actor THEN
    RAISE EXCEPTION 'FAIL (5): manual flag row wrong (% / % / %)', r.source, r.note, r.created_by;
  END IF;
  -- a long note is cut at 80 characters
  v_s := public.identity_mark_shared('+420777908003', repeat('x', 200), v_actor);
  IF v_s <> 'marked' OR (SELECT char_length(f.note) FROM public.phone_flags f WHERE f.phone = '+420777908003') <> 80 THEN
    RAISE EXCEPTION 'FAIL (5): long note was not cut to 80';
  END IF;
  SELECT count(*) INTO v_n FROM public.identity_admin_log l WHERE l.action = 'mark_shared' AND l.actor = v_actor;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL (5): expected 2 mark_shared audit rows, found %', v_n; END IF;

  -- ── (6) a manual mark is never downgraded by a split ──────────────────────
  INSERT INTO public.contact_identities DEFAULT VALUES RETURNING id INTO v_i2;
  INSERT INTO auth.users (id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES (v_uid, 'authenticated', 'authenticated', 'smoke+82-08-d@rideprestigo.com', '', '', '', '');
  UPDATE public.contact_identities SET user_id = v_uid WHERE id = v_i2;
  INSERT INTO public.identity_emails (email, identity_id, basis) VALUES ('smoke+82-08-c@rideprestigo.com', v_i2, 'email');
  INSERT INTO public.identity_emails (email, identity_id, basis, via_phone)
  VALUES ('smoke+82-08-d@rideprestigo.com', v_i2, 'phone', '+420777908002');
  j := public.identity_split('smoke+82-08-d@rideprestigo.com', v_actor);
  IF j->>'outcome' <> 'split' THEN RAISE EXCEPTION 'FAIL (6): split answered %', j->>'outcome'; END IF;
  v_new2 := (j->>'new_identity_id')::uuid;
  IF (SELECT f.source FROM public.phone_flags f WHERE f.phone = '+420777908002') <> 'manual' THEN
    RAISE EXCEPTION 'FAIL (6): a manual flag was downgraded by a split';
  END IF;
  -- the account link follows the account's own email
  IF (SELECT c.user_id FROM public.contact_identities c WHERE c.id = v_new2) IS DISTINCT FROM v_uid
     OR (SELECT c.user_id FROM public.contact_identities c WHERE c.id = v_i2) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (6): the account link did not move to the new identity';
  END IF;

  -- ── (7) privileges ────────────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.identity_split(text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_split(text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.identity_mark_shared(text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.identity_mark_shared(text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.identity_phone_merges()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.identity_shared_phones()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL (7): a 073 function is executable by anon / authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.identity_split(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL (7): service_role cannot execute identity_split';
  END IF;
  IF has_table_privilege('anon', 'public.identity_admin_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.identity_admin_log', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL (7): identity_admin_log is readable by anon / authenticated';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_82_08';
END;
$smoke$;
