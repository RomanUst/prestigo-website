-- 099: send a quote with TBC fields; the bookings follow once the operator fills them in (owner request 2026-11-24).
--
-- 097 let a DRAFT keep TBC fields and refused to freeze an incomplete version. From here only the price is required to
-- send: the pickup date, time and addresses, hours, return date and tour title may still be TBC on the version the
-- client sees. When the client pays the deposit (or confirms / saves a card without one) while a line is still TBC,
-- quote_convert_to_bookings records the payment exactly as before but makes no booking: the quote is paid with
-- bookings_pending. The operator fills the TBC fields (quote_fill_line_details: only fields that are still NULL, on the
-- version the client has, nothing the client was shown changes); once every line is complete
-- quote_create_pending_bookings makes the bookings (the same rows the conversion makes).
--
-- Rollback: restore quote_versions_guard from 097, quote_children_guard from 091, quote_convert_to_bookings from 098;
-- drop the two new functions and quotes.bookings_pending (only while no quote is pending).

-- == 1. quotes.bookings_pending ======================================================================================
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS bookings_pending boolean NOT NULL DEFAULT false;

-- == 2. freezing needs a price on every line, nothing more ===========================================================
CREATE OR REPLACE FUNCTION public.quote_versions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_incomplete integer;
BEGIN
  IF current_setting('prestigo.quote_erasure', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'quote_version_frozen';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- 099: sending needs a price on every line; any other field may be sent as TBC.
  IF NEW.frozen_at IS NOT NULL THEN
    SELECT count(*) INTO v_incomplete
      FROM public.quote_version_lines l
     WHERE l.version_id = NEW.id
       AND l.amount_minor IS NULL;
    IF v_incomplete > 0 THEN
      RAISE EXCEPTION 'quote_lines_incomplete';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- == 3. the line guard lets quote_fill_line_details through (its own transaction-local switch) =======================
CREATE OR REPLACE FUNCTION public.quote_children_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_row     jsonb;
  v_version uuid;
  v_frozen  timestamptz;
BEGIN
  IF current_setting('prestigo.quote_erasure', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- 099: filling TBC fields of a sent line (quote_fill_line_details sets the switch for its own UPDATE only).
  IF current_setting('prestigo.quote_fill', true) = 'on' AND TG_TABLE_NAME = 'quote_version_lines' AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_row := to_jsonb(OLD);
    IF TG_TABLE_NAME = 'quote_version_lines' THEN
      v_version := (v_row ->> 'version_id')::uuid;
    ELSE
      SELECT l.version_id INTO v_version
        FROM public.quote_version_lines l
       WHERE l.id = (v_row ->> 'line_id')::uuid;
    END IF;
    SELECT v.frozen_at INTO v_frozen FROM public.quote_versions v WHERE v.id = v_version;
    IF v_frozen IS NOT NULL THEN
      RAISE EXCEPTION 'quote_version_frozen';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_row := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'quote_version_lines' THEN
      v_version := (v_row ->> 'version_id')::uuid;
    ELSE
      SELECT l.version_id INTO v_version
        FROM public.quote_version_lines l
       WHERE l.id = (v_row ->> 'line_id')::uuid;
    END IF;
    SELECT v.frozen_at INTO v_frozen FROM public.quote_versions v WHERE v.id = v_version;
    IF v_frozen IS NOT NULL THEN
      RAISE EXCEPTION 'quote_version_frozen';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- == 4. quote_convert_to_bookings: the pending path ==================================================================
-- The 098 body plus the pending path (marked 099); every other statement is unchanged.
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
  v_pending     boolean;
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
      RETURN jsonb_build_object('converted', true, 'first_time', false, 'booking_ids', to_jsonb(v_ids),
                                'pending', v_quote.bookings_pending);
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

  -- 099: a line still TBC (sent with fields the operator fills in later) means the client's payment or confirmation is
  -- recorded now and the bookings are made by quote_create_pending_bookings once every line is complete.
  SELECT EXISTS (
    SELECT 1 FROM public.quote_version_lines l
     WHERE l.version_id = p_version_id
       AND (   l.pickup_date IS NULL
            OR l.pickup_time IS NULL
            OR l.origin_address IS NULL
            OR (l.trip_type = 'transfer' AND l.destination_address IS NULL)
            OR (l.trip_type = 'hourly' AND l.hours IS NULL)
            OR (l.trip_type = 'daily' AND l.return_date IS NULL)
            OR (l.trip_type = 'tour' AND (l.title IS NULL OR l.hours IS NULL)))
  ) INTO v_pending;

  -- 5. Validation pass, before the first write: every line carries its amounts and shares, and a held line has its
  --    hold instant. A failure here writes nothing.
  FOR v_line IN
    SELECT * FROM public.quote_version_lines l WHERE l.version_id = p_version_id ORDER BY l.position
  LOOP
    IF v_line.deposit_share_minor IS NULL OR v_line.remainder_minor IS NULL
       OR v_line.amount_eur IS NULL OR v_line.amount_czk IS NULL THEN
      RETURN jsonb_build_object('converted', false, 'reason', 'lines_mismatch');
    END IF;
    IF NOT v_pending AND v_line.remainder_minor > 0 AND v_version.remainder_method = 'saved_card' THEN
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

  -- 099: the pending path. The quote is paid (secured) with the card it collected; no booking yet.
  IF v_pending THEN
    UPDATE public.quotes q
       SET status                   = 'paid',
           paid_at                  = now(),
           bookings_pending         = true,
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

    RETURN jsonb_build_object('converted', true, 'first_time', true, 'booking_ids', '[]'::jsonb, 'pending', true);
  END IF;

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

-- == 5. quote_fill_line_details ======================================================================================
CREATE OR REPLACE FUNCTION public.quote_fill_line_details(
  p_line_id    uuid,
  p_patch      jsonb,
  p_actor_id   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line     public.quote_version_lines;
  v_version  public.quote_versions;
  v_quote    public.quotes;
  v_complete boolean;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('filled', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_line FROM public.quote_version_lines l WHERE l.id = p_line_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('filled', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO v_version FROM public.quote_versions v WHERE v.id = v_line.version_id;
  SELECT * INTO v_quote FROM public.quotes q WHERE q.id = v_version.quote_id FOR UPDATE;
  IF v_quote.voided_at IS NOT NULL OR v_quote.cancelled_at IS NOT NULL OR v_quote.anonymised_at IS NOT NULL
     OR v_quote.status NOT IN ('sent', 'viewed', 'accepted', 'paid') THEN
    RETURN jsonb_build_object('filled', false, 'reason', 'closed');
  END IF;
  -- Only the version the client has (a draft is edited in the builder, an older version is history).
  IF v_version.frozen_at IS NULL
     OR v_version.id IS DISTINCT FROM COALESCE(v_quote.accepted_version_id, v_quote.current_version_id) THEN
    RETURN jsonb_build_object('filled', false, 'reason', 'not_current');
  END IF;

  -- Only a field that is still TBC (NULL) is written: a value the client was shown is never changed here.
  PERFORM set_config('prestigo.quote_fill', 'on', true);
  UPDATE public.quote_version_lines l
     SET pickup_date         = COALESCE(l.pickup_date, p_patch ->> 'pickup_date'),
         pickup_time         = COALESCE(l.pickup_time, p_patch ->> 'pickup_time'),
         origin_lat          = CASE WHEN l.origin_address IS NULL THEN (p_patch ->> 'origin_lat')::double precision ELSE l.origin_lat END,
         origin_lng          = CASE WHEN l.origin_address IS NULL THEN (p_patch ->> 'origin_lng')::double precision ELSE l.origin_lng END,
         origin_address      = COALESCE(l.origin_address, p_patch ->> 'origin_address'),
         destination_lat     = CASE WHEN l.destination_address IS NULL THEN (p_patch ->> 'destination_lat')::double precision ELSE l.destination_lat END,
         destination_lng     = CASE WHEN l.destination_address IS NULL THEN (p_patch ->> 'destination_lng')::double precision ELSE l.destination_lng END,
         destination_address = COALESCE(l.destination_address, p_patch ->> 'destination_address'),
         hours               = COALESCE(l.hours, (p_patch ->> 'hours')::smallint),
         return_date         = COALESCE(l.return_date, p_patch ->> 'return_date'),
         title               = COALESCE(l.title, p_patch ->> 'title'),
         flight_number       = COALESCE(l.flight_number, p_patch ->> 'flight_number'),
         terminal            = COALESCE(l.terminal, p_patch ->> 'terminal'),
         distance_km         = COALESCE(l.distance_km, (p_patch ->> 'distance_km')::numeric)
   WHERE l.id = p_line_id;
  PERFORM set_config('prestigo.quote_fill', 'off', true);

  -- The stored PDF showed TBC: it is made again on the next download.
  DELETE FROM public.quote_documents d WHERE d.version_id = v_version.id;

  INSERT INTO public.quote_events (quote_id, event_key, kind, version_id, actor_type, actor_id, error_code)
  VALUES (v_quote.id, 'details:' || p_line_id::text || ':' || md5(p_patch::text), 'admin_action', v_version.id, 'admin',
          left(p_actor_id, 64), 'details_filled')
  ON CONFLICT (quote_id, event_key) DO NOTHING;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.quote_version_lines l
     WHERE l.version_id = v_version.id
       AND (   l.pickup_date IS NULL
            OR l.pickup_time IS NULL
            OR l.origin_address IS NULL
            OR (l.trip_type = 'transfer' AND l.destination_address IS NULL)
            OR (l.trip_type = 'hourly' AND l.hours IS NULL)
            OR (l.trip_type = 'daily' AND l.return_date IS NULL)
            OR (l.trip_type = 'tour' AND (l.title IS NULL OR l.hours IS NULL)))
  ) INTO v_complete;

  RETURN jsonb_build_object('filled', true, 'complete', v_complete, 'bookings_pending', v_quote.bookings_pending);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.quote_fill_line_details(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_fill_line_details(uuid, jsonb, text) TO service_role;

-- == 6. quote_create_pending_bookings ================================================================================
CREATE OR REPLACE FUNCTION public.quote_create_pending_bookings(
  p_quote_id   uuid,
  p_lines      jsonb,
  p_actor_type text,
  p_actor_id   text
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

  SELECT * INTO v_quote FROM public.quotes q WHERE q.id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_found');
  END IF;
  IF v_quote.voided_at IS NOT NULL OR v_quote.cancelled_at IS NOT NULL OR v_quote.anonymised_at IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'closed');
  END IF;
  IF v_quote.status <> 'paid' OR v_quote.paid_at IS NULL OR NOT v_quote.bookings_pending THEN
    -- Already made (a second press, a race): the bookings that exist are the answer.
    SELECT COALESCE(array_agg(b.id ORDER BY l.position), ARRAY[]::uuid[])
      INTO v_ids
      FROM public.bookings b
      JOIN public.quote_version_lines l ON l.id = b.quote_line_id
     WHERE b.quote_id = p_quote_id;
    IF cardinality(v_ids) > 0 THEN
      RETURN jsonb_build_object('created', true, 'first_time', false, 'booking_ids', to_jsonb(v_ids));
    END IF;
    RETURN jsonb_build_object('created', false, 'reason', 'not_pending');
  END IF;

  SELECT * INTO v_version FROM public.quote_versions v
   WHERE v.id = COALESCE(v_quote.accepted_version_id, v_quote.current_version_id);
  IF NOT FOUND OR v_version.frozen_at IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_pending');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quote_version_lines l
     WHERE l.version_id = v_version.id
       AND (   l.pickup_date IS NULL
            OR l.pickup_time IS NULL
            OR l.origin_address IS NULL
            OR (l.trip_type = 'transfer' AND l.destination_address IS NULL)
            OR (l.trip_type = 'hourly' AND l.hours IS NULL)
            OR (l.trip_type = 'daily' AND l.return_date IS NULL)
            OR (l.trip_type = 'tour' AND (l.title IS NULL OR l.hours IS NULL)))
  ) THEN
    RETURN jsonb_build_object('created', false, 'reason', 'incomplete');
  END IF;

  -- The acceptance the client confirmed (its consent text is copied to every booking).
  SELECT * INTO v_acceptance
    FROM public.quote_acceptances a
   WHERE a.quote_id = p_quote_id AND a.version_id = v_version.id AND a.confirmed_at IS NOT NULL
   ORDER BY a.confirmed_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_accepted');
  END IF;

  -- 4. The caller's lines must be exactly the version's lines (positions only; nothing else is read from p_lines).
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RETURN jsonb_build_object('created', false, 'reason', 'lines_mismatch');
  END IF;
  FOR v_entry IN SELECT e FROM jsonb_array_elements(p_lines) e LOOP
    IF jsonb_typeof(v_entry) <> 'object'
       OR jsonb_typeof(v_entry -> 'position') <> 'number'
       OR jsonb_typeof(v_entry -> 'booking_reference') <> 'string'
       OR char_length(v_entry ->> 'booking_reference') = 0 THEN
      RETURN jsonb_build_object('created', false, 'reason', 'lines_mismatch');
    END IF;
  END LOOP;
  SELECT COALESCE(array_agg((e ->> 'position')::numeric::integer ORDER BY (e ->> 'position')::numeric::integer), ARRAY[]::integer[])
    INTO v_given
    FROM jsonb_array_elements(p_lines) e;
  SELECT COALESCE(array_agg(l.position::integer ORDER BY l.position), ARRAY[]::integer[])
    INTO v_expected
    FROM public.quote_version_lines l
   WHERE l.version_id = v_version.id;
  IF cardinality(v_expected) = 0 OR v_given IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('created', false, 'reason', 'lines_mismatch');
  END IF;

  v_customer := v_quote.stripe_customer_id;
  v_method   := v_quote.stripe_payment_method_id;

  -- 5. Validation pass, before the first write: every line carries its amounts and shares, and a held line has its
  --    hold instant. A failure here writes nothing.
  FOR v_line IN
    SELECT * FROM public.quote_version_lines l WHERE l.version_id = v_version.id ORDER BY l.position
  LOOP
    IF v_line.deposit_share_minor IS NULL OR v_line.remainder_minor IS NULL
       OR v_line.amount_eur IS NULL OR v_line.amount_czk IS NULL THEN
      RETURN jsonb_build_object('created', false, 'reason', 'lines_mismatch');
    END IF;
    IF v_line.remainder_minor > 0 AND v_version.remainder_method = 'saved_card' THEN
      SELECT e INTO v_entry FROM jsonb_array_elements(p_lines) e WHERE (e ->> 'position')::numeric::integer = v_line.position;
      IF v_entry ->> 'hold_at' IS NULL THEN
        RETURN jsonb_build_object('created', false, 'reason', 'hold_at_missing');
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
    SELECT * FROM public.quote_version_lines l WHERE l.version_id = v_version.id ORDER BY l.position
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
        'key', 'quote_deposit:' || v_quote.deposit_payment_intent_id,
        'kind', 'quote_deposit',
        'stripe_object_id', v_quote.deposit_payment_intent_id,
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

  UPDATE public.quotes q
     SET bookings_pending = false,
         updated_at       = now()
   WHERE q.id = p_quote_id;

  INSERT INTO public.quote_events
    (quote_id, event_key, kind, version_id, actor_type, actor_id)
  VALUES
    (p_quote_id, 'converted:' || v_version.id::text, 'converted', v_version.id, v_actor_type, v_actor_id)
  ON CONFLICT (quote_id, event_key) DO NOTHING;

  RETURN jsonb_build_object('created', true, 'first_time', true, 'booking_ids', to_jsonb(v_ids));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.quote_create_pending_bookings(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_create_pending_bookings(uuid, jsonb, text, text) TO service_role;
