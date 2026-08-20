---
phase: 51
plan: 02
subsystem: admin-ui
tags: [admin, ui, gnet, stripe, cancel-modal, vitest]
dependency_graph:
  requires: [51-01]
  provides: [gnet-stripe-suppression, gnet-cancel-copy, gnet-vitest-coverage]
  affects: [components/admin/BookingsTable.tsx, tests/BookingsTable.test.tsx]
tech_stack:
  added: []
  patterns: [conditional-render, tdd, vitest]
key_files:
  created:
    - tests/BookingsTable.test.tsx (extended)
  modified:
    - components/admin/BookingsTable.tsx
decisions:
  - Stripe variants A and C suppressed via AND clause (booking_source !== 'gnet') — not via disabled/opacity
  - Variant B copy split: GNet branch vs manual branch — no new component introduced
  - Confirm button label resolves via same booking_source check
metrics:
  duration: ~25 minutes
  completed: "2026-05-04"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
---

# Phase 51 Plan 02: Stripe Suppression + GNet Modal Copy

**One-liner:** Suppressed Stripe refund UI variants (A + C) for GNet bookings via `booking_source !== 'gnet'` AND clauses; added GNet-specific cancel copy in Variant B; 6 Vitest tests cover badge rendering + Stripe suppression.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Vitest tests (RED→GREEN) | e0c4278 | tests/BookingsTable.test.tsx |
| 2 | Suppress Stripe refund variants + GNet copy | e4feb94 | components/admin/BookingsTable.tsx |
| 3 | Visual checkpoint — approved by operator | — | — |

## What Was Built

- Variant A (full refund copy): now renders only when `payment_intent_id !== null AND booking_source !== 'gnet'`
- Variant C (partial refund leg): now renders only when `payment_intent_id !== null AND leg !== null AND linked_booking_id !== null AND booking_source !== 'gnet'`
- Variant B (no-payment copy): split — GNet branch shows "This booking was received from a GNet partner. There is no Stripe payment to refund. Cancelling will mark the booking as cancelled and push the CANCEL status to GNet." Manual branch unchanged.
- Confirm button label: `payment_intent_id !== null && booking_source !== 'gnet' ? 'Confirm Cancel + Refund' : 'Cancel Booking'`
- 6 new Vitest tests in `describe('Phase 51 — GNet UI')` — all pass

## Test Results

- 12/12 tests passing (6 new + 6 pre-existing)
- `npx tsc --noEmit` — 0 errors

## Verification

- `grep -c "booking_source !== 'gnet'" components/admin/BookingsTable.tsx` ≥ 3 ✓
- `grep -c "received from a GNet partner" components/admin/BookingsTable.tsx` = 1 ✓
- Visual checkpoint: approved by operator

## Deviations from Plan

None.

## Self-Check

- [x] Variant A tightened with `booking_source !== 'gnet'`
- [x] Variant C tightened with `booking_source !== 'gnet'`
- [x] Variant B GNet copy added
- [x] Confirm button label logic updated
- [x] 6 Vitest tests: all GREEN
- [x] TypeScript: 0 errors
- [x] No disabled/opacity hiding — DOM removal only
- [x] Non-GNet bookings: no regression

## Self-Check: PASSED
