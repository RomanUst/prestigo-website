-- Migration 066: bookings.lead_channel (Phase 81, plan 04, D-08)
-- Date: 2026-10-18
--
-- Adds a NEW, nullable lead_channel column to bookings, recording through
-- which channel a MANUALLY created booking reached the owner (WhatsApp,
-- phone, email, partner, other). The admin "manual booking" form now requires
-- this choice (POST /api/admin/bookings validates it with a zod enum), and the
-- booking-to-Lead mapper (plan 81-09) turns it into the Lead source so that
-- Phase 85 can show conversion by channel.
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS, and the CHECK constraint
-- is dropped-if-exists then re-added so the migration can be re-run safely.
-- NO backfill: existing rows stay NULL, which means "channel unknown" (the
-- Lead mapper maps NULL to source 'Other'). Site checkout bookings also keep
-- NULL; only admin manual creates write this column.
--
-- Applied LIVE by the operator via the Supabase MCP BEFORE the admin route
-- that writes this column is deployed -- otherwise every admin manual-booking
-- insert fails on an unknown column (T-81-11).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS lead_channel text NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_lead_channel_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_lead_channel_check
  CHECK (lead_channel IS NULL OR lead_channel IN ('whatsapp', 'phone', 'email', 'partner', 'other'));
