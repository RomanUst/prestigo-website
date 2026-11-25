-- 098: a quote without a deposit (owner request 2026-11-24).
--
-- The operator may now choose "no deposit". Two client paths, decided by the remainder method:
--   saved_card / cash      the client saves a card (a Stripe SetupIntent, nothing is charged); the trips are then held
--                          and charged (saved_card) or guaranteed (cash) exactly as before, for the whole amount of each
--                          trip. The SetupIntent id is stored in quotes.card_setup_intent_id and in
--                          quote_acceptances.payment_intent_id (the column holds the Stripe object behind the acceptance).
--   payment_link / invoice the client only confirms: no Stripe object, the bookings are created at once.
-- In both cases the quote becomes 'paid' (= secured, the bookings exist) with deposit_minor 0.
--
-- Changes: deposit_kind 'none' (value null, deposit_minor 0) on quote_versions; quote_acceptances.deposit_minor may be
-- 0; quotes.card_setup_intent_id; quote_convert_to_bookings accepts the two new paths (the deposit path is unchanged)
-- and writes no deposit ledger row or deposit_paid event when there is no deposit.
-- Rollback: restore the function from 096 and the CHECKs from 091 (only while no 'none' version exists).

-- == 1. quote_versions ===============================================================================================
ALTER TABLE public.quote_versions DROP CONSTRAINT IF EXISTS quote_versions_deposit_kind_check;
ALTER TABLE public.quote_versions ADD CONSTRAINT quote_versions_deposit_kind_check
  CHECK (deposit_kind IS NULL OR deposit_kind IN ('percent', 'fixed', 'none'));

ALTER TABLE public.quote_versions DROP CONSTRAINT IF EXISTS quote_versions_deposit_minor_check;
ALTER TABLE public.quote_versions ADD CONSTRAINT quote_versions_deposit_minor_check
  CHECK (deposit_minor IS NULL OR deposit_minor > 0 OR (deposit_kind = 'none' AND deposit_minor = 0));

ALTER TABLE public.quote_versions DROP CONSTRAINT IF EXISTS quote_versions_deposit_none_check;
ALTER TABLE public.quote_versions ADD CONSTRAINT quote_versions_deposit_none_check
  CHECK (deposit_kind IS DISTINCT FROM 'none' OR (deposit_value IS NULL AND (deposit_minor IS NULL OR deposit_minor = 0)));

ALTER TABLE public.quote_versions DROP CONSTRAINT IF EXISTS quote_versions_frozen_complete;
ALTER TABLE public.quote_versions ADD CONSTRAINT quote_versions_frozen_complete CHECK (
  frozen_at IS NULL OR (
        deposit_kind IS NOT NULL
    AND (deposit_value IS NOT NULL OR deposit_kind = 'none')
    AND deposit_minor IS NOT NULL
    AND remainder_method IS NOT NULL
    AND total_minor > 0
    AND deposit_minor <= total_minor
    AND cancel_policy IS NOT NULL
    AND terms_version IS NOT NULL));

-- == 2. quote_acceptances, quotes ====================================================================================
ALTER TABLE public.quote_acceptances DROP CONSTRAINT IF EXISTS quote_acceptances_deposit_minor_check;
ALTER TABLE public.quote_acceptances ADD CONSTRAINT quote_acceptances_deposit_minor_check CHECK (deposit_minor >= 0);

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS card_setup_intent_id text
  CHECK (card_setup_intent_id IS NULL OR char_length(card_setup_intent_id) <= 100);

-- == 3. quote_convert_to_bookings ====================================================================================
-- The 096 body with the no-deposit paths (marked 098); every other statement is unchanged.
CREATE OR REPLACE FUNCTION public.quote_convert_to_bookings(
  p_quote_id          uuid,
  p_version_id        uuid,
  p_payment_intent_id text,
  p_customer_id       text,
  p_payment_method_id text,
  p_lines             jsonb,
  p_actor_type        text,
  p_actor_id          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote       public.quotes;
  v_version     public.quote_versions;
  v_line        public.quote_version_lines;
  v_acceptance  public.quote_acceptances;
  v_entry       jsonb;
  v_expected    integer[];
  v_given       integer[];
  v_ids         uuid[] := ARRAY[]::uuid[];
  v_booking_id  uuid;
  v_actor_type  text;
  v_actor_id    text;
  v_customer    text;
  v_method      text;
  v_mode        text;
  v_state       text;
  v_remainder   bigint;
  v_hold_at     timestamptz;
  v_card_line   boolean;
BEGIN
  v_actor_type := CASE WHEN p_actor_type IN ('admin', 'webhook', 'system') THEN p_actor_type ELSE 'system' END;
  v_actor_id   := left(p_actor_id, 64);

  -- 1. The quote, locked: concurrent deliveries of the same payment queue up here.
  SELECT * INTO v_quote FROM public.quotes q WHERE q.id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'not_found');
  END IF;

  -- 2. Already paid (whatever a later cancel or void recorded): the recorded intent gets its bookings back, any other
  --    intent is a payment the quote does not own. Nothing is written either way.
  IF v_quote.status = 'paid' OR v_quote.paid_at IS NOT NULL THEN
    -- 098: a quote without a deposit was paid by the client's card setup (card_setup_intent_id) or by a plain
    -- confirmation (no Stripe object at all: both ids null).
    IF (p_payment_intent_id IS NOT NULL AND v_quote.deposit_payment_intent_id = p_payment_intent_id)
       OR (p_payment_intent_id IS NOT NULL AND v_quote.card_setup_intent_id = p_payment_intent_id)
       OR (p_payment_intent_id IS NULL AND v_quote.deposit_payment_intent_id IS NULL AND v_quote.card_setup_intent_id IS NULL) THEN
      SELECT COALESCE(array_agg(b.id ORDER BY l.position), ARRAY[]::uuid[])
        INTO v_ids
        FROM public.bookings b
        JOIN public.quote_version_lines l ON l.id = b.quote_line_id
       WHERE b.quote_id = p_quote_id;
      RETURN jsonb_build_object('converted', true, 'first_time', false, 'booking_ids', to_jsonb(v_ids));
    END IF;
    RETURN jsonb_build_object('converted', false, 'reason', 'intent_mismatch');
  END IF;

  -- 3. Ownership before payment.
  IF v_quote.voided_at IS NOT NULL OR v_quote.status = 'voided' THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'voided');
  END IF;
  IF v_quote.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'cancelled');
  END IF;
  IF v_quote.status <> 'accepted' THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'not_accepted');
  END IF;
  IF v_quote.current_version_id IS DISTINCT FROM p_version_id THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'version_mismatch');
  END IF;

  SELECT * INTO v_version FROM public.quote_versions v WHERE v.id = p_version_id;
  IF NOT FOUND OR v_version.quote_id <> p_quote_id THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'version_mismatch');
  END IF;
  IF v_version.frozen_at IS NULL THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'not_accepted');
  END IF;

  IF v_version.deposit_minor > 0 THEN
    -- The paid deposit intent must be the one the quote recorded.
    IF p_payment_intent_id IS NULL OR v_quote.deposit_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
      RETURN jsonb_build_object('converted', false, 'reason', 'intent_mismatch');
    END IF;
  ELSIF v_version.remainder_method IN ('saved_card', 'cash') THEN
    -- 098, no deposit, card kept for the trips: the succeeded SetupIntent must be the one the quote recorded.
    IF p_payment_intent_id IS NULL OR v_quote.card_setup_intent_id IS DISTINCT FROM p_payment_intent_id THEN
      RETURN jsonb_build_object('converted', false, 'reason', 'intent_mismatch');
    END IF;
  ELSE
    -- 098, no deposit and no card (payment link or invoice): a plain confirmation, no Stripe object.
    IF p_payment_intent_id IS NOT NULL THEN
      RETURN jsonb_build_object('converted', false, 'reason', 'intent_mismatch');
    END IF;
  END IF;

  -- The acceptance behind this payment (the deposit intent or the card setup it created; for a plain confirmation the
  -- latest acceptance of this version): it carries the consent text the client saw.
  SELECT * INTO v_acceptance
    FROM public.quote_acceptances a
   WHERE a.quote_id = p_quote_id
     AND (   (p_payment_intent_id IS NOT NULL AND a.payment_intent_id = p_payment_intent_id)
          OR (p_payment_intent_id IS NULL AND a.payment_intent_id IS NULL AND a.version_id = p_version_id))
   ORDER BY a.accepted_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'not_accepted');
  END IF;

  -- 4. The caller's lines must be exactly the version's lines (positions only; nothing else is read from p_lines).
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'lines_mismatch');
  END IF;
  FOR v_entry IN SELECT e FROM jsonb_array_elements(p_lines) e LOOP
    IF jsonb_typeof(v_entry) <> 'object'
       OR jsonb_typeof(v_entry -> 'position') <> 'number'
       OR jsonb_typeof(v_entry -> 'booking_reference') <> 'string'
       OR char_length(v_entry ->> 'booking_reference') = 0 THEN
      RETURN jsonb_build_object('converted', false, 'reason', 'lines_mismatch');
    END IF;
  END LOOP;
  SELECT COALESCE(array_agg((e ->> 'position')::numeric::integer ORDER BY (e ->> 'position')::numeric::integer), ARRAY[]::integer[])
    INTO v_given
    FROM jsonb_array_elements(p_lines) e;
  SELECT COALESCE(array_agg(l.position::integer ORDER BY l.position), ARRAY[]::integer[])
    INTO v_expected
    FROM public.quote_version_lines l
   WHERE l.version_id = p_version_id;
  IF cardinality(v_expected) = 0 OR v_given IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'lines_mismatch');
  END IF;

  v_customer := COALESCE(p_customer_id, v_quote.stripe_customer_id);
  v_method   := COALESCE(p_payment_method_id, v_quote.stripe_payment_method_id);

  -- 5. Validation pass, before the first write: every line carries its amounts and shares, and a held line has its
  --    hold instant. A failure here writes nothing.
  FOR v_line IN
    SELECT * FROM public.quote_version_lines l WHERE l.version_id = p_version_id ORDER BY l.position
  LOOP
    IF v_line.deposit_share_minor IS NULL OR v_line.remainder_minor IS NULL
       OR v_line.amount_eur IS NULL OR v_line.amount_czk IS NULL THEN
      RETURN jsonb_build_object('converted', false, 'reason', 'lines_mismatch');
    END IF;
    IF v_line.remainder_minor > 0 AND v_version.remainder_method = 'saved_card' THEN
      SELECT e INTO v_entry FROM jsonb_array_elements(p_lines) e WHERE (e ->> 'position')::numeric::integer = v_line.position;
      IF v_entry ->> 'hold_at' IS NULL THEN
        RETURN jsonb_build_object('converted', false, 'reason', 'hold_at_missing');
      END IF;
    END IF;
    IF v_line.remainder_minor > 0 AND v_version.remainder_method IN ('saved_card', 'cash')
       AND (v_customer IS NULL OR v_method IS NULL) THEN
      -- A held or guaranteed trip without its customer and card would never be charged: refuse the whole call.
      RAISE EXCEPTION 'quote_card_ids_missing';
    END IF;
  END LOOP;

  -- 6. One booking per line, in position order.
  FOR v_line IN
    SELECT * FROM public.quote_version_lines l WHERE l.version_id = p_version_id ORDER BY l.position
  LOOP
    SELECT e INTO v_entry FROM jsonb_array_elements(p_lines) e WHERE (e ->> 'position')::numeric::integer = v_line.position;
    v_remainder := v_line.remainder_minor;
    v_hold_at   := NULL;
    v_card_line := false;

    IF v_remainder > 0 AND v_version.remainder_method = 'saved_card' THEN
      v_mode      := 'card_hold';
      v_state     := 'card_saved';
      v_hold_at   := (v_entry ->> 'hold_at')::timestamptz;
      v_card_line := true;
    ELSIF v_remainder > 0 AND v_version.remainder_method = 'cash' THEN
      v_mode      := 'cash_guarantee';
      v_state     := 'card_saved';
      v_card_line := true;
    ELSE
      v_mode  := 'quote';
      v_state := 'none';
    END IF;

    INSERT INTO public.bookings (
      trip_type, pickup_date, pickup_time, landing_date, landing_time, pickup_offset_min,
      origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng,
      vehicle_class, passengers, luggage, hours, return_date, distance_km, flight_number, terminal, special_requests,
      tour_id, tour_title, tour_description,
      extra_child_seat, extra_meet_greet, extra_luggage, amount_eur, amount_czk,
      client_first_name, client_last_name, client_email, client_phone,
      booking_reference, booking_source, lead_channel, booking_type, status,
      locale, cancel_policy, cancel_policy_version,
      quote_id, quote_line_id, quote_deposit_minor,
      payment_mode, payment_state, payment_amount_minor, payment_currency,
      stripe_customer_id, stripe_payment_method_id, hold_at
    ) VALUES (
      v_line.trip_type, v_line.pickup_date, v_line.pickup_time, v_line.landing_date, v_line.landing_time, v_line.pickup_offset_min,
      v_line.origin_address, v_line.origin_lat, v_line.origin_lng, v_line.destination_address, v_line.destination_lat, v_line.destination_lng,
      v_line.vehicle_class, v_line.passengers, v_line.luggage, v_line.hours, v_line.return_date, v_line.distance_km,
      v_line.flight_number, v_line.terminal, v_line.special_requests,
      NULL,
      CASE WHEN v_line.trip_type = 'tour' THEN v_line.title ELSE NULL END,
      CASE WHEN v_line.trip_type = 'tour' THEN v_line.description ELSE NULL END,
      v_line.extra_child_seat, v_line.extra_meet_greet, v_line.extra_luggage, v_line.amount_eur, v_line.amount_czk,
      v_quote.client_first_name, v_quote.client_last_name, v_quote.client_email, COALESCE(v_quote.client_phone, ''),
      v_entry ->> 'booking_reference', 'manual', v_quote.lead_channel, 'confirmed', 'confirmed',
      v_version.locale, v_version.cancel_policy, v_version.cancel_policy_version,
      p_quote_id, v_line.id, v_line.deposit_share_minor,
      v_mode, v_state,
      CASE WHEN v_card_line THEN v_remainder ELSE NULL END,
      CASE WHEN v_card_line THEN v_version.currency ELSE NULL END,
      CASE WHEN v_card_line THEN v_customer ELSE NULL END,
      CASE WHEN v_card_line THEN v_method ELSE NULL END,
      v_hold_at
    )
    RETURNING id INTO v_booking_id;

    -- Its stops, in the same transaction, so the calendar, CRM and lead triggers see them.
    INSERT INTO public.booking_stops (
      booking_id, position, address, lat, lng, wait_minutes, free_minutes, blocks, fee_per_block_eur, fee_eur
    )
    SELECT v_booking_id, s.position, s.address, s.lat, s.lng, s.wait_minutes, s.free_minutes, s.blocks,
           s.fee_per_block_eur, s.fee_eur
      FROM public.quote_version_line_stops s
     WHERE s.line_id = v_line.id
     ORDER BY s.position;

    -- Its ledger row: the line's share of the deposit. The intent id sits in stripe_object_id, never on the booking.
    -- 098: a quote without a deposit has no deposit row.
    IF v_version.deposit_minor > 0 THEN
    PERFORM public.append_payment_event(
      v_booking_id,
      jsonb_build_object(
        'key', 'quote_deposit:' || p_payment_intent_id,
        'kind', 'quote_deposit',
        'stripe_object_id', p_payment_intent_id,
        'amount_minor', v_line.deposit_share_minor,
        'currency', v_version.currency,
        'actor_type', v_actor_type,
        'actor_id', v_actor_id
      )
    );
    END IF;

    -- Its consent row, copied from the acceptance, so the extras gate finds a consent for every converted trip.
    INSERT INTO public.booking_payment_consents (
      booking_id, mode, text_version, text_sha256, text_rendered, locale,
      amount_minor, currency, planned_hold_at, accepted_at, ip, user_agent, confirmed_at
    ) VALUES (
      v_booking_id, 'quote', v_acceptance.terms_version, v_acceptance.terms_sha256, v_acceptance.terms_rendered,
      v_acceptance.locale,
      CASE WHEN v_card_line THEN v_remainder ELSE NULL END,
      CASE WHEN v_card_line THEN v_version.currency ELSE NULL END,
      v_hold_at, v_acceptance.accepted_at, v_acceptance.ip, v_acceptance.user_agent, now()
    );

    v_ids := v_ids || v_booking_id;
  END LOOP;

  -- 7. The quote is paid; the acceptance is confirmed; the two events are written once.
  UPDATE public.quotes q
     SET status                   = 'paid',
         paid_at                  = now(),
         stripe_customer_id       = COALESCE(q.stripe_customer_id, p_customer_id),
         stripe_payment_method_id = COALESCE(q.stripe_payment_method_id, p_payment_method_id),
         updated_at               = now()
   WHERE q.id = p_quote_id;

  UPDATE public.quote_acceptances a
     SET confirmed_at = now()
   WHERE a.id = v_acceptance.id AND a.confirmed_at IS NULL;

  IF v_version.deposit_minor > 0 THEN
    INSERT INTO public.quote_events
      (quote_id, event_key, kind, version_id, stripe_object_id, amount_minor, currency, actor_type, actor_id)
    VALUES
      (p_quote_id, 'deposit_paid:' || p_payment_intent_id, 'deposit_paid', p_version_id, p_payment_intent_id,
       v_version.deposit_minor, v_version.currency, v_actor_type, v_actor_id)
    ON CONFLICT (quote_id, event_key) DO NOTHING;
  END IF;

  INSERT INTO public.quote_events
    (quote_id, event_key, kind, version_id, actor_type, actor_id)
  VALUES
    (p_quote_id, 'converted:' || p_version_id::text, 'converted', p_version_id, v_actor_type, v_actor_id)
  ON CONFLICT (quote_id, event_key) DO NOTHING;

  RETURN jsonb_build_object('converted', true, 'first_time', true, 'booking_ids', to_jsonb(v_ids));
END;
$$;

-- A re-created SECURITY DEFINER function regains PUBLIC EXECUTE: always revoke, then grant to the service role only.
REVOKE EXECUTE ON FUNCTION public.quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb, text, text) TO service_role;
