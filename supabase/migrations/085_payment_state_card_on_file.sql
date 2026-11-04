-- Migration 085: payment_state_card_on_file
-- Phase 88 — Card-on-file & Scheduled Holds (PAYF-01, D-01, D-04, D-05)
--
-- Adds the payment model next to the trip model: every booking row carries a payment_mode (how the
-- client pays) and a payment_state (where the money is), both separate from bookings.status.
--
--   * payment_mode  — pay_now | card_hold | cash_guarantee | quote | partner. Legacy rows read
--                     'pay_now' (the column default); GNet partner rows are backfilled to 'partner'.
--                     cash_guarantee (Phase 89) and quote (Phase 92) are reserved now so the CHECK
--                     does not churn; the hold engine acts on card_hold only.
--   * payment_state — none | checkout_pending | card_saved | placing_hold | authorized | capturing |
--                     captured | balance_due | failed | expired | released.
--
-- The state lists below must stay equal to PAYMENT_STATES / PAYMENT_MODES / LEDGER_KINDS in
-- lib/payments/state.ts (tests/payments-state.test.ts reads the latest CHECK and fails on drift).
-- lib/payments/state.ts is the only module that calls apply_payment_transition, append_payment_event
-- and claim_due_payment_work (D-05; tests/payment-state-writers-gate.test.ts).
--
-- 085 is purely additive for old code (new columns with defaults, new tables, new functions), so
-- applying it before the code merges is safe; the reverse order makes every payment write fail.
--
-- Schema FILE only — live application is the [BLOCKING] Task 3 of plan 88-01, run by the
-- orchestrator via Supabase MCP.

-- ── 1. bookings: payment columns (PAYF-01) ──────────────────────────────────────
-- Every trigger on public.bookings is UPDATE OF <named columns> and none of them names a payment
-- column, so writing these columns (and the backfill below) fires no gcal / CRM / lead / status-log
-- trigger.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_mode             text        NOT NULL DEFAULT 'pay_now',
  ADD COLUMN IF NOT EXISTS payment_state            text        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_currency         text,
  ADD COLUMN IF NOT EXISTS payment_amount_minor     bigint,
  ADD COLUMN IF NOT EXISTS stripe_customer_id       text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS setup_intent_id          text,
  ADD COLUMN IF NOT EXISTS hold_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS hold_payment_intent_id   text,
  ADD COLUMN IF NOT EXISTS hold_amount_minor        bigint,
  ADD COLUMN IF NOT EXISTS hold_placed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS capture_before           timestamptz,
  ADD COLUMN IF NOT EXISTS hold_attempts            smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_attempts          smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_lease_until      timestamptz,
  ADD COLUMN IF NOT EXISTS captured_amount_minor    bigint      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_at              timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS payment_retry_at         timestamptz,
  ADD COLUMN IF NOT EXISTS payment_retry_count      smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_error       text,
  ADD COLUMN IF NOT EXISTS recovery_link_id         text,
  ADD COLUMN IF NOT EXISTS recovery_link_url        text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_mode_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_mode_check
  CHECK (payment_mode IN (
    'pay_now',
    'card_hold',
    'cash_guarantee',
    'quote',
    'partner'
  ));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_state_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_state_check
  CHECK (payment_state IN (
    'none',
    'checkout_pending',
    'card_saved',
    'placing_hold',
    'authorized',
    'capturing',
    'captured',
    'balance_due',
    'failed',
    'expired',
    'released'
  ));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_currency_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_currency_check
  CHECK (payment_currency IS NULL OR payment_currency IN ('eur', 'czk'));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_amount_minor_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_amount_minor_check
  CHECK (payment_amount_minor IS NULL OR payment_amount_minor > 0);

-- A Stripe error/decline CODE only (no message, no PII).
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_last_payment_error_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_last_payment_error_check
  CHECK (last_payment_error IS NULL OR char_length(last_payment_error) <= 60);

-- Backfill: partner (GNet) bookings are paid outside Prestigo (PAYF-01). Everything else keeps the
-- 'pay_now' default. assertMoneyEligible stays the runtime guard.
UPDATE public.bookings
   SET payment_mode = 'partner'
 WHERE booking_source = 'gnet'
   AND payment_mode = 'pay_now';
