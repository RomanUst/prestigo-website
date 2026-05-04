-- Migration 041: booking_driver_id
-- Phase 53 — Driver Assignment UI (DRIVER-ASSIGN-01)
--
-- Adds driver_id FK column to bookings table.
-- IMPORTANT: This migration was applied directly to Supabase on 2026-04-27
-- without creating a local file. This file is created retroactively for
-- repo/schema sync. Running `supabase db push` is NOT required — the
-- column already exists in the live database.
-- IF NOT EXISTS guard ensures idempotency if applied to a fresh environment.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS driver_id uuid
  REFERENCES public.drivers(id)
  ON DELETE SET NULL;
