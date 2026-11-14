---
phase: 90-dispatch-views
plan: 04
subsystem: admin-dispatch
tags: [dispatch, move-planner, confirm-dialog, dnd-kit, money-safety]
requires:
  - lib/booking-transitions.ts (UI_TRANSITIONS)
  - lib/booking-status.ts (BOOKING_STATUSES, isPartnerBooking)
  - lib/payments/money.ts (formatMinor, PaymentCurrency)
provides:
  - components/admin/bookingMoves.ts (planMove, completeEffect, hasCancelMoney, showsPaymentBadge, MoveSurface, MoveBooking, MovePlan, CompleteEffect)
  - components/admin/CompleteTripDialog.tsx (CompleteTripDialog)
  - "@dnd-kit/core 6.3.1 and @dnd-kit/utilities 3.2.2 installed and proven under React 19"
affects:
  - plan 90-07 (board) and the detail-panel surfaces that call planMove
tech-stack:
  added: ["@dnd-kit/core 6.3.1", "@dnd-kit/utilities 3.2.2"]
  patterns: ["one pure planner decides every move", "effect-stating confirm dialog on the ConfirmNoShowModal pattern"]
key-files:
  created:
    - components/admin/bookingMoves.ts
    - components/admin/CompleteTripDialog.tsx
    - tests/booking-moves.test.ts
    - tests/complete-trip-dialog.test.tsx
    - tests/dnd-kit-spike.test.tsx
  modified:
    - package.json (by orchestrator, commit 9bb2470e)
    - package-lock.json (by orchestrator, commit 9bb2470e)
key-decisions:
  - "planMove reads UI_TRANSITIONS only; confirmed->completed and assigned->completed stay rejected"
  - "assigned always = driver picker; no_show always = dialog; cancelled = dialog on the board, dialog on the panel only when money exists (else existing PATCH)"
  - "completing card_hold / cash_guarantee = effect-stating confirmation; GNet, pay_now, no payment_mode = direct move (research Open Question 1)"
  - "dnd-kit 6.3.1 confirmed working under React 19 (no fallback to @hello-pangea/dnd needed)"
requirements: [DISP-02]
status: complete
commits: 2
plan_head_before: 9bb2470eff05365b57fa4680673d964abca12c4e
plan_head_after: d59115f17184ca9ced80e8f6aed815b85b9f5c34
actuals:
  tokens: 14000
  tasks: 3
  commits: 2
metrics:
  duration: ~12 minutes
  completed: 2026-11-10
---

# Phase 90 Plan 04: Move planner, complete-trip dialog, dnd-kit spike Summary

A pure `planMove` decides every status move against `UI_TRANSITIONS` and routes all money targets to dialogs; `CompleteTripDialog` states the capture or cash effect before completing; `@dnd-kit/core` is proven to mount under React 19.

## Tasks

| Task | Name | Commit | Notes |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | planMove routes every (status, target, surface) to one of six outcomes | cee5a1dc | 200-combination matrix against UI_TRANSITIONS plus targeted money-routing cases (260 tests incl. booking-status.test.ts) |
| 2 | dnd-kit install (checkpoint:human-action) | 9bb2470e | Done by the orchestrator before dispatch; verify commands re-run here: versions 6.3.1 / 3.2.2, exact pins in package.json, last package-lock commit is `chore(90-04)` |
| 3 | CompleteTripDialog and dnd-kit React 19 spike | d59115f1 | 38 tests green together with admin-no-hardcoded-colors |

## What was built

- **bookingMoves.ts**: `showsPaymentBadge` and `hasCancelMoney` mirror the current BookingsTable bodies (with `payment_intent_id` optional). `completeEffect` returns null for GNet partner bookings, a capture effect for `card_hold` (amount and currency from the row; currency kept only for `eur` / `czk`), a cash effect for `cash_guarantee`, else null. `planMove` outcomes: rejected, direct, assign_picker, cancel_dialog, no_show_dialog, confirm_complete. No React, no fetch, no VALID_TRANSITIONS reference.
- **CompleteTripDialog.tsx**: Modal titled "Complete trip {reference}?", effect sentence (amount through `formatMinor`, never typed), primary "Complete trip" sends `PATCH /api/admin/bookings` with `{ id, status: 'completed', expected_status }`; in-flight ref guard, disabled primary and non-dismissable while pending; 409 `status_conflict` shows `statusConflictMessage` in a role alert (`STATUS_CONFLICT_STYLE`) and calls `onConflict`; other failures show the generic line and keep the dialog open; "Keep open" only calls `onClose`. Renders nothing when booking or effect is null. Only `var(--admin-*)` / `var(--status-*)` tokens.
- **dnd-kit spike**: DndContext with PointerSensor (distance 6) and TouchSensor (delay 250, tolerance 8), one useDraggable, one enabled and one disabled useDroppable, a DragOverlay. Mounts with no console errors under React 19.2; the draggable carries `aria-roledescription="draggable"`. Research assumption A2 holds.

## Verification

- `npx vitest run tests/booking-moves.test.ts tests/booking-status.test.ts` : 260 passed.
- `npx vitest run tests/complete-trip-dialog.test.tsx tests/dnd-kit-spike.test.tsx tests/admin-no-hardcoded-colors.test.ts` : 38 passed.
- `npx tsc --noEmit`: 8 errors, all the known baseline in `tests/`; none in this plan's files.
- `npx eslint --quiet` on all new files: clean.
- Acceptance greps: no `€` in CompleteTripDialog.tsx; `expected_status`, `formatMinor`, `statusConflictMessage` all present; VALID_TRANSITIONS count outside comments is 0; `UI_TRANSITIONS[` present.

## Deviations from Plan

None. The plan was executed as written. TDD note: for Task 1 the test file and the module were written together and committed in one task commit rather than as separate RED/GREEN commits (the plan is `type: execute`, not `type: tdd`).

Task 2 was not a stop point: the orchestrator had already installed the packages (commit 9bb2470e), and its `<verify>` commands passed.

## Authentication gates

None.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or trust boundary: the dialog reuses the existing `PATCH /api/admin/bookings`; the two npm packages were audited in research and installed by the orchestrator with exact pins.

## Notes for downstream plans

- DISP-02 is only partly delivered here (the planner and the complete dialog); the board and panel wiring in later plans complete it, so requirements were not marked complete by this plan.
- Callers must still wire `assign_picker` to the existing assign route, `cancel_dialog` to `CancelBookingDialog`, `no_show_dialog` to `ConfirmNoShowModal`. The planner only decides.
- If the owner wants a prompt on every completion (including GNet and pay-now), `completeEffect` can return a no-money effect; one-line change in `components/admin/bookingMoves.ts`.

## Self-Check: PASSED

- FOUND: components/admin/bookingMoves.ts, components/admin/CompleteTripDialog.tsx, tests/booking-moves.test.ts, tests/complete-trip-dialog.test.tsx, tests/dnd-kit-spike.test.tsx
- FOUND commits: cee5a1dc, d59115f1 (and orchestrator commit 9bb2470e)
