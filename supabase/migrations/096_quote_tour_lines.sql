-- Migration 096: tour lines and client descriptions on quotes (quick task quote-tour-line).
--
-- The owner answers custom-tour requests with quotes. A quote line may now be a 'tour' (a custom private tour) with a
-- client-visible headline (title) and the hours of service, and EVERY line may carry a client-visible description
-- (itinerary, what is included / not included). On acceptance a tour line becomes a booking with trip_type 'tour',
-- tour_title = title, hours = hours, tour_id NULL and the description in the new bookings.tour_description, so the
-- operator and the driver see it. Non-tour lines keep tour_description NULL on their booking.
--
--   1. quote_version_lines: trip_type CHECK re-created with 'tour'; title and description columns; tour completeness
--   2. bookings.tour_description
--   3. quote_convert_to_bookings: verbatim copy of the latest definition (091) + the tour mapping
--   4. erasure_anonymise_person: verbatim copy of the latest definition (091) + description / tour_description cleared
--
-- ORCHESTRATOR CHECK BEFORE APPLYING: the trip_type CHECK of quote_version_lines was declared inline in 091, so Postgres
-- named it automatically. This migration assumes the name quote_version_lines_trip_type_check (DROP ... IF EXISTS).
-- Verify the live name first:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.quote_version_lines'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%trip_type%';
-- If it differs, change the DROP below; otherwise the old CHECK survives and every 'tour' line is refused.
--
-- No other SQL function writes quote_version_lines columns by name: the draft save, the revise copy and the conversion
-- read are in TypeScript (lib/quotes/store.ts, lib/quotes/lifecycle.ts copy whole rows) and the only SQL readers are the
-- two functions re-created here. 091 to 095 are live and are not edited.
-- Rolled-back smoke: .planning/quick/quote-tour-line-096-smoke.sql

-- == 1. quote_version_lines ==========================================================================================
ALTER TABLE public.quote_version_lines DROP CONSTRAINT IF EXISTS quote_version_lines_trip_type_check;
ALTER TABLE public.quote_version_lines
  ADD CONSTRAINT quote_version_lines_trip_type_check
  CHECK (trip_type IN ('transfer', 'hourly', 'daily', 'tour'));

-- The client-visible headline of a tour line (bookings.tour_title has the same 200-character limit).
ALTER TABLE public.quote_version_lines
  ADD COLUMN IF NOT EXISTS title text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 200);

-- Client-visible plain text of any line: itinerary, what is included and what is not.
ALTER TABLE public.quote_version_lines
  ADD COLUMN IF NOT EXISTS description text CHECK (description IS NULL OR char_length(description) <= 4000);

-- A tour line always has its headline and its hours of service.
ALTER TABLE public.quote_version_lines DROP CONSTRAINT IF EXISTS quote_version_lines_tour_complete_check;
ALTER TABLE public.quote_version_lines
  ADD CONSTRAINT quote_version_lines_tour_complete_check
  CHECK (trip_type <> 'tour' OR (title IS NOT NULL AND hours IS NOT NULL));

-- == 2. bookings.tour_description ====================================================================================
-- The description of a tour booking made from a quote line; NULL for every other booking (and for site day trips, whose
-- text lives on public.tours).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS tour_description text CHECK (tour_description IS NULL OR char_length(tour_description) <= 4000);

-- == 3. quote_convert_to_bookings ====================================================================================
-- Unchanged from 091 except the booking INSERT: tour_id is NULL (a custom tour is not a catalogue tour), a tour line
-- copies its title into tour_title and its description into tour_description; every other line leaves both NULL.
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
    IF p_payment_intent_id IS NOT NULL AND v_quote.deposit_payment_intent_id = p_payment_intent_id THEN
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
  IF p_payment_intent_id IS NULL OR v_quote.deposit_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'intent_mismatch');
  END IF;

  SELECT * INTO v_version FROM public.quote_versions v WHERE v.id = p_version_id;
  IF NOT FOUND OR v_version.quote_id <> p_quote_id THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'version_mismatch');
  END IF;
  IF v_version.frozen_at IS NULL THEN
    RETURN jsonb_build_object('converted', false, 'reason', 'not_accepted');
  END IF;

  -- The acceptance that created this deposit intent: it carries the consent text the client saw.
  SELECT * INTO v_acceptance
    FROM public.quote_acceptances a
   WHERE a.quote_id = p_quote_id AND a.payment_intent_id = p_payment_intent_id
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

  INSERT INTO public.quote_events
    (quote_id, event_key, kind, version_id, stripe_object_id, amount_minor, currency, actor_type, actor_id)
  VALUES
    (p_quote_id, 'deposit_paid:' || p_payment_intent_id, 'deposit_paid', p_version_id, p_payment_intent_id,
     v_version.deposit_minor, v_version.currency, v_actor_type, v_actor_id)
  ON CONFLICT (quote_id, event_key) DO NOTHING;

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

-- == 4. erasure_anonymise_person =====================================================================================
-- Unchanged from 091 except two added statements (every 091 statement is kept whole): the person's bookings lose
-- tour_description (it can hold the visitor's wishes) and the anonymised quote lines lose description. The tour title
-- stays (an operator-written headline).
CREATE OR REPLACE FUNCTION public.erasure_anonymise_person(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  r         record;
  v_ids     uuid[];
  v_emails  text[];
  v_phones  text[];
  n_book    integer := 0;
  n_audit   integer := 0;
  n_mail    integer := 0;
  n_gnet    integer := 0;
  n_notes   integer := 0;
  n_inq     integer := 0;
  n_ql      integer := 0;
  n_ident   integer := 0;
  v_counts  jsonb;
  n_consent integer := 0;
  n_token   integer := 0;
  n_pnote   integer := 0;
  n_case    integer := 0;
  n_stripe  integer := 0;
  n_stops   integer := 0;
  n_extra   integer := 0;
  v_quote_ids         uuid[];
  n_quotes_deleted    integer := 0;
  n_quotes_anonymised integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  SELECT * INTO r FROM public.erasure_requests e WHERE e.id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('confirmed', 'running') THEN
    RAISE EXCEPTION 'erasure_anonymise_person: request is not active';
  END IF;

  IF r.steps -> 'supabase' IS NOT NULL THEN
    RETURN (r.steps -> 'supabase') - 'done_at';
  END IF;

  -- Supabase is last: the CRM and chat steps must be done and verified first.
  IF r.steps -> 'chatwoot' IS NULL
     OR r.steps -> 'espocrm' IS NULL
     OR COALESCE(r.steps -> 'verify' ->> 'verified', 'false') <> 'true' THEN
    RAISE EXCEPTION 'erasure_anonymise_person: CRM steps are not finished';
  END IF;

  -- Phase 89: the Stripe Customer is deleted (saga step 'stripe') while the Stripe ids are still on the
  -- bookings. Anonymising first would orphan the Customer, so the order is enforced here as well.
  IF r.steps -> 'stripe' IS NULL THEN
    RAISE EXCEPTION 'erasure_anonymise_person: stripe step is not finished';
  END IF;

  v_emails := r.subject_emails;
  v_ids := ARRAY(
    SELECT DISTINCT x
      FROM unnest(r.booking_ids || public.erasure_booking_ids(r.identity_id, r.user_id, v_emails)) AS x
  );
  v_phones := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             r.subject_phones
             || ARRAY(SELECT p.phone FROM public.identity_phones p WHERE p.identity_id = r.identity_id)
           ) AS x
  );

  -- D-08: bookings keep date, amount, vehicle class, reference and invoice data; personal data goes.
  UPDATE public.bookings b
     SET client_first_name   = '',
         client_last_name    = '',
         client_email        = 'erased-' || b.id::text || '@erased.invalid',
         client_phone        = '',
         special_requests    = NULL,
         operator_notes      = NULL,
         origin_address      = NULL,
         origin_lat          = NULL,
         origin_lng          = NULL,
         destination_address = NULL,
         destination_lat     = NULL,
         destination_lng     = NULL,
         flight_number       = NULL,
         flight_iata         = NULL,
         user_id             = NULL,
         anonymised_at       = now()
   WHERE b.id = ANY (v_ids)
     AND b.anonymised_at IS NULL;
  GET DIAGNOSTICS n_book = ROW_COUNT;

  -- 096: the description of a tour booking made from a quote can hold the visitor's wishes; it goes too.
  UPDATE public.bookings b
     SET tour_description = NULL
   WHERE b.id = ANY (v_ids)
     AND b.tour_description IS NOT NULL;

  -- Residual copies of the same data. Edit-audit rows keep the field name and the accounting values
  -- (price, status, schedule); every other old/new value is wiped.
  UPDATE public.booking_edit_audit_log a
     SET old_value = NULL, new_value = NULL
   WHERE a.booking_id = ANY (v_ids)
     AND (a.old_value IS NOT NULL OR a.new_value IS NOT NULL)
     AND a.field NOT IN (
       'amount_czk', 'amount_eur', 'outbound_amount_czk', 'return_amount_czk', 'driver_price_czk',
       'status', 'vehicle_class', 'pickup_date', 'pickup_time', 'return_date', 'passengers',
       'luggage', 'hours', 'distance_km'
     );
  GET DIAGNOSTICS n_audit = ROW_COUNT;

  UPDATE public.email_log l
     SET recipient = 'erased@erased.invalid'
   WHERE (l.booking_id = ANY (v_ids) OR public.identity_normalize_email(l.recipient) = ANY (v_emails))
     AND l.recipient <> 'erased@erased.invalid';
  GET DIAGNOSTICS n_mail = ROW_COUNT;

  UPDATE public.gnet_bookings g
     SET raw_payload = '{}'::jsonb, last_push_error = NULL
   WHERE g.booking_id = ANY (v_ids)
     AND (g.raw_payload <> '{}'::jsonb OR g.last_push_error IS NOT NULL);
  GET DIAGNOSTICS n_gnet = ROW_COUNT;

  UPDATE public.driver_assignments d
     SET trip_note = NULL
   WHERE d.booking_id = ANY (v_ids)
     AND d.trip_note IS NOT NULL;
  GET DIAGNOSTICS n_notes = ROW_COUNT;

  -- Phase 89 (88 D-23, T-89-15): the payment flow's own personal data. Consent rows stay (the wording, its
  -- hash and the acceptance time are accounting evidence); only the network identifiers go.
  UPDATE public.booking_payment_consents pc
     SET ip = NULL, user_agent = NULL
   WHERE pc.booking_id = ANY (v_ids)
     AND (pc.ip IS NOT NULL OR pc.user_agent IS NOT NULL);
  GET DIAGNOSTICS n_consent = ROW_COUNT;

  -- The manage-booking link dies with the person.
  DELETE FROM public.booking_manage_tokens mt
   WHERE mt.booking_id = ANY (v_ids);
  GET DIAGNOSTICS n_token = ROW_COUNT;

  -- Operator free text about cash decisions.
  DELETE FROM public.booking_payment_notes pn
   WHERE pn.booking_id = ANY (v_ids);
  GET DIAGNOSTICS n_pnote = ROW_COUNT;

  -- Fee cases keep kind, amounts, status and dates; the free text and the evidence pack go.
  UPDATE public.booking_fee_cases fc
     SET reason = NULL, contact_note = NULL, evidence = '{}'::jsonb
   WHERE fc.booking_id = ANY (v_ids)
     AND (fc.reason IS NOT NULL OR fc.contact_note IS NOT NULL OR fc.evidence <> '{}'::jsonb);
  GET DIAGNOSTICS n_case = ROW_COUNT;

  -- Phase 91: the addresses of the extra stops are location data like the pickup and drop-off above; the stop rows
  -- stay (position, wait and the price snapshot are accounting history). The operator's free text on an extra charge goes.
  UPDATE public.booking_stops bs
     SET address = NULL, lat = NULL, lng = NULL
   WHERE bs.booking_id = ANY (v_ids)
     AND (bs.address IS NOT NULL OR bs.lat IS NOT NULL OR bs.lng IS NOT NULL);
  GET DIAGNOSTICS n_stops = ROW_COUNT;

  UPDATE public.booking_extra_charges ec
     SET description = NULL
   WHERE ec.booking_id = ANY (v_ids)
     AND ec.description IS NOT NULL;
  GET DIAGNOSTICS n_extra = ROW_COUNT;

  -- Stripe ids only where the payment is finished (T-89-16): a live hold or an open fee case still needs them.
  UPDATE public.bookings sb
     SET stripe_customer_id       = NULL,
         stripe_payment_method_id = NULL,
         setup_intent_id          = NULL,
         hold_payment_intent_id   = NULL,
         recovery_link_url        = NULL
   WHERE sb.id = ANY (v_ids)
     AND sb.payment_state IN ('captured', 'released', 'cash_settled')
     AND (sb.stripe_customer_id IS NOT NULL
          OR sb.stripe_payment_method_id IS NOT NULL
          OR sb.setup_intent_id IS NOT NULL
          OR sb.hold_payment_intent_id IS NOT NULL
          OR sb.recovery_link_url IS NOT NULL);
  GET DIAGNOSTICS n_stripe = ROW_COUNT;

  -- Phase 92 (D-19, T-92-37): the personal data of the person's quotes. The guards of 091 section 8 let this
  -- transaction through (and only this one) while prestigo.quote_erasure is 'on'.
  PERFORM set_config('prestigo.quote_erasure', 'on', true);
  v_quote_ids := public.erasure_quote_ids(v_emails, r.subject_phones, v_ids);

  -- A quote that never took money and never became a booking is deleted with everything under it (versions, lines,
  -- stops, links, events, acceptances and documents cascade).
  DELETE FROM public.quotes dq
   WHERE dq.id = ANY (v_quote_ids)
     AND dq.paid_at IS NULL
     AND dq.remainder_paid_at IS NULL
     AND dq.deposit_refunded_minor = 0
     AND dq.remainder_refunded_minor = 0
     AND dq.deposit_payment_intent_id IS NULL
     AND dq.remainder_payment_intent_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.bookings qb WHERE qb.quote_id = dq.id)
     AND NOT EXISTS (SELECT 1 FROM public.quote_acceptances qa WHERE qa.quote_id = dq.id AND qa.payment_intent_id IS NOT NULL);
  GET DIAGNOSTICS n_quotes_deleted = ROW_COUNT;

  -- Every other quote of the person is anonymised in place: amounts, dates, references and the ledgers stay
  -- (accounting history); addresses, coordinates, free text, the client fields and the network identifiers go.
  UPDATE public.quote_version_line_stops qs
     SET address = NULL, lat = NULL, lng = NULL
   WHERE qs.line_id IN (
           SELECT ql.id
             FROM public.quote_version_lines ql
             JOIN public.quote_versions qv ON qv.id = ql.version_id
            WHERE qv.quote_id = ANY (v_quote_ids)
         )
     AND (qs.address IS NOT NULL OR qs.lat IS NOT NULL OR qs.lng IS NOT NULL);

  -- origin_address is NOT NULL (1 to 500 characters): it gets a fixed placeholder, everything else is nulled.
  UPDATE public.quote_version_lines ql
     SET origin_address      = 'erased',
         origin_lat          = NULL,
         origin_lng          = NULL,
         destination_address = NULL,
         destination_lat     = NULL,
         destination_lng     = NULL,
         flight_number       = NULL,
         special_requests    = NULL
   WHERE ql.version_id IN (SELECT qv.id FROM public.quote_versions qv WHERE qv.quote_id = ANY (v_quote_ids))
     AND (ql.origin_address <> 'erased' OR ql.origin_lat IS NOT NULL OR ql.origin_lng IS NOT NULL
          OR ql.destination_address IS NOT NULL OR ql.destination_lat IS NOT NULL OR ql.destination_lng IS NOT NULL
          OR ql.flight_number IS NOT NULL OR ql.special_requests IS NOT NULL);

  -- 096: the client description of a line is free text; it goes. The tour title (an operator headline) stays.
  UPDATE public.quote_version_lines ql
     SET description = NULL
   WHERE ql.version_id IN (SELECT qv.id FROM public.quote_versions qv WHERE qv.quote_id = ANY (v_quote_ids))
     AND ql.description IS NOT NULL;

  UPDATE public.quote_versions qv
     SET billing_note = NULL
   WHERE qv.quote_id = ANY (v_quote_ids)
     AND qv.billing_note IS NOT NULL;

  UPDATE public.quote_acceptances qa
     SET ip = NULL, user_agent = NULL
   WHERE qa.quote_id = ANY (v_quote_ids)
     AND (qa.ip IS NOT NULL OR qa.user_agent IS NOT NULL);

  -- The secret link and the stored PDF (it carries the client's name and the trip addresses) are deleted.
  DELETE FROM public.quote_links qk
   WHERE qk.quote_id = ANY (v_quote_ids);

  DELETE FROM public.quote_documents qd
   WHERE qd.version_id IN (SELECT qv.id FROM public.quote_versions qv WHERE qv.quote_id = ANY (v_quote_ids));

  -- The Stripe ids go where no money is in flight (the saga step 'stripe' has already deleted the Customer).
  UPDATE public.quotes sq
     SET stripe_customer_id       = NULL,
         stripe_payment_method_id = NULL,
         updated_at               = now()
   WHERE sq.id = ANY (v_quote_ids)
     AND NOT (
          (sq.status = 'accepted' AND sq.deposit_payment_intent_id IS NOT NULL)
       OR (sq.remainder_payment_intent_id IS NOT NULL AND sq.remainder_paid_at IS NULL AND sq.cancelled_at IS NULL)
        )
     AND (sq.stripe_customer_id IS NOT NULL OR sq.stripe_payment_method_id IS NOT NULL);

  UPDATE public.quotes aq
     SET client_first_name = '-',
         client_last_name  = '-',
         client_email      = 'erased-' || aq.id::text || '@erased.invalid',
         client_phone      = NULL,
         user_id           = NULL,
         source_inquiry_id = NULL,
         anonymised_at     = now(),
         updated_at        = now()
   WHERE aq.id = ANY (v_quote_ids)
     AND aq.anonymised_at IS NULL;
  GET DIAGNOSTICS n_quotes_anonymised = ROW_COUNT;

  PERFORM set_config('prestigo.quote_erasure', 'off', true);

  -- Contact forms and quote requests of the person's emails are removed, not kept.
  DELETE FROM public.inquiries i
   WHERE i.id = ANY (r.inquiry_ids)
      OR COALESCE(i.email_normalized, public.identity_normalize_email(i.email)) = ANY (v_emails);
  GET DIAGNOSTICS n_inq = ROW_COUNT;

  DELETE FROM public.quote_leads q
   WHERE public.identity_normalize_email(q.email) = ANY (v_emails);
  GET DIAGNOSTICS n_ql = ROW_COUNT;

  -- The identity rows (emails, phones, booking links cascade).
  IF r.identity_id IS NOT NULL THEN
    DELETE FROM public.contact_identities c WHERE c.id = r.identity_id;
    GET DIAGNOSTICS n_ident = ROW_COUNT;
  END IF;

  -- Automatic "shared" flags for the person's numbers, when no other identity holds the number.
  DELETE FROM public.phone_flags f
   WHERE f.phone = ANY (v_phones)
     AND f.source = 'auto'
     AND NOT EXISTS (SELECT 1 FROM public.identity_phones p WHERE p.phone = f.phone);

  v_counts := jsonb_build_object(
    'bookings_anonymised', n_book,
    'inquiries_deleted', n_inq,
    'quote_leads_deleted', n_ql,
    'audit_values_scrubbed', n_audit,
    'email_log_scrubbed', n_mail,
    'gnet_payloads_scrubbed', n_gnet,
    'trip_notes_scrubbed', n_notes,
    'identity_deleted', n_ident
  );

  v_counts := v_counts || jsonb_build_object(
    'consents_scrubbed', n_consent,
    'manage_tokens_deleted', n_token,
    'payment_notes_deleted', n_pnote,
    'fee_cases_scrubbed', n_case,
    'stripe_ids_cleared', n_stripe
  );

  v_counts := v_counts || jsonb_build_object(
    'stops_scrubbed', n_stops,
    'extra_descriptions_scrubbed', n_extra
  );

  v_counts := v_counts || jsonb_build_object(
    'quotes_deleted', n_quotes_deleted,
    'quotes_anonymised', n_quotes_anonymised
  );

  UPDATE public.erasure_requests e
     SET steps  = e.steps || jsonb_build_object('supabase', v_counts || jsonb_build_object('done_at', now())),
         status = 'running'
   WHERE e.id = p_request_id;

  RETURN v_counts;
END;
$$;

-- A re-created SECURITY DEFINER function regains PUBLIC EXECUTE: revoke again, grant to the service role only.
REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) TO service_role;
