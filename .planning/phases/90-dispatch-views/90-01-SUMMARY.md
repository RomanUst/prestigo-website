---
phase: 90-dispatch-views
plan: 01
subsystem: ui
tags: [react, admin, refactor, bookings, extraction]

requires:
  - phase: 87-driver-flow
    provides: expected_status compare-and-set on status PATCH, ConfirmNoShowModal as the only path to no_show
  - phase: 89-cancellation-fees
    provides: CancelBookingDialog for bookings with money, fee_case_status on rows
provides:
  - "AdminBooking type (+ optional driver_id), PatchBody, PatchError, patchBooking, showsPaymentBadge, hasCancelMoney, vehicleClassMap, STATUS_LABELS in components/admin/bookingTypes.ts"
  - "useBookingMoves hook + BookingMovesApi: one owner of status moves, 409 conflict copy, no-show and cancel dialogs"
  - "BookingDetailPanel: the single booking detail panel (desktop row, mobile card, later side panel / board / calendar)"
  - "DetailField, TripEditPanel, PaymentLinkSection as their own modules"
affects: [90-05 side panel, 90-06 move routing, 90-07 board, 90-08 calendar, 91 extra-charge action]

actuals:
  tokens: 33000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Panel-local edit state seeded from the booking on mount, mounted with key={booking.id}; row changes leave through onPatched(id, patch)"
    - "Dialog-owning hook returns a `dialogs` node that each view mounts exactly once"

key-files:
  created:
    - components/admin/bookingTypes.ts
    - components/admin/DetailField.tsx
    - components/admin/TripEditPanel.tsx
    - components/admin/PaymentLinkSection.tsx
    - components/admin/useBookingMoves.tsx
    - components/admin/BookingDetailPanel.tsx
    - tests/booking-detail-panel.test.tsx
  modified:
    - components/admin/BookingsTable.tsx

key-decisions:
  - "Moved code by line range with a script so TripEditPanel, PaymentLinkSection and DetailField are byte-identical to the originals"
  - "onSearchReference is an optional BookingDetailPanel prop: the paired-outbound chip needs the table's search state; without it the panel prints the reference as plain text"
  - "hook output object is rebuilt every render; callers must not use it as an effect dependency"

patterns-established:
  - "useBookingMoves({ onPatched, onStale }) is the only place that PATCHes a status"
  - "Unmount flush for debounced saves: a pending value is sent once through a ref, not dropped"

requirements-completed: [DISP-04]

coverage:
  - id: D1
    description: "BookingsTable renders its expanded content from one BookingDetailPanel on desktop and mobile"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx (unchanged, 83 tests) + tests/booking-detail-panel.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Status moves and the no-show / cancel dialogs come from useBookingMoves; expected_status and the modal-only no_show path are preserved"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx (Phase 87 conflict/no-show, Phase 89 plan 16 cancel wiring), tests/cancel-booking-dialog.test.tsx, tests/no-show-banner.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "The expanded row and mobile card look and behave the same in a real browser"
    verification: []
    human_judgment: true
    rationale: "No browser check was run in the worktree (admin needs login and Supabase env); jsdom tests cover behaviour, not layout."

duration: 16min
completed: 2026-11-10
status: complete
plan_head_before: 9bb2470eff05365b57fa4680673d964abca12c4e
plan_head_after: 7233fa8bf0ca06eb38aa0e776ec85c65ed155da2
commits: 3
---

# Phase 90 Plan 01: BookingDetailPanel extraction Summary

**BookingsTable (2,916 -> 1,060 lines) now renders its expanded content from one BookingDetailPanel and takes its status moves and money dialogs from one useBookingMoves hook, with the untouched 83-test table suite green after every task.**

## Performance

- **Duration:** 16 min
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 7 created, 1 modified

## Accomplishments

- Task 1 (tracer): `AdminBooking`, `PatchBody`, `PatchError`, `patchBooking` and the label maps moved to `bookingTypes.ts`; `DetailField`, `TripEditPanel`, `PaymentLinkSection` moved verbatim. Table suite green, tsc/eslint clean. Tracer verify re-run passed, expansion continued.
- Task 2: `useBookingMoves` owns the status PATCH (still `expected_status`), the 409 `status_conflict` line (no alert, then `onStale`), no_show through `ConfirmNoShowModal` only, cancel-with-money through `CancelBookingDialog`. Each dialog is mounted once, via `moves.dialogs`.
- Task 3: `BookingDetailPanel` holds notes (800 ms debounce, blur flush, unmount flush), driver price, payment refresh counter, and every section of the expanded row. Mounted in the desktop expanded cell and the mobile expanded card (key = booking id). 16 new panel tests.

## Task Commits

1. Task 1: `e2c2bc50` refactor(90-01): move booking type, PATCH helper and leaf components out of BookingsTable
2. Task 2: `7814419e` refactor(90-01): useBookingMoves owns status PATCH, conflict copy and the no-show and cancel dialogs
3. Task 3: `7233fa8b` feat(90-01): BookingDetailPanel holds the expanded-row content, mounted on desktop and mobile

## Verification

- `npx vitest run tests/BookingsTable.test.tsx tests/booking-detail-panel.test.tsx tests/cancel-booking-dialog.test.tsx tests/no-show-banner.test.tsx tests/PaymentPanel.test.tsx tests/DriverAssignmentSection.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 253/253 pass. `tests/admin-bookings-kpi-decoupling.test.tsx`: 4/4 pass.
- `tests/BookingsTable.test.tsx` has no diff against the base commit.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet` on all changed files: clean (no warnings on the new files either).
- Acceptance criteria of all three tasks re-run: all pass (`<BookingDetailPanel` x2 in the table, 0 leaf-section mounts left in the table, table 1,060 lines, 8 exports in bookingTypes).

## Deviations from Plan

### Auto-fixed / judgment calls

**1. [Rule 2 - Missing critical] Email and Phone fields added to the panel**
- **Found during:** Task 3
- **Issue:** the desktop expanded row (the "verbatim" source) had no Email/Phone read-only fields, but the mobile expanded card did. Replacing the mobile JSX with the desktop body would have dropped the client's phone and email from mobile, which is the main thing a dispatcher taps.
- **Fix:** two `DetailField`s (Email, Phone) added to the panel grid. Desktop gains them too.
- **Files modified:** components/admin/BookingDetailPanel.tsx
- **Commit:** 7233fa8b

**2. [Rule 3 - Blocking] Optional `onSearchReference` prop on BookingDetailPanel**
- **Found during:** Task 3
- **Issue:** the "Paired outbound" chip sets the table's search/page state, which is not reachable through the planned `{ booking, moves, onPatched }` props.
- **Fix:** optional prop; the table passes it. Without it (board, calendar) the reference renders as plain text instead of a dead button. The mobile-only test id `linked-ref-chip-mobile-<id>` is gone (no test referenced it); the desktop id `linked-ref-chip-<id>` is used.
- **Commit:** 7233fa8b

**3. [Process] Task 3 `tdd="true"` committed as one commit**
- Panel and its test file were written in the same task commit rather than a RED commit followed by a GREEN commit. The task is a behaviour-preserving extraction whose regression net is the existing table suite; the new tests were run against the finished panel.

**Total deviations:** 3 (1 Rule 2, 1 Rule 3, 1 process). **Impact:** none on the plan's contracts; interfaces for later plans are as listed, plus the optional prop.

## Behaviour changes worth knowing (intended by the plan or its consequence)

- Mobile expanded card now shows the status select, driver price, DriverAssignmentSection and the desktop field set (Passengers, Luggage, Payment ID, ...) instead of its old shorter list. The card's own status buttons and conflict line stay on the card, so a conflict line can show twice (card and panel) when a mobile card is expanded.
- The panel's operator-notes save now also patches the row (`operator_notes`) through `onPatched`; before, only local text state changed.
- Notes and driver price are seeded from the booking when the panel mounts (the table used to seed once per fetch and keep the first value). Same effect for the open row; a re-expanded row shows the latest stored value.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or trust-boundary changes; T-90-01 mitigations (expected_status, modal-only no_show, cancel dialog for money) are proven by the unchanged table suite.

## Issues Encountered

- No browser check (verify skill step 6) was run: the admin needs login and Supabase env that the worktree does not have. Layout parity of the extracted panel is covered only by the jsdom suite; recommend a quick look at /admin/bookings on desktop and mobile width before the D-03 flip in 90-05.
- `node_modules` is a symlink to the main checkout (not committed).

## Next Phase Readiness

Ready for plans 90-05 to 90-08: `BookingDetailPanel`, `useBookingMoves` and `AdminBooking` exist with the planned names. Note for 90-06/07: `useBookingMoves` returns a fresh object every render, so do not put `moves` in effect dependency arrays; use its members.

## Self-Check: PASSED

- Created files exist: bookingTypes.ts, DetailField.tsx, TripEditPanel.tsx, PaymentLinkSection.tsx, useBookingMoves.tsx, BookingDetailPanel.tsx, tests/booking-detail-panel.test.tsx (all found on disk).
- Commits e2c2bc50, 7814419e, 7233fa8b present on the branch; `git rev-list --count` from the plan base = 3.
- `tests/BookingsTable.test.tsx` unchanged.
