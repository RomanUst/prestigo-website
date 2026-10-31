-- 85-01 smoke: rolled-back proof of migration 081 (chat channel, stats_trips, stats_conversion).
--
-- Run with the Supabase MCP `execute_sql` AFTER `apply_migration` name `081_stats_conversion`.
-- The whole block ends in RAISE EXCEPTION, so every row it creates (bookings, identities, inquiries,
-- chat leads, the phone flag) is rolled back. ONLY the message SMOKE_OK_85_01 means success; any
-- other exception message names the failed assertion (SMOKE_FAIL_<step>).
--
-- Isolation: every fixture lives in the year 2001 (no live rows exist there; checked in step pre) and
-- every step reads its own calendar period, so steps cannot contaminate each other. Each person has a
-- unique email smoke-85-<x>@example.test and a unique phone +4207008520NN (E5/E4 use +4207008500NN).
-- bookings are written with an explicit created_at; pickup_utc is generated and never inserted.
-- Paid fixtures are linked through the real resolver public.identity_resolve_booking(id), as 84-01
-- does; abandoned rows are never linked (the resolver deletes the link for them).
--
-- Periods and expectations
--   a/b  2001-01-01..2001-01-31  contact + corporate inquiry of A, A pays 15 days later
--   c    2001-02-01..2001-02-28  window edge: +90 days converts, +90 days + 1 minute does not
--   d    2001-04-01..2001-04-30  cancelled / pending / not-abandoned unpaid never convert
--   e    2001-08-01..2001-08-31  chat channels, explicit conversion (180 days), phone resolution
--   f    2001-10-01..2001-10-31  abandoned rows: 2 inquiries, both converted by one later paid booking
--   g    2001-03-01..2001-03-31  Prague-local period edges (DST began 2001-03-25)
--   h    2001-12-01..2001-12-31  direct rows and the trips_in_period invariant
--   i    live window: delta check on current_date - 2 .. current_date
--   j    chat_lead_reserve with 6 args / 5 args, bucket
--   k    privileges and shape
--
-- If the live schema reports another NOT NULL bookings column without a default
-- (82-LIVE-SCHEMA.md), add it to the INSERT column list.

DO $smoke$
DECLARE
  j       jsonb;
  f       jsonb;
  w       jsonb;
  r       record;
  v_lead  uuid;
  v_lead2 uuid;
  v_ch1   text;
  v_ch2   text;
  v_ch3   text;
  v_msg   text;
  v_order text;
BEGIN
  -- ── pre: nothing live in 2001..2002, no smoke identities ──────────────────
  IF EXISTS (SELECT 1 FROM public.bookings WHERE created_at >= '2001-01-01' AND created_at < '2003-01-01')
     OR EXISTS (SELECT 1 FROM public.inquiries WHERE created_at >= '2001-01-01' AND created_at < '2003-01-01')
     OR EXISTS (SELECT 1 FROM public.chat_leads WHERE created_at >= '2001-01-01' AND created_at < '2003-01-01') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre live rows exist in 2001..2002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.identity_emails WHERE email LIKE 'smoke-85-%@example.test') THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre smoke identities already exist';
  END IF;
  IF EXISTS (SELECT 1 FROM public.phone_flags WHERE phone IN ('+420700850041', '+420700850051')) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_pre smoke phones already flagged';
  END IF;

  -- ── fixture: bookings ─────────────────────────────────────────────────────
  INSERT INTO public.bookings (
    booking_reference, leg, booking_type, status, booking_source, trip_type,
    origin_address, destination_address, passengers, luggage, pickup_date, pickup_time,
    vehicle_class, amount_czk, amount_eur, payment_link_id, lead_channel, created_at,
    client_first_name, client_last_name, client_email, client_phone
  )
  SELECT v.ref, v.leg, 'confirmed', v.status, v.src, v.trip_type,
         'Smoke origin', 'Smoke destination', 1, 0, '2030-01-01', '10:00',
         'business', v.eur * 25, v.eur, v.plink, v.lead, v.created,
         'Smoke', 'Fixture', v.email, v.phone
    FROM (VALUES
      -- a/b: person A pays 15 days after the first inquiry
      ('SMK-85-01-A1',  'outbound', 'confirmed', 'online', 'one_way',   100, NULL::text, NULL::text, '2001-01-25 10:00+01'::timestamptz, 'smoke-85-a@example.test',  '+420700852001'),
      -- c: window edge
      ('SMK-85-01-C1',  'outbound', 'confirmed', 'online', 'one_way',   110, NULL, NULL, ('2001-02-01 10:00+01'::timestamptz + interval '90 days'),                          'smoke-85-c1@example.test', '+420700852002'),
      ('SMK-85-01-C2',  'outbound', 'confirmed', 'online', 'one_way',   120, NULL, NULL, ('2001-02-02 10:00+01'::timestamptz + interval '90 days' + interval '1 minute'),    'smoke-85-c2@example.test', '+420700852003'),
      -- d: never convert
      ('SMK-85-01-D1',  'outbound', 'cancelled', 'online', 'one_way',   130, NULL, NULL, '2001-04-10 10:00+02'::timestamptz, 'smoke-85-d@example.test',  '+420700852004'),
      ('SMK-85-01-D2',  'outbound', 'pending',   'online', 'one_way',   140, NULL, NULL, '2001-04-12 10:00+02'::timestamptz, 'smoke-85-d@example.test',  '+420700852004'),
      ('SMK-85-01-D3',  'outbound', 'unpaid',    'online', 'one_way',   145, 'plink_smoke_85', NULL, '2001-04-13 10:00+02'::timestamptz, 'smoke-85-d@example.test',  '+420700852004'),
      -- e: explicit conversion targets (180 days after the lead) and phone-owner bookings
      ('SMK-85-01-E1B', 'outbound', 'confirmed', 'online', 'one_way',   150, NULL, NULL, ('2001-08-02 10:00+02'::timestamptz + interval '180 days'), 'smoke-85-e1@example.test', '+420700852005'),
      ('SMK-85-01-E2B', 'outbound', 'cancelled', 'online', 'one_way',   160, NULL, NULL, ('2001-08-03 10:00+02'::timestamptz + interval '180 days'), 'smoke-85-e2@example.test', '+420700852006'),
      ('SMK-85-01-E4B', 'outbound', 'confirmed', 'online', 'one_way',   170, NULL, NULL, '2001-08-20 10:00+02'::timestamptz, 'smoke-85-e4@example.test', '+420700850041'),
      ('SMK-85-01-E5B', 'outbound', 'confirmed', 'online', 'one_way',   180, NULL, NULL, '2001-08-22 10:00+02'::timestamptz, 'smoke-85-e5@example.test', '+420700850051'),
      -- f: two abandoned outbound rows, an abandoned return leg, one later paid booking
      ('SMK-85-01-F1',  'outbound', 'unpaid',    'online', 'one_way',   190, NULL, NULL, '2001-10-05 09:00+02'::timestamptz, 'smoke-85-f@example.test',  '+420700852007'),
      ('SMK-85-01-F2',  'outbound', 'unpaid',    'online', 'one_way',   190, NULL, NULL, '2001-10-06 09:00+02'::timestamptz, 'smoke-85-f@example.test',  '+420700852007'),
      ('SMK-85-01-F3R', 'return',   'unpaid',    'online', 'round_trip', 190, NULL, NULL, '2001-10-05 09:00+02'::timestamptz, 'smoke-85-f@example.test',  '+420700852007'),
      ('SMK-85-01-FP',  'outbound', 'confirmed', 'online', 'one_way',   200, NULL, NULL, '2001-11-20 10:00+01'::timestamptz, 'smoke-85-f@example.test',  '+420700852007'),
      -- h: direct rows
      ('SMK-85-01-H1',  'outbound', 'confirmed', 'manual', 'one_way',    10, NULL, 'whatsapp', '2001-12-05 10:00+01'::timestamptz, 'smoke-85-h1@example.test', '+420700852008'),
      ('SMK-85-01-H2',  'outbound', 'confirmed', 'manual', 'one_way',    20, NULL, NULL,       '2001-12-06 10:00+01'::timestamptz, 'smoke-85-h2@example.test', '+420700852009'),
      ('SMK-85-01-H3',  'outbound', 'confirmed', 'gnet',   'one_way',    30, NULL, NULL,       '2001-12-07 10:00+01'::timestamptz, 'noreply@gnet.local',       '+420700852010'),
      ('SMK-85-01-H4',  'outbound', 'confirmed', 'online', 'one_way',    40, NULL, NULL,       '2001-12-08 10:00+01'::timestamptz, 'smoke-85-h4@example.test', '+420700852011'),
      ('SMK-85-01-H5',  'outbound', 'confirmed', 'online', 'one_way',    50, NULL, NULL,       '2001-12-10 10:00+01'::timestamptz, 'smoke-85-h5@example.test', '+420700852012')
    ) AS v(ref, leg, status, src, trip_type, eur, plink, lead, created, email, phone);

  -- Link every paid, non-GNet fixture through the real resolver.
  FOR r IN
    SELECT b.id, b.booking_reference
      FROM public.bookings b
     WHERE b.booking_reference LIKE 'SMK-85-01-%'
       AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'completed')
       AND b.booking_source <> 'gnet'
     ORDER BY b.booking_reference
  LOOP
    PERFORM 1 FROM public.identity_resolve_booking(r.id) x WHERE x.outcome = 'resolved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SMOKE_FAIL_fx % did not resolve', r.booking_reference;
    END IF;
  END LOOP;

  -- ── shape: nine funnel entries and eight direct entries in the fixed order ─
  j := public.stats_conversion('2001-01-01', '2001-01-31');
  SELECT string_agg(e ->> 'source', ',' ORDER BY ord) INTO v_order
    FROM jsonb_array_elements(j -> 'funnel') WITH ORDINALITY AS t(e, ord);
  IF v_order <> 'chat_web,chat_whatsapp,chat_email,chat_telegram,chat_other,form_contact,form_corporate,form_multiday_quote,abandoned' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_shape1 funnel order %', v_order;
  END IF;
  SELECT string_agg(e ->> 'source', ',' ORDER BY ord) INTO v_order
    FROM jsonb_array_elements(j -> 'direct') WITH ORDINALITY AS t(e, ord);
  IF v_order <> 'manual_whatsapp,manual_phone,manual_email,manual_partner,manual_other,manual_unknown,gnet,online' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_shape2 direct order %', v_order;
  END IF;
  IF j ->> 'from' <> '2001-01-01' OR j ->> 'to' <> '2001-01-31' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_shape3 period echo %', j ->> 'from';
  END IF;
  BEGIN
    PERFORM public.stats_conversion(NULL, '2001-01-31');
    RAISE EXCEPTION 'SMOKE_FAIL_shape4 NULL period accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'invalid period' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.stats_conversion('2001-02-01', '2001-01-31');
    RAISE EXCEPTION 'SMOKE_FAIL_shape5 inverted period accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'invalid period' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;

  -- ── (a) contact inquiry, confirmed booking of the same email 15 days later ─
  INSERT INTO public.inquiries (kind, email, created_at) VALUES
    ('contact',   'smoke-85-a@example.test', '2001-01-10 12:00+01'),
    -- (b) a second inquiry (corporate) of the same email, same booking
    ('corporate', 'Smoke-85-A@Example.test', '2001-01-12 12:00+01');

  j := public.stats_conversion('2001-01-01', '2001-01-31');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 100 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_a1 form_contact %', f;
  END IF;
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_corporate")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 100 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b1 form_corporate %', f;
  END IF;
  w := j -> 'funnel_total';
  IF (w ->> 'inquiries')::integer <> 2 OR (w ->> 'converted')::integer <> 2
     OR (w ->> 'converting_bookings')::integer <> 1 OR (w ->> 'revenue_eur')::integer <> 100
     OR (w ->> 'window_open')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b2 funnel_total counts the booking twice %', w;
  END IF;
  IF (j ->> 'trips_in_period')::integer <> 1 OR (j ->> 'attributed_bookings')::integer <> 1
     OR (j -> 'direct_total' ->> 'bookings')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_b3 attribution %', j;
  END IF;

  -- ── (c) window edge: +90 days exactly converts, +90 days + 1 minute does not ─
  INSERT INTO public.inquiries (kind, email, created_at) VALUES
    ('contact', 'smoke-85-c1@example.test', '2001-02-01 10:00+01'),
    ('contact', 'smoke-85-c2@example.test', '2001-02-02 10:00+01');
  j := public.stats_conversion('2001-02-01', '2001-02-28');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")');
  IF (f ->> 'inquiries')::integer <> 2 OR (f ->> 'converted')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 110 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_c1 window edge %', f;
  END IF;

  -- ── (d) cancelled, pending and not-abandoned unpaid rows never convert ─────
  INSERT INTO public.inquiries (kind, email, created_at)
  VALUES ('contact', 'smoke-85-d@example.test', '2001-04-03 10:00+02');
  j := public.stats_conversion('2001-04-01', '2001-04-30');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 0 OR (f ->> 'revenue_eur')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_d1 non-paid booking converted %', f;
  END IF;
  IF (j -> 'funnel_total' ->> 'converting_bookings')::integer <> 0 OR (j ->> 'trips_in_period')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_d2 non-paid booking counted as a trip %', j;
  END IF;
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "abandoned")');
  IF (f ->> 'inquiries')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_d3 unpaid row with a payment link counted as abandoned %', f;
  END IF;

  -- ── (e) chat leads ────────────────────────────────────────────────────────
  INSERT INTO public.phone_flags (phone, shared, source) VALUES ('+420700850051', true, 'manual');

  INSERT INTO public.chat_leads
    (lead_ref, person_key, identity_id, phone, open, closed_reason, converted_booking_id, created_at, closed_at, channel)
  VALUES
    -- explicit conversion 180 days later, ignores the window
    ('chat:' || gen_random_uuid()::text, 'c:8500001', NULL, NULL, false, 'converted',
     (SELECT id FROM public.bookings WHERE booking_reference = 'SMK-85-01-E1B'),
     '2001-08-02 10:00+02', now(), 'telegram'),
    -- explicit id of a cancelled booking does not count
    ('chat:' || gen_random_uuid()::text, 'c:8500002', NULL, NULL, false, 'converted',
     (SELECT id FROM public.bookings WHERE booking_reference = 'SMK-85-01-E2B'),
     '2001-08-03 10:00+02', now(), 'whatsapp'),
    -- channel NULL lands in chat_other
    ('chat:' || gen_random_uuid()::text, 'c:8500003', NULL, NULL, true, NULL, NULL,
     '2001-08-04 10:00+02', NULL, NULL),
    -- no identity, phone with exactly one owner: converts by phone
    ('chat:' || gen_random_uuid()::text, 'c:8500004', NULL, '+420700850041', true, NULL, NULL,
     '2001-08-10 10:00+02', NULL, 'web'),
    -- no identity, phone flagged shared: never used
    ('chat:' || gen_random_uuid()::text, 'c:8500005', NULL, '+420700850051', true, NULL, NULL,
     '2001-08-11 10:00+02', NULL, 'email');

  j := public.stats_conversion('2001-08-01', '2001-08-31');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "chat_telegram")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 150 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e1 explicit conversion after 180 days %', f;
  END IF;
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "chat_whatsapp")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e2 cancelled explicit booking converted %', f;
  END IF;
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "chat_other")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e3 NULL channel not in chat_other %', f;
  END IF;
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "chat_web")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 170 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e4 phone-resolved lead did not convert %', f;
  END IF;
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "chat_email")');
  IF (f ->> 'inquiries')::integer <> 1 OR (f ->> 'converted')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e5 shared phone was used %', f;
  END IF;
  w := j -> 'funnel_total';
  IF (w ->> 'inquiries')::integer <> 5 OR (w ->> 'converted')::integer <> 2
     OR (w ->> 'converting_bookings')::integer <> 2 OR (w ->> 'revenue_eur')::integer <> 320 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e6 funnel_total %', w;
  END IF;
  -- trips created in August: E4B (attributed to the phone-resolved lead) and E5B (direct, online)
  IF (j ->> 'trips_in_period')::integer <> 2 OR (j ->> 'attributed_bookings')::integer <> 1
     OR (j -> 'direct_total' ->> 'bookings')::integer <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e7 direct/attributed split %', j;
  END IF;
  f := jsonb_path_query_first(j, '$.direct[*] ? (@.source == "online")');
  IF (f ->> 'bookings')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 180 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_e8 online direct row %', f;
  END IF;

  -- ── (f) abandoned rows: each outbound row is an inquiry, the return leg is not ─
  -- The abandoned rows F1, F2 and F3R stay unlinked on purpose (the resolver never links them): they are
  -- matched to the paid booking FP through identity_emails of the shared email.
  j := public.stats_conversion('2001-10-01', '2001-10-31');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "abandoned")');
  IF (f ->> 'inquiries')::integer <> 2 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f1 abandoned inquiries (return leg or dedup) %', f;
  END IF;
  IF (f ->> 'converted')::integer <> 2 OR (f ->> 'revenue_eur')::integer <> 200 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f2 abandoned rows not converted by the later paid booking %', f;
  END IF;
  IF (j -> 'funnel_total' ->> 'converting_bookings')::integer <> 1 OR (j -> 'funnel_total' ->> 'revenue_eur')::integer <> 200 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_f3 funnel_total %', j -> 'funnel_total';
  END IF;

  -- ── (g) Prague-local period edges (CEST from 2001-03-25) ──────────────────
  INSERT INTO public.inquiries (kind, email, created_at) VALUES
    ('contact', 'smoke-85-g1@example.test', '2001-03-31 23:30+02'),
    ('contact', 'smoke-85-g2@example.test', '2001-04-01 00:10+02'),
    ('contact', 'smoke-85-g3@example.test', '2001-02-28 23:59+01');
  j := public.stats_conversion('2001-03-01', '2001-03-31');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")');
  IF (f ->> 'inquiries')::integer <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_g1 March period %', f;
  END IF;
  j := public.stats_conversion('2001-04-01', '2001-04-30');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")');
  IF (f ->> 'inquiries')::integer <> 2 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_g2 April period (00:10 Prague on 04-01 must be inside) %', f;
  END IF;
  j := public.stats_conversion('2001-02-01', '2001-02-28');
  f := jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")');
  IF (f ->> 'inquiries')::integer <> 3 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_g3 February period (23:59 Prague on 02-28 must be inside) %', f;
  END IF;

  -- ── (h) direct rows ───────────────────────────────────────────────────────
  INSERT INTO public.inquiries (kind, email, created_at)
  VALUES ('contact', 'smoke-85-h5@example.test', '2001-11-20 10:00+01');
  j := public.stats_conversion('2001-12-01', '2001-12-31');
  IF (j -> 'direct' -> 0 ->> 'bookings')::integer <> 1 OR (j -> 'direct' -> 0 ->> 'revenue_eur')::integer <> 10 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_h1 manual_whatsapp %', j -> 'direct' -> 0;
  END IF;
  f := jsonb_path_query_first(j, '$.direct[*] ? (@.source == "manual_unknown")');
  IF (f ->> 'bookings')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 20 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_h2 manual_unknown %', f;
  END IF;
  f := jsonb_path_query_first(j, '$.direct[*] ? (@.source == "gnet")');
  IF (f ->> 'bookings')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 30 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_h3 gnet %', f;
  END IF;
  f := jsonb_path_query_first(j, '$.direct[*] ? (@.source == "online")');
  IF (f ->> 'bookings')::integer <> 1 OR (f ->> 'revenue_eur')::integer <> 40 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_h4 online (the booking with a prior inquiry must not be direct) %', f;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(j -> 'direct') e
     WHERE e ->> 'source' IN ('manual_phone', 'manual_email', 'manual_partner', 'manual_other')
       AND (e ->> 'bookings')::integer <> 0
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_h5 unexpected manual bucket %', j -> 'direct';
  END IF;
  IF (j -> 'direct_total' ->> 'bookings')::integer <> 4 OR (j -> 'direct_total' ->> 'revenue_eur')::integer <> 100
     OR (j ->> 'attributed_bookings')::integer <> 1 OR (j ->> 'trips_in_period')::integer <> 5
     OR (j ->> 'trips_in_period')::integer <> (j -> 'direct_total' ->> 'bookings')::integer + (j ->> 'attributed_bookings')::integer THEN
    RAISE EXCEPTION 'SMOKE_FAIL_h6 invariant trips_in_period = direct + attributed %', j;
  END IF;

  -- ── (i) window_open: delta against live rows (live data stays untouched) ───
  j := public.stats_conversion(current_date - 2, current_date);
  INSERT INTO public.inquiries (kind, email, created_at)
  VALUES ('contact', 'smoke-85-i@example.test', now() - interval '1 day');
  w := public.stats_conversion(current_date - 2, current_date);
  IF (jsonb_path_query_first(w, '$.funnel[*] ? (@.source == "form_contact")') ->> 'inquiries')::integer
     <> (jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")') ->> 'inquiries')::integer + 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_i1 inquiries did not grow by one';
  END IF;
  IF (jsonb_path_query_first(w, '$.funnel[*] ? (@.source == "form_contact")') ->> 'window_open')::integer
     <> (jsonb_path_query_first(j, '$.funnel[*] ? (@.source == "form_contact")') ->> 'window_open')::integer + 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_i2 window_open did not grow by one';
  END IF;
  IF (w -> 'funnel_total' ->> 'window_open')::integer <> (j -> 'funnel_total' ->> 'window_open')::integer + 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL_i3 funnel_total window_open did not grow by one';
  END IF;

  -- ── (j) chat_lead_reserve stores the bucket on INSERT only ────────────────
  SELECT x.chat_lead_id INTO v_lead
    FROM public.chat_lead_reserve('c:8500101', NULL::uuid, 8500101::bigint, NULL::text,
                                  'chat:' || gen_random_uuid()::text, 'Channel::Whatsapp') x;
  SELECT l.channel INTO v_ch1 FROM public.chat_leads l WHERE l.id = v_lead;
  IF v_ch1 IS DISTINCT FROM 'whatsapp' THEN RAISE EXCEPTION 'SMOKE_FAIL_j1 6-arg channel %', v_ch1; END IF;

  SELECT x.chat_lead_id INTO v_lead2
    FROM public.chat_lead_reserve('c:8500102', NULL::uuid, 8500102::bigint, NULL::text,
                                  'chat:' || gen_random_uuid()::text) x;
  SELECT l.channel INTO v_ch2 FROM public.chat_leads l WHERE l.id = v_lead2;
  IF v_ch2 IS NOT NULL THEN RAISE EXCEPTION 'SMOKE_FAIL_j2 5-arg call stored channel %', v_ch2; END IF;

  -- a later conversation of the same person returns the open lead and never relabels it
  PERFORM 1 FROM public.chat_lead_reserve('c:8500101', NULL::uuid, 8500101::bigint, NULL::text,
                                          'chat:' || gen_random_uuid()::text, 'Channel::Email') x;
  SELECT l.channel INTO v_ch3 FROM public.chat_leads l WHERE l.id = v_lead;
  IF v_ch3 IS DISTINCT FROM 'whatsapp' THEN RAISE EXCEPTION 'SMOKE_FAIL_j3 lead relabelled to %', v_ch3; END IF;

  IF public.chat_channel_bucket('Channel::Api') IS DISTINCT FROM 'other' THEN RAISE EXCEPTION 'SMOKE_FAIL_j4 unknown class'; END IF;
  IF public.chat_channel_bucket(NULL) IS NOT NULL THEN RAISE EXCEPTION 'SMOKE_FAIL_j5 NULL class'; END IF;
  IF public.chat_channel_bucket('Channel::Telegram') IS DISTINCT FROM 'telegram'
     OR public.chat_channel_bucket('Channel::WebWidget') IS DISTINCT FROM 'web'
     OR public.chat_channel_bucket('Channel::Email') IS DISTINCT FROM 'email'
     OR public.chat_channel_bucket('Channel::Whatsapp') IS DISTINCT FROM 'whatsapp' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_j6 bucket map';
  END IF;

  -- ── (k) privileges and shape ──────────────────────────────────────────────
  FOR r IN
    SELECT s FROM unnest(ARRAY[
      'public.chat_channel_bucket(text)',
      'public.chat_lead_reserve(text,uuid,bigint,text,text,text)',
      'public.stats_trips()',
      'public.stats_conversion(date,date)'
    ]) AS s
  LOOP
    IF has_function_privilege('anon', r.s, 'EXECUTE') THEN RAISE EXCEPTION 'SMOKE_FAIL_k1 anon can execute %', r.s; END IF;
    IF has_function_privilege('authenticated', r.s, 'EXECUTE') THEN RAISE EXCEPTION 'SMOKE_FAIL_k2 authenticated can execute %', r.s; END IF;
    IF NOT has_function_privilege('service_role', r.s, 'EXECUTE') THEN RAISE EXCEPTION 'SMOKE_FAIL_k3 service_role cannot execute %', r.s; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid = r.s::regprocedure AND p.proconfig @> ARRAY['search_path=""']
    ) THEN
      RAISE EXCEPTION 'SMOKE_FAIL_k4 search_path not pinned for %', r.s;
    END IF;
  END LOOP;
  IF to_regprocedure('public.chat_lead_reserve(text,uuid,bigint,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL_k5 old 5-arg chat_lead_reserve still exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.stats_trips()'::regprocedure AND p.provolatile = 's' AND p.prosecdef
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.stats_conversion(date,date)'::regprocedure AND p.provolatile = 's' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'SMOKE_FAIL_k6 stats functions are not STABLE SECURITY DEFINER';
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_85_01';
END;
$smoke$;
