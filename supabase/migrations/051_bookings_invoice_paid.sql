-- Migration 051: bookings invoice payment fields
-- Adds paid_at + invoice_number so manually-invoiced bookings (e.g. corporate
-- accounts billed via a Stripe invoice) can record payment without overloading
-- the lifecycle `status` column. Payment is an attribute, not a status.
-- Both nullable, no default — existing rows stay unpaid (NULL). A future
-- invoice.paid webhook can populate these automatically.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;
