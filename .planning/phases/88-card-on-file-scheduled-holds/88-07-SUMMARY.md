---
phase: 88-card-on-file-scheduled-holds
plan: 07
subsystem: admin-ui
tags: [react, admin, payments, stripe, confirm-modal, tokens, vitest]
status: complete

requires:
  - phase: 88-card-on-file-scheduled-holds
    provides: lib/payments/state.ts types (88-01) and formatMinor (88-03)
provides:
  - PaymentPanel - self-contained admin panel (GET /api/admin/bookings/[id]/payment, POST { action }) with badge, banners, facts, server-driven actions, confirm modals and append-only history
  - PaymentStateBadge / RefundFailedBadge / PAYMENT_STATE_BADGE - 11 states plus refund failed plus raw-value fallback
  - BadgeShell exported from StatusBadge.tsx (StatusBadge API unchanged, neutral family accepted)
  - BookingsTable - list payment badge, card cancel variant D, 502 refund_failed handling, trip-edit payment_effect and payment_in_progress copy
affects: [88-15 payment route (codes against this contract), 88-16 cancel route and trip-edit PATCH payment_effect, 90 BookingDetailPanel extraction]

actuals:
  tokens: 23000
  tasks: 3
  commits: 3
plan_head_before: e69289647e8dac55b43e87f9649163e7c1b9a5d4
plan_head_after: 1a813110afe70ffb781582439a29b4c47caa9106

tech-stack:
  added: []
  patterns:
    - "Self-contained panel: fetches its own data, refetches on refreshKey / after any action, no polling"
    - "Money actions: UI never sends an amount; buttons come only from the server allowed_actions; every action goes through a confirm modal whose initial focus is the dismiss button"
    - "Colour only through var(--admin-*) / var(--status-*) tokens; amounts only through formatMinor"

key-files:
  created:
    - components/admin/PaymentPanel.tsx
    - components/admin/PaymentStateBadge.tsx
    - tests/PaymentPanel.test.tsx
  modified:
    - components/admin/StatusBadge.tsx
    - components/admin/BookingsTable.tsx
    - tests/BookingsTable.test.tsx

key-decisions:
  - "PaymentPanel takes an optional paymentMode prop: a known non-card booking never shows a skeleton or a load error (it only renders for refund_failed); omit it to behave as a card booking"
  - "Initial modal focus is set from a deferred effect (setTimeout 0) instead of autoFocus or a Modal change, so Modal still records the real trigger button for focus return"
  - "Trip-edit payment_effect message renders in a role=status line right under the Edit button (visible with edit mode closed); errors go through the existing per-field error hint"

patterns-established:
  - "PaymentStateBadge unknown state -> raw value in neutral family, never throws"
  - "Cancel 502 refund_failed with cancelled:true throws CancelRefundFailedError: row turns cancelled, dialog keeps the line, confirm is disabled"

requirements-completed: [HOLD-07, PAYF-01, HOLD-05]

duration: ~35 min
completed: 2026-11-04
---

# Phase 88 Plan 07: Admin payment panel, list badge, card cancel and refund-failed handling Summary

**Self-contained `PaymentPanel` for card-hold bookings (state badge, first-match alert banners, facts in Prague time, server-driven actions behind confirm modals, append-only history), plus the list badge, card cancel variant, 502 refund-failed handling and trip-edit payment feedback in BookingsTable, all on theme tokens.**

## What was built

- **Task 1 (tracer)** `d0586b58`: `BadgeShell` extracted from `StatusBadge` (output identical, `neutral` accepted); `PaymentStateBadge` with the UI-SPEC state table; `PaymentPanel` fetching the payment GET and rendering the badge, facts (null facts are not rendered, `Hold expires` as `Thu 12 Nov, 14:05 (Prague time)`) and the history (5 shown, `Show all {n}` up to the sent rows, unknown kinds shown raw, actors System / Stripe / Admin + id, error code). Skeleton and load-error states. `Booking.payment_mode` / `payment_state` and the two `<PaymentPanel>` mounts above `PaymentLinkSection`, with a per-booking `refreshKey` bumped from `handleTripUpdated`.
- **Task 2** `c03bcbcc`: actions rendered only from `allowed_actions`; one confirm modal per action (UI-SPEC copy verbatim, dismiss button focused, danger styling only for Release and Waive); POST body is `{ action }` only; result handling for ok, declined, 409 payment_busy, 422, 401/403 and network failure; `Working…` state with everything disabled and the modal undismissable; result line clearing after 8 s; first-match banners (refund failed, payment failed, balance unpaid, hold expired, hold expires soon, no valid hold) with `role=alert` for danger and `role=status` otherwise; Copy link fact (`Copied` for 2 s, select-by-hand fallback).
- **Task 3** `1a813110`: `PaymentStateBadge` under the status badge in the desktop row and mobile card for `card_hold`; cancel dialog variant D with `Confirm Cancel + Release Hold`; 502 `refund_failed` + `cancelled: true` marks the row cancelled, keeps the manual-refund line and disables the confirm button; the 409 `status_conflict` branch lost the refund note; trip edit shows the `payment_effect` message and maps 409 `payment_in_progress`; the Refund failed badge + banner render for any payment mode (a pay_now booking gets only those two).

## Verification

- `npx vitest run tests/PaymentPanel.test.tsx tests/BookingsTable.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-theme-css.test.ts tests/admin-bookings-kpi-decoupling.test.tsx`: 5 files, 193 tests green.
- `npx tsc --noEmit`: no error in `components/admin/*` or the two test files. `npx eslint --quiet` on the four admin components and both tests: clean.
- Acceptance greps: `<PaymentPanel` x2, `export function BadgeShell` x1, colour literals 0 in both new components, `Confirm Cancel + Release Hold` x1, `refund_failed` x2, `The refund was already issued` x0, no amount in the POST body (the test deep-equals `{ action }`).
- Full suite: 331 files passed, 5 failed. The five (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) fail on `next-intl/server` module resolution through the worktree's symlinked `node_modules` (`Cannot find module '/@fs/.../next-intl/dist/esm/development/server.react-server.js'`); they import nothing from this plan and are an environment artefact of the symlink, not a regression.

## Deviations from Plan

### Auto-fixed / judgement calls

**1. [Rule 2 - Missing critical] Optional `paymentMode` prop on PaymentPanel**
- **Found during:** Task 1 (existing BookingsTable tests started showing `Could not load payment details.` for pay-now rows whose mocked fetch has no payment endpoint).
- **Issue:** The spec says the panel renders only for card bookings but must still ask the endpoint for `refund_failed` on any booking (D-20). Without knowing the list's mode, every pay-now row would flash a skeleton or an error.
- **Fix:** `paymentMode?: string | null`. Anything but `card_hold` keeps loading and load failures silent; `undefined` (standalone / Phase 90 move) behaves as a card booking. The contract signature `{ bookingId, refreshKey }` is a strict subset.
- **Files modified:** components/admin/PaymentPanel.tsx, components/admin/BookingsTable.tsx
- **Commit:** d0586b58

**2. [Rule 3 - Blocking] AddressInput mocked in tests/BookingsTable.test.tsx**
- **Issue:** Opening trip-edit mode mounts `AddressInput` (a next-intl consumer), which throws without a provider; the new trip-edit payment tests need edit mode open.
- **Fix:** `vi.mock('@/components/booking/AddressInput', () => ({ default: () => null }))` (same approach as `tests/DayCard.test.tsx`). No existing test relied on the real component.
- **Commit:** 1a813110

**3. Section label above the panel card omitted**
- The UI-SPEC lists a muted section label above the card and a "Payment" heading in the header row. Both read "Payment", so the label would only repeat the heading verbatim; only the header heading is rendered.

**4. "Refund failed" list badge not added**
- The UI-SPEC says the badge stays in the list. The bookings list payload carries no `refund_failed` flag (it comes from the payment GET), so the Refund failed badge shows in the panel header (card bookings) and above the banner (any other mode), not in the table row. A list-level flag would need a payload change (a later plan).

### Assumptions to confirm in plan 88-15 / 88-16

- `payment_retry_at` is shown as the scheduled automatic retry only while `payment_retry_count < 1` (per 88-14: the retry clears `payment_retry_at` and sets the count to 1).
- `outstanding amount` for Capture / Retry / Send link is `amount_minor - captured_amount_minor` (falls back to `amount_minor`); Release uses `hold_amount_minor`; the server remains the source of truth because the UI sends no amount.
- 401/403 keep the modal open with the session-ended line (UI-SPEC does not say whether the modal closes).

## Authentication gates

None.

## Known Stubs

None. The panel codes against the `GET/POST /api/admin/bookings/[id]/payment` contract; the route itself is plan 88-15, so until it ships a real card booking shows `Could not load payment details.` (tests use mocked fetch).

## Threat surface

T-88-17 mitigated as planned: body is `{ action }` only, actions come from `allowed_actions`, every money action sits behind a confirm modal (tested: no POST on the first click). No new endpoint or trust boundary introduced.

## Self-Check: PASSED

- FOUND: components/admin/PaymentPanel.tsx, components/admin/PaymentStateBadge.tsx, tests/PaymentPanel.test.tsx
- FOUND commits: d0586b58, c03bcbcc, 1a813110
