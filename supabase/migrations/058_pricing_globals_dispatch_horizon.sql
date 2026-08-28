-- Migration 058: pricing_globals dispatch horizon default (Phase 65, DISP-02, D-03)
--
-- Adds the persisted default-horizon setting for the admin dispatch bookings
-- list: which of Future/Last-N-days/All the list shows on load, and N for the
-- "Last N days" option. Stored globally on the single pricing_globals row
-- (id = 1), mirroring the existing notification_flags persistence pattern
-- read/written via /api/admin/settings.
--
-- TEXT + CHECK (not a Postgres ENUM) follows this project's own documented
-- precedent for customer_profiles.account_type — stays alterable without an
-- ALTER TYPE migration if a fourth option is ever added.
--
-- The shipped default 'future' is load-bearing: it is what makes DISP-01
-- ("admin bookings list defaults to showing only future trips on load") hold
-- on a fresh/existing row without any additional data migration.
--
-- Applied LIVE by the operator (this repo's established convention — no
-- migrations are auto-pushed). See Task 3 of Plan 65-01.

ALTER TABLE public.pricing_globals
  ADD COLUMN dispatch_default_horizon text NOT NULL DEFAULT 'future'
    CHECK (dispatch_default_horizon IN ('future', 'last_n_days', 'all')),
  ADD COLUMN dispatch_horizon_days integer NOT NULL DEFAULT 7
    CHECK (dispatch_horizon_days > 0);
