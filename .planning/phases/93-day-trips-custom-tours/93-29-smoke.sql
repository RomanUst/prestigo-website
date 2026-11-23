-- 93-29 smoke: migration 093 (custom-tour inquiries). Run by the ORCHESTRATOR with Supabase execute_sql against
-- project enakcryrtxlnjvjutfpv. Nothing here persists: the whole check is ONE DO block that always ends in
-- RAISE EXCEPTION, so every row it inserts is rolled back (a plain BEGIN ... ROLLBACK is not reliable through
-- execute_sql, which may return only the last statement). The expected outcome is therefore an ERROR whose message is
-- 'SMOKE_OK {...json...}' (all checks true) or 'SMOKE_FAIL {...json...}'. Read the JSON; every value must be true.
--
-- ---------------------------------------------------------------------------------------------------------------
-- STEP 0 (run BEFORE applying 093, read-only): the live name of the kind CHECK. 093 drops and re-adds
-- 'inquiries_kind_check'; if the live name differs, STOP and report - do not apply a second CHECK.
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.inquiries'::regclass AND contype = 'c';
--
-- Expected before 093: inquiries_kind_check | CHECK ((kind = ANY (ARRAY['contact'::text, 'corporate'::text, 'multiday_quote'::text])))
-- ---------------------------------------------------------------------------------------------------------------
-- STEP 1 (run AFTER applying 093): the block below.

DO $smoke$
DECLARE
  r              jsonb := '{}'::jsonb;
  v_inq          uuid;
  v_inq2         uuid;
  v_ok           boolean;
  v_def          text;
  v_n            integer;
  v_stats        jsonb;
BEGIN
  -- 1. live constraint name and definition after 093
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.inquiries'::regclass AND contype = 'c' AND conname = 'inquiries_kind_check';
  r := r || jsonb_build_object('kind_check_name_is_inquiries_kind_check', v_def IS NOT NULL);
  r := r || jsonb_build_object('kind_check_def', v_def);
  r := r || jsonb_build_object('kind_check_accepts_custom_tour', coalesce(v_def, '') LIKE '%custom_tour%');

  -- 2. a custom_tour inquiry is accepted and the existing 065 trigger enqueued lead.inquiry:<id>
  INSERT INTO public.inquiries (kind, email, name, phone, payload)
  VALUES ('custom_tour', 'smoke-93-29@example.invalid', 'Smoke Test', NULL,
          '{"where":"Kutna Hora","date":"2027-05-01","people":4,"wishes":null,"tourSlug":null,"locale":"en"}'::jsonb)
  RETURNING id INTO v_inq;
  SELECT count(*) INTO v_n
    FROM public.integration_outbox
   WHERE idempotency_key = 'lead.inquiry:' || v_inq::text
     AND event_type = 'lead.inquiry' AND aggregate_id = v_inq;
  r := r || jsonb_build_object('custom_tour_inquiry_stored', v_inq IS NOT NULL);
  r := r || jsonb_build_object('outbox_row_enqueued', v_n = 1);

  -- 3. an unknown kind is still rejected
  v_ok := false;
  BEGIN
    INSERT INTO public.inquiries (kind, email) VALUES ('not_a_kind', 'smoke-93-29b@example.invalid');
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('unknown_kind_rejected', v_ok);

  -- 4. one quote per request: the unique partial index exists, a second quote for the same inquiry is refused
  SELECT count(*) INTO v_n
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'quotes' AND indexname = 'quotes_source_inquiry_id_key';
  r := r || jsonb_build_object('quote_unique_index_exists', v_n = 1);

  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, source_inquiry_id)
  VALUES ('Q-20270501-SMK931', 'Smoke', 'Test', 'smoke-93-29@example.invalid', 'email', v_inq);
  v_ok := false;
  BEGIN
    INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, source_inquiry_id)
    VALUES ('Q-20270501-SMK932', 'Smoke', 'Test', 'smoke-93-29@example.invalid', 'email', v_inq);
  EXCEPTION WHEN unique_violation THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('second_quote_same_inquiry_refused', v_ok);

  -- quotes without a source inquiry are not constrained by the partial index
  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20270501-SMK933', 'Smoke', 'Test', 'smoke-93-29@example.invalid', 'email');
  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20270501-SMK934', 'Smoke', 'Test', 'smoke-93-29@example.invalid', 'email');
  r := r || jsonb_build_object('null_source_inquiry_unconstrained', true);

  -- 5. stats_conversion stays service_role only (T-93-65)
  r := r || jsonb_build_object(
    'anon_can_execute_stats_conversion_must_be_false',
    has_function_privilege('anon', 'public.stats_conversion(date,date)', 'EXECUTE'));
  r := r || jsonb_build_object(
    'authenticated_can_execute_stats_conversion_must_be_false',
    has_function_privilege('authenticated', 'public.stats_conversion(date,date)', 'EXECUTE'));
  r := r || jsonb_build_object(
    'service_role_can_execute_stats_conversion_must_be_true',
    has_function_privilege('service_role', 'public.stats_conversion(date,date)', 'EXECUTE'));
  r := r || jsonb_build_object(
    'public_pseudo_role_has_no_execute',
    NOT EXISTS (
      SELECT 1
        FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.stats_conversion(date,date)'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'));

  -- 6. stats_conversion runs, lists form_custom_tour last and counts the smoke inquiry in its source
  v_stats := public.stats_conversion(current_date - 30, current_date);
  r := r || jsonb_build_object('stats_runs', v_stats IS NOT NULL);
  r := r || jsonb_build_object(
    'funnel_has_10_rows_form_custom_tour_last',
    jsonb_array_length(v_stats->'funnel') = 10
      AND (v_stats->'funnel'->9->>'source') = 'form_custom_tour');
  r := r || jsonb_build_object(
    'funnel_counts_the_smoke_inquiry',
    coalesce((v_stats->'funnel'->9->>'inquiries')::integer, 0) >= 1);

  -- verdict; the exception rolls back every row inserted above
  IF (SELECT bool_and(
        CASE
          WHEN key LIKE '%\_must\_be\_false' THEN value = 'false'::jsonb
          WHEN key = 'kind_check_def' THEN true
          ELSE value = 'true'::jsonb
        END)
        FROM jsonb_each(r)) THEN
    RAISE EXCEPTION 'SMOKE_OK %', r;
  ELSE
    RAISE EXCEPTION 'SMOKE_FAIL %', r;
  END IF;
END
$smoke$;

-- STEP 2 (after the block): confirm nothing remains. Both must return 0.
--   SELECT count(*) FROM public.inquiries WHERE email = 'smoke-93-29@example.invalid';
--   SELECT count(*) FROM public.integration_outbox o
--    WHERE NOT EXISTS (SELECT 1 FROM public.inquiries i WHERE i.id = o.aggregate_id)
--      AND o.event_type = 'lead.inquiry' AND o.created_at > now() - interval '10 minutes';
--   SELECT count(*) FROM public.quotes WHERE reference LIKE 'Q-20270501-SMK93%';
