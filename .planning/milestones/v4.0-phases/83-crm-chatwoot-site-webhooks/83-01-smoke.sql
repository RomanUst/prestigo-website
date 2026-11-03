-- 83-01 smoke: rolled-back proof of migration 076 (inbound webhook ingest, EspoCRM ingest, purge).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `076_inbound_webhooks`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (deliveries, outbox rows,
-- identities, the integration_config row) is rolled back. ONLY the message SMOKE_OK_83_01 means
-- success; any other exception message names the failed assertion (SMOKE_FAIL_<step>).
-- Precondition: no integration_config row 'chat_hooks_start' (capture is off until plan 83-14).

DO $smoke$
DECLARE
  v_conv uuid := gen_random_uuid();
  v_cont uuid := gen_random_uuid();
  v_bad  uuid := gen_random_uuid();
  v_k    text;
  v_out  text;
  v_n    integer;
  r      record;
  i      integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.integration_config WHERE key = 'chat_hooks_start') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre chat_hooks_start already set';
  END IF;

  -- (a) gate closed: off, nothing written
  v_k := 'hook.chat_intake:' || v_conv || ':c9000001';
  v_out := public.webhook_ingest('chatwoot', 'smoke-83-01-a', 'cw:conv:9000001', NULL,
    'hook.chat_intake', 'chat_conversation', v_conv, v_k, now());
  IF v_out <> 'off' THEN RAISE EXCEPTION 'SMOKE_FAIL_a1 %', v_out; END IF;
  IF EXISTS (SELECT 1 FROM public.webhook_deliveries WHERE delivery_id = 'smoke-83-01-a')
     OR EXISTS (SELECT 1 FROM public.integration_outbox WHERE idempotency_key = v_k) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_a2 off wrote rows';
  END IF;

  -- (a2) an unparseable gate value also counts as off
  INSERT INTO public.integration_config (key, value) VALUES ('chat_hooks_start', 'not-a-timestamp');
  v_out := public.webhook_ingest('chatwoot', 'smoke-83-01-a', 'cw:conv:9000001', NULL,
    'hook.chat_intake', 'chat_conversation', v_conv, v_k, now());
  IF v_out <> 'off' THEN RAISE EXCEPTION 'SMOKE_FAIL_a3 %', v_out; END IF;

  -- (b) gate open: queued, duplicate, exists, exactly one outbox row
  UPDATE public.integration_config SET value = (now() - interval '1 minute')::text WHERE key = 'chat_hooks_start';
  v_out := public.webhook_ingest('chatwoot', 'smoke-83-01-a', 'cw:conv:9000001', NULL,
    'hook.chat_intake', 'chat_conversation', v_conv, v_k, now());
  IF v_out <> 'queued' THEN RAISE EXCEPTION 'SMOKE_FAIL_b1 %', v_out; END IF;
  v_out := public.webhook_ingest('chatwoot', 'smoke-83-01-a', 'cw:conv:9000001', NULL,
    'hook.chat_intake', 'chat_conversation', v_conv, v_k, now());
  IF v_out <> 'duplicate' THEN RAISE EXCEPTION 'SMOKE_FAIL_b2 %', v_out; END IF;
  v_out := public.webhook_ingest('chatwoot', 'smoke-83-01-b', 'cw:conv:9000001', NULL,
    'hook.chat_intake', 'chat_conversation', v_conv, v_k, now());
  IF v_out <> 'exists' THEN RAISE EXCEPTION 'SMOKE_FAIL_b3 %', v_out; END IF;
  SELECT count(*) INTO v_n FROM public.integration_outbox
   WHERE idempotency_key = v_k AND event_type = 'hook.chat_intake' AND aggregate_type = 'chat_conversation';
  IF v_n <> 1 THEN RAISE EXCEPTION 'SMOKE_FAIL_b4 rows=%', v_n; END IF;

  -- (c) a non-hook event type raises and enqueues nothing
  BEGIN
    PERFORM public.webhook_ingest('chatwoot', 'smoke-83-01-c', 'cw:conv:9000003', NULL,
      'sync.espo', 'person', v_bad, 'sync.espo:' || v_bad || ':c9000003', now());
    RAISE EXCEPTION 'SMOKE_FAIL_c1 not raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'webhook_ingest_bad_event' THEN RAISE EXCEPTION 'SMOKE_FAIL_c2 %', SQLERRM; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.integration_outbox WHERE idempotency_key = 'sync.espo:' || v_bad || ':c9000003') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c3 row enqueued';
  END IF;

  -- (d) fuse: 20 allowed, the 21st delivery for one entity inside 10 minutes is fused
  FOR i IN 1..21 LOOP
    v_k := 'hook.chat_contact:' || v_cont || ':c9000002b' || i;
    v_out := public.webhook_ingest('chatwoot', 'smoke-83-01-d' || lpad(i::text, 2, '0'), 'cw:contact:9000002', 20,
      'hook.chat_contact', 'chat_contact', v_cont, v_k, now());
    IF i <= 20 AND v_out <> 'queued' THEN RAISE EXCEPTION 'SMOKE_FAIL_d1 i=% %', i, v_out; END IF;
    IF i = 21 AND v_out <> 'fused' THEN RAISE EXCEPTION 'SMOKE_FAIL_d2 %', v_out; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.integration_outbox WHERE idempotency_key = v_k) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_d3 fused enqueued';
  END IF;

  -- (e) EspoCRM ingest: unlinked, queued (bucketed key), duplicate, erasing
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-83-01-e1', 'aaaaaaaaaaaaaaaaa', 20, 30, 'm1');
  IF r.outcome <> 'unlinked' THEN RAISE EXCEPTION 'SMOKE_FAIL_e1 %', r.outcome; END IF;
  INSERT INTO public.contact_identities (espo_contact_id) VALUES ('bbbbbbbbbbbbbbbbb');
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-83-01-e2', 'bbbbbbbbbbbbbbbbb', 20, 30, 'm5');
  IF r.outcome <> 'queued' OR r.idempotency_key NOT LIKE 'hook.espo_contact:%:b%m5' OR r.available_at <= now() THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e2 % %', r.outcome, r.idempotency_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integration_outbox
                  WHERE idempotency_key = r.idempotency_key AND event_type = 'hook.espo_contact' AND aggregate_type = 'person') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e3 no outbox row';
  END IF;
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-83-01-e2', 'bbbbbbbbbbbbbbbbb', 20, 30, 'm5');
  IF r.outcome <> 'duplicate' THEN RAISE EXCEPTION 'SMOKE_FAIL_e4 %', r.outcome; END IF;
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-83-01-e5', 'bbbbbbbbbbbbbbbbb', 20, 30, 'm5');
  IF r.outcome <> 'exists' THEN RAISE EXCEPTION 'SMOKE_FAIL_e5 %', r.outcome; END IF;
  INSERT INTO public.contact_identities (espo_contact_id, erasing_at) VALUES ('ccccccccccccccccc', now());
  SELECT * INTO r FROM public.webhook_ingest_espo('smoke-83-01-e6', 'ccccccccccccccccc', 20, 30, 'm2');
  IF r.outcome <> 'erasing' THEN RAISE EXCEPTION 'SMOKE_FAIL_e6 %', r.outcome; END IF;
  BEGIN
    PERFORM public.webhook_ingest_espo('smoke-83-01-e7', 'not-a-contact-id', 20, 30, 'm2');
    RAISE EXCEPTION 'SMOKE_FAIL_e7 not raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'webhook_ingest_espo_bad_input' THEN RAISE EXCEPTION 'SMOKE_FAIL_e8 %', SQLERRM; END IF;
  END;

  -- (f) purge: an espocrm row older than 30 days is deleted
  UPDATE public.webhook_deliveries SET received_at = now() - interval '31 days' WHERE delivery_id = 'smoke-83-01-e1';
  IF public.webhook_purge(7, 30) < 1 THEN RAISE EXCEPTION 'SMOKE_FAIL_f1 nothing purged'; END IF;
  IF EXISTS (SELECT 1 FROM public.webhook_deliveries WHERE delivery_id = 'smoke-83-01-e1') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f2 row still there';
  END IF;

  -- (g) privileges: no anon / authenticated execute, no table access
  IF has_function_privilege('anon', 'public.webhook_ingest(text,text,text,integer,text,text,uuid,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.webhook_ingest(text,text,text,integer,text,text,uuid,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.webhook_ingest_espo(text,text,integer,integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.webhook_ingest_espo(text,text,integer,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.webhook_purge(integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.webhook_purge(integer,integer)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.webhook_deliveries', 'SELECT')
     OR has_table_privilege('authenticated', 'public.webhook_deliveries', 'SELECT') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_g privilege leak';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.webhook_ingest(text,text,text,integer,text,text,uuid,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_g2 service_role cannot execute';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_83_01';
END
$smoke$;
