-- Migration 038: quote_leads
-- Phase 48 — Calculator Lead Capture + Analytics (LEAD-04)
-- Stores email-capture submissions from /calculator with 30-day GDPR retention
-- enforced by /api/cron/purge-quote-leads.

CREATE TABLE IF NOT EXISTS public.quote_leads (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT          NOT NULL,
  quote_payload     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  consent_version   TEXT          NOT NULL DEFAULT 'transactional-v1',
  consent_timestamp TIMESTAMPTZ   NOT NULL DEFAULT now(),
  marketing_opt_in  BOOLEAN       NOT NULL DEFAULT false,
  ip                TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_leads_created_at_idx
  ON public.quote_leads (created_at);

ALTER TABLE public.quote_leads ENABLE ROW LEVEL SECURITY;

-- Service-role only: explicitly deny all public/anon SELECTs.
DROP POLICY IF EXISTS quote_leads_no_public_read ON public.quote_leads;
CREATE POLICY quote_leads_no_public_read
  ON public.quote_leads FOR SELECT
  USING (false);

DROP POLICY IF EXISTS quote_leads_no_public_insert ON public.quote_leads;
CREATE POLICY quote_leads_no_public_insert
  ON public.quote_leads FOR INSERT
  WITH CHECK (false);
