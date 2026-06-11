-- Migration 046: customer_profiles.updated_at BEFORE UPDATE trigger
-- Phase 57 — Customer Auth Foundation (code-review WR-03)
-- Migration 044 created customer_profiles with `updated_at DEFAULT now()` but no
-- trigger, so the column froze at creation time after any UPDATE. This mirrors
-- the established repo convention (see 042_content_automation.sql:
-- content_items_set_updated_at) to keep updated_at fresh on every UPDATE.

CREATE OR REPLACE FUNCTION public.customer_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_profiles_set_updated_at ON public.customer_profiles;
CREATE TRIGGER customer_profiles_set_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.customer_profiles_set_updated_at();
