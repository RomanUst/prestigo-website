-- Migration 052: bookings driver price
-- Adds driver_price_czk — the fee shown to the assigned driver, entered manually
-- by an admin. Nullable: when unset, the driver assignment email shows no price
-- (it no longer falls back to the client-facing amount_czk).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS driver_price_czk INTEGER;
