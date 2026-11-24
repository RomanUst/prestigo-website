-- Migration 095: seasonal tours
-- A tour can be bookable only inside a date window (e.g. the Dresden Christmas markets, late November to
-- Christmas). Both columns are optional: NULL on either side means open-ended, NULL on both means all year
-- (every existing tour). The window is checked by the booking calendar, by checkout (lib/checkout/compute.ts,
-- 422 TOUR_UNAVAILABLE) and hides a tour from the listings once bookable_until has passed. Dates are
-- Europe/Prague pickup dates, inclusive on both ends. Additive only.

ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS bookable_from date,
  ADD COLUMN IF NOT EXISTS bookable_until date;

ALTER TABLE public.tours DROP CONSTRAINT IF EXISTS tours_bookable_window_check;
ALTER TABLE public.tours
  ADD CONSTRAINT tours_bookable_window_check
  CHECK (bookable_from IS NULL OR bookable_until IS NULL OR bookable_from <= bookable_until);
