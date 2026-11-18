---
phase: 92-quotes
plan: 30
subsystem: admin-bookings-ui
tags: [quotes, admin, booking-panel, cancel-dialog]
requires: ["92-01"]
provides:
  - "AdminBooking quote_id / quote_line_id / quote_deposit_minor"
  - "data-testid=quote-origin chip in BookingDetailPanel"
  - "quote branch of outcomeFor in CancelBookingDialog"
affects: [admin booking panel (list, board, calendar via BookingPanelProvider)]
tech-stack:
  added: []
  patterns: ["admin theme tokens only", "money via formatMinor from data"]
key-files:
  created: []
  modified:
    - components/admin/bookingTypes.ts
    - components/admin/BookingDetailPanel.tsx
    - components/admin/CancelBookingDialog.tsx
    - tests/booking-detail-panel.test.tsx
    - tests/cancel-booking-dialog.test.tsx
decisions:
  - "Deposit share currency = booking.payment_currency (eur fallback); migration 091 stores quote_deposit_minor without a currency column on bookings"
  - "Quote branch of outcomeFor returns situation from situationOf and late=false regardless of who/payment mode"
metrics:
  tasks: 2
  commits: 2
  completed: 2026-11-14
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: 425e4799
plan_head_after: 6dcf0876c9eb60f5b1339b499e3f2f2ace2d4c9f
---

# Phase 92 Plan 30: Quote bookings in the admin booking panel Summary

A booking made from a quote now shows a "From quote" chip linking to /admin/quotes/<quote_id> with the deposit sentence, offers no legacy payment link, and its cancel dialog states the quote rule (free trip, no fee, deposit stays on the quote).

## Mount

`BookingDetailPanel` is rendered by `components/admin/BookingPanelProvider.tsx` (mounted by `BookingsWorkspace` on /admin/bookings; the board and calendar use the same provider). The panel test `mount (92-30)` renders the real `BookingPanelProvider`, opens a quote booking through `openBooking` and asserts the chip, the link and the absence of the payment-link section. The cancel dialog is mounted by `useBookingMoves` through the same provider and receives the `AdminBooking` row directly, so `quote_id` flows through unchanged.

## Tasks

1. Tracer (f314ce7d): type fields, `QuoteOrigin` chip, `PaymentLinkSection` rendered only when `quote_id` is empty (B2 / D-20). Tests: chip + link + sentence; B2 for `quote`, `cash_guarantee`, `card_hold`; ordinary booking unchanged; no-deposit case; provider mount.
2. Cancel dialog (6dcf0876): `quote_id` on `CancelDialogBooking`; `outcomeFor` returns the free quote outcome for both "client asked" and "Prestigo cancels" in every payment mode, primary "Cancel trip", no proposed fee (D-11, T-92-34).

## Verification

- `npx vitest run` on the 10 test files that reference these components: 446 passed (includes admin-no-hardcoded-colors run separately: green).
- `npx tsc --noEmit`: 8 errors, all in tests/ (baseline).
- `npx eslint --quiet` on the three components and both tests: clean.

## Deviations from Plan

None - plan executed as written. Note: the dialog's "The client" tile helper ("Follows the cancellation policy.") is unchanged for quote trips; the outcome line states the quote rule once a tile is chosen.

## Known Stubs

None.

## Threat Flags

None. T-92-98: no payment-link UI for quote bookings (component test); server refusal is 92-10. T-92-34: dialog branch matches the forced-free server rule of 92-11.

## Self-Check: PASSED

Files modified exist; commits f314ce7d and 6dcf0876 present.
