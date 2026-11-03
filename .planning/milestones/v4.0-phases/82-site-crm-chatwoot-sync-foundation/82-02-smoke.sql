-- 82-02 smoke: rolled-back proof of migration 070 (outbox admin health + retry functions).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `070_outbox_admin`
-- (file supabase/migrations/070_outbox_admin.sql).
-- The whole block ends in RAISE EXCEPTION, so every row it creates is rolled back. ONLY the message
-- SMOKE_OK_82_02 means success; any other exception message names the failed assertion.
--
-- Synthetic rows only: event_type 'lead.inquiry', aggregate_type 'inquiry', random uuids, keys
-- prefixed 'lead.inquiry:' so nothing real is touched. The live outbox may hold real open rows, so
-- every count assertion uses >= and every key assertion looks for the synthetic key by name.
-- outbox_retry_failed(500) also flips real failed rows inside this transaction; the rollback
-- restores them.

DO $smoke$
DECLARE
  v_fail1   text := 'lead.inquiry:' || gen_random_uuid()::text;  -- failed, last_error crm_http_500
  v_pend    text := 'lead.inquiry:' || gen_random_uuid()::text;  -- pending, available_at 7 h ago
  v_proc    text := 'lead.inquiry:' || gen_random_uuid()::text;  -- processing, lease expired
  v_sent    text := 'lead.inquiry:' || gen_random_uuid()::text;  -- sent
  v_fail2   text := 'lead.inquiry:' || gen_random_uuid()::text;  -- second failed row
  v_live    text := 'lead.inquiry:' || gen_random_uuid()::text;  -- processing, live lease
  v_health  jsonb;
  v_n       integer;
  v_row     record;
  v_keys    text[];
BEGIN
  -- ── Preconditions ─────────────────────────────────────────────────────────
  IF to_regprocedure('public.outbox_health()') IS NULL
     OR to_regprocedure('public.outbox_open_events(text,integer)') IS NULL
     OR to_regprocedure('public.outbox_retry(text)') IS NULL
     OR to_regprocedure('public.outbox_retry_failed(integer)') IS NULL THEN
    RAISE EXCEPTION 'FAIL pre: migration 070 functions are missing';
  END IF;

  -- ── Synthetic rows ────────────────────────────────────────────────────────
  INSERT INTO public.integration_outbox
    (event_type, aggregate_type, aggregate_id, idempotency_key, status, attempts, available_at, lease_until, last_error, sent_at)
  VALUES
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_fail1, 'failed',     6, now(),                      NULL,                         'crm_http_500', NULL),
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_pend,  'pending',    0, now() - interval '7 hours', NULL,                         NULL,           NULL),
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_proc,  'processing', 1, now(),                      now() - interval '1 minute',  NULL,           NULL),
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_sent,  'sent',       1, now(),                      NULL,                         NULL,           now());

  -- ── outbox_health ─────────────────────────────────────────────────────────
  v_health := public.outbox_health();
  IF (v_health->>'failed')::integer < 1 THEN
    RAISE EXCEPTION 'FAIL health: failed < 1 (%)', v_health;
  END IF;
  IF (v_health->>'stuck')::integer < 2 THEN
    RAISE EXCEPTION 'FAIL health: stuck < 2 (%)', v_health;
  END IF;
  IF (v_health->>'oldest_pending_seconds') IS NULL OR (v_health->>'oldest_pending_seconds')::numeric < 7 * 3600 - 60 THEN
    RAISE EXCEPTION 'FAIL health: oldest_pending_seconds should be >= 7 h (%)', v_health;
  END IF;
  IF (v_health->>'sent_last_24h')::integer < 1 THEN
    RAISE EXCEPTION 'FAIL health: sent_last_24h < 1 (%)', v_health;
  END IF;
  IF jsonb_typeof(v_health->'by_type') <> 'array' THEN
    RAISE EXCEPTION 'FAIL health: by_type is not an array';
  END IF;
  IF (v_health->>'open_total')::integer <
     (v_health->>'pending')::integer + (v_health->>'processing')::integer
     + (v_health->>'failed')::integer + (v_health->>'stuck')::integer THEN
    RAISE EXCEPTION 'FAIL health: open_total is smaller than the buckets (%)', v_health;
  END IF;

  -- ── outbox_open_events ────────────────────────────────────────────────────
  SELECT array_agg(e.idempotency_key) INTO v_keys FROM public.outbox_open_events(NULL, 100) e;
  IF NOT (v_fail1 = ANY (v_keys) AND v_pend = ANY (v_keys) AND v_proc = ANY (v_keys)) THEN
    RAISE EXCEPTION 'FAIL open: the three open synthetic keys must be listed';
  END IF;
  IF v_sent = ANY (v_keys) THEN
    RAISE EXCEPTION 'FAIL open: a sent row must never be listed';
  END IF;

  SELECT count(*) INTO v_n FROM public.outbox_open_events(NULL, 100000);
  IF v_n > 100 THEN
    RAISE EXCEPTION 'FAIL open: limit must be capped at 100 (got %)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.outbox_open_events('sent', 100);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL open: status sent must return no rows';
  END IF;

  SELECT e.* INTO v_row FROM public.outbox_open_events('failed', 100) e WHERE e.idempotency_key = v_fail1;
  IF v_row.idempotency_key IS NULL OR v_row.last_error <> 'crm_http_500' OR v_row.attempts <> 6 THEN
    RAISE EXCEPTION 'FAIL open: failed row must carry attempts 6 and last_error crm_http_500';
  END IF;

  SELECT e.* INTO v_row FROM public.outbox_open_events('pending', 100) e WHERE e.idempotency_key = v_pend;
  IF v_row.idempotency_key IS NULL OR v_row.stuck IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL open: the 7-hour-old pending row must be flagged stuck';
  END IF;

  SELECT e.* INTO v_row FROM public.outbox_open_events('processing', 100) e WHERE e.idempotency_key = v_proc;
  IF v_row.idempotency_key IS NULL OR v_row.stuck IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL open: the expired-lease processing row must be flagged stuck';
  END IF;

  -- ── outbox_retry ──────────────────────────────────────────────────────────
  IF public.outbox_retry(v_fail1) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL retry: a failed row must be retryable';
  END IF;
  SELECT o.status, o.attempts, o.last_error, o.lease_until INTO v_row
    FROM public.integration_outbox o WHERE o.idempotency_key = v_fail1;
  IF v_row.status <> 'pending' OR v_row.attempts <> 0 OR v_row.last_error IS DISTINCT FROM 'crm_http_500'
     OR v_row.lease_until IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL retry: row must be pending, attempts 0, last_error kept, lease cleared (%)', v_row;
  END IF;

  -- idempotent: a second retry leaves the same row
  IF public.outbox_retry(v_fail1) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL retry: a pending row must stay retryable (idempotent)';
  END IF;
  SELECT count(*) INTO v_n FROM public.integration_outbox o
   WHERE o.idempotency_key = v_fail1 AND o.status = 'pending' AND o.attempts = 0 AND o.last_error = 'crm_http_500';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL retry: retrying twice must leave exactly one pending row';
  END IF;

  IF public.outbox_retry(v_sent) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL retry: a sent row must not be retryable';
  END IF;
  IF (SELECT o.status FROM public.integration_outbox o WHERE o.idempotency_key = v_sent) <> 'sent' THEN
    RAISE EXCEPTION 'FAIL retry: a sent row must stay sent';
  END IF;

  IF public.outbox_retry(v_proc) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL retry: a processing row must not be retryable';
  END IF;

  -- ── outbox_retry_failed ───────────────────────────────────────────────────
  INSERT INTO public.integration_outbox
    (event_type, aggregate_type, aggregate_id, idempotency_key, status, attempts, available_at, lease_until, last_error)
  VALUES
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_fail2, 'failed',     6, now(), NULL,                       'crm_http_500'),
    ('lead.inquiry', 'inquiry', gen_random_uuid(), v_live,  'processing', 1, now(), now() + interval '5 minutes', NULL);

  SELECT array_agg(k) INTO v_keys FROM public.outbox_retry_failed(500) AS t(k);
  IF v_keys IS NULL OR NOT (v_fail2 = ANY (v_keys)) THEN
    RAISE EXCEPTION 'FAIL retry_failed: the failed synthetic key must be returned';
  END IF;
  IF v_live = ANY (v_keys) OR v_proc = ANY (v_keys) OR v_sent = ANY (v_keys) THEN
    RAISE EXCEPTION 'FAIL retry_failed: processing and sent keys must never be returned';
  END IF;

  SELECT o.status, o.attempts, o.last_error INTO v_row FROM public.integration_outbox o WHERE o.idempotency_key = v_fail2;
  IF v_row.status <> 'pending' OR v_row.attempts <> 0 OR v_row.last_error IS DISTINCT FROM 'crm_http_500' THEN
    RAISE EXCEPTION 'FAIL retry_failed: failed row must be pending, attempts 0, last_error kept (%)', v_row;
  END IF;
  IF (SELECT o.status FROM public.integration_outbox o WHERE o.idempotency_key = v_live) <> 'processing' THEN
    RAISE EXCEPTION 'FAIL retry_failed: the live processing row must still be processing';
  END IF;
  IF (SELECT o.status FROM public.integration_outbox o WHERE o.idempotency_key = v_proc) <> 'processing' THEN
    RAISE EXCEPTION 'FAIL retry_failed: the expired-lease processing row must still be processing';
  END IF;

  -- ── Privileges ────────────────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.outbox_retry(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_retry(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.outbox_retry_failed(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_retry_failed(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.outbox_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_health()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.outbox_open_events(text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outbox_open_events(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL priv: anon/authenticated must not have EXECUTE on the 070 functions';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.outbox_retry(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL priv: service_role must have EXECUTE';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_82_02';
END
$smoke$;
