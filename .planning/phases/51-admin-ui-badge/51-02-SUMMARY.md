---
phase: 51
plan: 02
subsystem: admin-ui
tags: [admin, ui, gnet, cancel-modal, stripe-suppression, tdd]
dependency_graph:
  requires: [51-01]
  provides: [GNet-aware cancel modal, Stripe suppression for GNet rows]
  affects: [components/admin/BookingsTable.tsx, tests/BookingsTable.test.tsx]
tech_stack:
  patterns: [TDD red-green, conditional rendering, booking_source guard]
key_files:
  modified:
    - components/admin/BookingsTable.tsx
    - tests/BookingsTable.test.tsx
decisions:
  - GNet copy avoids the word "refund" entirely (original plan had "no Stripe payment to refund" which triggered the no-refund test)
  - PartialBooking type in test file extended with 'gnet' union member
  - fixture client_last_name changed from 'Partner' to 'Testuser' to avoid false-positive on /GNet partner/i regex
metrics:
  duration: ~35 min
  completed_date: "2026-04-27"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
---

# Phase 51 Plan 02: GNet Cancel Modal Suppression Summary

**One-liner:** GNet-aware cancel modal — refund variants suppressed from DOM + GNet-specific copy, covered by 6 Vitest tests (TDD green).

## What Was Built

Four precise edits to `components/admin/BookingsTable.tsx`:

1. **Variant C condition** (`booking_source !== 'gnet'` added) — partial-refund round-trip copy never shown for GNet rows
2. **Variant A condition** (`booking_source !== 'gnet'` added) — full-refund one-way copy never shown for GNet rows
3. **Variant B split** — GNet rows get dedicated copy: "This booking was received from a GNet partner. Billing is handled directly by the GNet partner. Cancelling will mark the booking as cancelled and push the CANCEL status to GNet."
4. **Confirm button label** — `payment_intent_id !== null && booking_source !== 'gnet'` guards "Confirm Cancel + Refund"; GNet rows always get "Cancel Booking"

Six new Vitest tests in `tests/BookingsTable.test.tsx` (describe: `Phase 51 — GNet UI`):
1. Desktop GNet row renders `gnet-badge-{id}` with text GNET
2. Desktop online row does NOT render `gnet-badge-{id}`
3. Mobile GNet card renders `gnet-badge-mobile-{id}`
4. Cancel modal for GNet row does NOT contain "refund" (case-insensitive)
5. Cancel modal for GNet row contains "GNet partner" copy
6. Cancel modal confirm button reads "Cancel Booking" not "Confirm Cancel + Refund"

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `3202a3e` | test | Add 6 GNet badge + Stripe suppression tests (RED then refined) |
| `0163e53` | feat | Suppress Stripe refund variants + GNet-specific cancel copy (GREEN) |
| `c2a7c01` | test | Visual checkpoint — GNet seed verified in DB, code logic confirmed |

## Verification Results

```
Tests  12 passed (12)  — all pre-existing + 6 new Phase 51 tests
tsc --noEmit — exits 0 (no type errors)
```

Acceptance criteria:
- `booking_source !== 'gnet'` count: 3 (Edits 1, 2, 4)
- `booking_source === 'gnet'` count: 3 (desktop badge, mobile badge, Edit 3 in modal)
- "received from a GNet partner" count: 1
- "push the CANCEL status to GNet" count: 1
- "created manually and has no payment record" count: 1 (manual copy preserved)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GNet copy contained word "refund" — violated no-refund assertion**
- **Found during:** Task 2 GREEN verification
- **Issue:** Plan specified copy "There is no Stripe payment to refund" — this string contains "refund" and made the `not.toContain('refund')` test fail
- **Fix:** Changed copy to "Billing is handled directly by the GNet partner." — semantically equivalent, no banned word
- **Files modified:** `components/admin/BookingsTable.tsx`
- **Commit:** `0163e53`

**2. [Rule 1 - Bug] Test fixture name caused false-positive on /GNet partner/i regex**
- **Found during:** Task 1 RED verification
- **Issue:** `client_last_name: 'Partner'` made `screen.getByText(/GNet partner/i)` match the displayed client name "Gnet Partner" before GNet copy was added
- **Fix:** Changed `client_last_name` to `'Testuser'`; also tightened test to assert within `modalContainer` not global DOM
- **Files modified:** `tests/BookingsTable.test.tsx`
- **Commit:** `3202a3e`

## Checkpoint: Task 3 (human-verify) — APPROVED

Visual verification approved by user. Code logic confirmed programmatically:

- GNet seed row (`booking_reference = 'PRE-GNET-SEED'`, `id = '2079efeb-78da-4121-8852-5ecc2943b883'`) was inserted into DB via Supabase MCP before checkpoint
- DB CHECK constraint already includes `'gnet'` as valid `booking_source`
- `gnet-badge` testid confirmed present in both desktop (line 352) and mobile (line 712) of BookingsTable.tsx
- `booking_source !== 'gnet'` guard confirmed on Variant A, Variant C, and confirm-button (3 occurrences)
- GNet-specific copy confirmed: "received from a GNet partner" (1 occurrence), "CANCEL status to GNet" (1 occurrence)
- Manual copy preserved: "created manually and has no payment record" (1 occurrence)

## Known Stubs

None — all GNet copy is wired and rendering conditionally based on `booking_source`.

## Threat Flags

No new security-relevant surface introduced. See plan threat model (T-51-04 through T-51-07) — all `accept` disposition, no new endpoints or auth paths added.

## Self-Check: PASSED

- `components/admin/BookingsTable.tsx` modified: confirmed (4 edits applied)
- `tests/BookingsTable.test.tsx` modified: confirmed (6 new tests in describe block)
- Commit `3202a3e` exists: confirmed
- Commit `0163e53` exists: confirmed
- All 12 tests pass: confirmed
- tsc clean: confirmed
