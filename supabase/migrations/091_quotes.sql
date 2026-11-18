-- Migration 091: quotes
-- Phase 92 (plan 92-01; QUOTE-01, QUOTE-05, QUOTE-06) - multi-trip quotes: the quote header, immutable versions with
-- lines and stops, hashed links, the acceptance log, the quote event ledger, the stored PDF and the booking link
-- columns, with guard triggers and deny-all access.
--
-- Schema FILE only - applied LIVE by the orchestrator through the Supabase MCP (plan 92-12) BEFORE any code that
-- reads the new tables ships. Additive for old code: every new column is nullable or defaulted, every new table is
-- deny-all, the two widened CHECKs (ledger kinds, consent mode) only add values.
--
-- Numbering: 090 belongs to the production hotfix 090_consent_locale_zh_hant.sql (booking_payment_consents.locale
-- accepts zh-hant). This file never redefines booking_payment_consents_locale_check.
--
-- What this file adds:
--   1. public.quotes                      the quote header (mutable: status, payment and cancellation state)
--   2. public.quote_versions              immutable once frozen; language of the quote is one of the site locales
--   3. public.quote_version_lines         the trips of a version; public.quote_version_line_stops their stops
--   4. public.quote_links                 the secret link, stored as a SHA-256 hash only
--   5. public.quote_acceptances, public.quote_events, public.quote_documents
--   6. bookings.quote_id / quote_line_id / quote_deposit_minor (+ the exactly-once index on quote_line_id)
--   7. ledger kinds quote_deposit, quote_remainder; consent mode 'quote'
--   8. guard triggers: frozen versions are immutable, the acceptance and event logs are append-only
--   9. public.quote_convert_to_bookings    a paid deposit becomes one confirmed booking per line, exactly once (plan 92-06)
--   (the erasure copies of plan 92-12 are appended below)
--
-- Lifecycle changes (freeze, revise, void, viewed, accepted) are compare-and-set updates in TypeScript.

-- == 1. quotes (QUOTE-01) ==========================================================
-- Deny-all like every table of this file: the client reaches a quote only through the secret link, served by the
-- service client. The two foreign keys to quote_versions are added after that table exists (section 2).
CREATE TABLE IF NOT EXISTS public.quotes (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                  text        NOT NULL UNIQUE CHECK (reference ~ '^Q-[0-9]{8}-[A-Z0-9]{6}$'),
  status                     text        NOT NULL DEFAULT 'draft'
    CONSTRAINT quotes_status_check CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'paid', 'expired', 'voided')),
  current_version_id         uuid,
  client_first_name          text        NOT NULL CHECK (char_length(client_first_name) BETWEEN 1 AND 100),
  client_last_name           text        NOT NULL CHECK (char_length(client_last_name) BETWEEN 1 AND 100),
  client_email               text        NOT NULL CHECK (char_length(client_email) BETWEEN 3 AND 200),
  client_phone               text        CHECK (client_phone IS NULL OR char_length(client_phone) <= 50),
  lead_channel               text        NOT NULL CHECK (lead_channel IN ('whatsapp', 'phone', 'email', 'partner', 'other')),
  user_id                    uuid,
  source_inquiry_id          uuid,
  expires_at                 timestamptz,
  stripe_customer_id         text,
  stripe_payment_method_id   text,
  deposit_payment_intent_id  text,
  accepted_version_id        uuid,
  accepted_at                timestamptz,
  paid_at                    timestamptz,
  remainder_payment_intent_id text,
  remainder_amount_minor     bigint      CHECK (remainder_amount_minor IS NULL OR remainder_amount_minor > 0),
  remainder_attempt          integer     NOT NULL DEFAULT 0 CHECK (remainder_attempt >= 0),
  remainder_paid_at          timestamptz,
  invoice_requested_at       timestamptz,
  invoice_number             text        CHECK (invoice_number IS NULL OR char_length(invoice_number) <= 60),
  invoice_paid_at            timestamptz,
  voided_at                  timestamptz,
  voided_by                  uuid,
  cancelled_at               timestamptz,
  cancel_initiator           text        CHECK (cancel_initiator IS NULL OR cancel_initiator IN ('admin_client', 'admin_prestigo')),
  cancel_outcome             text        CHECK (cancel_outcome IS NULL OR cancel_outcome IN ('free', 'late')),
  deposit_refunded_minor     bigint      NOT NULL DEFAULT 0 CHECK (deposit_refunded_minor >= 0),
  remainder_refunded_minor   bigint      NOT NULL DEFAULT 0 CHECK (remainder_refunded_minor >= 0),
  anonymised_at              timestamptz,
  created_by                 uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- One quote per Stripe intent: a webhook replay or a second quote can never claim the same payment.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_deposit_pi_key
  ON public.quotes (deposit_payment_intent_id)
  WHERE deposit_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_remainder_pi_key
  ON public.quotes (remainder_payment_intent_id)
  WHERE remainder_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotes_client_email_idx
  ON public.quotes (lower(client_email));

REVOKE ALL ON public.quotes FROM anon, authenticated;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_no_public_read ON public.quotes;
CREATE POLICY quotes_no_public_read
  ON public.quotes FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quotes_no_public_insert ON public.quotes;
CREATE POLICY quotes_no_public_insert
  ON public.quotes FOR INSERT
  WITH CHECK (false);

-- == 2. quote_versions (QUOTE-06, D-07, D-09, D-13) =================================
-- A version is editable while frozen_at IS NULL (draft) and immutable once frozen (guard trigger, section 8).
-- D-07: deposit_kind, deposit_value and remainder_method have NO default - the operator enters them on every quote.
-- D-09: locale is the language of the page, the PDF and the email; the list is exactly `locales` of i18n/locales.ts
-- (tests/migration-091.test.ts compares them, so a new site locale fails the test instead of drifting).
-- D-13: free cancellation may be set up to 720 hours (30 days) before the first trip.
CREATE TABLE IF NOT EXISTS public.quote_versions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id             uuid        NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  version_no           integer     NOT NULL CHECK (version_no >= 1),
  frozen_at            timestamptz,
  locale               text        NOT NULL
    CONSTRAINT quote_versions_locale_check CHECK (locale IN ('en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh', 'zh-hant')),
  currency             text        NOT NULL CHECK (currency IN ('eur', 'czk')),
  total_minor          bigint      NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  deposit_kind         text        CHECK (deposit_kind IS NULL OR deposit_kind IN ('percent', 'fixed')),
  deposit_value        bigint      CHECK (deposit_value IS NULL OR deposit_value > 0),
  deposit_minor        bigint      CHECK (deposit_minor IS NULL OR deposit_minor > 0),
  remainder_method     text
    CONSTRAINT quote_versions_remainder_method_check CHECK (remainder_method IN ('saved_card', 'payment_link', 'cash', 'invoice')),
  cancel_free_hours    integer     CHECK (cancel_free_hours IS NULL OR cancel_free_hours BETWEEN 0 AND 720),
  cancel_fee_percent   integer     CHECK (cancel_fee_percent IS NULL OR cancel_fee_percent BETWEEN 1 AND 100),
  cancel_policy        jsonb,
  cancel_policy_version text,
  terms_version        text,
  billing_name         text        CHECK (billing_name IS NULL OR char_length(billing_name) <= 200),
  billing_address      text        CHECK (billing_address IS NULL OR char_length(billing_address) <= 500),
  billing_company_id   text        CHECK (billing_company_id IS NULL OR char_length(billing_company_id) <= 40),
  billing_vat_id       text        CHECK (billing_vat_id IS NULL OR char_length(billing_vat_id) <= 40),
  billing_note         text        CHECK (billing_note IS NULL OR char_length(billing_note) <= 300),
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_versions_deposit_percent_check CHECK (deposit_kind IS DISTINCT FROM 'percent' OR deposit_value BETWEEN 1 AND 100),
  CONSTRAINT quote_versions_quote_version_no_key UNIQUE (quote_id, version_no),
  CONSTRAINT quote_versions_frozen_complete CHECK (
    frozen_at IS NULL
    OR (
      deposit_kind IS NOT NULL
      AND deposit_value IS NOT NULL
      AND deposit_minor IS NOT NULL
      AND remainder_method IS NOT NULL
      AND total_minor > 0
      AND deposit_minor <= total_minor
      AND cancel_policy IS NOT NULL
      AND terms_version IS NOT NULL
    )
  )
);

REVOKE ALL ON public.quote_versions FROM anon, authenticated;
ALTER TABLE public.quote_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_versions_no_public_read ON public.quote_versions;
CREATE POLICY quote_versions_no_public_read
  ON public.quote_versions FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_versions_no_public_insert ON public.quote_versions;
CREATE POLICY quote_versions_no_public_insert
  ON public.quote_versions FOR INSERT
  WITH CHECK (false);

-- The header points at its versions. Deferrable, so a transaction can create the quote and its first version in
-- either order.
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_current_version_fk;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.quote_versions(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_accepted_version_fk;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_accepted_version_fk
  FOREIGN KEY (accepted_version_id) REFERENCES public.quote_versions(id) DEFERRABLE INITIALLY DEFERRED;

-- == 3. quote_version_lines and quote_version_line_stops (QUOTE-01) ==================
-- One line per trip, same field names and CHECKs as bookings, so a line becomes a booking without translation.
-- amount_minor is what the client pays for the line (one total per line, owner decision 2026-11-12: no waiting
-- breakdown for the client); suggested_amount_minor is what the live tariffs proposed (D-04), price_overridden says the
-- operator typed another amount. deposit_share_minor + remainder_minor = amount_minor when both are known.
CREATE TABLE IF NOT EXISTS public.quote_version_lines (
  id                    uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id            uuid             NOT NULL REFERENCES public.quote_versions(id) ON DELETE CASCADE,
  position              smallint         NOT NULL CHECK (position BETWEEN 1 AND 20),
  trip_type             text             NOT NULL CHECK (trip_type IN ('transfer', 'hourly', 'daily')),
  pickup_date           text             NOT NULL CHECK (pickup_date ~ '^\d{4}-\d{2}-\d{2}$'),
  pickup_time           text             NOT NULL CHECK (pickup_time ~ '^\d{2}:\d{2}$'),
  landing_date          text             CHECK (landing_date IS NULL OR landing_date ~ '^\d{4}-\d{2}-\d{2}$'),
  landing_time          text             CHECK (landing_time IS NULL OR landing_time ~ '^\d{2}:\d{2}$'),
  pickup_offset_min     smallint         CHECK (pickup_offset_min IS NULL OR pickup_offset_min IN (0, 15, 30, 45, 60, 90)),
  origin_address        text             NOT NULL CHECK (char_length(origin_address) BETWEEN 1 AND 500),
  origin_lat            double precision CHECK (origin_lat IS NULL OR origin_lat BETWEEN -90 AND 90),
  origin_lng            double precision CHECK (origin_lng IS NULL OR origin_lng BETWEEN -180 AND 180),
  destination_address   text             CHECK (destination_address IS NULL OR char_length(destination_address) <= 500),
  destination_lat       double precision CHECK (destination_lat IS NULL OR destination_lat BETWEEN -90 AND 90),
  destination_lng       double precision CHECK (destination_lng IS NULL OR destination_lng BETWEEN -180 AND 180),
  vehicle_class         text             NOT NULL CHECK (vehicle_class IN ('business', 'first_class', 'business_van')),
  passengers            smallint         NOT NULL CHECK (passengers BETWEEN 1 AND 20),
  luggage               smallint         NOT NULL DEFAULT 0 CHECK (luggage BETWEEN 0 AND 20),
  hours                 smallint         CHECK (hours IS NULL OR hours BETWEEN 1 AND 24),
  return_date           text             CHECK (return_date IS NULL OR return_date ~ '^\d{4}-\d{2}-\d{2}$'),
  distance_km           numeric          CHECK (distance_km IS NULL OR distance_km >= 0),
  flight_number         text             CHECK (flight_number IS NULL OR char_length(flight_number) <= 20),
  terminal              text             CHECK (terminal IS NULL OR char_length(terminal) <= 20),
  special_requests      text             CHECK (special_requests IS NULL OR char_length(special_requests) <= 1000),
  extra_child_seat      boolean          NOT NULL DEFAULT false,
  extra_meet_greet      boolean          NOT NULL DEFAULT false,
  extra_luggage         boolean          NOT NULL DEFAULT false,
  suggested_amount_minor bigint          CHECK (suggested_amount_minor IS NULL OR suggested_amount_minor > 0),
  amount_minor          bigint           NOT NULL CHECK (amount_minor > 0),
  price_overridden      boolean          NOT NULL DEFAULT false,
  deposit_share_minor   bigint           CHECK (deposit_share_minor IS NULL OR deposit_share_minor >= 0),
  remainder_minor       bigint           CHECK (remainder_minor IS NULL OR remainder_minor >= 0),
  amount_eur            numeric(12,2),
  amount_czk            integer,
  CONSTRAINT quote_version_lines_version_position_key UNIQUE (version_id, position),
  CONSTRAINT quote_version_lines_landing_complete_check CHECK (
    (landing_date IS NULL) = (landing_time IS NULL)
    AND (landing_time IS NULL) = (pickup_offset_min IS NULL)
  ),
  CONSTRAINT quote_version_lines_deposit_split_check CHECK (deposit_share_minor IS NULL OR remainder_minor IS NULL OR deposit_share_minor + remainder_minor = amount_minor)
);

REVOKE ALL ON public.quote_version_lines FROM anon, authenticated;
ALTER TABLE public.quote_version_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_version_lines_no_public_read ON public.quote_version_lines;
CREATE POLICY quote_version_lines_no_public_read
  ON public.quote_version_lines FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_version_lines_no_public_insert ON public.quote_version_lines;
CREATE POLICY quote_version_lines_no_public_insert
  ON public.quote_version_lines FOR INSERT
  WITH CHECK (false);

-- The stops of a line: the booking_stops columns of 089 with line_id instead of booking_id. free_minutes /
-- fee_per_block_eur / blocks / fee_eur are the price snapshot taken when the line was priced.
CREATE TABLE IF NOT EXISTS public.quote_version_line_stops (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id           uuid             NOT NULL REFERENCES public.quote_version_lines(id) ON DELETE CASCADE,
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
  CONSTRAINT quote_version_line_stops_line_position_key UNIQUE (line_id, position)
);

REVOKE ALL ON public.quote_version_line_stops FROM anon, authenticated;
ALTER TABLE public.quote_version_line_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_version_line_stops_no_public_read ON public.quote_version_line_stops;
CREATE POLICY quote_version_line_stops_no_public_read
  ON public.quote_version_line_stops FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_version_line_stops_no_public_insert ON public.quote_version_line_stops;
CREATE POLICY quote_version_line_stops_no_public_insert
  ON public.quote_version_line_stops FOR INSERT
  WITH CHECK (false);

-- == 4. quote_links (QUOTE-02: hashed 256-bit secret) ===============================
-- The raw token (32 random bytes, base64url) exists only in the response of the mint action and in the outgoing email.
-- Only its lowercase-hex SHA-256 is stored, so a database leak exposes no working link. A link is valid only for the
-- quote's current version; revoked_at kills a single link. There is no last_used_at: the public GET writes nothing.
CREATE TABLE IF NOT EXISTS public.quote_links (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id   uuid        NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  version_id uuid        NOT NULL REFERENCES public.quote_versions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS quote_links_quote_idx
  ON public.quote_links (quote_id);

REVOKE ALL ON public.quote_links FROM anon, authenticated;
ALTER TABLE public.quote_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_links_no_public_read ON public.quote_links;
CREATE POLICY quote_links_no_public_read
  ON public.quote_links FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_links_no_public_insert ON public.quote_links;
CREATE POLICY quote_links_no_public_insert
  ON public.quote_links FOR INSERT
  WITH CHECK (false);

-- == 5. quote_acceptances, quote_events, quote_documents (QUOTE-05, D-08) ===========
-- quote_acceptances: the append-only log of an acceptance (D-08): when, from which IP and browser, which version, the
-- terms text the client saw (the text and its SHA-256 are both kept, so the log proves what was shown) and the
-- hold lead time. The deposit PaymentIntent and the confirmation are the only two columns written later, once each.
-- ON DELETE CASCADE exists only so the erasure function can remove a quote that never took money; the guard
-- (section 8) forbids every other delete.
CREATE TABLE IF NOT EXISTS public.quote_acceptances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          uuid        NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  version_id        uuid        NOT NULL REFERENCES public.quote_versions(id) ON DELETE CASCADE,
  link_id           uuid        REFERENCES public.quote_links(id) ON DELETE SET NULL,
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  ip                text        CHECK (ip IS NULL OR char_length(ip) <= 64),
  user_agent        text        CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  locale            text        NOT NULL,
  terms_version     text        NOT NULL,
  terms_sha256      text        NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  terms_rendered    text        NOT NULL CHECK (char_length(terms_rendered) BETWEEN 1 AND 4000),
  deposit_minor     bigint      NOT NULL CHECK (deposit_minor > 0),
  currency          text        NOT NULL CHECK (currency IN ('eur', 'czk')),
  hold_lead_hours   smallint    CHECK (hold_lead_hours IS NULL OR hold_lead_hours BETWEEN 6 AND 96),
  payment_intent_id text,
  confirmed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS quote_acceptances_quote_idx
  ON public.quote_acceptances (quote_id, accepted_at);

REVOKE ALL ON public.quote_acceptances FROM anon, authenticated;
ALTER TABLE public.quote_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_acceptances_no_public_read ON public.quote_acceptances;
CREATE POLICY quote_acceptances_no_public_read
  ON public.quote_acceptances FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_acceptances_no_public_insert ON public.quote_acceptances;
CREATE POLICY quote_acceptances_no_public_insert
  ON public.quote_acceptances FOR INSERT
  WITH CHECK (false);

-- quote_events: the quote's lifecycle and money ledger, one row per (quote, event_key) so a webhook replay or a
-- re-driven step cannot write twice. Ids, amounts and codes only - no personal data (like booking_payment_events).
-- The kind list is mirrored by QUOTE_EVENT_KINDS in lib/quotes/events.ts (tests/quote-events.test.ts compares them).
CREATE TABLE IF NOT EXISTS public.quote_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         uuid        NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  event_key        text        NOT NULL CHECK (char_length(event_key) BETWEEN 1 AND 200),
  kind             text        NOT NULL
    CONSTRAINT quote_events_kind_check CHECK (kind IN (
      'created',
      'sent',
      'link_minted',
      'viewed',
      'revised',
      'voided',
      'accepted',
      'deposit_started',
      'deposit_paid',
      'deposit_failed',
      'deposit_canceled',
      'converted',
      'convert_failed',
      'orphan_refunded',
      'dispute_opened',
      'email_sent',
      'email_failed',
      'alert_sent',
      'reminder_scheduled',
      'invoice_requested',
      'invoice_paid',
      'remainder_requested',
      'remainder_started',
      'remainder_paid',
      'remainder_failed',
      'cancelled',
      'deposit_refunded',
      'remainder_refunded',
      'refund_failed',
      'refund_observed',
      'admin_action'
    )),
  version_id       uuid,
  stripe_object_id text,
  amount_minor     bigint,
  currency         text,
  actor_type       text        NOT NULL CHECK (actor_type IN ('admin', 'webhook', 'system', 'client')),
  actor_id         text,
  error_code       text        CHECK (error_code IS NULL OR char_length(error_code) <= 60),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_events_quote_key_unique UNIQUE (quote_id, event_key)
);

CREATE INDEX IF NOT EXISTS quote_events_quote_idx
  ON public.quote_events (quote_id, created_at);

REVOKE ALL ON public.quote_events FROM anon, authenticated;
ALTER TABLE public.quote_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_events_no_public_read ON public.quote_events;
CREATE POLICY quote_events_no_public_read
  ON public.quote_events FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_events_no_public_insert ON public.quote_events;
CREATE POLICY quote_events_no_public_insert
  ON public.quote_events FOR INSERT
  WITH CHECK (false);

-- quote_documents: the rendered PDF of a version (one per version), kept so the page and the email serve the same
-- bytes. Deleted with the version (and by the erasure function with the person).
CREATE TABLE IF NOT EXISTS public.quote_documents (
  version_id uuid        PRIMARY KEY REFERENCES public.quote_versions(id) ON DELETE CASCADE,
  locale     text        NOT NULL,
  pdf        bytea       NOT NULL,
  sha256     text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size  integer     NOT NULL CHECK (byte_size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.quote_documents FROM anon, authenticated;
ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_documents_no_public_read ON public.quote_documents;
CREATE POLICY quote_documents_no_public_read
  ON public.quote_documents FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_documents_no_public_insert ON public.quote_documents;
CREATE POLICY quote_documents_no_public_insert
  ON public.quote_documents FOR INSERT
  WITH CHECK (false);

-- == 6. bookings: link to the quote (QUOTE-05, D-18) ================================
-- quote_line_id is the exactly-once guard of the conversion: a line becomes at most one booking, whatever retries or
-- replays happen (unique partial index). quote_deposit_minor is the line's share of the deposit, needed by the
-- price-edit hook (D-20). ON DELETE RESTRICT: a booking made from a quote keeps its quote and its line.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS quote_line_id uuid REFERENCES public.quote_version_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS quote_deposit_minor bigint CHECK (quote_deposit_minor IS NULL OR quote_deposit_minor >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_quote_line_id_key
  ON public.bookings (quote_line_id)
  WHERE quote_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_quote_id_idx
  ON public.bookings (quote_id)
  WHERE quote_id IS NOT NULL;

-- == 7. Ledger kinds quote_deposit, quote_remainder; consent mode 'quote' ===========
-- The full 089 list, verbatim, then the two new kinds (tests/payments-state.test.ts compares the order with
-- LEDGER_KINDS). The consent mode CHECK was named booking_payment_consents_mode_check in 087; only the MODE
-- constraint is touched here - the locale constraint belongs to 090_consent_locale_zh_hant.sql.
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
    'extra_failed',
    'quote_deposit',
    'quote_remainder'
  ));

ALTER TABLE public.booking_payment_consents
  DROP CONSTRAINT IF EXISTS booking_payment_consents_mode_check;
ALTER TABLE public.booking_payment_consents
  ADD CONSTRAINT booking_payment_consents_mode_check
  CHECK (mode IN ('setup', 'hold_now', 'cash_setup', 'quote'));

-- == 8. Guard triggers (QUOTE-06, D-08) ==============================================
-- Plain plpgsql, search_path '', called only by their triggers. All three let the transaction through when the
-- transaction-local setting prestigo.quote_erasure is 'on' - the erasure function (plan 92-12) sets it with
-- set_config('prestigo.quote_erasure', 'on', true) and nothing else does.

-- A frozen version never changes and is never deleted. Freezing itself is an UPDATE of a draft (frozen_at IS NULL in
-- OLD), so it passes.
CREATE OR REPLACE FUNCTION public.quote_versions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quote_versions_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS quote_versions_guard ON public.quote_versions;
CREATE TRIGGER quote_versions_guard
  BEFORE UPDATE OR DELETE ON public.quote_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_versions_guard();

-- Lines and stops: resolve the version of the old row (update, delete) and of the new row (insert, update) and refuse
-- when it is frozen. A stop reaches its version through its line. jsonb reads the key column, because OLD and NEW have
-- different shapes in the two tables.
CREATE OR REPLACE FUNCTION public.quote_children_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.quote_children_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS quote_version_lines_guard ON public.quote_version_lines;
CREATE TRIGGER quote_version_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_version_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_children_guard();

DROP TRIGGER IF EXISTS quote_version_line_stops_guard ON public.quote_version_line_stops;
CREATE TRIGGER quote_version_line_stops_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_version_line_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_children_guard();

-- The acceptance log and the event ledger are append-only (D-08). No row is ever deleted. quote_events is never
-- updated. quote_acceptances allows exactly two writes after the insert: payment_intent_id set once (from NULL) and
-- confirmed_at set once (from NULL); every other column stays as it was.
CREATE OR REPLACE FUNCTION public.quote_log_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('prestigo.quote_erasure', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'quote_log_append_only';
  END IF;

  IF TG_TABLE_NAME = 'quote_acceptances' THEN
    IF (to_jsonb(OLD) - 'payment_intent_id' - 'confirmed_at') IS DISTINCT FROM (to_jsonb(NEW) - 'payment_intent_id' - 'confirmed_at')
       OR (OLD.payment_intent_id IS NOT NULL AND NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id)
       OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) THEN
      RAISE EXCEPTION 'quote_log_append_only';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'quote_log_append_only';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quote_log_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS quote_acceptances_guard ON public.quote_acceptances;
CREATE TRIGGER quote_acceptances_guard
  BEFORE UPDATE OR DELETE ON public.quote_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_log_guard();

DROP TRIGGER IF EXISTS quote_events_guard ON public.quote_events;
CREATE TRIGGER quote_events_guard
  BEFORE UPDATE OR DELETE ON public.quote_events
  FOR EACH ROW
  EXECUTE FUNCTION public.quote_log_guard();

-- == 9. quote_convert_to_bookings (QUOTE-04, QUOTE-05, D-15, D-18) =================
-- One transaction turns the accepted, paid version of a quote into one confirmed booking per line: the booking row,
-- its stops, its ledger row and its consent row, then the quote becomes paid. Called only by the service role (the
-- wrapper lives in lib/payments/state.ts, plan 92-18). The caller passes references and hold instants only; every
-- trip field and every amount comes from the frozen version, so nothing the caller sends can change a trip or a price.
--
-- Exactly once: the quotes row is locked FOR UPDATE, a paid quote answers from the bookings it already made, and the
-- unique index bookings_quote_line_id_key makes a second booking for a line impossible even if the status check were
-- bypassed. A replay of the RECORDED deposit intent answers first_time false (also after a later cancel or void: it is
-- never a refund case); a paid quote called with any other intent answers intent_mismatch (a payment it does not own).
-- An ownership failure before payment returns converted false with a reason and writes nothing (the caller refunds,
-- plan 92-18); a constraint violation raises and rolls the whole call back.
--
-- Mode by line (the same table as bookingModeFor in lib/quotes/money.ts):
--   saved_card, remainder > 0 -> card_hold / card_saved, amount = remainder, Stripe ids, hold_at from the caller
--   cash,       remainder > 0 -> cash_guarantee / card_saved, amount = remainder, Stripe ids, no hold_at
--   anything else             -> quote / none, no Stripe ids, no amount
-- The deposit PaymentIntent id is never written to the bookings payment-intent column (a later refund of the deposit
-- would cancel trips, and that column is unique per leg): it lives on quotes, quote_acceptances and the ledger rows'
-- stripe_object_id. pickup_utc is generated by the database and never inserted.

-- The consent text of a quote acceptance is up to 4000 characters (quote_acceptances.terms_rendered); the original
-- consent limit of 2000 would roll a paid conversion back. Only the limit widens.
ALTER TABLE public.booking_payment_consents
  DROP CONSTRAINT IF EXISTS booking_payment_consents_text_rendered_check;
ALTER TABLE public.booking_payment_consents
  ADD CONSTRAINT booking_payment_consents_text_rendered_check
  CHECK (char_length(text_rendered) <= 4000);

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

-- == 10. Erasure coverage for quotes (D-19; QUOTE-01, QUOTE-02, QUOTE-05) ==========
-- An unconverted quote holds a client's name, email, phone, trip addresses, IP and browser, and is reachable by a
-- secret link: the erasure functions must cover it. The three public erasure functions are replaced by FULL COPIES of
-- their latest bodies (erasure_confirm and erasure_scope from 088, erasure_anonymise_person from 089) with the quote
-- statements ADDED; tests/migration-091.test.ts compares them statement by statement, so nothing of the old bodies can
-- be edited out unnoticed. Only two old statements change shape: the 'not_found' condition of erasure_scope (a person
-- who only has a quote is found) and its closing RETURN (counts.quotes).
--
-- Matching: a quote belongs to the person by the normalised client email, by the normalised client phone (only the
-- phones frozen on the request, which never include a shared desk or hotel number), or through a booking it became
-- (bookings.quote_id). In flight: the deposit is paid and not yet converted (status accepted with a deposit intent), or
-- a remainder payment was started and neither paid nor cancelled. An erasure waits for those (erasure_confirm answers
-- 'payment_open') and the Stripe Customer of such a quote is not deleted.
--
-- Deleted: a quote with no booking, no payment intent, no paid time and no refund (versions, lines, stops, links,
-- events, acceptances and documents go with it). Anonymised in place: every other quote of the person. A kept quote
-- keeps amounts, dates, references, ledgers and the acceptance log rows; client fields, trip addresses and coordinates,
-- free text, acceptance IP and browser, links, PDFs and Stripe ids go. Client fields cannot be '' (CHECK length >= 1):
-- the names become '-' and the email 'erased-<id>@erased.invalid' (the 075 pattern), the phone NULL; origin_address is
-- NOT NULL and becomes 'erased'.
--
-- The erasure deletes rows of frozen versions and of the append-only logs, so erasure_anonymise_person sets the
-- transaction-local prestigo.quote_erasure = 'on' (the guards of section 8 honour it) before the first quote statement
-- and back to 'off' after the last one.

-- Internal: the ids of the person's quotes that are not anonymised yet.
CREATE OR REPLACE FUNCTION public.erasure_quote_ids(p_emails text[], p_phones text[], p_booking_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT q.id), '{}'::uuid[])
    FROM public.quotes q
   WHERE q.anonymised_at IS NULL
     AND (
          public.identity_normalize_email(q.client_email) = ANY (p_emails)
       OR (q.client_phone IS NOT NULL AND public.identity_normalize_phone(q.client_phone) = ANY (p_phones))
       OR q.id IN (SELECT b.quote_id FROM public.bookings b WHERE b.id = ANY (p_booking_ids) AND b.quote_id IS NOT NULL)
     );
$$;

-- Internal: how many of the person's quotes have money in flight.
CREATE OR REPLACE FUNCTION public.erasure_quote_payment_open(p_emails text[], p_phones text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
    FROM public.quotes q
   WHERE q.id = ANY (public.erasure_quote_ids(p_emails, p_phones, '{}'::uuid[]))
     AND (
          (q.status = 'accepted' AND q.deposit_payment_intent_id IS NOT NULL)
       OR (q.remainder_payment_intent_id IS NOT NULL AND q.remainder_paid_at IS NULL AND q.cancelled_at IS NULL)
     );
$$;

-- The Stripe Customers stored on the request person's quotes, for the saga step 'stripe' (lib/erasure.ts). Not the
-- customer of a quote with money in flight, and not a customer a booking still uses for a payment that is not finished.
CREATE OR REPLACE FUNCTION public.erasure_quote_customer_ids(p_request_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT q.stripe_customer_id), '{}'::text[])
    FROM public.erasure_requests r
    JOIN public.quotes q ON q.id = ANY (public.erasure_quote_ids(r.subject_emails, r.subject_phones, r.booking_ids))
   WHERE r.id = p_request_id
     AND q.stripe_customer_id IS NOT NULL
     AND NOT (
          (q.status = 'accepted' AND q.deposit_payment_intent_id IS NOT NULL)
       OR (q.remainder_payment_intent_id IS NOT NULL AND q.remainder_paid_at IS NULL AND q.cancelled_at IS NULL)
        )
     AND NOT EXISTS (
           SELECT 1 FROM public.bookings ob
            WHERE ob.stripe_customer_id = q.stripe_customer_id
              AND ob.payment_state NOT IN ('none', 'captured', 'released', 'cash_settled')
         );
$$;

-- Full copy of the 088 erasure_confirm + the quote payment guard.
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

  -- Phase 92 (D-19, T-92-38): the same refusal for a quote whose deposit or remainder is in flight.
  IF public.erasure_quote_payment_open(v_emails, v_phones) > 0 THEN
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

-- Full copy of the 088 erasure_scope + the quote count (counts.quotes) and the quote payments in counts.payment_open.
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
  v_quotes_cnt integer;
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
  v_quotes_cnt := cardinality(public.erasure_quote_ids(v_emails, v_phones, v_bookings));
  v_payment_open := v_payment_open + public.erasure_quote_payment_open(v_emails, v_phones);

  IF v_identity IS NULL AND v_user IS NULL
     AND cardinality(v_bookings) = 0 AND cardinality(v_inquiries) = 0 AND v_quote = 0 AND v_quotes_cnt = 0 THEN
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
      'quotes', v_quotes_cnt,
      'has_account', v_user IS NOT NULL
    )
  );
END;
$$;

-- Full copy of the 089 erasure_anonymise_person + the quote deletion / anonymisation.
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

-- Grants: a re-created SECURITY DEFINER function regains PUBLIC EXECUTE, so every function of this section is revoked
-- again explicitly. The two internal helpers are revoked from service_role too (Supabase default privileges grant new
-- public functions there); the four callable ones are granted to service_role only.
REVOKE EXECUTE ON FUNCTION public.erasure_quote_ids(text[], text[], uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_quote_ids(text[], text[], uuid[]) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.erasure_quote_payment_open(text[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_quote_payment_open(text[], text[]) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.erasure_quote_customer_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_confirm(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_scope(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.erasure_quote_customer_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_confirm(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_scope(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.erasure_anonymise_person(uuid) TO service_role;
