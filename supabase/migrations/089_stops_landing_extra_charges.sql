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

-- == 4. booking_extra_charges (EXTRA-01): added in plan 91-01 task 2 ================
-- == 5. Ledger kinds extra_charged, extra_failed: added in plan 91-01 task 2 ========
-- == 6. Erasure function copies: added in plan 91-01 task 2 =========================
