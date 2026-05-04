-- Migration 040: extended_booking_statuses
-- Phase 52 — Extended Booking Statuses (STATUS-04-EXT)
--
-- Adds 'assigned', 'en_route', 'on_location' to the bookings.status CHECK
-- constraint. Existing values ('pending', 'confirmed', 'completed', 'cancelled')
-- are preserved. DROP + RECREATE pattern mirrors migration 039_gnet_bookings.sql
-- which extended booking_source the same way.
-- Task 1 inspection result: constraint bookings_status_check (bookings_booking_source_check
-- pattern confirmed in migration 039; status constraint follows same auto-naming convention).

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'assigned',
    'en_route',
    'on_location'
  ));
