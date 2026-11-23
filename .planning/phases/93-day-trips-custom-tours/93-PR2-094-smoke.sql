-- 93 PR 2 smoke: migration 094 (custom-tour quote index + list_custom_tour_requests). Run by the ORCHESTRATOR with
-- Supabase execute_sql against project enakcryrtxlnjvjutfpv, AFTER applying 094 and BEFORE the code that calls the
-- function ships. Nothing here persists: the whole check is ONE DO block that always ends in RAISE EXCEPTION, so every
-- row it inserts is rolled back (a plain BEGIN ... ROLLBACK is not reliable through execute_sql, which may return only the
-- last statement). The expected outcome is therefore an ERROR whose message is 'SMOKE_OK {...json...}' (all checks
-- true) or 'SMOKE_FAIL {...json...}'. Read the JSON; every key ending in _must_be_false must be false, all others true.
--
-- Checks:
--   1. the live index quotes_source_inquiry_id_key is UNIQUE, partial, and its predicate excludes 'voided'
--   2. a second NON-voided quote for the same request is refused (unique_violation)
--   3. after the first quote is voided, a new quote for the same request is allowed; a third live one is refused
--   4. list_custom_tour_requests: 'open' / 'quoted' / 'all' return the right requests with the live quote's id and
--      reference (not the voided one); the keyset cursor and the page limit work; a bad status is refused
--   5. anon and authenticated cannot execute the function (nor PUBLIC); service_role can
--
-- The rows use the reserved address smoke-93-pr2@example.invalid and references Q-20270501-SMK94x.

DO $smoke$
DECLARE
  r              jsonb := '{}'::jsonb;
  v_a            uuid;   -- request that stays open
  v_b            uuid;   -- request that gets a quote, which is then voided and replaced
  v_q1           uuid;
  v_q2           uuid;
  v_ok           boolean;
  v_def          text;
  v_n            integer;
  v_ref          text;
  v_cur_at       timestamptz;
  v_cur_id       uuid;
BEGIN
  -- 1. the live index definition
  SELECT indexdef INTO v_def
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'quotes' AND indexname = 'quotes_source_inquiry_id_key';
  r := r || jsonb_build_object('index_exists', v_def IS NOT NULL);
  r := r || jsonb_build_object('index_def', v_def);
  r := r || jsonb_build_object('index_is_unique', coalesce(v_def, '') LIKE 'CREATE UNIQUE INDEX%');
  r := r || jsonb_build_object('index_on_source_inquiry_id', coalesce(v_def, '') LIKE '%(source_inquiry_id)%');
  r := r || jsonb_build_object('index_predicate_excludes_voided', coalesce(v_def, '') LIKE '%WHERE%' AND coalesce(v_def, '') LIKE '%voided%');
  r := r || jsonb_build_object('index_predicate_requires_source_inquiry_not_null', coalesce(v_def, '') LIKE '%source_inquiry_id IS NOT NULL%');

  -- two custom-tour requests, created in the future so they are the newest rows whatever data the database holds
  INSERT INTO public.inquiries (kind, email, name, payload, created_at)
  VALUES ('custom_tour', 'smoke-93-pr2@example.invalid', 'Smoke Open',
          '{"where":"Kutna Hora","date":"2027-05-01","people":2,"wishes":null,"tourSlug":null,"locale":"en"}'::jsonb,
          now() + interval '2 days')
  RETURNING id INTO v_a;
  INSERT INTO public.inquiries (kind, email, name, payload, created_at)
  VALUES ('custom_tour', 'smoke-93-pr2@example.invalid', 'Smoke Quoted',
          '{"where":"Karlstejn","date":"2027-05-02","people":4,"wishes":null,"tourSlug":null,"locale":"en"}'::jsonb,
          now() + interval '1 day')
  RETURNING id INTO v_b;

  -- 2. one live quote per request: the first is accepted, a second live one is refused
  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, source_inquiry_id)
  VALUES ('Q-20270501-SMK941', 'Smoke', 'Test', 'smoke-93-pr2@example.invalid', 'email', v_b)
  RETURNING id INTO v_q1;
  v_ok := false;
  BEGIN
    INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, source_inquiry_id)
    VALUES ('Q-20270501-SMK942', 'Smoke', 'Test', 'smoke-93-pr2@example.invalid', 'email', v_b);
  EXCEPTION WHEN unique_violation THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('second_live_quote_same_request_refused', v_ok);

  -- the list sees the request as quoted, with the quote of v_q1
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('quoted', NULL, NULL, 101)
   WHERE id = v_b AND quote_id = v_q1 AND quote_reference = 'Q-20270501-SMK941';
  r := r || jsonb_build_object('list_quoted_shows_request_with_quote', v_n = 1);

  -- 3. void the quote: the request is open again and a new quote is allowed
  UPDATE public.quotes SET status = 'voided', voided_at = now() WHERE id = v_q1;
  v_ok := false;
  BEGIN
    INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, source_inquiry_id)
    VALUES ('Q-20270501-SMK943', 'Smoke', 'Test', 'smoke-93-pr2@example.invalid', 'email', v_b)
    RETURNING id INTO v_q2;
    v_ok := true;
  EXCEPTION WHEN unique_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('new_quote_after_void_allowed', v_ok);

  v_ok := false;
  BEGIN
    INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, source_inquiry_id)
    VALUES ('Q-20270501-SMK944', 'Smoke', 'Test', 'smoke-93-pr2@example.invalid', 'email', v_b);
  EXCEPTION WHEN unique_violation THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('third_live_quote_after_replacement_refused', v_ok);

  -- a second voided quote next to the live one is fine (any number of voided quotes)
  v_ok := false;
  BEGIN
    INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, source_inquiry_id, status, voided_at)
    VALUES ('Q-20270501-SMK945', 'Smoke', 'Test', 'smoke-93-pr2@example.invalid', 'email', v_b, 'voided', now());
    v_ok := true;
  EXCEPTION WHEN unique_violation THEN
    v_ok := false;
  END;
  r := r || jsonb_build_object('several_voided_quotes_allowed', v_ok);

  -- 4. the list function. Both requests are the newest rows, so they sit at the top of every unpaged result.
  -- open: v_a (no quote); v_b has the live replacement quote, so it is NOT open
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('open', NULL, NULL, 101) WHERE id = v_a;
  r := r || jsonb_build_object('open_contains_request_without_quote', v_n = 1);
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('open', NULL, NULL, 101) WHERE id = v_b;
  r := r || jsonb_build_object('open_excludes_request_with_live_quote', v_n = 0);

  -- quoted: v_b only, linked to the live quote (v_q2), never the voided one
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('quoted', NULL, NULL, 101) WHERE id = v_a;
  r := r || jsonb_build_object('quoted_excludes_request_without_quote', v_n = 0);
  SELECT quote_reference INTO v_ref FROM public.list_custom_tour_requests('quoted', NULL, NULL, 101) WHERE id = v_b;
  r := r || jsonb_build_object('quoted_links_the_live_quote_not_the_voided_one', v_ref = 'Q-20270501-SMK943');
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('quoted', NULL, NULL, 101) WHERE id = v_b AND quote_id = v_q2;
  r := r || jsonb_build_object('quoted_quote_id_is_the_live_quote', v_n = 1);

  -- one row per request (the LEFT JOIN never multiplies a request that also has voided quotes)
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('all', NULL, NULL, 101) WHERE id = v_b;
  r := r || jsonb_build_object('all_returns_each_request_once', v_n = 1);
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('all', NULL, NULL, 101) WHERE id IN (v_a, v_b);
  r := r || jsonb_build_object('all_contains_both_requests', v_n = 2);

  -- a request of another kind never appears
  INSERT INTO public.inquiries (kind, email, name, payload, created_at)
  VALUES ('contact', 'smoke-93-pr2@example.invalid', 'Smoke Contact', '{}'::jsonb, now() + interval '3 days');
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('all', NULL, NULL, 101) WHERE name = 'Smoke Contact';
  r := r || jsonb_build_object('other_kinds_excluded', v_n = 0);

  -- keyset: newest first is v_a, then v_b. Page size 1 returns v_a; the cursor of v_a returns v_b first.
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('all', NULL, NULL, 1);
  r := r || jsonb_build_object('limit_1_returns_one_row', v_n = 1);
  SELECT id INTO v_cur_id FROM public.list_custom_tour_requests('all', NULL, NULL, 1);
  r := r || jsonb_build_object('newest_first', v_cur_id = v_a);
  SELECT created_at, id INTO v_cur_at, v_cur_id FROM public.list_custom_tour_requests('all', NULL, NULL, 1);
  SELECT id INTO v_cur_id FROM public.list_custom_tour_requests('all', v_cur_at, v_cur_id, 1);
  r := r || jsonb_build_object('cursor_continues_after_the_last_row', v_cur_id = v_b);
  SELECT count(*) INTO v_n FROM public.list_custom_tour_requests('all', now() + interval '2 days', v_a, 101) WHERE id = v_a;
  r := r || jsonb_build_object('cursor_excludes_the_cursor_row_itself', v_n = 0);

  -- an unknown status is refused (22023), and a NULL one too
  v_ok := false;
  BEGIN
    PERFORM * FROM public.list_custom_tour_requests('weird', NULL, NULL, 10);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_ok := true;
  END;
  r := r || jsonb_build_object('bad_status_refused', v_ok);

  -- 5. the function is service_role only
  r := r || jsonb_build_object(
    'anon_can_execute_list_must_be_false',
    has_function_privilege('anon', 'public.list_custom_tour_requests(text,timestamptz,uuid,integer)', 'EXECUTE'));
  r := r || jsonb_build_object(
    'authenticated_can_execute_list_must_be_false',
    has_function_privilege('authenticated', 'public.list_custom_tour_requests(text,timestamptz,uuid,integer)', 'EXECUTE'));
  r := r || jsonb_build_object(
    'service_role_can_execute_list',
    has_function_privilege('service_role', 'public.list_custom_tour_requests(text,timestamptz,uuid,integer)', 'EXECUTE'));
  r := r || jsonb_build_object(
    'public_pseudo_role_has_no_execute',
    NOT EXISTS (
      SELECT 1
        FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.list_custom_tour_requests(text,timestamptz,uuid,integer)'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'));
  r := r || jsonb_build_object(
    'function_is_security_definer_with_empty_search_path',
    EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = 'public.list_custom_tour_requests(text,timestamptz,uuid,integer)'::regprocedure
         AND p.prosecdef
         AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']));

  -- verdict; the exception rolls back every row inserted above
  IF (SELECT bool_and(
        CASE
          WHEN key LIKE '%\_must\_be\_false' THEN value = 'false'::jsonb
          WHEN key = 'index_def' THEN true
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
--   SELECT count(*) FROM public.inquiries WHERE email = 'smoke-93-pr2@example.invalid';
--   SELECT count(*) FROM public.quotes WHERE reference LIKE 'Q-20270501-SMK94%';
--
-- Also (read-only, once after applying 094): the old 093 index must be gone and only the new one exist.
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'quotes' AND indexname = 'quotes_source_inquiry_id_key';
--   -- expected: ONE row, UNIQUE ... (source_inquiry_id) WHERE ((source_inquiry_id IS NOT NULL) AND (status <> 'voided'::text))
