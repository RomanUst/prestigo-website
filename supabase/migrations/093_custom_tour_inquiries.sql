-- Migration 093: custom-tour inquiries
-- Phase 93 (plan 93-29; TRIP-06; D-17, D-18) - the data foundation of the custom-tour request: the inquiry kind
-- 'custom_tour', one quote per request, and the stats source for the new request form.
--
-- Schema FILE only - applied LIVE by the orchestrator through the Supabase MCP (plan 93-29 Task 3) BEFORE the form
-- route that stores a custom_tour inquiry ships. Additive: one CHECK gains a value, one partial index is new, one
-- function is re-created with one more row in its source list.
--
-- A stored custom-tour inquiry flows through the existing 065 trigger (enqueue_inquiry_lead -> outbox lead.inquiry)
-- to the EspoCRM Lead path; the trigger does not filter on kind and is not touched here.
--
-- What this file adds:
--   1. inquiries_kind_check          accepts 'custom_tour' (the inline CHECK of 065 got this auto-generated name)
--   2. quotes_source_inquiry_id_key  one quote per request (unique partial index on quotes.source_inquiry_id)
--   3. public.stats_conversion       the 083 definition plus the funnel source form_custom_tour (appended)

-- == 1. inquiries.kind accepts custom_tour (D-18) ====================================
ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_kind_check;
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_kind_check
  CHECK (kind IN ('contact', 'corporate', 'multiday_quote', 'custom_tour'));

-- == 2. one quote per request (D-18) =================================================
CREATE UNIQUE INDEX IF NOT EXISTS quotes_source_inquiry_id_key
  ON public.quotes (source_inquiry_id) WHERE source_inquiry_id IS NOT NULL;
