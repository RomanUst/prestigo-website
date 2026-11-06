-- Migration 088: erasure_payment_pii
-- Phase 89 (plan 89-05; CASH-03, CASH-01) -- closes the erasure gap carried from Phase 88 (88 D-23, the go-live
-- blocker): the personal data the payment flow stores must be erasable before any client saves a card, and an
-- erasure must never strand a live hold.
--
-- What 075 left behind, and what this file does about it:
--   * booking_payment_consents.ip and .user_agent (085)  -> nulled for the person's bookings
--   * booking_manage_tokens (087)                         -> rows deleted (the link dies with the person)
--   * booking_payment_notes (087)                         -> rows deleted (operator free text)
--   * booking_fee_cases.reason / contact_note / evidence  -> NULL / NULL / '{}' (the case row, amounts, kind and
--                                                            status stay: accounting history)
--   * bookings.stripe_customer_id, stripe_payment_method_id, setup_intent_id, hold_payment_intent_id,
--     recovery_link_url                                   -> cleared ONLY where payment_state is terminal
--                                                            (captured, released, cash_settled); clearing them on
--                                                            a live hold or an open fee case would make the hold
--                                                            unreleasable and the fee uncollectable
--   * the Stripe Customer object itself                   -> deleted by the new saga step 'stripe' (lib/erasure.ts)
--                                                            BEFORE the Supabase step; charges stay in Stripe for
--                                                            the accounting retention (research A10)
--
-- Request guard: a person with a booking in placing_hold / authorized / capturing, a pending fee case, or a future
-- (not cancelled) pickup whose payment_state is neither 'none' nor terminal is refused. erasure_confirm answers
-- 'payment_open' (the admin route returns it as a 422 code and the confirm form says why); erasure_scope reports the
-- number of such bookings as counts.payment_open so the preview shows it before the admin types anything. A future
-- pickup with no card flow ('none') keeps the existing 82 behaviour: acknowledge, then anonymise.
--
-- Functions replaced here (full copies of the 075 bodies plus the additions above, so a text test can prove nothing
-- of the old body was edited out):
--   erasure_payment_open (new, internal)   erasure_record_step (+ 'stripe')   erasure_confirm (+ guard)
--   erasure_anonymise_person (+ payment PII, 'stripe' step required)           erasure_scope (+ payment_open count)
--
-- CREATE OR REPLACE keeps the existing grants, but the REVOKE / GRANT block at the bottom is repeated anyway: a
-- DROP + CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE (project memory), and the block must always be
-- re-run (T-89-17).
--
-- ORDER: apply AFTER 087 (it names the 087 tables). Apply BEFORE the code that records the 'stripe' step is
-- deployed: erasure_record_step in 075 refuses an unknown step name.
--
-- Schema FILE only -- applied by the orchestrator via Supabase MCP, not by the executor.

-- == 1. erasure_payment_open: bookings an erasure must wait for (internal, not granted) ==
-- Counts the bookings whose payment is still in play: a hold being placed / held / captured, a pending fee case
-- (the mirror column or the case row itself), or a future pickup with a card flow still open.
CREATE OR REPLACE FUNCTION public.erasure_payment_open(p_booking_ids uuid[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
    FROM public.bookings b
   WHERE b.id = ANY (p_booking_ids)
     AND (
          b.payment_state IN ('placing_hold', 'authorized', 'capturing')
       OR b.fee_case_status = 'pending'
       OR EXISTS (
            SELECT 1 FROM public.booking_fee_cases c
             WHERE c.booking_id = b.id AND c.status = 'pending'
          )
       OR (
            b.pickup_utc >= now()
            AND b.status <> 'cancelled'
            AND b.payment_state NOT IN ('none', 'captured', 'released', 'cash_settled')
          )
     );
$$;

-- == 2. erasure_record_step: 'stripe' joins the step names ==
CREATE OR REPLACE FUNCTION public.erasure_record_step(p_request_id uuid, p_step text, p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_step IS NULL OR p_step NOT IN ('chatwoot', 'espocrm', 'verify', 'stripe', 'supabase', 'auth') THEN
    RAISE EXCEPTION 'erasure_record_step: invalid step';
  END IF;
  IF p_result IS NOT NULL AND jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'erasure_record_step: result must be an object';
  END IF;

  UPDATE public.erasure_requests e
     SET steps  = e.steps || jsonb_build_object(
                    p_step,
                    COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('done_at', now())
                  ),
         status = CASE WHEN e.status = 'confirmed' THEN 'running' ELSE e.status END
   WHERE e.id = p_request_id
     AND e.status IN ('confirmed', 'running');
END;
$$;

-- == 3. erasure_confirm: freeze + enqueue in ONE transaction, refused while a payment is open ==
-- Returns 'confirmed' | 'not_found' | 'already_in_progress' | 'not_previewed' | 'expired' |
-- 'actor_mismatch' | 'payment_open' (088). The identity lock is taken FIRST (the same lock every resolver takes, and the
-- order every erasure function uses), then the request row: one lock order, no deadlock.
-- The scope is refreshed under the lock: the person may have booked or signed up since the preview.
CREATE OR REPLACE FUNCTION public.erasure_confirm(p_request_id uuid, p_actor uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  r           record;
  v_identity  uuid;
  v_user      uuid;
  v_emails    text[];
  v_phones    text[];
  v_bookings  uuid[];
  v_inquiries uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0));

  SELECT * INTO r FROM public.erasure_requests e WHERE e.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF r.status IN ('confirmed', 'running') THEN
    RETURN 'already_in_progress';
  END IF;
  IF r.status <> 'previewed' THEN
    RETURN 'not_previewed';
  END IF;
  IF r.expires_at <= now() THEN
    RETURN 'expired';
  END IF;
  IF r.requested_by <> p_actor THEN
    RETURN 'actor_mismatch';
  END IF;

  v_identity := r.identity_id;
  IF v_identity IS NULL THEN
    SELECT ie.identity_id INTO v_identity
      FROM public.identity_emails ie
     WHERE ie.email = ANY (r.subject_emails)
     LIMIT 1;
  END IF;

  v_emails := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             r.subject_emails
             || ARRAY(SELECT ie.email FROM public.identity_emails ie WHERE ie.identity_id = v_identity)
           ) AS x
  );

  -- Only numbers that are not flagged shared: a desk / hotel number must never pull another
  -- person's chat contact into the deletion.
  v_phones := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             r.subject_phones
             || ARRAY(
                  SELECT p.phone
                    FROM public.identity_phones p
                    LEFT JOIN public.phone_flags f ON f.phone = p.phone
                   WHERE p.identity_id = v_identity
                     AND (f.phone IS NULL OR f.shared = false)
                )
           ) AS x
  );

  v_user := COALESCE(
    r.user_id,
    (SELECT c.user_id FROM public.contact_identities c WHERE c.id = v_identity),
    (SELECT u.id FROM auth.users u WHERE public.identity_normalize_email(u.email) = ANY (v_emails) LIMIT 1)
  );

  v_bookings := public.erasure_booking_ids(v_identity, v_user, v_emails);
  v_inquiries := public.erasure_inquiry_ids(v_emails);

  -- Phase 89 (T-89-16): refuse while a payment is in play. A live hold, a pending fee case or a card flow still
  -- open on a future pickup needs the Stripe ids and the booking's contact data; nothing has been written yet.
  IF public.erasure_payment_open(v_bookings) > 0 THEN
    RETURN 'payment_open';
  END IF;

  -- The partial unique indexes decide a race between two confirms: nothing else is written then.
  BEGIN
    UPDATE public.erasure_requests e
       SET status         = 'confirmed',
           confirmed_at   = now(),
           identity_id    = v_identity,
           user_id        = v_user,
           subject_emails = v_emails,
           subject_phones = v_phones,
           booking_ids    = v_bookings,
           inquiry_ids    = v_inquiries
     WHERE e.id = p_request_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'already_in_progress';
  END;

  IF v_identity IS NOT NULL THEN
    UPDATE public.contact_identities c
       SET erasing_at = COALESCE(c.erasing_at, now()), updated_at = now()
     WHERE c.id = v_identity;
  END IF;

  -- The erase row shares the person aggregate (the identity id), so the claim mutex of 064 never runs
  -- it beside a sync row. A person without an identity uses the request id.
  PERFORM public.outbox_enqueue(
    'erase.person',
    'person',
    COALESCE(v_identity, p_request_id),
    'erase.person:' || p_request_id::text,
    now()
  );

  RETURN 'confirmed';
END;
$$;

-- == 4. erasure_anonymise_person: the Supabase half, ONE transaction, with the payment PII ==
-- Returns the counts (and records the 'supabase' step itself in the same transaction, so there is no
-- window between "anonymised" and "recorded"). A repeat call after success returns the stored counts.
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

  UPDATE public.erasure_requests e
     SET steps  = e.steps || jsonb_build_object('supabase', v_counts || jsonb_build_object('done_at', now())),
         status = 'running'
   WHERE e.id = p_request_id;

  RETURN v_counts;
END;
$$;

-- == 5. erasure_scope: the preview reports the open payments ==
-- Outcomes: 'invalid' | 'shared_phone' (with the identities count) | 'not_found' |
-- 'already_in_progress' | 'ok'. An email search covers the identity's emails (phone-merged ones
-- included, D-10), its account, its bookings, inquiries and quote requests; a person who never got an
-- identity (inquiry-only, or before the backfill) is found through the email alone. A phone search
-- resolves ONLY through a non-shared identity phone: a desk / hotel number never picks a person.
-- When both an email and a phone are given the email wins. Read-only; nothing is locked.
CREATE OR REPLACE FUNCTION public.erasure_scope(p_email text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_email     text;
  v_phone     text;
  v_identity  uuid;
  v_user      uuid;
  v_emails    text[];
  v_phones    text[];
  v_owners    uuid[];
  v_shared    boolean;
  v_bookings  uuid[];
  v_inquiries uuid[];
  v_quote     integer;
  v_upcoming  integer;
  v_primary   text;
  v_payment_open integer;
BEGIN
  v_email := public.identity_normalize_email(p_email);
  v_phone := public.identity_normalize_phone(p_phone);
  IF v_email IS NULL AND v_phone IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT ie.identity_id INTO v_identity FROM public.identity_emails ie WHERE ie.email = v_email;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT p.identity_id), '{}'::uuid[])
      INTO v_owners
      FROM public.identity_phones p
     WHERE p.phone = v_phone;
    SELECT EXISTS (SELECT 1 FROM public.phone_flags f WHERE f.phone = v_phone AND f.shared)
      INTO v_shared;
    IF v_shared OR cardinality(v_owners) > 1 THEN
      RETURN jsonb_build_object('outcome', 'shared_phone', 'identities', cardinality(v_owners));
    END IF;
    IF cardinality(v_owners) = 0 THEN
      RETURN jsonb_build_object('outcome', 'not_found');
    END IF;
    v_identity := v_owners[1];
  END IF;

  v_emails := ARRAY(
    SELECT DISTINCT x
      FROM unnest(
             CASE WHEN v_email IS NULL THEN '{}'::text[] ELSE ARRAY[v_email] END
             || ARRAY(SELECT ie.email FROM public.identity_emails ie WHERE ie.identity_id = v_identity)
           ) AS x
     ORDER BY x
  );
  SELECT ie.email INTO v_primary
    FROM public.identity_emails ie
   WHERE ie.identity_id = v_identity
   ORDER BY ie.created_at, ie.email
   LIMIT 1;
  v_primary := COALESCE(v_primary, v_email);

  v_user := COALESCE(
    (SELECT c.user_id FROM public.contact_identities c WHERE c.id = v_identity),
    (SELECT u.id FROM auth.users u WHERE public.identity_normalize_email(u.email) = ANY (v_emails) LIMIT 1)
  );

  v_phones := ARRAY(
    SELECT p.phone
      FROM public.identity_phones p
      LEFT JOIN public.phone_flags f ON f.phone = p.phone
     WHERE p.identity_id = v_identity
       AND (f.phone IS NULL OR f.shared = false)
     ORDER BY p.first_seen, p.phone
  );

  v_bookings := public.erasure_booking_ids(v_identity, v_user, v_emails);
  v_inquiries := public.erasure_inquiry_ids(v_emails);
  SELECT count(*)::integer INTO v_quote
    FROM public.quote_leads q
   WHERE public.identity_normalize_email(q.email) = ANY (v_emails);
  SELECT count(*)::integer INTO v_upcoming
    FROM public.bookings b
   WHERE b.id = ANY (v_bookings)
     AND b.pickup_utc >= now()
     AND b.status <> 'cancelled';
  v_payment_open := public.erasure_payment_open(v_bookings);

  IF v_identity IS NULL AND v_user IS NULL
     AND cardinality(v_bookings) = 0 AND cardinality(v_inquiries) = 0 AND v_quote = 0 THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.erasure_requests e
     WHERE e.status IN ('confirmed', 'running')
       AND ((v_identity IS NOT NULL AND e.identity_id = v_identity) OR e.subject_emails && v_emails)
  ) THEN
    RETURN jsonb_build_object('outcome', 'already_in_progress');
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'primary_email', v_primary,
    'emails', to_jsonb(v_emails),
    'phones', to_jsonb(v_phones),
    'identity_id', v_identity,
    'user_id', v_user,
    'booking_ids', to_jsonb(v_bookings),
    'inquiry_ids', to_jsonb(v_inquiries),
    'counts', jsonb_build_object(
      'bookings', cardinality(v_bookings),
      'upcoming', v_upcoming,
      'payment_open', v_payment_open,
      'inquiries', cardinality(v_inquiries),
      'quote_leads', v_quote,
      'has_account', v_user IS NOT NULL
    )
  );
END;
$$;

-- == 6. Grants ==
-- SECURITY DEFINER functions get PUBLIC EXECUTE by default: revoke it, then grant to service_role only.
-- erasure_payment_open is internal (called by the definer functions above): revoked, not granted.
REVOKE EXECUTE ON FUNCTION public.erasure_payment_open(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_record_step(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_confirm(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_scope(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.erasure_record_step(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_confirm(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_scope(text, text) TO service_role;
