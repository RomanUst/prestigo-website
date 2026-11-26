-- 101: airport transfer "from" prices for S-Class and V-Class move into the admin (owner request 2026-11-25).
--
-- Until now only the E-Class airport price (regular / promo) lived in pricing_globals; the S-Class and V-Class
-- airport prices were constants in lib/price-fallbacks.ts. They are display prices (site copy, schema, llms.txt):
-- the booking calculator prices every trip by distance and is not affected. Defaults equal the old constants, so
-- the site shows the same numbers until the admin changes them.
--
-- Rollback: ALTER TABLE public.pricing_globals DROP COLUMN airport_s_class_price_eur, DROP COLUMN airport_v_class_price_eur;
-- (deploy the code that no longer selects them first).

ALTER TABLE public.pricing_globals
  ADD COLUMN IF NOT EXISTS airport_s_class_price_eur numeric NOT NULL DEFAULT 120 CHECK (airport_s_class_price_eur > 0),
  ADD COLUMN IF NOT EXISTS airport_v_class_price_eur numeric NOT NULL DEFAULT 76 CHECK (airport_v_class_price_eur > 0);
