-- 82-09 rolled-back dry run of migration 074 on the real data (counts only, no personal data).
-- Run with Supabase MCP execute_sql AFTER apply_migration 074_crm_backfill. The DO block ends in
-- RAISE EXCEPTION 'SMOKE_OK_82_09 ...', so the transaction rolls back: no identity, no outbox row
-- and no pg_net request survives. Any other error text means a failed assertion.
DO $$
DECLARE
  v_pre_id int; v_pre_bf int; v_t text; v_n1 int; v_n2 int; v_n3 int; v_rows int;
  v_pass jsonb; v_pass2 jsonb; v_rep jsonb; v_rep2 jsonb; v_exp int; v_span interval;
BEGIN
  SELECT count(*) INTO v_pre_id FROM public.contact_identities;
  SELECT count(*) INTO v_pre_bf FROM public.integration_outbox WHERE idempotency_key ~ ':bf[0-9]{0,3}$';
  ASSERT v_pre_bf = 0, 'bf rows exist before the smoke';

  -- tag validation: every bad tag raises invalid_tag
  FOREACH v_t IN ARRAY ARRAY['nope', 'bf1234', 'BF', 'bf-1', 'bfx', '', ' bf', 'bf ']
  LOOP
    BEGIN
      PERFORM public.crm_backfill_enqueue(v_t, 5);
      RAISE EXCEPTION 'tag_not_rejected';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'invalid_tag' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM public.crm_backfill_enqueue(NULL, 5);
    RAISE EXCEPTION 'tag_not_rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_tag' THEN RAISE; END IF;
  END;

  -- identity pass + report; a second pass converges on the same state
  v_pass := public.crm_backfill_identity_pass();
  v_rep  := public.crm_identity_report();
  v_pass2 := public.crm_backfill_identity_pass();
  v_rep2  := public.crm_identity_report();
  ASSERT v_pass2 = v_pass, 'second identity pass differs';
  ASSERT v_rep2 = v_rep, 'second report differs';

  ASSERT (v_rep->>'bookings_linked')::int + (v_rep->>'bookings_no_identity')::int
       + (v_rep->>'bookings_abandoned')::int = (v_rep->>'bookings_total')::int, 'report does not add up';
  ASSERT (v_pass->>'bookings_seen')::int = (v_rep->>'bookings_total')::int, 'pass/report total';
  ASSERT (v_pass->>'abandoned_skipped')::int = (v_rep->>'bookings_abandoned')::int, 'pass/report abandoned';
  ASSERT (v_pass->>'bookings_linked')::int = (v_rep->>'bookings_linked')::int, 'pass/report linked';
  ASSERT (v_pass->>'bookings_no_identity')::int + (v_pass->>'bookings_erasing')::int
       = (v_rep->>'bookings_no_identity')::int, 'pass/report no_identity';
  ASSERT (v_pass->>'profiles_seen')::int = (v_rep->>'profiles')::int, 'pass/report profiles';
  ASSERT (v_rep->>'identities')::int >= v_pre_id, 'identities shrank';
  ASSERT (v_rep->>'phone_merges')::int = (v_rep->'emails_by_basis'->>'phone')::int, 'phone merge count';
  ASSERT position('@' IN v_rep::text) = 0 AND position('+' IN v_rep::text) = 0, 'report is not counts only';
  ASSERT position('@' IN v_pass::text) = 0, 'pass is not counts only';

  -- enqueue: exact count, idempotent, tagged, staggered, re-runnable with a new tag
  v_exp := (v_rep->>'bookings_total')::int - (v_rep->>'bookings_abandoned')::int + (v_rep->>'profiles')::int;
  v_n1 := public.crm_backfill_enqueue('bf', 5);
  ASSERT v_n1 = v_exp, 'first enqueue count differs from the expected rows';
  ASSERT public.crm_backfill_enqueue('bf', 5) = 0, 'second enqueue with the same tag is not a no-op';
  SELECT count(*) INTO v_rows FROM public.integration_outbox WHERE idempotency_key ~ ':bf$';
  ASSERT v_rows = v_n1, 'bf rows != returned count';
  SELECT count(*) INTO v_rows FROM public.integration_outbox
   WHERE idempotency_key ~ ':bf$' AND event_type NOT IN ('sync.booking', 'sync.signup');
  ASSERT v_rows = 0, 'unexpected event type';
  IF v_n1 > 0 THEN
    SELECT max(available_at) - min(available_at) INTO v_span FROM public.integration_outbox WHERE idempotency_key ~ ':bf$';
    ASSERT v_span = make_interval(secs => (v_n1 - 1) * 5), 'stagger is not n * 5 s';
  END IF;
  -- stagger clamp (0 -> 1 s, 9999 -> 60 s) still enqueues the same rows under a new tag
  v_n2 := public.crm_backfill_enqueue('bf2', 0);
  v_n3 := public.crm_backfill_enqueue('bf3', 9999);
  ASSERT v_n2 = v_n1 AND v_n3 = v_n1, 're-run with a new tag did not enqueue the same rows';

  -- privileges: service_role only
  ASSERT NOT has_function_privilege('anon', 'public.crm_backfill_enqueue(text,integer)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.crm_backfill_enqueue(text,integer)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.crm_backfill_identity_pass()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.crm_backfill_identity_pass()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.crm_identity_report()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.crm_identity_report()', 'EXECUTE'), 'public execute leaked';
  ASSERT has_function_privilege('service_role', 'public.crm_backfill_enqueue(text,integer)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.crm_backfill_identity_pass()', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.crm_identity_report()', 'EXECUTE'), 'service_role lost execute';

  RAISE EXCEPTION 'SMOKE_OK_82_09 pass=% report=% enqueued=%', v_pass::text, v_rep::text, v_n1
    USING DETAIL = format('identities_before=%s enqueued_per_tag=%s', v_pre_id, v_n1);
END;
$$;
