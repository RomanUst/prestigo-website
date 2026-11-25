-- Rolled-back smoke of migration 098 on production, run 2026-11-24 through the Supabase MCP: SMOKE_OK none_version_ok
-- confirm=true paid=true booking_quote_mode=true no_deposit_ledger=true replay=true deposit_needs_intent=true
-- none_value_refused=true; afterwards 0 quotes, 0 bookings, empty net queue. Nothing is left behind: the block
-- always ends in RAISE EXCEPTION. Booking triggers (calendar, CRM, outbox) fire inside the transaction and roll back too.
DO $$
DECLARE
  q uuid; v uuid; l uuid; q2 uuid; v2 uuid; r text := ''; res jsonb; ok boolean;
  hash text := repeat('a', 64);
BEGIN
  -- A. No deposit + invoice: a plain confirmation converts with no intent.
  INSERT INTO public.quotes (reference, status, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20991231-SMK098', 'draft', 'Smoke', 'Test', 'smoke@example.invalid', 'other') RETURNING id INTO q;
  INSERT INTO public.quote_versions (quote_id, version_no, locale, currency, total_minor, deposit_kind, deposit_value,
    deposit_minor, remainder_method)
  VALUES (q, 1, 'en', 'eur', 10000, 'none', NULL, 0, 'invoice') RETURNING id INTO v;
  INSERT INTO public.quote_version_lines (version_id, position, trip_type, pickup_date, pickup_time, origin_address,
    destination_address, vehicle_class, passengers, luggage, amount_minor, deposit_share_minor, remainder_minor,
    amount_eur, amount_czk, distance_km)
  VALUES (v, 1, 'transfer', '2099-01-01', '09:00', 'A', 'B', 'business', 2, 0, 10000, 0, 10000, 100, 2500, 10) RETURNING id INTO l;
  UPDATE public.quote_versions SET frozen_at = now(), cancel_policy = '{"freeHours":24,"feePercent":100}'::jsonb,
    terms_version = 'quote-2026-11-1' WHERE id = v;
  UPDATE public.quotes SET status = 'accepted', current_version_id = v, accepted_version_id = v, accepted_at = now() WHERE id = q;
  INSERT INTO public.quote_acceptances (quote_id, version_id, accepted_at, locale, terms_version, terms_sha256,
    terms_rendered, deposit_minor, currency)
  VALUES (q, v, now(), 'en', 'quote-2026-11-1', hash, 'consent', 0, 'eur');
  r := r || 'none_version_ok ';

  res := public.quote_convert_to_bookings(q, v, NULL, NULL, NULL,
    jsonb_build_array(jsonb_build_object('position', 1, 'booking_reference', 'PRG-SMK098')), 'system', NULL);
  r := r || 'confirm=' || (res ->> 'converted') || ' ';
  r := r || 'paid=' || ((SELECT status FROM public.quotes WHERE id = q) = 'paid') || ' ';
  r := r || 'booking_quote_mode=' || ((SELECT payment_mode FROM public.bookings WHERE quote_id = q) = 'quote') || ' ';
  r := r || 'no_deposit_ledger=' || (NOT EXISTS (SELECT 1 FROM public.booking_payment_events e JOIN public.bookings b ON b.id = e.booking_id WHERE b.quote_id = q)) || ' ';
  res := public.quote_convert_to_bookings(q, v, NULL, NULL, NULL,
    jsonb_build_array(jsonb_build_object('position', 1, 'booking_reference', 'PRG-SMK098B')), 'system', NULL);
  r := r || 'replay=' || ((res ->> 'first_time') = 'false') || ' ';

  -- B. A deposit quote still refuses a call without its deposit intent.
  INSERT INTO public.quotes (reference, status, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20991231-SMK09B', 'draft', 'Smoke', 'Test', 'smoke2@example.invalid', 'other') RETURNING id INTO q2;
  INSERT INTO public.quote_versions (quote_id, version_no, locale, currency, total_minor, deposit_kind, deposit_value,
    deposit_minor, remainder_method, frozen_at, cancel_policy, terms_version)
  VALUES (q2, 1, 'en', 'eur', 10000, 'percent', 30, 3000, 'invoice', now(), '{}'::jsonb, 'x') RETURNING id INTO v2;
  UPDATE public.quotes SET status = 'accepted', current_version_id = v2 WHERE id = q2;
  res := public.quote_convert_to_bookings(q2, v2, NULL, NULL, NULL, '[]'::jsonb, 'system', NULL);
  r := r || 'deposit_needs_intent=' || ((res ->> 'reason') = 'intent_mismatch') || ' ';

  -- C. 'none' with a deposit value is refused.
  ok := false;
  BEGIN
    INSERT INTO public.quote_versions (quote_id, version_no, locale, currency, total_minor, deposit_kind, deposit_value, deposit_minor)
    VALUES (q2, 2, 'en', 'eur', 0, 'none', 30, 0);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  r := r || 'none_value_refused=' || ok;

  RAISE EXCEPTION 'SMOKE_OK %', r;
END $$;
