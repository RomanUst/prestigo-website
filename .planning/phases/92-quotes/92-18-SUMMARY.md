---
phase: 92-quotes
plan: 18
subsystem: payments
tags: [quotes, conversion, exactly-once, orphan-refund, operator-alerts, stripe]
requires: ["92-06", "92-04"]
provides:
  - "convertQuoteToBookings in lib/payments/state.ts: the only caller of the conversion RPC of migration 091"
  - "applyQuoteDepositPaid in lib/quotes/convert.ts: converted / replayed / orphan_refunded / ignored"
  - "sendQuoteOperatorAlert and QUOTE_ALERT_KINDS in lib/quotes/alerts.ts"
affects: [92-21, 92-22, 92-26, 92-31]
tech-stack:
  added: []
  patterns:
    - "decision order recorded-deposit replay BEFORE ownership BEFORE conversion (W2)"
    - "send-then-record exactly-once alerts keyed in the quote event ledger"
key-files:
  created:
    - lib/quotes/convert.ts
    - lib/quotes/alerts.ts
    - tests/quote-convert.test.ts
  modified:
    - lib/payments/state.ts
    - tests/payment-state-writers-gate.test.ts
key-decisions:
  - "A deposit the quote recorded (pi.id = deposit_payment_intent_id and paid_at set) answers replayed from the quote itself: no RPC call, no Stripe call, whatever cancelled_at / voided_at / current_version_id say now"
  - "Only a payment the quote never recorded is refunded automatically (refund:quote:<id>:orphan:<pi>); the database answering intent_mismatch / version_mismatch / voided / cancelled under a race takes the same path"
  - "Any other database refusal (not_accepted, lines_mismatch, hold_at_missing, not_found) and any RPC or read error after ownership is a conversion failure: convert_failed once, alert once, throw"
requirements-completed: [QUOTE-03, QUOTE-04, QUOTE-05]
status: complete
duration: ~1h
completed: 2026-11-14
estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 2
  confidence: low
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: 8d56e16b7ddfbc3b68021eecaa9cfacb39cb1853
plan_head_after: fcf6c8a79f384857eb1ee0069c356e990829a41a
commits: 2
---

# Phase 92 Plan 18: Quote conversion core Summary

A succeeded quote deposit becomes one linked booking per line exactly once through the single RPC wrapper `convertQuoteToBookings`; a deposit the quote already recorded is answered `replayed` and never refunded, a payment the quote never owned is refunded automatically and alerted, and money that arrives without bookings records `convert_failed`, alerts once and throws so Stripe retries.

## What was built

- **Task 1 (tracer, `security:`, 756d9656).** `convertQuoteToBookings` in `lib/payments/state.ts` (typed result, throws `quote conversion failed` on an RPC error or malformed answer, logs only the database code). `lib/quotes/convert.ts` `applyQuoteDepositPaid`: step 1 ignores anything that is not a succeeded `card_quote_deposit` with uuid `quoteId` / `versionId` and a known quote; step 2 (W2) answers `replayed` with the booking ids in line order when the intent is the recorded one and `paid_at` is set; step 3 builds one line per version line with a fresh `PRG-` reference (unique inside the call) and `hold_at = computeHoldAt(pickup, acceptance.hold_lead_hours)` for a saved-card line with a remainder, null otherwise, and calls the wrapper; `first_time` false is `replayed`. The writer gate test lists `quote_convert_to_bookings` in `RPC_NAMES`.
- **Task 2 (`security:`, fcf6c8a7).** The not-owned path (voided / cancelled before payment, superseded version, another intent, also on an already paid quote): full refund under `stripeKeys.quoteRefund(quote, 'orphan:<pi>')`, `orphan_refunded` event (reason code in `error_code`), one `quote_orphan_refunded` alert; a replay finds the event and refunds, records and mails nothing more. A failed refund records `refund_failed` once, alerts `quote_refund_failed` once and throws; the redelivery refunds. A conversion failure (RPC error, read error after ownership, a non-ownership refusal) records `convert_failed` once, alerts `quote_convert_failed` once and throws; the next delivery converts. `lib/quotes/alerts.ts`: English mail to `MANAGER_EMAIL` with reference, `/admin/quotes/<id>` link, amount and code only; sent, then recorded as an `alert_sent` quote event under the event key (a failed send leaves `<key>:send_failed` and no delivered row; the key is also the Resend idempotency key).
- **Tests.** `tests/quote-convert.test.ts` (28 tests, real modules on the fake payments DB, fake Stripe, Resend double): tracer, replay, claim after hold_at, all four remainder methods, lead hours, ignored cases, four W2 cases (late cancel with the deposit kept, free cancel, void after payment, new version after payment), six orphan cases, the database-race reasons, refund failure and retry, conversion failure and retry, non-ownership refusals, the alert module. A mutation check (step 2 disabled) fails five tests.

## Verification

- `npx vitest run tests/quote-convert.test.ts tests/quote-convert-fake.test.ts tests/payment-state-writers-gate.test.ts`: 3 files, 65 tests passed. With `payments-state`, `payments-tick`, `quote-events`, `migration-091`, `payments-alerts`, `quote-stripe-vocabulary`: 9 files, 304 tests passed.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (i18n-translate-dnt, nav-auth, passenger-actions).
- `npx eslint --quiet lib/payments/state.ts lib/quotes/convert.ts lib/quotes/alerts.ts tests/quote-convert.test.ts tests/payment-state-writers-gate.test.ts`: clean.
- Nothing ran against live Stripe or Supabase; the conversion SQL is exercised only through the 92-06 fake.

## Deviations from Plan

### Auto-fixed Issues

None. Plan choices that go slightly beyond the plan text:

- The wrapper takes `customerId` and `paymentMethodId` as `string | null` (plan: `string`). A null lets the SQL fall back to the ids recorded on the quote (92-06) instead of sending an empty string.
- Acceptance `hold_lead_hours` null falls back to `DEFAULT_HOLD_LEAD_HOURS` (72) without a settings read (the column is nullable; a settings read would add a dependency on `pricing_globals` to the conversion path).
- A quote id in metadata that matches no quote is `ignored` with an error log (no quote to alert on); an unparsable pickup gives `hold_at` null, which the database refuses as `hold_at_missing` (a conversion failure, alerted).
- `quote_paid` is part of `QUOTE_ALERT_KINDS` but is not sent here (the plan lists only the orphan, refund-failed and convert-failed alerts); 92-21 / 92-31 decide when to use it.
- The per-plan commit ledger file was not written (sandbox refused compound git-dir commands); the base commit is recorded as `plan_head_before`. `commits: 2` was measured before this SUMMARY commit.

## Known Stubs

None.

## Threat Flags

None beyond the register: T-92-58 (ownership check, automatic refund with a fixed key, alert), T-92-99 (recorded-deposit rule before any ownership check, W2 tests for late cancel, free cancel, void and new version), T-92-61 (alerts carry reference, admin link, amount and code; tests assert no name, email or address), T-92-SC accepted (no package installed).

## Notes for the orchestrator / plan 92-31

- Webhook routing (`payment_intent.succeeded` of `card_quote_deposit`), the failure / cancel / dispute handlers and the tick reconcile call `applyQuoteDepositPaid(pi, actor)`; it throws when money arrived without bookings and when an orphan refund fails, so the caller must answer 500 for a throw. `ignored` / `replayed` / `converted` / `orphan_refunded` are all 200.
- The orphan refund creates a refund without metadata; a `charge.refunded` handler of 92-31 should treat a refund whose key or payment is already recorded as `orphan_refunded` (event key `orphan_refunded:<pi>`) as the site's own.
- After-commit emails and reminders of the converted quote are 92-21 (not here); `first_time` is visible to the caller through `outcome: 'converted'`.
- Migration 091 is still not applied (92-12); the conversion has no live proof until its smoke.

## Decisions the owner may override (I5)

- Automatic orphan refund: a succeeded deposit that the quote never recorded (another intent, a superseded version, a quote voided or cancelled before payment) is refunded in full automatically and the operator is alerted. This is a planner design built on D-18, not an owner decision; the alternative is to hold the money and let the operator refund by hand from the alert.
- Replay rule (W2): a deposit the quote recorded is never refunded by the conversion code, whatever happened to the quote later; only the quote cancel (92-22) and the refund dialog (92-26) return deposit money.

## Self-Check: PASSED

- Files exist: lib/payments/state.ts, lib/quotes/convert.ts, lib/quotes/alerts.ts, tests/quote-convert.test.ts, tests/payment-state-writers-gate.test.ts.
- Commits exist: 756d9656, fcf6c8a7.
