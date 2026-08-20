-- Migration 053: unpaid_booking_status
-- Phase 62 — Abandoned & Unpaid Booking Capture (D-01/D-02/D-06)
--
-- Adds 'unpaid' to the bookings.status CHECK constraint (revenue-recovery
-- capture: a booking row now exists PRE-payment, before the client completes
-- checkout). DROP + RECREATE pattern mirrors migration 040_extended_booking_statuses.sql.
--
-- Also adds a nullable `attempt_id uuid` column plus a partial unique index
-- scoped to unpaid rows — the stable per-checkout-attempt dedup key wired in
-- Plan 62-02 (this plan only adds the column/index; the capture write here
-- keys on (payment_intent_id, leg) for the no-retry tracer path).
--
-- Schema FILE only — live application against the remote Supabase project is
-- the [BLOCKING] task in Plan 62-04.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'unpaid',
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'assigned',
    'en_route',
    'on_location'
  ));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS attempt_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_attempt_id_leg_unpaid_key
  ON public.bookings (attempt_id, leg)
  WHERE status = 'unpaid';
