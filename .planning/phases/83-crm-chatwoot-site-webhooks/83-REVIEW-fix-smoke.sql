-- Rolled-back smoke for migration 079 (83-REVIEW CR-01..CR-03). Run with execute_sql AFTER
-- apply_migration 079_webhook_security_fixes. Only the message SMOKE_OK_83_079 means success.
DO $smoke$
DECLARE
  j uuid; i uuid; a uuid; b uuid; r record; n integer;
  v_lb uuid; v_lc uuid;
BEGIN
  -- (a) CR-01: a chat email + somebody else's phone never joins that person
  INSERT INTO public.contact_identities DEFAULT VALUES RETURNING id INTO j;
  INSERT INTO public.identity_emails (email, identity_id, basis) VALUES ('smoke+079-owner@example.org', j, 'email');
  INSERT INTO public.identity_phones (identity_id, phone) VALUES (j, '+420700000791');
  SELECT * INTO r FROM public.identity_resolve_chat('smoke+079-attacker@example.org', '+420700000791');
  i := r.identity_id;
  ASSERT r.outcome = 'resolved' AND i IS NOT NULL AND i <> j, 'a1 attacker email must get its own identity';
  ASSERT (SELECT e.identity_id FROM public.identity_emails e WHERE e.email = 'smoke+079-attacker@example.org') = i, 'a2 attacker email on own identity';
  ASSERT (SELECT e.basis FROM public.identity_emails e WHERE e.email = 'smoke+079-attacker@example.org') = 'chat', 'a3 basis chat, not phone';
  ASSERT NOT EXISTS (SELECT 1 FROM public.identity_phones p WHERE p.phone = '+420700000791' AND p.identity_id = i), 'a4 phone not copied to attacker';
  ASSERT NOT EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = '+420700000791'), 'a5 no phone flag written';
  SELECT count(*) INTO n FROM public.identity_emails e WHERE e.identity_id = j;
  ASSERT n = 1, 'a6 owner identity unchanged';
  -- an unowned phone is attached to the chat identity
  SELECT * INTO r FROM public.identity_resolve_chat('smoke+079-attacker@example.org', '+420700000792');
  ASSERT EXISTS (SELECT 1 FROM public.identity_phones p WHERE p.phone = '+420700000792' AND p.identity_id = i), 'a7 free phone attached';

  -- (b) CR-02: same content hash is a duplicate only within one hour
  DELETE FROM public.integration_config WHERE key = 'chat_hooks_start';
  INSERT INTO public.integration_config (key, value) VALUES ('chat_hooks_start', (now() - interval '1 minute')::text);
  INSERT INTO public.contact_identities (espo_contact_id) VALUES ('ddddddddddddddddd');
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-079-b1', 'ddddddddddddddddd', 20, 30, 'm1');
  ASSERT r.outcome = 'queued', 'b1 first delivery queued: ' || r.outcome;
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-079-b1', 'ddddddddddddddddd', 20, 30, 'm1');
  ASSERT r.outcome = 'duplicate', 'b2 retry within the hour is duplicate: ' || r.outcome;
  UPDATE public.webhook_deliveries SET received_at = now() - interval '2 hours' WHERE delivery_id = 'smoke-079-b1';
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-079-b1', 'ddddddddddddddddd', 20, 30, 'm1');
  ASSERT r.outcome IN ('queued', 'exists'), 'b3 same hash after an hour is a new edit: ' || r.outcome;
  ASSERT (SELECT received_at FROM public.webhook_deliveries WHERE delivery_id = 'smoke-079-b1') > now() - interval '1 minute', 'b4 row refreshed';

  -- (c) CR-03: erasing A through a shared Chatwoot contact id never touches B's rows
  INSERT INTO public.contact_identities DEFAULT VALUES RETURNING id INTO a;
  INSERT INTO public.contact_identities DEFAULT VALUES RETURNING id INTO b;
  SELECT chat_lead_id INTO v_lb FROM public.chat_lead_reserve('i:' || b::text, b, 9000795, NULL, 'chat:' || gen_random_uuid()::text);
  PERFORM public.chat_lead_set_espo(v_lb, 'eeeeeeeeeeeeeeeee', 'fffffffffffffffff');
  PERFORM public.chat_conversation_record(9000796, 9000795, b, v_lb, 'eeeeeeeeeeeeeeeee', 'fffffffffffffffff', 'lead_created');
  SELECT chat_lead_id INTO v_lc FROM public.chat_lead_reserve('c:9000795', NULL, 9000795, '+420700000793', 'chat:' || gen_random_uuid()::text);
  SELECT count(*) INTO n FROM public.chat_erasure_scope(a, ARRAY[9000795]::bigint[], ARRAY['+420700000793']);
  ASSERT n = 1, 'c1 scope = only the identity-less c: lead, got ' || n;
  ASSERT NOT EXISTS (SELECT 1 FROM public.chat_erasure_scope(a, ARRAY[9000795]::bigint[], ARRAY[]::text[]) s WHERE s.espo_lead_id = 'eeeeeeeeeeeeeeeee'), 'c2 B lead not in A scope';
  PERFORM public.chat_erase(a, ARRAY[9000795]::bigint[], ARRAY['+420700000793']);
  ASSERT EXISTS (SELECT 1 FROM public.chat_leads WHERE id = v_lb), 'c3 B lead survives';
  ASSERT EXISTS (SELECT 1 FROM public.chat_conversations WHERE conversation_id = 9000796), 'c4 B conversation survives';
  ASSERT NOT EXISTS (SELECT 1 FROM public.chat_leads WHERE id = v_lc), 'c5 identity-less c: lead erased';
  -- erasing B itself still removes B's rows
  PERFORM public.chat_erase(b, ARRAY[9000795]::bigint[], ARRAY[]::text[]);
  ASSERT NOT EXISTS (SELECT 1 FROM public.chat_leads WHERE id = v_lb), 'c6 B lead erased by B';
  ASSERT NOT EXISTS (SELECT 1 FROM public.chat_conversations WHERE conversation_id = 9000796), 'c7 B conversation erased by B';

  -- (d) privileges
  ASSERT NOT has_function_privilege('anon', 'public.identity_resolve_chat(text,text)', 'EXECUTE'), 'd1';
  ASSERT NOT has_function_privilege('anon', 'public.webhook_ingest_espo(text,text,integer,integer,text)', 'EXECUTE'), 'd2';
  ASSERT NOT has_function_privilege('anon', 'public.chat_erase(uuid,bigint[],text[])', 'EXECUTE'), 'd3';
  ASSERT NOT has_function_privilege('authenticated', 'public.chat_erasure_scope(uuid,bigint[],text[])', 'EXECUTE'), 'd4';

  RAISE EXCEPTION 'SMOKE_OK_83_079';
END
$smoke$;
