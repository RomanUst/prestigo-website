-- 88-01 live smoke for migration 085 (payment columns, money ledger, card-flow settings, payment RPCs).
--
-- Run with the Supabase MCP execute_sql AFTER 085 is applied. It is one DO block that ends in a
-- RAISE EXCEPTION, so the whole run rolls back: the booking it touches is left exactly as it was, and
-- pg_net calls and outbox rows queued by the bookings triggers roll back with it. Inside the single
-- transaction now() is constant, which the lease and hold_at checks below rely on.
--
-- Expected result: the call FAILS with the final message of the block (the one that says all checks passed).
-- Any message starting with 'SMOKE_FAIL' (or any other error) is a failure of 085.

DO $$
DECLARE
  v_id      uuid;
  v_res     jsonb;
  v_caught  boolean;
  v_n       integer;
  v_state   text;
  v_hours   integer;
  v_mode    text;
  v_emails  text[];
  v_sig     text;
  v_role    text;
  v_from    text;
  v_to      text;
BEGIN
  -- 0. Most recent non-partner booking becomes a scheduled-card booking five days out.
  SELECT b.id INTO v_id
    FROM public.bookings b
   WHERE b.booking_source IS DISTINCT FROM 'gnet'
   ORDER BY b.created_at DESC
   LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL no-eligible-booking';
  END IF;

  SELECT b.payment_state INTO v_state FROM public.bookings b WHERE b.id = v_id;
  IF v_state IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'SMOKE_FAIL fresh-booking-not-none: %', v_state;
  END IF;

  UPDATE public.bookings b
     SET payment_mode = 'card_hold',
         status       = 'confirmed',
         pickup_date  = to_char((now() AT TIME ZONE 'Europe/Prague')::date + 5, 'YYYY-MM-DD'),
         pickup_time  = '12:00'
   WHERE b.id = v_id;

  IF NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = v_id AND b.pickup_utc > now()) THEN
    RAISE EXCEPTION 'SMOKE_FAIL pickup-not-in-future';
  END IF;

  -- 1. Backfill: no gnet row is left on pay_now.
  SELECT count(*) INTO v_n FROM public.bookings b
   WHERE b.booking_source = 'gnet' AND b.payment_mode <> 'partner';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL gnet-backfill-left-%', v_n;
  END IF;

  -- 2. pricing_globals defaults.
  SELECT g.payment_hold_lead_hours, g.card_flow_mode, g.card_flow_canary_emails
    INTO v_hours, v_mode, v_emails
    FROM public.pricing_globals g
   WHERE g.id = 1;
  IF v_hours IS DISTINCT FROM 72 OR v_mode IS DISTINCT FROM 'off' OR v_emails IS DISTINCT FROM '{}'::text[] THEN
    RAISE EXCEPTION 'SMOKE_FAIL pricing-defaults: % / % / %', v_hours, v_mode, v_emails;
  END IF;

  -- 3. card_flow_mode has no 'on' value until Phase 89.
  v_caught := false;
  BEGIN
    UPDATE public.pricing_globals g SET card_flow_mode = 'on' WHERE g.id = 1;
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL card-flow-mode-on-accepted';
  END IF;

  -- 4. none -> checkout_pending applies and writes one ledger row.
  v_res := public.apply_payment_transition(
    v_id, ARRAY['none'], 'checkout_pending',
    '{"payment_amount_minor": 4500, "payment_currency": "eur"}'::jsonb,
    '{"key": "smoke:1", "kind": "setup_started", "actor_type": "system", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true
     OR v_res->>'previous_state' IS DISTINCT FROM 'none'
     OR v_res->'booking'->>'payment_state' IS DISTINCT FROM 'checkout_pending' THEN
    RAISE EXCEPTION 'SMOKE_FAIL apply-none-to-checkout_pending: %', v_res;
  END IF;

  -- 5. The same event key again is a duplicate no-op and the state is unchanged.
  v_res := public.apply_payment_transition(
    v_id, ARRAY['none'], 'checkout_pending', '{}'::jsonb,
    '{"key": "smoke:1", "kind": "setup_started", "actor_type": "system", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'applied')::boolean IS DISTINCT FROM false
     OR (v_res->>'duplicate')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL duplicate-event: %', v_res;
  END IF;
  SELECT b.payment_state INTO v_state FROM public.bookings b WHERE b.id = v_id;
  IF v_state IS DISTINCT FROM 'checkout_pending' THEN
    RAISE EXCEPTION 'SMOKE_FAIL duplicate-changed-state: %', v_state;
  END IF;
  SELECT count(*) INTO v_n FROM public.booking_payment_events e WHERE e.booking_id = v_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL ledger-rows-after-duplicate-expected-1-got-%', v_n;
  END IF;

  -- 6. A payment_intent_id in the patch is refused unless money is collected.
  v_caught := false;
  BEGIN
    PERFORM public.apply_payment_transition(
      v_id, ARRAY['checkout_pending'], 'card_saved',
      '{"payment_intent_id": "pi_smoke"}'::jsonb,
      '{"key": "smoke:pi", "kind": "setup_succeeded", "actor_type": "system", "actor_id": "smoke"}'::jsonb
    );
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL payment_intent_id-accepted-for-card_saved';
  END IF;

  -- 7. checkout_pending -> card_saved with a hold time already due.
  v_res := public.apply_payment_transition(
    v_id, ARRAY['checkout_pending'], 'card_saved',
    jsonb_build_object('hold_at', now() - interval '1 minute'),
    '{"key": "smoke:2", "kind": "setup_succeeded", "actor_type": "webhook", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL apply-checkout_pending-to-card_saved: %', v_res;
  END IF;

  -- 8. The claim returns the booking in placing_hold and writes a hold_started row.
  SELECT count(*) INTO v_n FROM public.claim_due_payment_work(5, 60) c WHERE c.id = v_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL claim-expected-1-got-%', v_n;
  END IF;
  SELECT b.payment_state INTO v_state FROM public.bookings b WHERE b.id = v_id;
  IF v_state IS DISTINCT FROM 'placing_hold' THEN
    RAISE EXCEPTION 'SMOKE_FAIL claim-state: %', v_state;
  END IF;
  SELECT count(*) INTO v_n FROM public.booking_payment_events e
   WHERE e.booking_id = v_id AND e.kind = 'hold_started'
     AND e.from_state = 'card_saved' AND e.to_state = 'placing_hold';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL hold_started-rows-expected-1-got-%', v_n;
  END IF;

  -- 9. Re-claim before the lease passes is not applied, by RPC and by the claim query.
  v_res := public.apply_payment_transition(
    v_id, ARRAY['placing_hold'], 'placing_hold', '{}'::jsonb,
    '{"key": "smoke:3", "kind": "hold_started", "actor_type": "system", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'applied')::boolean IS DISTINCT FROM false
     OR v_res->>'current_state' IS DISTINCT FROM 'placing_hold' THEN
    RAISE EXCEPTION 'SMOKE_FAIL reclaim-before-lease-expiry: %', v_res;
  END IF;
  SELECT count(*) INTO v_n FROM public.claim_due_payment_work(5, 60) c WHERE c.id = v_id;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SMOKE_FAIL claim-reclaimed-live-lease-%', v_n;
  END IF;

  -- 10. The lease holder completes its own claim (placing_hold -> authorized).
  v_res := public.apply_payment_transition(
    v_id, ARRAY['placing_hold'], 'authorized', '{}'::jsonb,
    '{"key": "smoke:4", "kind": "hold_authorized", "actor_type": "system", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'applied')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL lease-holder-complete: %', v_res;
  END IF;

  -- 11. The ledger is append-only: UPDATE and DELETE raise.
  v_caught := false;
  BEGIN
    UPDATE public.booking_payment_events e SET error_code = 'x' WHERE e.booking_id = v_id;
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL ledger-update-accepted';
  END IF;
  v_caught := false;
  BEGIN
    DELETE FROM public.booking_payment_events e WHERE e.booking_id = v_id;
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL ledger-delete-accepted';
  END IF;

  -- 12. append_payment_event: an existing key inserts nothing, a new key inserts one row with from = to.
  v_res := public.append_payment_event(
    v_id, '{"key": "smoke:1", "kind": "setup_started", "actor_type": "system", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'inserted')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SMOKE_FAIL append-existing-key: %', v_res;
  END IF;
  v_res := public.append_payment_event(
    v_id, '{"key": "smoke:alert", "kind": "alert_sent", "actor_type": "system", "actor_id": "smoke"}'::jsonb
  );
  IF (v_res->>'inserted')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SMOKE_FAIL append-new-key: %', v_res;
  END IF;
  SELECT e.from_state, e.to_state INTO v_from, v_to
    FROM public.booking_payment_events e
   WHERE e.booking_id = v_id AND e.event_key = 'smoke:alert';
  IF v_from IS DISTINCT FROM 'authorized' OR v_to IS DISTINCT FROM 'authorized' THEN
    RAISE EXCEPTION 'SMOKE_FAIL append-from-to: % / %', v_from, v_to;
  END IF;

  -- 13. Privilege matrix: anon and authenticated cannot execute any payment RPC, service_role can.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.apply_payment_transition(uuid,text[],text,jsonb,jsonb)',
    'public.append_payment_event(uuid,jsonb)',
    'public.claim_due_payment_work(integer,integer)'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(v_role, v_sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'SMOKE_FAIL % can execute %', v_role, v_sig;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'SMOKE_FAIL service_role cannot execute %', v_sig;
    END IF;
  END LOOP;

  -- Forces the rollback of everything above, trigger side effects included.
  RAISE EXCEPTION 'SMOKE_OK all checks passed';
END
$$;
