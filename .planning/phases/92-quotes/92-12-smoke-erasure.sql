-- 92-12 live smoke, erasure half (second file next to 92-12-smoke.sql). Run with the Supabase MCP execute_sql AFTER 091 is
-- applied. ONE DO block; it ends in RAISE EXCEPTION, which is the ROLLBACK of everything it wrote (no commit anywhere). The run
-- FAILS with 'SMOKE_OK_92_12_ERASURE ...' when every check passed; any 'SMOKE_FAIL ...' is a defect of 091.
-- Covers: erasure_scope counts an unconverted quote; erasure_anonymise_person DELETES a quote with no booking and no money
-- (version, line, stop, link, PDF, acceptance and event included, through the frozen / append-only guards), ANONYMISES a quote
-- that took money (client fields, addresses, acceptance ip, link, PDF, Stripe ids; amounts, dates, ledgers stay) and closes
-- the guard bypass afterwards; a quote with money in flight is counted, refuses erasure_confirm ('payment_open') and its
-- Stripe customer is not returned by erasure_quote_customer_ids.
DO $$
DECLARE
  c_steps jsonb := '{"chatwoot": {}, "espocrm": {}, "verify": {"verified": true}, "stripe": {}}'::jsonb;
  c_mail  text[] := ARRAY['smoke-erase-9212@example.test', 'smoke-paid-9212@example.test', 'smoke-open-9212@example.test'];
  v_actor uuid := gen_random_uuid();
  v_q uuid[] := '{}'; v_v uuid[] := '{}'; v_l uuid[] := '{}'; v_r uuid[] := '{}';
  v_x uuid; v_res jsonb; v_msg text; n integer; i integer;
BEGIN
  -- 1 = never took money (deleted), 2 = paid, no booking (kept, anonymised). Both frozen, with line, stop, link, PDF, acceptance, event.
  FOR i IN 1..2 LOOP
    INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, client_phone, lead_channel, status,
        paid_at, deposit_payment_intent_id, stripe_customer_id, stripe_payment_method_id)
    VALUES ('Q-20991231-SMOKE' || (i + 1), 'Smoke', 'Erase', c_mail[i], CASE WHEN i = 2 THEN '+420 777 000 922' END,
        'email', CASE WHEN i = 2 THEN 'paid' ELSE 'sent' END, CASE WHEN i = 2 THEN now() END,
        CASE WHEN i = 2 THEN 'pi_smoke_paid' END, CASE WHEN i = 2 THEN 'cus_smoke_paid' END, CASE WHEN i = 2 THEN 'pm_smoke_paid' END)
    RETURNING id INTO v_x;
    v_q := v_q || v_x;
    INSERT INTO public.quote_versions (quote_id, version_no, locale, currency) VALUES (v_x, 1, 'zh-hant', 'eur') RETURNING id INTO v_x;
    v_v := v_v || v_x;
    INSERT INTO public.quote_version_lines (version_id, position, trip_type, pickup_date, pickup_time, origin_address, origin_lat,
        destination_address, vehicle_class, passengers, flight_number, special_requests, amount_minor)
    VALUES (v_x, 1, 'transfer', '2099-01-01', '10:00', 'Smoke erase origin', 50.1, 'Smoke erase destination', 'business', 1, 'OK123', 'smoke note', 5000)
    RETURNING id INTO v_x;
    v_l := v_l || v_x;
    INSERT INTO public.quote_version_line_stops (line_id, position, address, lat, lng, wait_minutes, free_minutes)
    VALUES (v_x, 1, 'Smoke erase stop', 50.08, 14.42, 0, 15);
    UPDATE public.quote_versions SET frozen_at = now(), total_minor = 5000, deposit_kind = 'fixed', deposit_value = 1000, deposit_minor = 1000,
           remainder_method = 'cash', cancel_policy = '{}'::jsonb, terms_version = 'smoke', billing_note = 'smoke billing note'
     WHERE id = v_v[i];
    UPDATE public.quotes SET current_version_id = v_v[i] WHERE id = v_q[i];
    INSERT INTO public.quote_links (quote_id, version_id, token_hash) VALUES (v_q[i], v_v[i], repeat(i::text, 64));
    INSERT INTO public.quote_documents (version_id, locale, pdf, sha256, byte_size) VALUES (v_v[i], 'zh-hant', '\x25504446'::bytea, repeat('d', 64), 4);
    INSERT INTO public.quote_acceptances (quote_id, version_id, locale, terms_version, terms_sha256, terms_rendered, deposit_minor, currency, ip, user_agent)
    VALUES (v_q[i], v_v[i], 'zh-hant', 'smoke', repeat('a', 64), 'Smoke terms.', 1000, 'eur', '203.0.113.5', 'smoke-agent');
    INSERT INTO public.quote_events (quote_id, event_key, kind, actor_type) VALUES (v_q[i], 'created', 'created', 'admin');
  END LOOP;

  -- 2. The preview sees the unconverted quote; matching by phone works.
  v_res := public.erasure_scope(c_mail[1], NULL);
  IF v_res->>'outcome' IS DISTINCT FROM 'ok' OR v_res->'counts'->>'quotes' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'SMOKE_FAIL scope of an unconverted quote: %', v_res;
  END IF;
  IF NOT (v_q[2] = ANY (public.erasure_quote_ids('{}'::text[], ARRAY[public.identity_normalize_phone('+420 777 000 922')], '{}'::uuid[]))) THEN
    RAISE EXCEPTION 'SMOKE_FAIL quote not matched by its phone';
  END IF;

  -- 3. Erase both people (one request each).
  FOR i IN 1..2 LOOP
    INSERT INTO public.erasure_requests (requested_by, email_hmac, status, expires_at, subject_emails, steps)
    VALUES (v_actor, repeat((ARRAY['e', 'f'])[i], 64), 'confirmed', now() + interval '1 hour', ARRAY[c_mail[i]], c_steps)
    RETURNING id INTO v_x;
    v_res := public.erasure_anonymise_person(v_x);
    IF v_res->>'quotes_deleted' IS DISTINCT FROM (ARRAY['1', '0'])[i] OR v_res->>'quotes_anonymised' IS DISTINCT FROM (ARRAY['0', '1'])[i] THEN
      RAISE EXCEPTION 'SMOKE_FAIL erasure counts %: %', i, v_res;
    END IF;
  END LOOP;

  SELECT (SELECT count(*) FROM public.quotes WHERE id = v_q[1]) + (SELECT count(*) FROM public.quote_versions WHERE quote_id = v_q[1])
       + (SELECT count(*) FROM public.quote_version_lines WHERE version_id = v_v[1]) + (SELECT count(*) FROM public.quote_version_line_stops WHERE line_id = v_l[1])
       + (SELECT count(*) FROM public.quote_links WHERE quote_id = v_q[1]) + (SELECT count(*) FROM public.quote_acceptances WHERE quote_id = v_q[1])
       + (SELECT count(*) FROM public.quote_events WHERE quote_id = v_q[1]) + (SELECT count(*) FROM public.quote_documents WHERE version_id = v_v[1]) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'SMOKE_FAIL % row(s) of the unconverted quote survived the erasure', n; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = v_q[2] AND q.anonymised_at IS NOT NULL AND q.status = 'paid' AND q.paid_at IS NOT NULL
                    AND q.client_first_name = '-' AND q.client_email LIKE 'erased-%@erased.invalid' AND q.client_phone IS NULL
                    AND q.stripe_customer_id IS NULL AND q.stripe_payment_method_id IS NULL AND q.deposit_payment_intent_id = 'pi_smoke_paid')
     OR EXISTS (SELECT 1 FROM public.quote_version_lines l WHERE l.version_id = v_v[2] AND (l.origin_address <> 'erased' OR l.destination_address IS NOT NULL
                    OR l.origin_lat IS NOT NULL OR l.flight_number IS NOT NULL OR l.special_requests IS NOT NULL OR l.amount_minor <> 5000))
     OR EXISTS (SELECT 1 FROM public.quote_version_line_stops s WHERE s.line_id = v_l[2] AND (s.address IS NOT NULL OR s.lat IS NOT NULL OR s.lng IS NOT NULL))
     OR EXISTS (SELECT 1 FROM public.quote_acceptances a WHERE a.quote_id = v_q[2] AND (a.ip IS NOT NULL OR a.user_agent IS NOT NULL))
     OR NOT EXISTS (SELECT 1 FROM public.quote_acceptances a WHERE a.quote_id = v_q[2])
     OR NOT EXISTS (SELECT 1 FROM public.quote_versions w WHERE w.id = v_v[2] AND w.billing_note IS NULL AND w.frozen_at IS NOT NULL AND w.total_minor = 5000)
     OR (SELECT count(*) FROM public.quote_links WHERE quote_id = v_q[2]) <> 0 OR (SELECT count(*) FROM public.quote_documents WHERE version_id = v_v[2]) <> 0
     OR (SELECT count(*) FROM public.quote_events WHERE quote_id = v_q[2]) <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL the paid quote was not anonymised as specified';
  END IF;
  v_msg := NULL;  -- the guard bypass is closed again after the erasure
  BEGIN UPDATE public.quote_versions SET total_minor = 1 WHERE id = v_v[2]; EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  IF v_msg IS DISTINCT FROM 'quote_version_frozen' THEN RAISE EXCEPTION 'SMOKE_FAIL erasure bypass stayed open: %', v_msg; END IF;

  -- 4. Money in flight: counted, confirm refuses, its Stripe customer is not listed (the other quote's customer is).
  INSERT INTO public.quotes (reference, client_first_name, client_last_name, client_email, lead_channel, status, deposit_payment_intent_id, stripe_customer_id)
  VALUES ('Q-20991231-SMOKE4', 'Smoke', 'Open', c_mail[3], 'email', 'accepted', 'pi_smoke_open', 'cus_smoke_open'),
         ('Q-20991231-SMOKE5', 'Smoke', 'Free', c_mail[3], 'email', 'sent', NULL, 'cus_smoke_free');
  INSERT INTO public.erasure_requests (requested_by, email_hmac, status, expires_at, subject_emails)
  VALUES (v_actor, repeat('9', 64), 'previewed', now() + interval '1 hour', ARRAY[c_mail[3]]) RETURNING id INTO v_x;
  v_res := public.erasure_scope(c_mail[3], NULL);
  IF public.erasure_quote_payment_open(ARRAY[c_mail[3]], '{}'::text[]) <> 1 OR v_res->'counts'->>'quotes' IS DISTINCT FROM '2'
     OR COALESCE((v_res->'counts'->>'payment_open')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL in-flight scope: %', v_res->'counts';
  END IF;
  IF public.erasure_confirm(v_x, v_actor) IS DISTINCT FROM 'payment_open'
     OR NOT EXISTS (SELECT 1 FROM public.erasure_requests e WHERE e.id = v_x AND e.status = 'previewed') THEN
    RAISE EXCEPTION 'SMOKE_FAIL erasure_confirm did not refuse a quote with money in flight';
  END IF;
  IF public.erasure_quote_customer_ids(v_x) IS DISTINCT FROM ARRAY['cus_smoke_free'] THEN
    RAISE EXCEPTION 'SMOKE_FAIL quote customer ids: %', public.erasure_quote_customer_ids(v_x);
  END IF;

  RAISE EXCEPTION 'SMOKE_OK_92_12_ERASURE every erasure check passed; this exception rolls the smoke rows back';
END
$$;
