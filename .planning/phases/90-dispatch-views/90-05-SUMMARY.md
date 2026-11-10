---
phase: 90-dispatch-views
plan: 05
subsystem: ui
tags: [react, admin, bookings, side-panel, provider]

requires:
  - phase: 90-dispatch-views
    provides: "BookingDetailPanel, useBookingMoves, AdminBooking (plan 90-01)"
provides:
  - "BookingPanelProvider / useBookingPanel / useBookingEvents / BookingEvent / BookingPanelValue: one host for the selected booking, one useBookingMoves instance and the side panel"
  - "BookingSidePanel: right-hand sheet (data-testid booking-panel) with close button, Escape dialog guard, focus handling"
  - "A bookings list that only opens bookings in the side panel (no inline expansion on desktop or mobile)"
affects: [90-06 move routing, 90-07 board, 90-08 calendar, 90-09 BookingsWorkspace]

actuals:
  tokens: 19000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Views never talk to each other: row changes are published as BookingEvent ('patched' / 'stale') through the provider and each mounted view merges them"
    - "Provider owns selection through a ref plus state (commitSelected) so callbacks stay stable and read the latest snapshot"
    - "Panel Escape listener runs in the capture phase and bails out while any [role=dialog][aria-modal=true] is in the DOM"

key-files:
  created:
    - components/admin/BookingPanelProvider.tsx
    - components/admin/BookingSidePanel.tsx
  modified:
    - components/admin/BookingsTable.tsx
    - components/admin/BookingDetailPanel.tsx
    - components/admin/TripEditPanel.tsx
    - app/(internal)/admin/(dashboard)/bookings/page.tsx
    - tests/BookingsTable.test.tsx
    - tests/booking-detail-panel.test.tsx

key-decisions:
  - "openBooking takes an optional second argument (the opener element): a click on a table row leaves focus on body, so document.activeElement cannot identify the row; rows and cards are tabIndex 0 and pass currentTarget"
  - "Provider exposes setReferenceSearchHandler so the list can keep the Paired outbound chip; views that register nothing get plain text"
  - "Opening the already selected booking is a no-op on the snapshot (kept current by events and syncRows)"
  - "The list calls syncRows(bookings) in an effect on every rows change; syncRows only bumps the payment refresh when status or payment_state differ"

patterns-established:
  - "useBookingEvents(listener) with a latest-listener ref"
  - "Dirty reporting: panel computes dirty from local state versus last saved value (savedNotes, savedDriverPrice, tripEditOpen) and reports through onDirtyChange; provider turns it into pausePolling"

requirements-completed: [DISP-04]

coverage:
  - id: D1
    description: "A row click (desktop) or card click (mobile) opens the booking in the shared side panel; the list stays visible; another click switches the booking"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx (83 cases, all through renderWithPanel) + tests/booking-detail-panel.test.tsx BookingPanelProvider block"
        status: pass
    human_judgment: false
  - id: D2
    description: "Escape and the close button close the panel, focus returns to the opener, Escape is ignored while a dialog is open"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/booking-detail-panel.test.tsx (Escape cases, dialog guard)"
        status: pass
    human_judgment: false
  - id: D3
    description: "pausePolling is true for unsaved notes, unsaved driver price, an open trip-edit form and an open move dialog; syncRows refreshes the snapshot and the payment panel without touching typed text"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/booking-detail-panel.test.tsx (pausePolling and syncRows describes, list wiring test)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The side panel looks right: width, shadow, layering above the sidebar and below modals, full-width on a phone, no clipping"
    verification: []
    human_judgment: true
    rationale: "No browser check from a worktree (admin needs login and Supabase env); jsdom covers behaviour, not layout or z-order."

duration: 35min
completed: 2026-11-10
status: complete
plan_head_before: 191af1689c4c9aabc0ce2a4743ce7e99f1ea1e81
plan_head_after: bb19b15e1cc30895e8778ef7af93ebc248e55f59
commits: 3
---

# Phase 90 Plan 05: Shared side panel Summary

**The bookings list now opens bookings only in a right-hand side panel hosted by a BookingPanelProvider (one selection, one useBookingMoves instance with its dialogs mounted once, event fan-out to views), with Escape/focus/dialog-guard handling, an unsaved-input polling pause and a syncRows that keeps the panel current without losing typing.**

## Performance

- **Duration:** about 35 min
- **Tasks:** 3 (1 tracer, 1 auto, 1 tdd)
- **Files:** 2 created, 6 modified

## Accomplishments

- Task 1 (tracer): provider, side panel, table without row expansion (no TanStack expanded model, static chevron), page wraps the table in the provider, table tests rendered through `renderWithPanel`. Tracer re-verify (table, KPI-decoupling, panel suites; tsc; eslint) passed before expanding.
- Task 2: mobile cards open the same panel (`aria-current`, selected background); the per-card expansion map and expanded block are gone; the two tests that looked inside the old expanded card now query `booking-panel`. Test count unchanged.
- Task 3: Escape (capture phase) with the dialog guard, focus to the close button on open and back to the opener on close, `onDirtyChange` / `onEditOpenChange`, `pausePolling`, `syncRows` with the payment refresh signal. RED run showed 9 failing tests first, then green.

## Task Commits

1. Task 1: `e4ad84c3` feat(90-05): list rows open the shared side panel through BookingPanelProvider
2. Task 2: `919efa65` feat(90-05): mobile cards open the same side panel, inline expansion removed
3. Task 3: `bb19b15e` feat(90-05): side panel Escape guard, focus return, unsaved-input pause and syncRows refresh

## Verification

- `npx vitest run tests/booking-detail-panel.test.tsx tests/BookingsTable.test.tsx tests/PaymentPanel.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-bookings-kpi-decoupling.test.tsx tests/cancel-booking-dialog.test.tsx tests/no-show-banner.test.tsx tests/DriverAssignmentSection.test.tsx`: 277/277 pass.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet` on every changed file: clean.
- Acceptance greps: no `getExpandedRowModel|ExpandedState|onExpandedChange` in the table; no `.dialogs` in the table, 1 in the provider; no `expandedCards`; no `<BookingDetailPanel` in the table; `booking-panel` 2+ times in the table tests; 83 `it(` cases in `tests/BookingsTable.test.tsx`; 0 `transform|willChange|will-change|filter:` in the side panel.

## Deviations from Plan

**1. [Rule 2 - Missing critical] Paired outbound chip kept through `setReferenceSearchHandler`**
- **Found during:** Task 1
- **Issue:** the chip in the panel filters the list by a reference. With the panel hosted by the provider, the panel has no access to the table's search state; the chip would have silently turned into plain text on the list.
- **Fix:** `BookingPanelValue` gained `setReferenceSearchHandler(handler | null)`. The list registers its handler in an effect; the provider passes it to `BookingDetailPanel.onSearchReference`. Board and calendar register nothing and get plain text.
- **Files:** BookingPanelProvider.tsx, BookingsTable.tsx. **Commit:** e4ad84c3

**2. [Rule 3 - Blocking] `openBooking(b, opener?)` takes an optional opener element**
- **Found during:** Task 1 / 3
- **Issue:** the plan returns focus "to the row or card that opened it", but clicking a `<tr>` or card `<div>` leaves `document.activeElement` on `body`, so remembering the active element returns nothing.
- **Fix:** optional second argument; rows and cards are `tabIndex={0}` (Enter/Space on the focused row opens it) and pass `currentTarget`. Without the argument the provider falls back to `document.activeElement`. Callers that pass only a booking still satisfy the interface.
- **Commit:** e4ad84c3, 919efa65

**3. [Rule 2 - Missing critical] The list calls `syncRows(bookings)` on every rows change**
- **Found during:** Task 3
- **Issue:** the plan completes `syncRows` in the provider, but nothing fed it rows, so the panel would still go stale after a refetch (Pitfall 4).
- **Fix:** one effect in the table. Covered by a test that changes a row's status between list loads and then drops the row from the list.
- **Commit:** bb19b15e

**4. [Judgment] Mobile card conflict line hidden while its panel is open**
- Plan 90-01 flagged that the 409 line could show twice (card and panel). On a phone the panel covers the cards, but the DOM held both; the card's line now renders only when the card is not the selected one.

**5. [Process] Task 3 `tdd="true"` committed as one commit** (tests and implementation together). The RED run was done (9 failures) before the implementation, but not committed separately.

**Total deviations:** 5 (2 Rule 2, 1 Rule 3, 1 judgment, 1 process). None change the plan's contracts; interfaces gained only optional members.

## Known Stubs

None.

## Threat Flags

None. T-90-12: the table renders no dialogs element (grep gate), the provider renders them once, and a test opens the cancel dialog next to an open panel and finds one radiogroup. T-90-13: notes still flush on unmount (90-01), local inputs are keyed by booking id and not re-seeded, `pausePolling` covers unsaved input, and a test types notes, runs `syncRows` and checks the text survives.

## Notes for the next plans

- `pausePolling` exists but nothing polls yet; the board/calendar (90-07, 90-08) or the workspace (90-09) must honour it.
- `selected` is a snapshot; a view that is not in the rows list must not assume it is fresh (use `subscribe` events and `syncRows`).
- The provider currently sits in `bookings/page.tsx` around the table; 90-09 moves it into `BookingsWorkspace`. The page keeps `key={refreshKey}` on the table only, so a manual booking creation does not close the panel.
- Do not add CSS transforms, filters, `will-change` or `contain` to the workspace wrappers: the panel is `position: fixed` (Pitfall 6).
- `useBookingMoves` returns a new object every render, so `useBookingPanel().moves` is not stable either; use its members in effect dependencies.

## Needs an owner look in a browser (not coverable in jsdom)

1. /admin/bookings on desktop: click a row, panel slides in on the right above the sidebar, list stays clickable, selected row highlighted, no horizontal clipping of the 560 px panel on a narrow laptop.
2. /admin/bookings at phone width: card click opens a full-width sheet; closing returns to the list.
3. Open the cancel or no-show dialog from the panel: dialog above the panel (z-index 100 vs 80); Escape closes only the dialog.
4. Keyboard: Tab to a row, Enter opens, Escape closes, focus returns to the row.

## Self-Check: PASSED

- Created files exist: BookingPanelProvider.tsx, BookingSidePanel.tsx.
- Commits e4ad84c3, 919efa65, bb19b15e present; `git rev-list --count` from the plan base = 3.
- STATE.md and ROADMAP.md untouched.
