-- 92-12 live smoke for migration 091 (quotes). Run with the Supabase MCP execute_sql AFTER 091 is applied (090 is live).
-- The erasure half is the second file, 92-12-smoke-erasure.sql (run it after this one). Two statements, one after the other:
--   A. catalog listing (one SELECT, READ-ONLY): section, name, detail
--   B. behaviour DO block. It ends in RAISE EXCEPTION, which is the ROLLBACK of everything it wrote (nothing persists, no
--      commit anywhere). The run FAILS with 'SMOKE_OK_92_12 ...' when every check passed; any other message
--      (SMOKE_FAIL ...) is a defect of 091. Trigger side effects (calendar queue, lead / CRM outbox) roll back too.
-- Expected for A: eight quote tables rls=true anon_priv=false auth_priv=false policies=2; bookings.quote_id /
--   quote_line_id / quote_deposit_minor; bookings_quote_line_id_key UNIQUE WHERE quote_line_id IS NOT NULL; the CHECKs
--   (locale list ends 'zh-hant', kind lists end quote_deposit / quote_remainder, consent mode has 'quote', consent
--   locale has 'zh-hant', text_rendered <= 4000); function_grants: public_exec=false anon_exec=false auth_exec=false for
--   all ten rows, service_role_exec=true only for convert, erasure_confirm, erasure_scope, erasure_anonymise_person and
--   erasure_quote_customer_ids (the two internal helpers and the guards: false).

-- == A. catalog listing =============================================================
SELECT 'tables' AS section, c.relname AS name,
       'rls=' || c.relrowsecurity || ' anon_priv=' || has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
       || ' auth_priv=' || has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
       || ' policies=' || (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS detail
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relname IN ('quotes', 'quote_versions', 'quote_version_lines', 'quote_version_line_stops', 'quote_links',
                     'quote_acceptances', 'quote_events', 'quote_documents')
UNION ALL
SELECT 'columns', t.table_name || '.' || t.column_name, t.data_type || ' nullable=' || t.is_nullable
  FROM information_schema.columns t
 WHERE t.table_schema = 'public' AND t.table_name = 'bookings'
   AND t.column_name IN ('quote_id', 'quote_line_id', 'quote_deposit_minor')
UNION ALL
SELECT 'indexes', i.indexname, i.indexdef
  FROM pg_indexes i
 WHERE i.schemaname = 'public' AND i.indexname IN ('bookings_quote_line_id_key', 'bookings_quote_id_idx')
UNION ALL
SELECT 'constraints', con.conrelid::regclass::text || '.' || con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
 WHERE con.conname IN ('quote_versions_locale_check', 'quotes_status_check', 'quote_events_kind_check',
                       'booking_payment_events_kind_check', 'booking_payment_consents_mode_check',
                       'booking_payment_consents_locale_check', 'booking_payment_consents_text_rendered_check')
UNION ALL
SELECT 'triggers', g.tgrelid::regclass::text || '.' || g.tgname, pg_get_triggerdef(g.oid)
  FROM pg_trigger g
 WHERE NOT g.tgisinternal AND g.tgrelid::regclass::text LIKE 'public.quote\_%'
UNION ALL
SELECT 'function_grants', f.oid::regprocedure::text,
       'public_exec=' || COALESCE((SELECT bool_or(a.grantee = 0) FROM aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) a
                                    WHERE a.privilege_type = 'EXECUTE'), false)
       || ' anon_exec=' || has_function_privilege('anon', f.oid, 'EXECUTE')
       || ' auth_exec=' || has_function_privilege('authenticated', f.oid, 'EXECUTE')
       || ' service_role_exec=' || has_function_privilege('service_role', f.oid, 'EXECUTE')
  FROM pg_proc f
 WHERE f.pronamespace = 'public'::regnamespace
   AND f.proname IN ('quote_convert_to_bookings', 'erasure_quote_ids', 'erasure_quote_payment_open', 'erasure_quote_customer_ids',
                     'erasure_confirm', 'erasure_scope', 'erasure_anonymise_person',
                     'quote_versions_guard', 'quote_children_guard', 'quote_log_guard')
ORDER BY 1, 2;

-- == B. behaviour (rolled back) =====================================================
DO $$
DECLARE
  c_tabs  text[] := ARRAY['quotes', 'quote_versions', 'quote_version_lines', 'quote_version_line_stops', 'quote_links',
                          'quote_acceptances', 'quote_events', 'quote_documents'];
  c_fns   text[] := ARRAY['quote_convert_to_bookings', 'erasure_quote_ids', 'erasure_quote_payment_open', 'erasure_quote_customer_ids',
                          'erasure_confirm', 'erasure_scope', 'erasure_anonymise_person',
                          'quote_versions_guard', 'quote_children_guard', 'quote_log_guard'];
  e1 text := 'smoke-conv-9212@example.test';
  v_q uuid; v_v uuid; v_acc uuid; v_x uuid;
  v_ln uuid[] := '{}'; v_bk uuid[];
  v_res jsonb; v_msg text; v_role text; v_tab text; v_sql text[]; v_want text[];
  n integer; n2 integer; i integer;
BEGIN
  -- 1. anon and authenticated: no table, no function. 42501 'permission denied for ...' is the only acceptable answer.
  SELECT count(*) INTO n FROM pg_proc f
   WHERE f.pronamespace = 'public'::regnamespace AND f.proname = ANY (c_fns)
     AND (has_function_privilege('anon', f.oid, 'EXECUTE') OR has_function_privilege('authenticated', f.oid, 'EXECUTE')
          OR COALESCE((SELECT bool_or(a.grantee = 0) FROM aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) a
                        WHERE a.privilege_type = 'EXECUTE'), false));
  IF n <> 0 THEN RAISE EXCEPTION 'SMOKE_FAIL % function(s) executable by anon / authenticated / PUBLIC', n; END IF;
  SELECT count(*) INTO n FROM pg_proc f WHERE f.pronamespace = 'public'::regnamespace AND f.proname = ANY (c_fns);
  IF n <> 10 THEN RAISE EXCEPTION 'SMOKE_FAIL expected 10 functions, found %', n; END IF;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_tab IN ARRAY c_tabs LOOP
      v_msg := NULL;
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', v_role);
        EXECUTE format('SELECT count(*) FROM public.%I', v_tab);
      EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
      IF v_msg IS NULL OR v_msg NOT LIKE 'permission denied for %' THEN
        RAISE EXCEPTION 'SMOKE_FAIL % read %: %', v_role, v_tab, v_msg;
      END IF;
    END LOOP;
    v_msg := NULL;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', v_role);
      PERFORM public.quote_convert_to_bookings(gen_random_uuid(), gen_random_uuid(), 'pi_x', NULL, NULL, '[]'::jsonb, 'system', NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
    IF v_msg IS NULL OR v_msg NOT LIKE 'permission denied for function%' THEN
      RAISE EXCEPTION 'SMOKE_FAIL % called quote_convert_to_bookings: %', v_role, v_msg;
    END IF;
  END LOOP;
  RESET ROLE;

  -- 2. A quote with a zh-hant version, three lines (two saved-card remainders, one without), stops, link, PDF, acceptance.
  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, client_phone, lead_channel)
  VALUES ('Q-20991231-SMOKE1', 'Smoke', 'Quote', e1, '+420 777 000 921', 'email') RETURNING id INTO v_q;
  INSERT INTO public.quote_versions (quote_id, version_no, locale, currency) VALUES (v_q, 1, 'zh-hant', 'eur') RETURNING id INTO v_v;
  FOR i IN 1..3 LOOP
    INSERT INTO public.quote_version_lines (version_id, position, trip_type, pickup_date, pickup_time, landing_date, landing_time,
        pickup_offset_min, origin_address, origin_lat, origin_lng, destination_address, vehicle_class, passengers,
        flight_number, special_requests, amount_minor, deposit_share_minor, remainder_minor, amount_eur, amount_czk)
    VALUES (v_v, i, 'transfer', to_char(current_date + 30 + i, 'YYYY-MM-DD'), '09:30',
        CASE WHEN i = 1 THEN to_char(current_date + 31, 'YYYY-MM-DD') END, CASE WHEN i = 1 THEN '09:00' END,
        CASE WHEN i = 1 THEN 30 END, 'Smoke origin ' || i, 50.1, 14.26, 'Smoke destination ' || i, 'business', 2,
        'OK123', 'smoke note', (ARRAY[10000, 8000, 5000])[i], (ARRAY[3000, 2000, 5000])[i], (ARRAY[7000, 6000, 0])[i],
        (ARRAY[100, 80, 50])[i], (ARRAY[2500, 2000, 1250])[i])
    RETURNING id INTO v_x;
    v_ln := v_ln || v_x;
    INSERT INTO public.quote_version_line_stops (line_id, position, address, lat, lng, wait_minutes, free_minutes)
    VALUES (v_x, 1, 'Smoke stop ' || i, 50.08, 14.42, 15, 15);
  END LOOP;
  UPDATE public.quote_versions
     SET frozen_at = now(), total_minor = 23000, deposit_kind = 'fixed', deposit_value = 10000, deposit_minor = 10000,
         remainder_method = 'saved_card', cancel_free_hours = 48, cancel_fee_percent = 100,
         cancel_policy = '{"freeHours": 48, "feePercent": 100}'::jsonb, cancel_policy_version = 'smoke', terms_version = 'smoke',
         billing_note = 'smoke billing note'
   WHERE id = v_v;
  INSERT INTO public.quote_links (quote_id, version_id, token_hash) VALUES (v_q, v_v, repeat('b', 64));
  INSERT INTO public.quote_documents (version_id, locale, pdf, sha256, byte_size) VALUES (v_v, 'zh-hant', '\x25504446'::bytea, repeat('d', 64), 4);
  INSERT INTO public.quote_acceptances (quote_id, version_id, locale, terms_version, terms_sha256, terms_rendered, deposit_minor,
      currency, ip, user_agent, payment_intent_id)
  VALUES (v_q, v_v, 'zh-hant', 'smoke', repeat('a', 64), repeat('Smoke terms. ', 200), 10000, 'eur', '203.0.113.9', 'smoke-agent', 'pi_smoke')
  RETURNING id INTO v_acc;
  UPDATE public.quotes SET status = 'accepted', current_version_id = v_v, accepted_version_id = v_v, accepted_at = now(),
         deposit_payment_intent_id = 'pi_smoke' WHERE id = v_q;

  -- 3. The conversion: three bookings, two card_hold and one quote, exactly once.
  v_res := public.quote_convert_to_bookings(v_q, v_v, 'pi_smoke', 'cus_smoke', 'pm_smoke',
    jsonb_build_array(
      jsonb_build_object('position', 1, 'booking_reference', 'SMOKE-92-12-1', 'hold_at', now() + interval '20 days'),
      jsonb_build_object('position', 2, 'booking_reference', 'SMOKE-92-12-2', 'hold_at', now() + interval '21 days'),
      jsonb_build_object('position', 3, 'booking_reference', 'SMOKE-92-12-3', 'hold_at', NULL)),
    'system', 'smoke');
  IF v_res->>'converted' IS DISTINCT FROM 'true' OR v_res->>'first_time' IS DISTINCT FROM 'true' OR jsonb_array_length(v_res->'booking_ids') <> 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL first conversion: %', v_res;
  END IF;
  SELECT array_agg(b.id) INTO v_bk FROM public.bookings b WHERE b.quote_id = v_q;
  SELECT count(*) FILTER (WHERE payment_mode = 'card_hold'), count(*) FILTER (WHERE payment_mode = 'quote') INTO n, n2
    FROM public.bookings WHERE quote_id = v_q;
  IF cardinality(v_bk) <> 3 OR n <> 2 OR n2 <> 1 THEN RAISE EXCEPTION 'SMOKE_FAIL bookings: % card_hold, % quote', n, n2; END IF;
  SELECT count(*) INTO n FROM public.booking_stops s WHERE s.booking_id = ANY (v_bk);
  SELECT count(*) INTO n2 FROM public.booking_payment_events e WHERE e.booking_id = ANY (v_bk) AND e.kind = 'quote_deposit';
  IF n <> 3 OR n2 <> 3 THEN RAISE EXCEPTION 'SMOKE_FAIL stops % / ledger rows %', n, n2; END IF;
  SELECT count(*) INTO n FROM public.booking_payment_consents c
   WHERE c.booking_id = ANY (v_bk) AND c.mode = 'quote' AND c.locale = 'zh-hant' AND char_length(c.text_rendered) > 2000;
  IF n <> 3 THEN RAISE EXCEPTION 'SMOKE_FAIL consent rows %', n; END IF;
  IF NOT (v_q = ANY (public.erasure_quote_ids('{}'::text[], '{}'::text[], v_bk))) THEN
    RAISE EXCEPTION 'SMOKE_FAIL quote not matched through its bookings by the erasure';
  END IF;
  IF (SELECT sum(quote_deposit_minor) FROM public.bookings WHERE quote_id = v_q) <> 10000
     OR (SELECT status FROM public.quotes WHERE id = v_q) <> 'paid'
     OR (SELECT confirmed_at FROM public.quote_acceptances WHERE id = v_acc) IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL deposit shares / quote status / acceptance confirmation';
  END IF;
  -- retry with the same intent: first_time false, nothing new; another intent: refused.
  v_res := public.quote_convert_to_bookings(v_q, v_v, 'pi_smoke', 'cus_smoke', 'pm_smoke', '[]'::jsonb, 'webhook', 'smoke');
  IF v_res->>'converted' IS DISTINCT FROM 'true' OR v_res->>'first_time' IS DISTINCT FROM 'false' OR jsonb_array_length(v_res->'booking_ids') <> 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL second conversion: %', v_res;
  END IF;
  v_res := public.quote_convert_to_bookings(v_q, v_v, 'pi_other', 'cus_smoke', 'pm_smoke', '[]'::jsonb, 'webhook', 'smoke');
  SELECT count(*) INTO n FROM public.bookings WHERE quote_id = v_q;
  IF v_res->>'converted' IS DISTINCT FROM 'false' OR v_res->>'reason' IS DISTINCT FROM 'intent_mismatch' OR n <> 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL other intent: % (% bookings)', v_res, n;
  END IF;

  -- 4. Guards: a frozen version, its lines and stops refuse changes; the acceptance and event logs are append-only;
  --    payment_intent_id is settable once (from NULL) and then frozen.
  INSERT INTO public.quote_acceptances (quote_id, version_id, locale, terms_version, terms_sha256, terms_rendered, deposit_minor, currency)
  VALUES (v_q, v_v, 'zh-hant', 'smoke', repeat('a', 64), 'Smoke terms.', 10000, 'eur') RETURNING id INTO v_x;
  UPDATE public.quote_acceptances SET payment_intent_id = 'pi_once' WHERE id = v_x;
  v_sql := ARRAY[
    format('UPDATE public.quote_versions SET total_minor = total_minor + 1 WHERE id = %L', v_v),
    format('DELETE FROM public.quote_versions WHERE id = %L', v_v),
    format('UPDATE public.quote_version_lines SET amount_minor = amount_minor + 1 WHERE id = %L', v_ln[1]),
    format('INSERT INTO public.quote_version_lines (version_id, position, trip_type, pickup_date, pickup_time, origin_address, vehicle_class, passengers, amount_minor) VALUES (%L, 4, ''transfer'', ''2099-01-01'', ''10:00'', ''x'', ''business'', 1, 100)', v_v),
    format('UPDATE public.quote_version_line_stops SET wait_minutes = 30 WHERE line_id = %L', v_ln[1]),
    format('DELETE FROM public.quote_acceptances WHERE id = %L', v_acc),
    format('UPDATE public.quote_acceptances SET ip = ''198.51.100.9'' WHERE id = %L', v_acc),
    format('UPDATE public.quote_acceptances SET payment_intent_id = ''pi_other'' WHERE id = %L', v_x),
    format('UPDATE public.quote_events SET amount_minor = 1 WHERE quote_id = %L', v_q),
    format('DELETE FROM public.quote_events WHERE quote_id = %L', v_q)];
  v_want := ARRAY['quote_version_frozen', 'quote_version_frozen', 'quote_version_frozen', 'quote_version_frozen', 'quote_version_frozen',
                  'quote_log_append_only', 'quote_log_append_only', 'quote_log_append_only', 'quote_log_append_only', 'quote_log_append_only'];
  FOR i IN 1..array_length(v_sql, 1) LOOP
    v_msg := NULL;
    BEGIN EXECUTE v_sql[i]; EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
    IF v_msg IS DISTINCT FROM v_want[i] THEN RAISE EXCEPTION 'SMOKE_FAIL guard %: got %', i, v_msg; END IF;
  END LOOP;

  RAISE EXCEPTION 'SMOKE_OK_92_12 every 091 check passed; this exception rolls the smoke rows back';
END
$$;
