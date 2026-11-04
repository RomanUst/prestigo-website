---
phase: 88-card-on-file-scheduled-holds
plan: 15
subsystem: admin-api
tags: [admin, payments, stripe, ledger, security, vitest]
status: complete

requires:
  - phase: 88-card-on-file-scheduled-holds
    provides: PaymentPanel contract (88-07), claimForHold / placeHold / releaseHold (88-11), settleBooking (88-13), refreshRecoveryLink (88-14), sendPaymentEmail (88-09), appendPaymentEvent (88-01)
provides:
  - "GET /api/admin/bookings/[id]/payment - payment facts, allowed_actions, refund_failed, newest-first ledger (100 rows) and events_total"
  - "POST /api/admin/bookings/[id]/payment { action } - capture, retry, release, waive, send_link through the engine with the admin actor"
  - "lib/payments/actions.ts - allowedPaymentActions (the one action matrix), toPaymentFacts, runPaymentAction"
affects: [88-16 cancel route and trip-edit PATCH, 88-17, 89 no-show charge, 90 BookingDetailPanel]

actuals:
  tokens: 36000
  tasks: 2
  commits: 2
plan_head_before: 0b8a6e420df390ca5f78c53d032f50947877e9d8
plan_head_after: fb7d68e5f279a6aa733ae7eeb0759478a54330fa

tech-stack:
  added: []
  patterns:
    - "One server-side action matrix feeds the GET and is re-checked on the POST (422); the UI never re-implements it"
    - "Strict zod discriminated union carrying only { action }: an amount in the body is a 400; every amount comes from the booking row"
    - "admin_action ledger row (key admin:<action>:<id>:<ms>) is written before the engine call"

key-files:
  created:
    - app/api/admin/bookings/[id]/payment/route.ts
    - lib/payments/actions.ts
    - tests/admin-payment-api.test.ts
  modified:
    - tests/helpers/fake-payments-db.ts

key-decisions:
  - "Ledger events are projected field by field (id, created_at, kind, amount_minor, currency, actor_type, actor_id, error_code): event keys and Stripe object ids never reach the browser"
  - "refund_failed is a separate ledger query (kind = refund_failed, limit 1) so a refund failure older than the 100 newest rows still raises the flag"
  - "A settle / placeHold result of noop or skipped answers 422 action_not_allowed (nothing left to do), busy and transient answer 409 payment_busy, a decline (failed, balance_due) is 200 declined"
  - "Partner (gnet) bookings get no actions from the matrix, in addition to the engine's own assertMoneyEligible guard"

patterns-established:
  - "Route test runs the real engine (settle, hold, state) against fake-payments-db + fake-stripe; only the email sender, recovery module and payment-link deactivation are mocked"

requirements-completed: [HOLD-07, PAYF-01]

duration: ~25 min
completed: 2026-11-04
---

# Phase 88 Plan 15: Admin payment API (ledger view and operator actions) Summary

**`GET/POST /api/admin/bookings/[id]/payment` backing the PaymentPanel: payment facts, a single server-side action matrix and the append-only ledger on GET; capture, retry, release, waive and send-link on POST through the CAS-guarded engine with the admin actor, never accepting an amount.**

## What was built

- **Task 1 (tracer)** `245397d6`: the route with the project's admin guard order (`enforceMaxBody` 2 KB, plus a real-length check for chunked bodies -> admin session 401 / 403 -> uuid id 400 -> JSON 400 -> strict discriminated union 400 -> booking 404 -> matrix 422 -> engine, 409 while busy). GET answers the plan 88-07 contract exactly (`payment`, `allowed_actions`, `refund_failed`, `events`, `events_total`; ledger ordered `created_at DESC, id DESC`, limit 100 with an exact count). `lib/payments/actions.ts` holds `allowedPaymentActions`, `toPaymentFacts` and `runPaymentAction`; capture runs `settleBooking(id, { type: 'admin', id })`. The in-memory payments database gained supabase-js `count` support on `select`.
- **Task 2** `fb7d68e5`: retry (`claimForHold` + `placeHold` before the trip, `settleBooking` after it), release / waive (`releaseHold` reason `operator` / `waive`), send_link (`refreshRecoveryLink` for `payment_amount_minor - captured_amount_minor` with tag `admin-<ms>`, then the `payment_failed` declined email keyed `email:payment_failed:<id>:admin:<tag>`). Full matrix table test over every `payment_state` x completed x mode, plus concurrency and replay cases.

## Verification

- `npx vitest run tests/admin-payment-api.test.ts tests/payments-settle.test.ts tests/payments-hold.test.ts tests/payment-state-writers-gate.test.ts`: 4 files, 177 tests green. `tests/PaymentPanel.test.tsx`, `payments-state`, `payments-migration-085`, `payments-tick`, `payments-failure`: 195 tests green.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (none in the new route, module or test). `npx eslint --quiet` on the route, module, test and helper: clean.
- Acceptance greps: `getAdminUser()` x2, `discriminatedUnion` x1, no `amount: z.` in any schema (0).
- Behaviours covered by tests: 401 / 403 / 400 / 404 guards, 413 (header and chunked), strict body (`amount: 1` -> 400), newest-first ordering with equal timestamps, 150 rows -> 100 + total 150, pay_now with refund_failed, capture ok / declined (failed and balance_due) / transient 409 / captured 422, retry before and after completion, claim-not-applied 409, release / waive, send_link amounts 12000 and 3000, two concurrent captures -> one Stripe capture (200 + 409), admin capture racing the completion consumer -> one capture, transient capture finished by the sweep with the same key, one `admin_action` row with the admin id per action.

## Deviations from Plan

### Auto-fixed / judgement calls

**1. [Rule 2 - Missing critical] 502 results for send_link failures**
- **Issue:** The planned result union has no outcome for "no recovery link could be created" or "the email failed". Reporting `ok` would tell the operator a client was emailed when nobody was.
- **Fix:** `runPaymentAction` also returns `{ status: 502, error: 'link_failed' | 'email_failed' }`; the panel shows its generic "Could not complete the action. Nothing was changed. Try again." for it. An amount owed of zero or less answers 422.
- **Files modified:** lib/payments/actions.ts, tests/admin-payment-api.test.ts
- **Commit:** fb7d68e5

**2. [Rule 2 - Missing critical] Body length checked on the real text, not only the header**
- **Issue:** `enforceMaxBody` reads `content-length` only; a chunked body would bypass the 2 KB cap (T-88-47).
- **Fix:** after the header check the route reads the text and answers 413 above 2048 characters.
- **Commit:** 245397d6

**3. [Rule 3 - Blocking] `count` option on the fake payments database**
- **Issue:** `events_total` needs the supabase-js `select(..., { count: 'exact' })` count; the shared fake ignored the option.
- **Fix:** `select` now accepts `count`, and the result carries the number of matching rows before `limit()`. Behaviour without the option is unchanged.
- **Files modified:** tests/helpers/fake-payments-db.ts
- **Commit:** 245397d6

**4. Race loser can answer 422 instead of 409**
- When an admin capture loses to a settle that has already finished (state captured), the settle returns `noop` and the route answers 422 `action_not_allowed` ("the panel shows the current state"); 409 `payment_busy` is returned when the winner is still mid-flight. Two concurrent admin captures in the test produce 200 + 409; the admin-versus-completion-consumer test accepts 409 or 422 for the loser and asserts a single Stripe capture.

## Authentication gates

None.

## Known Stubs

None.

## Threat surface

T-88-46 (admin guard first, matrix re-checked on POST), T-88-47 (strict `{ action }` body, 2 KB cap, amounts only from the row), T-88-48 (`admin_action` row with the admin id before every engine call; engine rows carry the admin actor), T-88-49 (engine CAS claim, one Stripe call, 409 for the loser) mitigated as planned. No new trust boundary beyond the planned route. CSRF strict Origin comes from the existing `/api/admin` middleware.

## Self-Check: PASSED

- FOUND: app/api/admin/bookings/[id]/payment/route.ts, lib/payments/actions.ts, tests/admin-payment-api.test.ts
- FOUND commits: 245397d6, fb7d68e5
