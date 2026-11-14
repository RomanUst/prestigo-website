---
phase: 90-dispatch-views
plan: 06
subsystem: admin-dispatch
tags: [dispatch, move-hook, confirm-dialog, driver-picker, money-safety]
requires:
  - components/admin/useBookingMoves.tsx (90-01)
  - components/admin/bookingMoves.ts, CompleteTripDialog.tsx (90-04)
provides:
  - "BookingMovesApi.requestMove(booking, to, surface) executing planMove"
  - "components/admin/DriverPickerDialog.tsx"
  - "move toast (role status, data-testid move-toast)"
  - "one definition of hasCancelMoney / showsPaymentBadge (bookingMoves.ts), re-exported from bookingTypes.ts"
affects: [90-05 panel and table consumers, 90-07 board, 90-08 calendar]
key-files:
  created:
    - components/admin/DriverPickerDialog.tsx
    - tests/use-booking-moves.test.tsx
  modified:
    - components/admin/useBookingMoves.tsx
    - components/admin/bookingTypes.ts
    - components/admin/CompleteTripDialog.tsx
    - tests/complete-trip-dialog.test.tsx
key-decisions:
  - "requestStatusChange delegates to requestMove(booking, to, 'panel'); the planner keeps the Phase 89 no-money cancel as a status PATCH on the panel surface and opens the cancel dialog on the board"
  - "Synchronous double-submit guard: an in-flight id set in a ref (state lags a render) plus a check against every open dialog's booking id"
  - "Assigning from the picker also shows the move toast, so closing the dialog is not silent"
requirements: [DISP-02]
status: complete
actuals:
  tokens: 26000
  tasks: 2
  commits: 2
plan_head_before: 191af1689c4c9aabc0ce2a4743ce7e99f1ea1e81
plan_head_after: 8674a75c44a2ee79ea9a669c75148dd8b5a68e67
commits: 2
completed: 2026-11-10
---

# Phase 90 Plan 06: requestMove, driver picker, guarded moves Summary

**One hook now turns every planned move into behaviour: completion of a card_hold or cash booking confirms its money effect first, assignment opens a driver picker, cancel and no-show keep their dialogs, everything else is a PATCH with `expected_status` that reaches the caller only after the server accepted.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | requestMove, complete dialog mount, move toast, no optimism | b4d5db88 |
| 2 | DriverPickerDialog, guards, panel delegation, single hasCancelMoney | 8674a75c |

## What was built

- **requestMove(booking, to, surface)**: asks `planMove`; `rejected` does nothing; `direct` runs the existing status PATCH path (`expected_status`, `onPatched` only after success, then a toast "{reference} moved to {Label}"; 409 `status_conflict` sets the inline conflict line, calls `onStale`, never alerts); `confirm_complete` opens `CompleteTripDialog`; `cancel_dialog` and `no_show_dialog` open the existing dialogs; `assign_picker` opens `DriverPickerDialog`.
- **Move toast**: fixed element, `role="status"`, `aria-live="polite"`, `data-testid="move-toast"`, mounted only while a message shows (hidden after 4 s), `var(--admin-*)` tokens only. Not mounting an empty live region keeps `getByRole('status')` unambiguous for the cancel dialog's outcome line (BookingsTable and cancel-booking-dialog suites pass).
- **DriverPickerDialog**: Modal "Assign a driver to {reference}" around the same `DriverAssignmentSection`; renders nothing for a null booking. Assigned -> `onPatched(id, { status: 'assigned' })`, `onStale(id)`, toast, close. Escape / close button change nothing and send nothing.
- **Double submit (T-90-15)**: `requestMove` returns when the booking id is in flight (ref set, so two calls in one tick send one PATCH) or has an open no-show / cancel / complete / picker dialog.
- **anyDialogOpen** now covers all four dialogs.
- **requestStatusChange** delegates to `requestMove(..., 'panel')`.
- **De-duplication**: `hasCancelMoney` / `showsPaymentBadge` bodies deleted from `bookingTypes.ts`, re-exported from `./bookingMoves`.

## Verification

- `npx vitest run tests/use-booking-moves.test.tsx tests/BookingsTable.test.tsx tests/booking-detail-panel.test.tsx tests/DriverAssignmentSection.test.tsx tests/cancel-booking-dialog.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/complete-trip-dialog.test.tsx tests/booking-moves.test.ts tests/no-show-banner.test.tsx`: 471/471 pass. `tests/BookingsTable.test.tsx` is unchanged and passes.
- `tests/use-booking-moves.test.tsx`: 20 tests (completion confirm, onPatched-after-server, toast mount/unmount at 4 s, 409 refetch without alert, GNet direct complete and GNet cancel partner copy, rejected move, picker assign and close, panel vs board cancel routing, no-show modal, in-flight and same-tick double submit, same-booking dialog guard, anyDialogOpen for all four dialogs).
- `npx eslint --quiet` on all changed source and test files: clean.
- Acceptance greps: `function hasCancelMoney` defined once (bookingMoves.ts); `from './bookingMoves'` in bookingTypes.ts; `<DriverAssignmentSection` in DriverPickerDialog; `<DriverPickerDialog` / `<CompleteTripDialog` / `planMove(` / `move-toast` in the hook.

## Deviations from Plan

**1. [Rule 3 - Blocking] CompleteTripDialog.onConflict now also passes `currentStatus`**
- **Found during:** Task 1. The dialog's `onConflict(id)` gave the hook no way to build the inline conflict line for the real current status (`statusConflictMessage('on_board')`), only a generic "another status".
- **Fix:** additive optional second argument `onConflict?(id, currentStatus?)`; `tests/complete-trip-dialog.test.tsx` assertion updated from `('b-1')` to `('b-1', 'on_board')`. Both files belong to 90-04 and are not owned by 90-05.
- **Commit:** b4d5db88

**2. [Process] tdd="true" tasks committed test and code together** (RED was observed locally: 8/8 failing before the hook change, but not committed separately), as in 90-01 and 90-04.

## Issues Encountered / merge note for the orchestrator

- **New tsc error after merging with 90-05's test file.** `tests/booking-detail-panel.test.tsx` (owned by 90-05, not edited here) builds a full `BookingMovesApi` literal in `fakeMoves()` without `requestMove`, so `npx tsc --noEmit` now reports 9 errors (8 baseline plus this one, line 69). Runtime is unaffected (vitest does not type-check). Fix at merge time, one line in `fakeMoves()`: `requestMove: vi.fn(),` next to `requestStatusChange: vi.fn(),`. I did not touch the file because the parallel instructions reserve it for 90-05.
- No browser check was run (admin needs login and Supabase env that the worktree lacks); jsdom tests cover behaviour, not toast placement or dialog stacking.
- Behaviour change on the list: a status move that `planMove` rejects (not in `UI_TRANSITIONS`) is now silently ignored instead of PATCHed. The select and mobile buttons only offer `UI_TRANSITIONS` targets, so the existing suite is unaffected.
- The list now toasts after every direct status move and after completion/assignment through the dialogs (D-12).

## Known Stubs

None.

## Threat Flags

None. No new endpoint: all writes still go through PATCH `/api/admin/bookings` (with `expected_status`), cancel, no-show and assign. T-90-14, T-90-15, T-90-16 mitigations are covered by tests (409 refetch without optimism, double-submit guards, GNet no capture dialog).

## Self-Check: PASSED

- FOUND: components/admin/DriverPickerDialog.tsx, tests/use-booking-moves.test.tsx
- FOUND commits b4d5db88, 8674a75c; `git rev-list --count 191af168..HEAD` = 2 (before this SUMMARY commit).
