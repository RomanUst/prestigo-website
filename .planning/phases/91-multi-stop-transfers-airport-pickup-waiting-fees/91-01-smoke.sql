-- 91-01 live smoke for migration 089 (booking_stops, landing columns, waiting rate, booking_extra_charges, ledger kinds,
-- erasure function copies).
--
-- Run with the Supabase MCP execute_sql AFTER 089 is applied. Two statements, one after the other.
--   A. the catalog listing   (one SELECT, READ-ONLY, returns rows: section, name, detail)
--   B. the behaviour DO block (ends in RAISE EXCEPTION, so everything it inserted is ROLLED BACK; the run FAILS with
--      'SMOKE_OK_91_01 ...' when every check passed, any message starting with 'SMOKE_FAIL' is a failure of 089)
--
-- Expected for A (every check is a row; look for the detail text):
--   columns          : bookings.landing_date / landing_time (text, nullable), bookings.pickup_offset_min (smallint, nullable),
--                      pricing_config.waiting_rate_per_15min (numeric, nullable, default -), booking_stops.* and
--                      booking_extra_charges.* with the defaults of the migration
--   constraints      : the CHECKs of both new tables, bookings_landing_* / bookings_pickup_offset_check,
--                      pricing_config_waiting_rate_check, and booking_payment_events_kind_check whose definition ends
--                      with 'cash_reopened', 'extra_charged', 'extra_failed'
--   tables           : booking_stops and booking_extra_charges with rls_enabled=true anon_priv=false authenticated_priv=false
--   policies         : *_no_public_read (SELECT, false) and *_no_public_insert (INSERT, false) on both tables
--   indexes          : booking_extra_charges_one_charging is UNIQUE with WHERE (status = 'charging'); booking_extra_charges_booking_idx
--   function_grants  : erasure_anonymise_person(uuid) and erasure_payment_open(uuid[]) -> public_exec=false anon_exec=false
--                      authenticated_exec=false (erasure_anonymise_person service_role_exec=true, erasure_payment_open false)
--   waiting_rates    : rows_with_rate=0 (D-05: no class offers paid waiting until the owner sets a rate)

-- == A. catalog listing =============================================================
SELECT 'columns' AS section, t.table_name || '.' || t.column_name AS name,
       t.data_type || ' nullable=' || t.is_nullable || ' default=' || coalesce(t.column_default, '-') AS detail
  FROM information_schema.columns t
 WHERE t.table_schema = 'public'
   AND ( t.table_name IN ('booking_stops', 'booking_extra_charges')
      OR (t.table_name = 'bookings' AND t.column_name IN ('landing_date', 'landing_time', 'pickup_offset_min'))
      OR (t.table_name = 'pricing_config' AND t.column_name = 'waiting_rate_per_15min') )

UNION ALL
SELECT 'constraints', con.conrelid::regclass::text || '.' || con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
 WHERE con.conrelid IN ('public.booking_stops'::regclass, 'public.booking_extra_charges'::regclass)
    OR con.conname IN ('bookings_landing_date_check', 'bookings_landing_time_check', 'bookings_pickup_offset_check',
                       'bookings_landing_complete_check', 'pricing_config_waiting_rate_check',
                       'booking_payment_events_kind_check')

UNION ALL
SELECT 'tables', c.relname,
       'rls_enabled=' || c.relrowsecurity
       || ' anon_priv=' || has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
       || ' authenticated_priv=' || has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relname IN ('booking_stops', 'booking_extra_charges')

UNION ALL
SELECT 'policies', p.tablename || '.' || p.policyname,
       p.cmd || ' qual=' || coalesce(p.qual, '-') || ' with_check=' || coalesce(p.with_check, '-')
  FROM pg_policies p
 WHERE p.schemaname = 'public'
   AND p.tablename IN ('booking_stops', 'booking_extra_charges')

UNION ALL
SELECT 'indexes', i.indexname, i.indexdef
  FROM pg_indexes i
 WHERE i.schemaname = 'public'
   AND i.tablename IN ('booking_stops', 'booking_extra_charges')

UNION ALL
SELECT 'function_grants', f.oid::regprocedure::text,
       'public_exec=' || coalesce((SELECT bool_or(a.grantee = 0) FROM aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                                    WHERE a.privilege_type = 'EXECUTE'), false)
       || ' anon_exec=' || has_function_privilege('anon', f.oid, 'EXECUTE')
       || ' authenticated_exec=' || has_function_privilege('authenticated', f.oid, 'EXECUTE')
       || ' service_role_exec=' || has_function_privilege('service_role', f.oid, 'EXECUTE')
  FROM pg_proc f
 WHERE f.pronamespace = 'public'::regnamespace
   AND f.proname IN ('erasure_anonymise_person', 'erasure_payment_open')

UNION ALL
SELECT 'waiting_rates', 'rows_with_rate', count(*)::text
  FROM public.pricing_config
 WHERE waiting_rate_per_15min IS NOT NULL

ORDER BY 1, 2;

-- == B. behaviour (rolled back) =====================================================
-- Takes any existing booking and writes inside one transaction that always ends in RAISE EXCEPTION, so the stop and the
-- extra-charge rows it creates are ROLLBACK-ed. The success marker is the exact exception text SMOKE_OK_91_01.
DO $$
DECLARE
  v_id    uuid;
  v_state text;
BEGIN
  SELECT b.id INTO v_id FROM public.bookings b ORDER BY b.created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL no booking to attach the rows to';
  END IF;

  -- A valid stop: position 1, wait 30 minutes, 15 free.
  INSERT INTO public.booking_stops (booking_id, position, address, wait_minutes, free_minutes)
  VALUES (v_id, 1, 'Smoke stop', 30, 15);

  -- wait_minutes 20 is not a multiple of 15.
  BEGIN
    INSERT INTO public.booking_stops (booking_id, position, wait_minutes, free_minutes) VALUES (v_id, 2, 20, 15);
    RAISE EXCEPTION 'SMOKE_FAIL wait_minutes 20 was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- position 6 is out of range.
  BEGIN
    INSERT INTO public.booking_stops (booking_id, position, wait_minutes, free_minutes) VALUES (v_id, 6, 0, 0);
    RAISE EXCEPTION 'SMOKE_FAIL position 6 was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- The same (booking, position) twice.
  BEGIN
    INSERT INTO public.booking_stops (booking_id, position, wait_minutes, free_minutes) VALUES (v_id, 1, 0, 0);
    RAISE EXCEPTION 'SMOKE_FAIL duplicate stop position was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Landing columns: all three or none.
  BEGIN
    UPDATE public.bookings SET landing_date = '2030-01-01' WHERE id = v_id;
    RAISE EXCEPTION 'SMOKE_FAIL a lone landing_date was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- A charging extra charge, then a second charging row for the same booking.
  INSERT INTO public.booking_extra_charges (booking_id, kind, currency, amount_minor, minutes, blocks)
  VALUES (v_id, 'waiting', 'eur', 3000, 30, 2);
  SELECT e.status INTO v_state FROM public.booking_extra_charges e WHERE e.booking_id = v_id;
  IF v_state IS DISTINCT FROM 'charging' THEN
    RAISE EXCEPTION 'SMOKE_FAIL extra charge status default is %', v_state;
  END IF;

  BEGIN
    INSERT INTO public.booking_extra_charges (booking_id, kind, currency, amount_minor)
    VALUES (v_id, 'other', 'eur', 1000);
    RAISE EXCEPTION 'SMOKE_FAIL a second charging row was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- A charged row next to the charging one is fine.
  INSERT INTO public.booking_extra_charges (booking_id, kind, status, currency, amount_minor, description)
  VALUES (v_id, 'other', 'charged', 'eur', 1000, 'Smoke description');

  -- The two new ledger kinds are accepted.
  PERFORM public.append_payment_event(
    v_id,
    jsonb_build_object('key', 'smoke-91-01-a', 'kind', 'extra_charged', 'actor_type', 'system', 'actor_id', 'smoke')
  );
  PERFORM public.append_payment_event(
    v_id,
    jsonb_build_object('key', 'smoke-91-01-b', 'kind', 'extra_failed', 'actor_type', 'system', 'actor_id', 'smoke')
  );

  -- erasure_payment_open counts the booking while its extra charge is charging.
  IF public.erasure_payment_open(ARRAY[v_id]) <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL erasure_payment_open ignored a charging extra charge';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_91_01 every 089 check passed; this exception rolls the smoke rows back';
END
$$;
