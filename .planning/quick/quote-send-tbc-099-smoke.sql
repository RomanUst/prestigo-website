-- Rolled-back smoke of migration 099 on production (Supabase MCP), run 2026-11-25: SMOKE_OK frozen_with_tbc pending=true
-- paid_pending=true no_bookings=true create_while_tbc=incomplete fill_complete=true kept_origin=true filled_time=true
-- created=true booking_time=true pending_cleared=true second_call_replay=true guard_closed=true; afterwards 0 quotes,
-- 0 bookings, empty net queue. Ends in RAISE EXCEPTION: nothing is left behind.
DO $$
DECLARE
  q uuid; v uuid; l1 uuid; r text := ''; res jsonb;
BEGIN
  INSERT INTO public.quotes (reference, status, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20991231-SMK099', 'draft', 'Smoke', 'Test', 'smoke@example.invalid', 'other') RETURNING id INTO q;
  INSERT INTO public.quote_versions (quote_id, version_no, locale, currency, total_minor, deposit_kind, deposit_value,
    deposit_minor, remainder_method)
  VALUES (q, 1, 'en', 'eur', 10000, 'none', NULL, 0, 'invoice') RETURNING id INTO v;
  -- A transfer sent with its pickup time and destination TBC.
  INSERT INTO public.quote_version_lines (version_id, position, trip_type, pickup_date, pickup_time, origin_address,
    destination_address, vehicle_class, passengers, luggage, amount_minor, deposit_share_minor, remainder_minor,
    amount_eur, amount_czk)
  VALUES (v, 1, 'transfer', '2099-01-01', NULL, 'A', NULL, 'business', 2, 0, 10000, 0, 10000, 100, 2500) RETURNING id INTO l1;
  UPDATE public.quote_versions SET frozen_at = now(), cancel_policy = '{"freeHours":24,"feePercent":100}'::jsonb,
    terms_version = 'quote-2026-11-1' WHERE id = v;
  r := r || 'frozen_with_tbc ';
  UPDATE public.quotes SET status = 'accepted', current_version_id = v, accepted_version_id = v, accepted_at = now() WHERE id = q;
  INSERT INTO public.quote_acceptances (quote_id, version_id, accepted_at, locale, terms_version, terms_sha256,
    terms_rendered, deposit_minor, currency)
  VALUES (q, v, now(), 'en', 'quote-2026-11-1', repeat('a', 64), 'consent', 0, 'eur');

  res := public.quote_convert_to_bookings(q, v, NULL, NULL, NULL,
    jsonb_build_array(jsonb_build_object('position', 1, 'booking_reference', 'PRG-SMK099')), 'system', NULL);
  r := r || 'pending=' || (res ->> 'pending') || ' ';
  r := r || 'paid_pending=' || ((SELECT status = 'paid' AND bookings_pending FROM public.quotes WHERE id = q)) || ' ';
  r := r || 'no_bookings=' || (NOT EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = q)) || ' ';

  res := public.quote_create_pending_bookings(q,
    jsonb_build_array(jsonb_build_object('position', 1, 'booking_reference', 'PRG-SMK099')), 'admin', NULL);
  r := r || 'create_while_tbc=' || (res ->> 'reason') || ' ';

  -- Fill: origin_address 'A' is shown to the client and must not change; time and destination are TBC.
  res := public.quote_fill_line_details(l1, '{"pickup_time":"10:15","origin_address":"Z","destination_address":"B","destination_lat":50.1,"destination_lng":14.4}'::jsonb, NULL);
  r := r || 'fill_complete=' || (res ->> 'complete') || ' ';
  r := r || 'kept_origin=' || ((SELECT origin_address FROM public.quote_version_lines WHERE id = l1) = 'A') || ' ';
  r := r || 'filled_time=' || ((SELECT pickup_time FROM public.quote_version_lines WHERE id = l1) = '10:15') || ' ';

  res := public.quote_create_pending_bookings(q,
    jsonb_build_array(jsonb_build_object('position', 1, 'booking_reference', 'PRG-SMK099')), 'admin', NULL);
  r := r || 'created=' || (res ->> 'created') || ' ';
  r := r || 'booking_time=' || ((SELECT pickup_time FROM public.bookings WHERE quote_id = q) = '10:15') || ' ';
  r := r || 'pending_cleared=' || (NOT (SELECT bookings_pending FROM public.quotes WHERE id = q)) || ' ';
  res := public.quote_create_pending_bookings(q,
    jsonb_build_array(jsonb_build_object('position', 1, 'booking_reference', 'PRG-SMK099B')), 'admin', NULL);
  r := r || 'second_call_replay=' || ((res ->> 'first_time') = 'false') || ' ';

  -- A frozen line still refuses a normal UPDATE (the switch is off outside the fill function).
  BEGIN
    UPDATE public.quote_version_lines SET terminal = 'T9' WHERE id = l1;
    r := r || 'guard_open!';
  EXCEPTION WHEN others THEN r := r || 'guard_closed=' || (SQLERRM = 'quote_version_frozen');
  END;

  RAISE EXCEPTION 'SMOKE_OK %', r;
END $$;
