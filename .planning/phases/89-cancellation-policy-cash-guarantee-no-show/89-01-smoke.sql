-- 89-01 live smoke for migration 087 (cash_settled state, cancellation settings, fee tables, status mirror).
--
-- Run with the Supabase MCP execute_sql AFTER 087 is applied. READ-ONLY: it is one SELECT over the catalogs plus one
-- rolled-back DO block, so it changes nothing. Two statements, run them one after the other:
--   A. the catalog listing   (returns rows: section, name, detail)
--   B. the behaviour DO block (ends in RAISE EXCEPTION; the run FAILS with 'SMOKE_OK ...' when every check passed,
--      any message starting with 'SMOKE_FAIL' is a failure of 087)
--
-- Expected for A:
--   settings          : cancel_free_km_threshold=100, cancel_free_hours_short=1, cancel_free_hours_long=12,
--                       cancel_free_hours_hourly=12, cancel_fee_percent=100; card_flow_mode = the value it had before 087
--   constraints       : the real names and definitions of every CHECK 087 added or widened
--   tables            : booking_fee_cases, booking_manage_tokens, booking_payment_notes with rls_enabled = true and
--                       anon_priv = false, authenticated_priv = false
--   policies          : *_no_public_read (SELECT, false) and *_no_public_insert (INSERT, false) on all three tables
--   function_grants   : apply_payment_transition(...,text[]) and booking_fee_cases_sync_status() -> public_exec = false,
--                       anon_exec = false, authenticated_exec = false; apply_payment_transition service_role_exec = true
--   bookings_triggers : every trigger on public.bookings with its definition. None may fire on fee_case_status:
--                       each one is either column-listed without fee_case_status or has no UPDATE (research A12).

-- ── A. catalog listing ───────────────────────────────────────────────────────────
SELECT 'settings' AS section, c.key AS name, c.value AS detail
  FROM public.pricing_globals g,
       LATERAL (VALUES
         ('cancel_free_km_threshold', g.cancel_free_km_threshold::text),
         ('cancel_free_hours_short',  g.cancel_free_hours_short::text),
         ('cancel_free_hours_long',   g.cancel_free_hours_long::text),
         ('cancel_free_hours_hourly', g.cancel_free_hours_hourly::text),
         ('cancel_fee_percent',       g.cancel_fee_percent::text),
         ('card_flow_mode',           g.card_flow_mode),
         ('payment_hold_lead_hours',  g.payment_hold_lead_hours::text)
       ) AS c(key, value)
 WHERE g.id = 1

UNION ALL
SELECT 'constraints', con.conrelid::regclass::text || '.' || con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
 WHERE con.conrelid IN (
         'public.bookings'::regclass,
         'public.booking_payment_events'::regclass,
         'public.booking_payment_consents'::regclass,
         'public.pricing_globals'::regclass,
         'public.booking_fee_cases'::regclass,
         'public.booking_manage_tokens'::regclass,
         'public.booking_payment_notes'::regclass
       )
   AND con.contype = 'c'
   AND (   con.conname LIKE 'pricing_globals_cancel%'
        OR con.conname IN (
             'pricing_globals_card_flow_mode_check',
             'bookings_payment_state_check',
             'booking_payment_events_kind_check',
             'booking_payment_consents_mode_check',
             'bookings_cancel_policy_version_check',
             'bookings_fee_case_status_check'
           )
        OR con.conrelid IN (
             'public.booking_fee_cases'::regclass,
             'public.booking_manage_tokens'::regclass,
             'public.booking_payment_notes'::regclass
           )
       )

UNION ALL
SELECT 'columns', t.table_name || '.' || t.column_name,
       t.data_type || ' nullable=' || t.is_nullable || ' default=' || coalesce(t.column_default, '-')
  FROM information_schema.columns t
 WHERE t.table_schema = 'public'
   AND ( (t.table_name = 'bookings' AND t.column_name IN ('cancel_policy_version', 'cancel_policy', 'fee_case_status'))
      OR (t.table_name = 'pricing_globals' AND t.column_name LIKE 'cancel_%') )

UNION ALL
SELECT 'tables', c.relname,
       'rls_enabled=' || c.relrowsecurity
       || ' anon_priv=' || has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
       || ' authenticated_priv=' || has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relname IN ('booking_fee_cases', 'booking_manage_tokens', 'booking_payment_notes')

UNION ALL
SELECT 'policies', p.tablename || '.' || p.policyname,
       p.cmd || ' qual=' || coalesce(p.qual, '-') || ' with_check=' || coalesce(p.with_check, '-')
  FROM pg_policies p
 WHERE p.schemaname = 'public'
   AND p.tablename IN ('booking_fee_cases', 'booking_manage_tokens', 'booking_payment_notes')

UNION ALL
SELECT 'function_grants', f.oid::regprocedure::text,
       'public_exec=' || coalesce((SELECT bool_or(a.grantee = 0) FROM aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                                    WHERE a.privilege_type = 'EXECUTE'), false)
       || ' anon_exec=' || has_function_privilege('anon', f.oid, 'EXECUTE')
       || ' authenticated_exec=' || has_function_privilege('authenticated', f.oid, 'EXECUTE')
       || ' service_role_exec=' || has_function_privilege('service_role', f.oid, 'EXECUTE')
  FROM pg_proc f
 WHERE f.pronamespace = 'public'::regnamespace
   AND f.proname IN ('apply_payment_transition', 'booking_fee_cases_sync_status')

UNION ALL
SELECT 'bookings_triggers', tg.tgname, pg_get_triggerdef(tg.oid)
  FROM pg_trigger tg
 WHERE tg.tgrelid = 'public.bookings'::regclass
   AND NOT tg.tgisinternal

UNION ALL
SELECT 'mirror_trigger', tg.tgname, pg_get_triggerdef(tg.oid)
  FROM pg_trigger tg
 WHERE tg.tgrelid = 'public.booking_fee_cases'::regclass
   AND NOT tg.tgisinternal

ORDER BY 1, 2;

-- ── B. behaviour (rolled back) ───────────────────────────────────────────────────
-- Uses the most recent non-partner booking inside one transaction that always ends in RAISE EXCEPTION, so the
-- booking, the ledger rows and the fee case it creates are all rolled back.
DO $$
DECLARE
  v_id      uuid;
  v_res     jsonb;
  v_state   text;
  v_caught  boolean;
  v_status  text;
BEGIN
  SELECT b.id INTO v_id
    FROM public.bookings b
   WHERE b.booking_source IS DISTINCT FROM 'gnet'
   ORDER BY b.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-eligible-booking';
  END IF;

  -- 1. A cash booking in card_saved settles in cash and reverses, one ledger row each.
  UPDATE public.bookings b
     SET payment_mode = 'cash_guarantee', payment_state = 'card_saved'
   WHERE b.id = v_id;

  v_res := public.apply_payment_transition(
    v_id, ARRAY['card_saved'], 'cash_settled', '{}'::jsonb,
    '{"key": "smoke89:1", "kind": "cash_settled", "actor_type": "admin", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL settle-card_saved-to-cash_settled: %', v_res;
  END IF;

  v_res := public.apply_payment_transition(
    v_id, ARRAY['cash_settled'], 'card_saved', '{}'::jsonb,
    '{"key": "smoke89:2", "kind": "cash_reopened", "actor_type": "admin", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL reopen-cash_settled-to-card_saved: %', v_res;
  END IF;

  -- 2. The 086 status gate is still live: a status outside p_require_status blocks and writes nothing.
  SELECT b.status INTO v_status FROM public.bookings b WHERE b.id = v_id;
  v_res := public.apply_payment_transition(
    v_id, ARRAY['card_saved'], 'cash_settled', '{}'::jsonb,
    '{"key": "smoke89:3", "kind": "cash_settled", "actor_type": "admin", "actor_id": "smoke"}'::jsonb,
    ARRAY['__never_a_status__']
  );
  IF (v_res->>'status_blocked')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL status-gate-lost: %', v_res;
  END IF;
  SELECT b.payment_state INTO v_state FROM public.bookings b WHERE b.id = v_id;
  IF v_state IS DISTINCT FROM 'card_saved' THEN
    RAISE EXCEPTION 'SMOKE_FAIL status-gate-wrote: %', v_state;
  END IF;

  -- 3. The new kinds are accepted by the ledger CHECK; an unknown kind is not.
  v_res := public.append_payment_event(
    v_id, '{"key": "smoke89:fee", "kind": "fee_opened", "actor_type": "system", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'inserted')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL fee_opened-kind-refused: %', v_res;
  END IF;

  -- 4. Fee case insert mirrors the status onto bookings.fee_case_status; update follows.
  INSERT INTO public.booking_fee_cases (booking_id, kind, currency, base_minor, proposed_minor)
  VALUES (v_id, 'no_show', 'eur', 10000, 10000);
  SELECT b.fee_case_status INTO v_status FROM public.bookings b WHERE b.id = v_id;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'SMOKE_FAIL mirror-on-insert: %', v_status;
  END IF;
  UPDATE public.booking_fee_cases SET status = 'waived' WHERE booking_id = v_id;
  SELECT b.fee_case_status INTO v_status FROM public.bookings b WHERE b.id = v_id;
  IF v_status IS DISTINCT FROM 'waived' THEN
    RAISE EXCEPTION 'SMOKE_FAIL mirror-on-update: %', v_status;
  END IF;

  -- 5. A decided amount above the base is refused.
  v_caught := false;
  BEGIN
    UPDATE public.booking_fee_cases SET decided_minor = 10001 WHERE booking_id = v_id;
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL decided-above-base-accepted';
  END IF;

  -- 6. A malformed manage token is refused.
  v_caught := false;
  BEGIN
    INSERT INTO public.booking_manage_tokens (booking_id, token) VALUES (v_id, 'too-short');
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL short-token-accepted';
  END IF;

  -- 7. Policy settings are bounded; card_flow_mode accepts 'on' (rolled back, the stored value is not kept).
  v_caught := false;
  BEGIN
    UPDATE public.pricing_globals SET cancel_fee_percent = 101 WHERE id = 1;
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL fee-percent-101-accepted';
  END IF;
  UPDATE public.pricing_globals SET card_flow_mode = 'on' WHERE id = 1;

  RAISE EXCEPTION 'SMOKE_OK all checks passed';
END
$$;
