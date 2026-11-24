-- Rolled-back smoke of migration 097 (run 2026-11-24 on production through the Supabase MCP: SMOKE_OK
-- tbc_insert_ok freeze_refused=true complete_freeze_ok frozen_guard=true; nothing left behind).
DO $$
DECLARE q uuid; v uuid; r text := ''; ok boolean;
BEGIN
  INSERT INTO public.quotes (reference, status, client_first_name, client_last_name, client_email, lead_channel)
  VALUES ('Q-20991231-SMK097', 'draft', 'Smoke', 'Test', 'smoke@example.invalid', 'other') RETURNING id INTO q;
  INSERT INTO public.quote_versions (quote_id, version_no, locale, currency, total_minor) VALUES (q, 1, 'en', 'eur', 0) RETURNING id INTO v;
  INSERT INTO public.quote_version_lines (version_id, position, trip_type, vehicle_class, passengers, luggage)
  VALUES (v, 1, 'tour', 'business', 2, 0);
  r := r || 'tbc_insert_ok ';
  ok := false;
  BEGIN
    UPDATE public.quote_versions SET frozen_at = now(), deposit_kind='percent', deposit_value=30, deposit_minor=3000,
      remainder_method='cash', total_minor=10000, cancel_policy='{}'::jsonb, terms_version='x' WHERE id = v;
  EXCEPTION WHEN others THEN ok := SQLERRM = 'quote_lines_incomplete';
  END;
  r := r || 'freeze_refused=' || ok || ' ';
  UPDATE public.quote_version_lines SET pickup_date='2099-01-01', pickup_time='09:00', origin_address='X', amount_minor=10000,
    title='T', hours=8 WHERE version_id = v;
  UPDATE public.quote_versions SET frozen_at = now(), deposit_kind='percent', deposit_value=30, deposit_minor=3000,
    remainder_method='cash', total_minor=10000, cancel_policy='{}'::jsonb, terms_version='x' WHERE id = v;
  r := r || 'complete_freeze_ok ';
  ok := false;
  BEGIN UPDATE public.quote_versions SET locale='ru' WHERE id = v; EXCEPTION WHEN others THEN ok := SQLERRM='quote_version_frozen'; END;
  r := r || 'frozen_guard=' || ok;
  RAISE EXCEPTION 'SMOKE_OK %', r;
END $$;
