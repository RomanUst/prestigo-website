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
--   (the conversion function of plan 92-06 and the erasure copies of plan 92-12 are appended below)
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
  CHECK (deposit_kind IS DISTINCT FROM 'percent' OR deposit_value BETWEEN 1 AND 100),
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
  CHECK (deposit_share_minor IS NULL OR remainder_minor IS NULL OR deposit_share_minor + remainder_minor = amount_minor)
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
  token_hash text        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
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

-- == 5-8. added by the next task of plan 92-01 (acceptance log, events, PDF, booking columns, CHECKs, guards) ==
-- == (the conversion function of plan 92-06 and the erasure copies of plan 92-12 follow after section 8)       ==
