-- 021_pricing_enhancements.sql
-- Phase 21: add min_fare column to pricing_config
-- Apply: Supabase Dashboard > SQL Editor > paste and run
-- Date: 2026-04-03

ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS min_fare NUMERIC(10,2) NOT NULL DEFAULT 0;
