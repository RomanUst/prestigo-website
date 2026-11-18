-- 93-01 live smoke for migration 092 (tours). Run with the Supabase MCP execute_sql AFTER 092 is applied.
-- Two statements, one after the other:
--   A. catalog listing (one SELECT, READ-ONLY): section, name, detail
--   B. behaviour DO block. It ends in RAISE EXCEPTION, which is the ROLLBACK of everything it wrote (nothing persists,
--      no commit anywhere). The run FAILS with 'SMOKE_OK_93_01 ...' when every check passed; any other message
--      (SMOKE_FAIL ...) is a defect of 092.
-- Expected for A: four tour tables rls=true anon_priv=false auth_priv=false policies=2; the tour_settings row id 1 with
--   free_cancel_hours 24 and pickup_radius_km 15; bucket tour-photos public=true 8388608 with the four image MIME
--   types; bookings.tour_id / tour_title / tour_extra_hours; the CHECK definitions (slug, locale, source, status).
-- After B: SELECT count(*) FROM public.tours WHERE slug = 'smoke-test-day-trip'  -> 0.

-- == A. catalog listing =============================================================
SELECT 'tables' AS section, c.relname AS name,
       'rls=' || c.relrowsecurity
       || ' anon_priv=' || has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
       || ' auth_priv=' || has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
       || ' policies=' || (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS detail
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relname IN ('tours', 'tour_translations', 'tour_photos', 'tour_settings')
UNION ALL
SELECT 'settings', 'tour_settings.id=' || s.id,
       'free_cancel_hours=' || s.free_cancel_hours || ' pickup_radius_km=' || s.pickup_radius_km
       || ' extra_hour_e=' || COALESCE(s.extra_hour_e_eur::text, 'null')
  FROM public.tour_settings s
UNION ALL
SELECT 'bucket', b.id,
       'public=' || b.public || ' limit=' || b.file_size_limit || ' mime=' || array_to_string(b.allowed_mime_types, ',')
  FROM storage.buckets b WHERE b.id = 'tour-photos'
UNION ALL
SELECT 'columns', t.table_name || '.' || t.column_name, t.data_type || ' nullable=' || t.is_nullable
  FROM information_schema.columns t
 WHERE t.table_schema = 'public' AND t.table_name = 'bookings'
   AND t.column_name IN ('tour_id', 'tour_title', 'tour_extra_hours')
UNION ALL
SELECT 'indexes', i.indexname, i.indexdef
  FROM pg_indexes i
 WHERE i.schemaname = 'public'
   AND i.indexname IN ('tour_photos_one_cover', 'tour_photos_tour_position_idx', 'tours_status_sort_idx', 'bookings_tour_id_idx')
UNION ALL
SELECT 'constraints', con.conrelid::regclass::text || '.' || con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
 WHERE con.conname IN ('tours_slug_check', 'tours_status_check', 'tour_translations_locale_check', 'tour_photos_source_check')
    OR (con.conrelid = 'public.bookings'::regclass AND pg_get_constraintdef(con.oid) ILIKE '%tour_extra_hours%')
ORDER BY 1, 2;

-- == B. behaviour (rolled back) =====================================================
DO $$
DECLARE
  c_tabs text[] := ARRAY['tours', 'tour_translations', 'tour_photos', 'tour_settings'];
  v_tab  text;
  v_role text;
  v_tour uuid;
  v_path text;
  n integer;
  b record;
  s record;
  v_hit boolean;
BEGIN
  -- 1. anon and authenticated: no privilege on any of the four tables, RLS on, two deny policies each.
  FOREACH v_tab IN ARRAY c_tabs LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(v_role, 'public.' || v_tab, 'SELECT, INSERT, UPDATE, DELETE') THEN
        RAISE EXCEPTION 'SMOKE_FAIL % has a privilege on %', v_role, v_tab;
      END IF;
    END LOOP;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = ('public.' || v_tab)::regclass) THEN
      RAISE EXCEPTION 'SMOKE_FAIL RLS is off on %', v_tab;
    END IF;
    SELECT count(*) INTO n FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = v_tab;
    IF n <> 2 THEN RAISE EXCEPTION 'SMOKE_FAIL % has % policies, expected 2', v_tab, n; END IF;
  END LOOP;

  -- 2. the settings row and its defaults.
  SELECT * INTO s FROM public.tour_settings WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SMOKE_FAIL tour_settings row 1 is missing'; END IF;
  IF s.free_cancel_hours <> 24 OR s.pickup_radius_km <> 15 THEN
    RAISE EXCEPTION 'SMOKE_FAIL settings defaults are % / %', s.free_cancel_hours, s.pickup_radius_km;
  END IF;
  v_hit := false;
  BEGIN
    INSERT INTO public.tour_settings (id) VALUES (2);
  EXCEPTION WHEN check_violation THEN v_hit := true;
  END;
  IF NOT v_hit THEN RAISE EXCEPTION 'SMOKE_FAIL a second tour_settings row was accepted'; END IF;

  -- 3. the bucket.
  SELECT * INTO b FROM storage.buckets WHERE id = 'tour-photos';
  IF NOT FOUND THEN RAISE EXCEPTION 'SMOKE_FAIL bucket tour-photos is missing'; END IF;
  IF b.public IS NOT TRUE OR b.file_size_limit <> 8388608
     OR b.allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'] THEN
    RAISE EXCEPTION 'SMOKE_FAIL bucket settings are public=% limit=% mime=%', b.public, b.file_size_limit, b.allowed_mime_types;
  END IF;

  -- 4. the bookings columns.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'bookings'
     AND column_name IN ('tour_id', 'tour_title', 'tour_extra_hours');
  IF n <> 3 THEN RAISE EXCEPTION 'SMOKE_FAIL bookings has % of the 3 tour columns', n; END IF;

  -- 5. a draft tour, its en translation and one cover photo are accepted.
  INSERT INTO public.tours (slug, destination_label) VALUES ('smoke-test-day-trip', 'Smoke')
    RETURNING id INTO v_tour;
  INSERT INTO public.tour_translations (tour_id, locale, title) VALUES (v_tour, 'en', 'Smoke');
  v_path := 'tours/' || v_tour || '/' || gen_random_uuid() || '.jpg';
  INSERT INTO public.tour_photos (tour_id, storage_path, position, is_cover) VALUES (v_tour, v_path, 1, true);

  -- 6. a second cover for the same tour is rejected (unique_violation).
  v_hit := false;
  BEGIN
    INSERT INTO public.tour_photos (tour_id, storage_path, position, is_cover)
    VALUES (v_tour, 'tours/' || v_tour || '/' || gen_random_uuid() || '.png', 2, true);
  EXCEPTION WHEN unique_violation THEN v_hit := true;
  END;
  IF NOT v_hit THEN RAISE EXCEPTION 'SMOKE_FAIL a second cover photo was accepted'; END IF;

  -- 7. a slug without the -day-trip suffix is rejected.
  v_hit := false;
  BEGIN
    INSERT INTO public.tours (slug) VALUES ('smoke-test');
  EXCEPTION WHEN check_violation THEN v_hit := true;
  END;
  IF NOT v_hit THEN RAISE EXCEPTION 'SMOKE_FAIL slug smoke-test was accepted'; END IF;

  -- 8. an unknown locale, a javascript: credit link, an SVG path and a non-positive price are rejected.
  v_hit := false;
  BEGIN
    INSERT INTO public.tour_translations (tour_id, locale) VALUES (v_tour, 'de');
  EXCEPTION WHEN check_violation THEN v_hit := true;
  END;
  IF NOT v_hit THEN RAISE EXCEPTION 'SMOKE_FAIL locale de was accepted'; END IF;

  v_hit := false;
  BEGIN
    INSERT INTO public.tour_photos (tour_id, storage_path, position, credit_url)
    VALUES (v_tour, 'tours/' || v_tour || '/' || gen_random_uuid() || '.jpg', 3, 'javascript:alert(1)');
  EXCEPTION WHEN check_violation THEN v_hit := true;
  END;
  IF NOT v_hit THEN RAISE EXCEPTION 'SMOKE_FAIL a javascript: credit_url was accepted'; END IF;

  v_hit := false;
  BEGIN
    INSERT INTO public.tour_photos (tour_id, storage_path, position)
    VALUES (v_tour, 'tours/' || v_tour || '/' || gen_random_uuid() || '.svg', 4);
  EXCEPTION WHEN check_violation THEN v_hit := true;
  END;
  IF NOT v_hit THEN RAISE EXCEPTION 'SMOKE_FAIL an .svg storage_path was accepted'; END IF;

  v_hit := false;
  BEGIN
    UPDATE public.tours SET price_e_eur = 0 WHERE id = v_tour;
  EXCEPTION WHEN check_violation THEN v_hit := true;
  END;
  IF NOT v_hit THEN RAISE EXCEPTION 'SMOKE_FAIL price 0 was accepted'; END IF;

  -- 9. trip_type has no live CHECK, so 'tour' needs no widening: no CHECK on bookings mentions trip_type.
  SELECT count(*) INTO n FROM pg_constraint con
   WHERE con.conrelid = 'public.bookings'::regclass AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%trip_type%';
  IF n <> 0 THEN RAISE EXCEPTION 'SMOKE_FAIL a CHECK on bookings.trip_type exists (% rows): widen it with tour', n; END IF;

  -- 10. the tour_extra_hours CHECK has the upper bound 12.
  SELECT count(*) INTO n FROM pg_constraint con
   WHERE con.conrelid = 'public.bookings'::regclass AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%tour_extra_hours%' AND pg_get_constraintdef(con.oid) LIKE '%12%';
  IF n <> 1 THEN RAISE EXCEPTION 'SMOKE_FAIL tour_extra_hours CHECK with bound 12 not found (% rows)', n; END IF;

  -- Everything passed: the RAISE below rolls back every row written above.
  RAISE EXCEPTION 'SMOKE_OK_93_01 all checks passed (rolled back)';
END
$$;
