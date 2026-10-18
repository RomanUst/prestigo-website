-- 065: inquiries (Phase 81 — site form submissions)
--
-- Every contact / corporate / multi-day-quote form submission is stored here
-- (best-effort, written by the form routes with the service role). The
-- AFTER INSERT trigger enqueues one PII-free outbox row in the same
-- transaction, so a stored inquiry is always queued for delivery.
--
-- No IP address and no browser identification are stored (D-17). There is NO
-- retention or purge job for this table (D-14): rows stay until Phase 82
-- erasure handles them. The dead `quote_leads` table is untouched (D-01).
--
-- Service-role only: RLS enabled with deny-all policies, privileges revoked
-- from anon/authenticated, function EXECUTE revoked from PUBLIC/anon/authenticated.

CREATE TABLE IF NOT EXISTS public.inquiries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text        NOT NULL CHECK (kind IN ('contact', 'corporate', 'multiday_quote')),
  email            text        NOT NULL,
  email_normalized text        GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  name             text,
  phone            text,
  company          text,
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiries_email_normalized_idx
  ON public.inquiries (email_normalized);

CREATE INDEX IF NOT EXISTS inquiries_created_at_idx
  ON public.inquiries (created_at);

REVOKE ALL ON public.inquiries FROM anon, authenticated;

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiries_no_public_read ON public.inquiries;
CREATE POLICY inquiries_no_public_read
  ON public.inquiries FOR SELECT
  USING (false);

DROP POLICY IF EXISTS inquiries_no_public_insert ON public.inquiries;
CREATE POLICY inquiries_no_public_insert
  ON public.inquiries FOR INSERT
  WITH CHECK (false);

-- ── Trigger: one outbox row per inquiry, never aborting the INSERT ──────────
CREATE OR REPLACE FUNCTION public.enqueue_inquiry_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.outbox_enqueue(
      'lead.inquiry',
      'inquiry',
      NEW.id,
      'lead.inquiry:' || NEW.id::text,
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- NEVER let outbox trouble abort the customer's inquiry INSERT.
    RAISE WARNING 'enqueue_inquiry_lead failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_inquiry_lead() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inquiries_lead_outbox ON public.inquiries;
CREATE TRIGGER inquiries_lead_outbox
  AFTER INSERT ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_inquiry_lead();
