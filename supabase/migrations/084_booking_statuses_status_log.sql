-- Migration 084: booking_statuses_status_log
-- Phase 87 — Status Service & Driver Step Flow (D-02, D-03, D-06, D-08, D-09, D-10, D-11, D-15)
--
-- Adds the two driver-flow statuses to bookings.status, the completion fact, the status log every
-- writer feeds, a compare-and-set RPC, the no-show request RPC and the no-show wait settings.
--
--   * on_board  — passenger is in the car (D-08). The driver's "I have arrived" step maps to the
--                 existing on_location status: there is no 'arrived' booking status.
--   * no_show   — terminal (D-09). VALID_TRANSITIONS.no_show is empty in lib/booking-transitions.ts.
--
-- The status list below must stay equal to BOOKING_STATUSES in lib/booking-status.ts
-- (tests/booking-status.test.ts reads the latest bookings_status_check and fails on drift).
--
-- 084 is purely additive for old code (wider CHECK, new table/columns/functions), so applying it
-- before the code merges is safe; the reverse order makes every on_board/RPC write fail.
--
-- Schema FILE only — live application is the [BLOCKING] Task 3 of plan 87-02, run by the
-- orchestrator via Supabase MCP.

-- ── 1. bookings_status_check: 10 values (DROP + RECREATE, pattern of 040/053) ──
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
    'on_location',
    'on_board',
    'no_show'
  ));
