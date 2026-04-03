-- 022_promo_claim_function.sql
-- Phase 22: Atomic promo code claim function
-- Apply: Supabase Dashboard > SQL Editor > paste and run
-- Date: 2026-04-03

CREATE OR REPLACE FUNCTION claim_promo_code(p_code TEXT)
RETURNS TABLE(id UUID, discount_value NUMERIC) AS $$
  UPDATE promo_codes
  SET current_uses = current_uses + 1
  WHERE code = p_code
    AND is_active = true
    AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    AND (max_uses IS NULL OR current_uses < max_uses)
  RETURNING id, discount_value;
$$ LANGUAGE SQL;
