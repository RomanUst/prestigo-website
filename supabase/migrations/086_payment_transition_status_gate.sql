-- Migration 086: payment_transition_status_gate
-- Phase 88 code review (88-REVIEW A-WR-04, C-WR-01) — a hold must never be placed on a cancelled / no-show booking.
--
-- apply_payment_transition gains an optional p_require_status text[] (DEFAULT NULL). When it is given, the
-- compare-and-set applies only while bookings.status is one of those values; the status is read under the SAME
-- row lock as payment_state (SELECT ... FOR UPDATE), so a concurrent status compare-and-set (the admin cancel)
-- either commits first and blocks the transition, or waits until the transition has committed. A blocked call
-- answers { applied: false, status_blocked: true, current_state, current_status } and writes nothing.
--
-- lib/payments/state.ts passes it for the hold claim (card_saved | expired | failed -> placing_hold) and for the
-- authorization (placing_hold -> authorized); without it the function behaves exactly as in 085.
--
-- Compatibility: the old 5-argument function is dropped and the new one has a DEFAULT for the 6th argument, so
-- every existing call (5 named arguments) resolves to the new function unchanged. Apply this migration BEFORE the
-- code that passes p_require_status is deployed (that code fails the RPC call against 085 alone). DROP + CREATE
-- re-grants the default PUBLIC EXECUTE, so the REVOKE / GRANT pair below is repeated for the new signature.
--
-- The DROP and the CREATE run in the one transaction the migration runner wraps each file in, so no caller ever
-- sees the function missing.
--
-- Schema FILE only — applied by the orchestrator via Supabase MCP, not by the code fixer.

DROP FUNCTION IF EXISTS public.apply_payment_transition(uuid, text[], text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.apply_payment_transition(
  p_booking_id uuid,
  p_from       text[],
  p_to         text,
  p_patch      jsonb,
  p_event      jsonb,
  p_require_status text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_states constant text[] := ARRAY[
    'none', 'checkout_pending', 'card_saved', 'placing_hold', 'authorized', 'capturing',
    'captured', 'balance_due', 'failed', 'expired', 'released'
  ];
  v_patch jsonb := COALESCE(p_patch, '{}'::jsonb);
  v_key   text  := p_event->>'key';
  v_prev  text;
  v_status text;
  v_row   public.bookings;
  v_rows  integer;
BEGIN
  IF p_to IS NULL OR NOT (p_to = ANY (v_states)) THEN
    RAISE EXCEPTION 'invalid payment state';
  END IF;
  IF p_from IS NULL OR cardinality(p_from) = 0 THEN
    RAISE EXCEPTION 'invalid from states';
  END IF;
  IF v_key IS NULL OR p_event->>'kind' IS NULL OR p_event->>'actor_type' IS NULL THEN
    RAISE EXCEPTION 'invalid payment event';
  END IF;
  IF v_patch ? 'payment_intent_id' AND p_to NOT IN ('captured', 'balance_due') THEN
    RAISE EXCEPTION 'payment_intent_id is set only when money is collected';
  END IF;

  SELECT b.payment_state, b.status INTO v_prev, v_status
    FROM public.bookings b
   WHERE b.id = p_booking_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'current_state', NULL);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_payment_events e
     WHERE e.booking_id = p_booking_id AND e.event_key = v_key
  ) THEN
    RETURN jsonb_build_object('applied', false, 'duplicate', true, 'current_state', v_prev);
  END IF;

  -- 086: the booking status gate. Read under the same row lock as the payment state, so a status change (the
  -- cancel route's compare-and-set) either lands before this check or waits for this transaction to finish.
  IF p_require_status IS NOT NULL AND NOT COALESCE(v_status = ANY (p_require_status), false) THEN
    RETURN jsonb_build_object(
      'applied', false,
      'status_blocked', true,
      'current_state', v_prev,
      'current_status', v_status
    );
  END IF;

  BEGIN
    UPDATE public.bookings b SET
        payment_state            = p_to,
        payment_currency         = CASE WHEN v_patch ? 'payment_currency'
                                        THEN v_patch->>'payment_currency' ELSE b.payment_currency END,
        payment_amount_minor     = CASE WHEN v_patch ? 'payment_amount_minor'
                                        THEN (v_patch->>'payment_amount_minor')::bigint ELSE b.payment_amount_minor END,
        stripe_customer_id       = CASE WHEN v_patch ? 'stripe_customer_id'
                                        THEN v_patch->>'stripe_customer_id' ELSE b.stripe_customer_id END,
        stripe_payment_method_id = CASE WHEN v_patch ? 'stripe_payment_method_id'
                                        THEN v_patch->>'stripe_payment_method_id' ELSE b.stripe_payment_method_id END,
        setup_intent_id          = CASE WHEN v_patch ? 'setup_intent_id'
                                        THEN v_patch->>'setup_intent_id' ELSE b.setup_intent_id END,
        hold_at                  = CASE WHEN v_patch ? 'hold_at'
                                        THEN (v_patch->>'hold_at')::timestamptz ELSE b.hold_at END,
        hold_payment_intent_id   = CASE WHEN v_patch ? 'hold_payment_intent_id'
                                        THEN v_patch->>'hold_payment_intent_id' ELSE b.hold_payment_intent_id END,
        hold_amount_minor        = CASE WHEN v_patch ? 'hold_amount_minor'
                                        THEN (v_patch->>'hold_amount_minor')::bigint ELSE b.hold_amount_minor END,
        hold_placed_at           = CASE WHEN v_patch ? 'hold_placed_at'
                                        THEN (v_patch->>'hold_placed_at')::timestamptz ELSE b.hold_placed_at END,
        capture_before           = CASE WHEN v_patch ? 'capture_before'
                                        THEN (v_patch->>'capture_before')::timestamptz ELSE b.capture_before END,
        hold_attempts            = CASE WHEN v_patch ? 'hold_attempts'
                                        THEN (v_patch->>'hold_attempts')::smallint ELSE b.hold_attempts END,
        charge_attempts          = CASE WHEN v_patch ? 'charge_attempts'
                                        THEN (v_patch->>'charge_attempts')::smallint ELSE b.charge_attempts END,
        payment_lease_until      = CASE WHEN v_patch ? 'payment_lease_until'
                                        THEN (v_patch->>'payment_lease_until')::timestamptz ELSE b.payment_lease_until END,
        captured_amount_minor    = CASE WHEN v_patch ? 'captured_amount_minor'
                                        THEN (v_patch->>'captured_amount_minor')::bigint ELSE b.captured_amount_minor END,
        captured_at              = CASE WHEN v_patch ? 'captured_at'
                                        THEN (v_patch->>'captured_at')::timestamptz ELSE b.captured_at END,
        payment_failed_at        = CASE WHEN v_patch ? 'payment_failed_at'
                                        THEN (v_patch->>'payment_failed_at')::timestamptz ELSE b.payment_failed_at END,
        payment_retry_at         = CASE WHEN v_patch ? 'payment_retry_at'
                                        THEN (v_patch->>'payment_retry_at')::timestamptz ELSE b.payment_retry_at END,
        payment_retry_count      = CASE WHEN v_patch ? 'payment_retry_count'
                                        THEN (v_patch->>'payment_retry_count')::smallint ELSE b.payment_retry_count END,
        last_payment_error       = CASE WHEN v_patch ? 'last_payment_error'
                                        THEN v_patch->>'last_payment_error' ELSE b.last_payment_error END,
        recovery_link_id         = CASE WHEN v_patch ? 'recovery_link_id'
                                        THEN v_patch->>'recovery_link_id' ELSE b.recovery_link_id END,
        recovery_link_url        = CASE WHEN v_patch ? 'recovery_link_url'
                                        THEN v_patch->>'recovery_link_url' ELSE b.recovery_link_url END,
        payment_intent_id        = CASE WHEN v_patch ? 'payment_intent_id'
                                        THEN v_patch->>'payment_intent_id' ELSE b.payment_intent_id END
      WHERE b.id = p_booking_id
        AND b.payment_state = ANY (p_from)
        AND NOT (
          b.payment_state IN ('placing_hold', 'capturing')
          AND p_to IN ('placing_hold', 'capturing')
          AND COALESCE(b.payment_lease_until > now(), false)
        )
      RETURNING b.* INTO v_row;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'applied', false,
        'current_state', (SELECT x.payment_state FROM public.bookings x WHERE x.id = p_booking_id)
      );
    END IF;

    INSERT INTO public.booking_payment_events
      (booking_id, event_key, kind, stripe_object_id, amount_minor, currency,
       from_state, to_state, actor_type, actor_id, error_code)
    VALUES
      (p_booking_id, v_key, p_event->>'kind', p_event->>'stripe_object_id',
       (p_event->>'amount_minor')::bigint, p_event->>'currency',
       v_prev, p_to, p_event->>'actor_type', p_event->>'actor_id', p_event->>'error_code')
    ON CONFLICT (booking_id, event_key) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RAISE EXCEPTION 'payment_event_duplicate' USING ERRCODE = 'P0D01';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'P0D01' THEN
      -- The sub-transaction rolled the UPDATE back: a replay of a recorded event is a no-op.
      RETURN jsonb_build_object('applied', false, 'duplicate', true, 'current_state', v_prev);
  END;

  RETURN jsonb_build_object(
    'applied', true,
    'previous_state', v_prev,
    'booking', to_jsonb(v_row)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_payment_transition(uuid, text[], text, jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_transition(uuid, text[], text, jsonb, jsonb, text[]) TO service_role;
