-- Migration 062: bookings.locale (Phase 75, plan 17, D-11)
-- Date: 2026-09-25
--
-- Adds a NEW, nullable locale column to bookings, recording the site
-- locale the customer was on when the booking was created. Plan 75-05
-- already writes this same value into the Stripe PaymentIntent's
-- metadata.locale (via normalizeSiteLocale); this column makes the same
-- value visible in the admin bookings table (dispatch/driver prep, "which
-- language does this client speak") and queryable in plain SQL for
-- revenue-by-language, without a Stripe dashboard lookup.
--
-- Additive, nullable, ADD COLUMN IF NOT EXISTS -- admin-created bookings
-- (ManualBookingForm) keep locale NULL; only site checkout writes it. The
-- format CHECK constraint whitelists a 2-letter locale code with an
-- optional script/region suffix (this project's 7 supported AppLocales --
-- en, ru, es, fr, ar, hi, zh -- are all bare 2-letter codes today, but the
-- pattern also admits a future tag like zh-CN without a second migration).
--
-- This migration touches NO SECURITY DEFINER RPC -- admin_search_bookings
-- already returns b.* so no function signature change and no re-GRANT is
-- needed here (contrast with migration 059's DROP+CREATE re-grant pitfall).
--
-- One-way per D-11: reverting requires a DROP COLUMN and loses every
-- recorded booking language. Applied LIVE by the operator via the
-- Supabase MCP (Plan 75-17 Task 3) BEFORE any code that writes this column
-- is deployed (Plan 75-19 precondition) -- otherwise every booking capture
-- insert fails on an unknown column.
--
-- Applied LIVE by the operator (this repo's established convention -- no
-- migrations are auto-pushed; local Supabase keys are placeholders).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS locale text NULL;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_locale_format_check
  CHECK (locale IS NULL OR locale ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$');
