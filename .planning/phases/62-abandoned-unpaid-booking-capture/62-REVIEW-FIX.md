---
phase: 62-abandoned-unpaid-booking-capture
source_review: 62-REVIEW.md
fixed: 2026-08-20
scope: critical_warning
findings_addressed: 4
findings_skipped: 2
status: fixed
---

# Phase 62: Code Review Fix Report

Applied fixes for all **Critical + Warning** findings from `62-REVIEW.md`. Info findings (IN-01, IN-02) were out of the default fix scope and left as-is. All fixes are test-verified; migrations 053/054 were already live and were **not** re-applied.

## Outcomes

| Finding | Severity | Outcome | Commit |
|---------|----------|---------|--------|
| CR-01 | Critical | **fixed** | `d267d3b` (+ enabler `34e155a`) |
| WR-01 | Warning | **fixed** | `69dae82` |
| WR-02 | Warning | **fixed** | `d267d3b` |
| WR-03 | Warning | **fixed** | `34e155a` |
| IN-01 | Info | skipped (out of scope; pre-existing D-19 behavior) | — |
| IN-02 | Info | skipped (out of scope; cosmetic typing) | — |

## What changed

### CR-01 — Round-trip partial-capture drops one leg (data loss) → fixed
- `lib/supabase.ts`: `reconcileRoundTripToConfirmed` now returns `{ id, leg }[]` (selects `leg`).
- `app/api/webhooks/stripe/route.ts`: `handleRoundTripSucceeded` now branches on the reconcile result:
  - **2 legs** reconciled → normal path (no insert).
  - **0 legs** → existing `saveRoundTripBookings` all-or-nothing fallback (both-missing insert, or both-confirmed retry no-op).
  - **1 leg** (the previously-unhandled partial case) → backfill **only the missing leg** via `saveBooking` (upsert on `payment_intent_id,leg`, idempotent). `saveRoundTripBookings` cannot be used here — it is all-or-nothing and would `23505` on the leg that already exists, dropping both.
- Both legs now end `confirmed` and side-effects fire exactly once for the full pair.
- **Test:** added regression `(d)` in `tests/webhooks-stripe.test.ts` — "exactly one leg captured → missing leg backfilled, side-effects once, both legs QStash-scheduled".
- Known residual (documented, not a regression): if the missing leg exists as an orphaned `unpaid` row carrying a *stale* `payment_intent_id` from an abandoned attempt, the backfill creates the correct confirmed row for the paid PI; the stale unpaid row remains and would appear in the admin unpaid queue until manually cleared. The customer-facing outcome (both legs confirmed, charged once) is correct.

### WR-01 — Admin transition map drifted → fixed
- `app/api/admin/bookings/route.ts`: deleted the inline `VALID_TRANSITIONS` copy; now imports the canonical map from `lib/booking-transitions.ts` (as `assign/route.ts` does). This unblocks `en_route → completed` (which the UI offered but the API rejected) and keeps API/UI in sync. `unpaid → confirmed/cancelled` preserved.

### WR-02 — charge.refunded idempotency ordering → fixed
- `app/api/webhooks/stripe/route.ts`: `charge.refunded` now read-checks `stripe_processed_events` first, runs `handleChargeRefunded`, then claims the event row (ignoring 23505) — the same SEC-10 order as `payment_intent.succeeded`. A crash between claim and handler no longer permanently drops the refund's booking-cancel.
- Updated the `mockFromChain` test helper to stub the new read-check select chain (5 refund tests green).

### WR-03 — captureUnpaidBooking unique-constraint race → fixed
- `lib/supabase.ts`: `captureUnpaidBooking` now catches `23505` from the migration-053 partial unique index on INSERT, re-selects, and updates the existing `unpaid` row (or no-ops if already confirmed) — idempotent regardless of caller try/catch.

## Verification
- `npx vitest run tests/create-payment-intent.test.ts tests/webhooks-stripe.test.ts tests/BookingsTable.test.tsx tests/admin-bookings.test.ts` → **114 passed / 2 failed / 5 todo**. The 2 failures are the pre-existing, out-of-scope `POST /api/admin/bookings` Test 5/6 (documented in `deferred-items.md` for Phase 64) — unchanged by these fixes.
- `npx tsc --noEmit` → zero errors in all changed files (only the 4 pre-existing unrelated test files still error).

## Not addressed (Info, out of default scope)
- **IN-01** — `charge.refunded` one-way branch cancels on *any* refund incl. partial. Pre-existing D-19 decision; flag for a future partial-refund policy decision.
- **IN-02** — `existingRow.status` typed as `string` rather than the status union in `captureUnpaidBooking`. Cosmetic; no functional issue.
