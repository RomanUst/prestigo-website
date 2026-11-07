-- 89-05 live smoke for migration 088 (erasure of payment PII, request guard, 'stripe' saga step).
--
-- RUNBOOK. Run with the Supabase MCP execute_sql AFTER 087 and 088 are applied (088 names the 087 tables), and BEFORE
-- the code that records the 'stripe' step is deployed. READ-ONLY: statement A is one SELECT over the catalogs and
-- two dry selects; statement B is one DO block that ends in RAISE EXCEPTION, so everything it writes is rolled back.
-- Run them one after the other:
--   A. catalog listing + dry select   (returns rows: section, name, detail)
--   B. behaviour DO block             (the run FAILS with 'SMOKE_OK ...' when every check passed; any message that
--                                      starts with 'SMOKE_FAIL' is a failure of 088; any other error is a SQL problem
--                                      to read, for example a column CHECK the fixture values do not satisfy)
--
-- Expected for A:
--   function_grants : erasure_payment_open(uuid[]), erasure_record_step, erasure_confirm, erasure_anonymise_person,
--                     erasure_scope -> public_exec = false, anon_exec = false, authenticated_exec = false;
--                     service_role_exec = true for all of them EXCEPT erasure_payment_open (internal helper, false)
--   function_bodies : erasure_anonymise_person names booking_payment_consents = true, booking_manage_tokens = true,
--                     booking_payment_notes = true, booking_fee_cases = true and the stripe step guard = true;
--                     erasure_confirm returns 'payment_open' = true; erasure_scope reports payment_open = true;
--                     erasure_record_step lists 'stripe' = true
--   terminal_dry_run: for the bookings of ONE test person (replace the placeholder uuid below): per payment_state the
--                     number of bookings that still carry Stripe ids and whether 088 would clear them
--                     (cleared_by_088 = true only for captured, released, cash_settled). Counts only.
--   terminal_summary: the same per payment_state over ALL bookings, counts only, no personal data.

-- ── A. catalog listing and dry select ────────────────────────────────────────────
SELECT 'function_grants' AS section, f.oid::regprocedure::text AS name,
       'public_exec=' || coalesce((SELECT bool_or(a.grantee = 0) FROM aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                                    WHERE a.privilege_type = 'EXECUTE'), false)
       || ' anon_exec=' || has_function_privilege('anon', f.oid, 'EXECUTE')
       || ' authenticated_exec=' || has_function_privilege('authenticated', f.oid, 'EXECUTE')
       || ' service_role_exec=' || has_function_privilege('service_role', f.oid, 'EXECUTE') AS detail
  FROM pg_proc f
 WHERE f.pronamespace = 'public'::regnamespace
   AND f.proname IN ('erasure_payment_open', 'erasure_record_step', 'erasure_confirm', 'erasure_anonymise_person', 'erasure_scope')

UNION ALL
SELECT 'function_bodies', f.proname,
       CASE f.proname
         WHEN 'erasure_anonymise_person' THEN
           'booking_payment_consents=' || (f.prosrc LIKE '%booking_payment_consents%')
           || ' booking_manage_tokens=' || (f.prosrc LIKE '%booking_manage_tokens%')
           || ' booking_payment_notes=' || (f.prosrc LIKE '%booking_payment_notes%')
           || ' booking_fee_cases=' || (f.prosrc LIKE '%booking_fee_cases%')
           || ' stripe_step_guard=' || (f.prosrc LIKE '%stripe step is not finished%')
         WHEN 'erasure_confirm' THEN 'returns_payment_open=' || (f.prosrc LIKE '%RETURN ''payment_open''%')
         WHEN 'erasure_scope' THEN 'reports_payment_open=' || (f.prosrc LIKE '%''payment_open'', v_payment_open%')
         WHEN 'erasure_record_step' THEN 'lists_stripe=' || (f.prosrc LIKE '%''stripe''%')
         ELSE 'internal helper'
       END
  FROM pg_proc f
 WHERE f.pronamespace = 'public'::regnamespace
   AND f.proname IN ('erasure_payment_open', 'erasure_record_step', 'erasure_confirm', 'erasure_anonymise_person', 'erasure_scope')

UNION ALL
-- Dry select for ONE test person: replace the placeholder uuid with the booking ids of the person (or leave it to
-- see an empty section). Counts only; it shows the terminal-state condition 088 uses to clear the Stripe ids.
SELECT 'terminal_dry_run', b.payment_state,
       count(*) FILTER (WHERE b.stripe_customer_id IS NOT NULL OR b.stripe_payment_method_id IS NOT NULL
                          OR b.setup_intent_id IS NOT NULL OR b.hold_payment_intent_id IS NOT NULL
                          OR b.recovery_link_url IS NOT NULL)::text || ' with stripe ids; cleared_by_088='
       || (b.payment_state IN ('captured', 'released', 'cash_settled'))
  FROM public.bookings b
 WHERE b.id = ANY (ARRAY['00000000-0000-0000-0000-000000000000']::uuid[])
 GROUP BY b.payment_state

UNION ALL
SELECT 'terminal_summary', b.payment_state,
       count(*) FILTER (WHERE b.stripe_customer_id IS NOT NULL OR b.stripe_payment_method_id IS NOT NULL
                          OR b.setup_intent_id IS NOT NULL OR b.hold_payment_intent_id IS NOT NULL
                          OR b.recovery_link_url IS NOT NULL)::text || ' of ' || count(*)::text
       || ' with stripe ids; cleared_by_088=' || (b.payment_state IN ('captured', 'released', 'cash_settled'))
  FROM public.bookings b
 GROUP BY b.payment_state

ORDER BY 1, 2;

-- ── B. behaviour (rolled back) ───────────────────────────────────────────────────
-- Uses the most recent non-partner, not yet anonymised booking inside one transaction that always ends in RAISE
-- EXCEPTION, so the booking changes, the fixture rows and the erasure requests are all rolled back. Nothing calls
-- erasure_confirm on a clean case (that would enqueue an outbox row): it is called only where the guard must refuse.
DO $$
DECLARE
  v_id       uuid;
  v_status   text;
  v_email    text;
  v_actor    uuid := gen_random_uuid();
  v_req1     uuid;
  v_req2     uuid;
  v_req3     uuid;
  v_req4     uuid;
  v_open     integer;
  v_scope    jsonb;
  v_res      jsonb;
  v_text     text;
  v_caught   boolean;
  v_steps    jsonb := '{"chatwoot": {}, "espocrm": {}, "verify": {"verified": true}, "stripe": {}}'::jsonb;
  n          integer;
BEGIN
  SELECT b.id, b.status, public.identity_normalize_email(b.client_email)
    INTO v_id, v_status, v_email
    FROM public.bookings b
   WHERE b.booking_source IS DISTINCT FROM 'gnet'
     AND b.anonymised_at IS NULL
     AND public.identity_normalize_email(b.client_email) IS NOT NULL
   ORDER BY b.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-eligible-booking';
  END IF;

  -- 1. erasure_payment_open: a live hold counts, a finished payment does not, a future card flow counts.
  UPDATE public.bookings b
     SET payment_state = 'authorized', fee_case_status = NULL
   WHERE b.id = v_id;
  IF public.erasure_payment_open(ARRAY[v_id]) <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL open-authorized-not-counted';
  END IF;
  UPDATE public.bookings SET payment_state = 'placing_hold' WHERE id = v_id;
  IF public.erasure_payment_open(ARRAY[v_id]) <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL open-placing_hold-not-counted';
  END IF;
  UPDATE public.bookings SET payment_state = 'capturing' WHERE id = v_id;
  IF public.erasure_payment_open(ARRAY[v_id]) <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL open-capturing-not-counted';
  END IF;
  UPDATE public.bookings SET payment_state = 'captured' WHERE id = v_id;
  IF public.erasure_payment_open(ARRAY[v_id]) <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL captured-counted-as-open';
  END IF;
  UPDATE public.bookings SET payment_state = 'card_saved', pickup_date = to_char((now() + interval '2 days') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD'), pickup_time = '12:00' WHERE id = v_id;  -- pickup_utc is generated from these
  v_open := public.erasure_payment_open(ARRAY[v_id]);
  IF v_open <> (CASE WHEN v_status = 'cancelled' THEN 0 ELSE 1 END) THEN
    RAISE EXCEPTION 'SMOKE_FAIL future-card_saved-count: % (status %)', v_open, v_status;
  END IF;
  UPDATE public.bookings SET payment_state = 'none' WHERE id = v_id;
  IF public.erasure_payment_open(ARRAY[v_id]) <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL future-none-counted-as-open';
  END IF;

  -- 2. A pending fee case blocks even when the payment is finished; waiving it releases the block.
  UPDATE public.bookings SET payment_state = 'captured' WHERE id = v_id;
  INSERT INTO public.booking_fee_cases (booking_id, kind, currency, base_minor, proposed_minor, reason, contact_note, evidence)
  VALUES (v_id, 'no_show', 'eur', 10000, 10000, 'smoke reason', 'smoke contact note', '{"smoke": true}'::jsonb);
  IF public.erasure_payment_open(ARRAY[v_id]) <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL pending-case-not-counted';
  END IF;

  -- 3. The preview reports it and the confirm refuses with payment_open, before anything is written.
  v_scope := public.erasure_scope(v_email, NULL);
  IF v_scope->>'outcome' IS DISTINCT FROM 'ok' OR COALESCE((v_scope->'counts'->>'payment_open')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL scope-payment_open: %', v_scope->'counts';
  END IF;
  INSERT INTO public.erasure_requests (requested_by, email_hmac, status, expires_at, subject_emails)
  VALUES (v_actor, repeat('a', 64), 'previewed', now() + interval '1 hour', ARRAY[v_email])
  RETURNING id INTO v_req1;
  v_text := public.erasure_confirm(v_req1, v_actor);
  IF v_text IS DISTINCT FROM 'payment_open' THEN
    RAISE EXCEPTION 'SMOKE_FAIL confirm-not-refused: %', v_text;
  END IF;
  SELECT count(*) INTO n FROM public.erasure_requests e WHERE e.id = v_req1 AND e.status = 'previewed';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL confirm-refusal-wrote-status';
  END IF;

  UPDATE public.booking_fee_cases SET status = 'waived' WHERE booking_id = v_id;
  IF public.erasure_payment_open(ARRAY[v_id]) <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL waived-case-still-open';
  END IF;

  -- 4. erasure_record_step accepts 'stripe' and still refuses an unknown step.
  INSERT INTO public.erasure_requests (requested_by, email_hmac, status, expires_at, booking_ids, steps)
  VALUES (v_actor, repeat('b', 64), 'confirmed', now() + interval '1 hour', ARRAY[v_id], '{}'::jsonb)
  RETURNING id INTO v_req2;
  PERFORM public.erasure_record_step(v_req2, 'stripe', '{"stripe_customers_deleted": 0}'::jsonb);
  SELECT count(*) INTO n FROM public.erasure_requests e WHERE e.id = v_req2 AND e.steps ? 'stripe';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL record-step-stripe-refused';
  END IF;
  v_caught := false;
  BEGIN
    PERFORM public.erasure_record_step(v_req2, 'bogus', '{}'::jsonb);
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL record-step-accepts-bogus';
  END IF;

  -- 5. erasure_anonymise_person refuses to run before the stripe step is recorded.
  INSERT INTO public.erasure_requests (requested_by, email_hmac, status, expires_at, booking_ids, steps)
  VALUES (v_actor, repeat('c', 64), 'confirmed', now() + interval '1 hour', ARRAY[v_id],
          '{"chatwoot": {}, "espocrm": {}, "verify": {"verified": true}}'::jsonb)
  RETURNING id INTO v_req3;
  v_caught := false;
  BEGIN
    PERFORM public.erasure_anonymise_person(v_req3);
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL anonymise-ran-without-stripe-step';
  END IF;

  -- 6. The real function on the real booking: payment PII goes, Stripe ids stay while a hold is live.
  UPDATE public.bookings
     SET payment_state = 'authorized',
         stripe_customer_id = 'cus_SMOKE', stripe_payment_method_id = 'pm_SMOKE', setup_intent_id = 'seti_SMOKE',
         hold_payment_intent_id = 'pi_SMOKE', recovery_link_url = 'https://example.invalid/pay'
   WHERE id = v_id;
  INSERT INTO public.booking_payment_consents (booking_id, mode, text_version, text_sha256, text_rendered, locale, ip, user_agent)
  VALUES (v_id, 'setup', 'smoke', repeat('0', 64), 'smoke text', 'en', '203.0.113.9', 'smoke-agent');
  INSERT INTO public.booking_manage_tokens (booking_id, token) VALUES (v_id, repeat('a', 43));
  INSERT INTO public.booking_payment_notes (booking_id, kind, note) VALUES (v_id, 'cash_reopen', 'smoke note');

  INSERT INTO public.erasure_requests (requested_by, email_hmac, status, expires_at, booking_ids, steps)
  VALUES (v_actor, repeat('d', 64), 'confirmed', now() + interval '1 hour', ARRAY[v_id], v_steps)
  RETURNING id INTO v_req4;
  v_res := public.erasure_anonymise_person(v_req4);

  SELECT count(*) INTO n FROM public.booking_payment_consents c
   WHERE c.booking_id = v_id AND (c.ip IS NOT NULL OR c.user_agent IS NOT NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL consent-ip-kept: %', n;
  END IF;
  SELECT count(*) INTO n FROM public.booking_payment_consents c WHERE c.booking_id = v_id;
  IF n < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL consent-row-deleted';
  END IF;
  SELECT count(*) INTO n FROM public.booking_manage_tokens t WHERE t.booking_id = v_id;
  IF n <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL manage-token-kept: %', n;
  END IF;
  SELECT count(*) INTO n FROM public.booking_payment_notes p WHERE p.booking_id = v_id;
  IF n <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL payment-note-kept: %', n;
  END IF;
  SELECT count(*) INTO n FROM public.booking_fee_cases fc
   WHERE fc.booking_id = v_id AND fc.reason IS NULL AND fc.contact_note IS NULL AND fc.evidence = '{}'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL fee-case-text-kept-or-row-deleted: %', n;
  END IF;
  SELECT count(*) INTO n FROM public.bookings b WHERE b.id = v_id AND b.stripe_customer_id = 'cus_SMOKE';
  IF n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL stripe-ids-cleared-on-live-hold';
  END IF;
  IF (v_res->>'consents_scrubbed')::integer < 1 OR (v_res->>'manage_tokens_deleted')::integer <> 1
     OR (v_res->>'payment_notes_deleted')::integer <> 1 OR (v_res->>'stripe_ids_cleared')::integer <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL counts-live-hold: %', v_res;
  END IF;

  -- 7. Once the payment is terminal, a later run (here: a second request) clears the Stripe ids.
  UPDATE public.bookings SET payment_state = 'captured' WHERE id = v_id;
  INSERT INTO public.erasure_requests (requested_by, email_hmac, status, expires_at, booking_ids, steps)
  VALUES (v_actor, repeat('e', 64), 'confirmed', now() + interval '1 hour', ARRAY[v_id], v_steps)
  RETURNING id INTO v_req4;
  v_res := public.erasure_anonymise_person(v_req4);
  SELECT count(*) INTO n FROM public.bookings b
   WHERE b.id = v_id AND b.stripe_customer_id IS NULL AND b.stripe_payment_method_id IS NULL
     AND b.setup_intent_id IS NULL AND b.hold_payment_intent_id IS NULL AND b.recovery_link_url IS NULL;
  IF n <> 1 OR (v_res->>'stripe_ids_cleared')::integer <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL stripe-ids-kept-on-terminal: % %', n, v_res;
  END IF;

  RAISE EXCEPTION 'SMOKE_OK all checks passed';
END
$$;
