-- Migration 089: stops_landing_extra_charges
-- Phase 91 (plan 91-01; STOP-03, STOP-04, STOP-05, EXTRA-01) - multi-stop transfers, airport pickup with a landing
-- time, per-class paid waiting and the operator's extra charges to the saved card.
--
-- Schema FILE only - applied LIVE by the orchestrator through the Supabase MCP BEFORE any code that reads the new
-- columns ships (getPricingConfig selects waiting_rate_per_15min from plan 91-02 on).
-- Additive for old code: every new column is nullable or defaulted, every new table is deny-all, the one widened
-- CHECK (ledger kinds) only adds values.
--
-- What this file adds:
--   1. public.booking_stops            stops of one booking, position 1..5, wait in 15-minute steps, fee snapshot
--   2. bookings.landing_date / landing_time / pickup_offset_min   (D-18: the flight's landing time, kept BESIDE the
--      pickup; pickup_date and pickup_time stay the operational instant and the generated pickup column is not touched)
--   3. pricing_config.waiting_rate_per_15min   (D-04: one rate per class next to hourly_rate; D-05: NO default and NO
--      row update here - every class starts with paid waiting "not offered" until the owner sets a rate in the admin)
--   4. public.booking_extra_charges    the operator's off-session charges to the saved card (waiting | other)
--   5. ledger kinds extra_charged, extra_failed
--   6. erasure_payment_open / erasure_anonymise_person copies (stop addresses and extra descriptions are personal data;
--      a charging extra is an open payment)
--
-- Why bookings_gcal_sync (063) is NOT re-created: it already fires on the generated pickup column. A landing change always
-- moves the pickup, and the stops are read at sync time (plan 91-14), so the trigger stays exactly as it is.

-- == 1. booking_stops (STOP-04) ====================================================
-- Deny-all table like booking_fee_cases (087): the client reads their booking, never a stop row directly; every read
-- and write goes through the service client. free_minutes / fee_per_block_eur / blocks / fee_eur are the price
-- snapshot taken at capture, so a later change of the waiting rate never rewrites an old booking.
CREATE TABLE IF NOT EXISTS public.booking_stops (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid             NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  position          smallint         NOT NULL CHECK (position BETWEEN 1 AND 5),
  address           text             CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 500),
  lat               double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng               double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  wait_minutes      smallint         NOT NULL DEFAULT 0 CHECK (wait_minutes BETWEEN 0 AND 120 AND wait_minutes % 15 = 0),
  free_minutes      smallint         NOT NULL CHECK (free_minutes >= 0),
  blocks            smallint         NOT NULL DEFAULT 0 CHECK (blocks >= 0),
  fee_per_block_eur numeric          CHECK (fee_per_block_eur IS NULL OR fee_per_block_eur > 0),
  fee_eur           numeric          NOT NULL DEFAULT 0 CHECK (fee_eur >= 0),
  created_at        timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT booking_stops_booking_position_key UNIQUE (booking_id, position)
);

REVOKE ALL ON public.booking_stops FROM anon, authenticated;
ALTER TABLE public.booking_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_stops_no_public_read ON public.booking_stops;
CREATE POLICY booking_stops_no_public_read
  ON public.booking_stops FOR SELECT
  USING (false);

DROP POLICY IF EXISTS booking_stops_no_public_insert ON public.booking_stops;
CREATE POLICY booking_stops_no_public_insert
  ON public.booking_stops FOR INSERT
  WITH CHECK (false);

-- == 2. Landing time beside the pickup (STOP-05, D-18) ==============================
-- All three are NULL (not an airport pickup, or an old booking) or all three are set: the flight's landing date and
-- time, and how many minutes after landing the driver is there (0, 15, 30, 45, 60 or 90).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS landing_date text,
  ADD COLUMN IF NOT EXISTS landing_time text,
  ADD COLUMN IF NOT EXISTS pickup_offset_min smallint;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_landing_date_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_landing_date_check
  CHECK (landing_date IS NULL OR landing_date ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_landing_time_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_landing_time_check
  CHECK (landing_time IS NULL OR landing_time ~ '^\d{2}:\d{2}$');

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_pickup_offset_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_pickup_offset_check
  CHECK (pickup_offset_min IS NULL OR pickup_offset_min IN (0, 15, 30, 45, 60, 90));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_landing_complete_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_landing_complete_check
  CHECK (
    (landing_date IS NULL) = (landing_time IS NULL)
    AND (landing_time IS NULL) = (pickup_offset_min IS NULL)
  );

-- == 3. Waiting rate per vehicle class (D-04, D-05) ================================
-- Euro price of one 15-minute block of paid waiting, per class. NULL = paid waiting is not offered for the class.
-- D-05: no default and no UPDATE here. The owner sets the rates in the admin; until then every class offers none.
ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS waiting_rate_per_15min numeric;

ALTER TABLE public.pricing_config
  DROP CONSTRAINT IF EXISTS pricing_config_waiting_rate_check;
ALTER TABLE public.pricing_config
  ADD CONSTRAINT pricing_config_waiting_rate_check
  CHECK (waiting_rate_per_15min IS NULL OR waiting_rate_per_15min > 0);

-- == 4. booking_extra_charges (EXTRA-01) ==========================================
-- The operator's off-session charges to the saved card, many per booking (unlike booking_fee_cases, which is one per
-- booking). kind 'waiting' = paid waiting beyond what the client chose (minutes, blocks and the rate snapshot are
-- stored), 'other' = a typed amount with a description. The row is the lock: the partial unique index below allows ONE
-- charging row per booking, so two operators clicking at once cannot charge twice. The operator's free text lives only
-- in description (erased with the person, never copied into the ledger); the ledger row carries ids and amounts.
-- ON DELETE RESTRICT: a booking with a money record is anonymised, never deleted.
CREATE TABLE IF NOT EXISTS public.booking_extra_charges (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id               uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  kind                     text        NOT NULL CHECK (kind IN ('waiting', 'other')),
  status                   text        NOT NULL DEFAULT 'charging' CHECK (status IN ('charging', 'charged', 'failed')),
  currency                 text        NOT NULL CHECK (currency IN ('eur', 'czk')),
  amount_minor             bigint      NOT NULL CHECK (amount_minor > 0),
  minutes                  integer     CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 480),
  blocks                   integer     CHECK (blocks IS NULL OR blocks >= 1),
  rate_per_block_eur       numeric     CHECK (rate_per_block_eur IS NULL OR rate_per_block_eur > 0),
  description              text        CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 200),
  attempt                  integer     NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  stripe_payment_intent_id text,
  last_error_code          text        CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 60),
  requested_by             uuid,
  requested_at             timestamptz NOT NULL DEFAULT now(),
  charged_at               timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_extra_charges_one_charging
  ON public.booking_extra_charges (booking_id)
  WHERE status = 'charging';

CREATE INDEX IF NOT EXISTS booking_extra_charges_booking_idx
  ON public.booking_extra_charges (booking_id, requested_at);

REVOKE ALL ON public.booking_extra_charges FROM anon, authenticated;
ALTER TABLE public.booking_extra_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_extra_charges_no_public_read ON public.booking_extra_charges;
CREATE POLICY booking_extra_charges_no_public_read
  ON public.booking_extra_charges FOR SELECT
  USING (false);

DROP POLICY IF EXISTS booking_extra_charges_no_public_insert ON public.booking_extra_charges;
CREATE POLICY booking_extra_charges_no_public_insert
  ON public.booking_extra_charges FOR INSERT
  WITH CHECK (false);

-- == 5. Ledger kinds extra_charged, extra_failed ===================================
-- The full 087 list, verbatim, then the two new kinds (tests/payments-state.test.ts compares the order with LEDGER_KINDS).
ALTER TABLE public.booking_payment_events
  DROP CONSTRAINT IF EXISTS booking_payment_events_kind_check;
ALTER TABLE public.booking_payment_events
  ADD CONSTRAINT booking_payment_events_kind_check
  CHECK (kind IN (
    'setup_started',
    'setup_succeeded',
    'setup_failed',
    'hold_scheduled',
    'hold_started',
    'hold_authorized',
    'hold_failed',
    'hold_released',
    'hold_expired',
    'capture_started',
    'captured',
    'charge_succeeded',
    'charge_failed',
    'difference_charged',
    'difference_failed',
    'recovery_link_created',
    'recovery_paid',
    'alert_sent',
    'email_sent',
    'admin_action',
    'refund_observed',
    'refund_failed',
    'edit_reevaluated',
    'waived',
    'fee_opened',
    'cash_settled',
    'cash_reopened',
    'extra_charged',
    'extra_failed'
  ));

-- == 6. Erasure functions: full copies of 088 with the stop and extra-charge data added =
-- erasure_payment_open: a booking with a charging extra is an open payment (an erasure must not strand a charge that
-- is in flight). erasure_anonymise_person: stop addresses / coordinates and the extra-charge description are nulled
-- for the person's bookings. Nothing of the 088 bodies is removed (tests/migration-089.test.ts compares statement by
-- statement). The signatures do not change, so CREATE OR REPLACE keeps the grants; the REVOKE / GRANT lines are
-- repeated anyway so they are explicit in the latest definition (a DROP + CREATE would re-grant PUBLIC EXECUTE).
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
       OR EXISTS (
            SELECT 1 FROM public.booking_extra_charges x
             WHERE x.booking_id = b.id AND x.status = 'charging'
          )
     );
$$;

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

  UPDATE public.erasure_requests e
     SET steps  = e.steps || jsonb_build_object('supabase', v_counts || jsonb_build_object('done_at', now())),
         status = 'running'
   WHERE e.id = p_request_id;

  RETURN v_counts;
END;
$$;

-- == 7. Grants ======================================================================
-- Same lines as 088 for the two functions replaced here. erasure_payment_open is internal (called by the definer
-- functions): revoked from everyone, including service_role (Supabase default privileges grant it there).
REVOKE EXECUTE ON FUNCTION public.erasure_payment_open(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_payment_open(uuid[]) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) TO service_role;
