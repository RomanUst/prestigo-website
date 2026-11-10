---
phase: 90-dispatch-views
plan: 07
subsystem: admin-dispatch
tags: [dispatch, kanban, dnd-kit, react, admin]
requires:
  - components/admin/dispatch/useDispatchBookings.ts, UpdatedAgo.tsx (90-03)
  - components/admin/BookingPanelProvider.tsx, BookingSidePanel.tsx (90-05)
  - components/admin/useBookingMoves.tsx requestMove, bookingMoves.ts planMove (90-04, 90-06)
provides:
  - "DispatchBoard({ search, tripType }): ten-column kanban board (data-testid board-column-{status}, data-drop idle/allowed/blocked)"
  - "BoardCard / BoardCardOverlay / FlagRow / flagsOf: card content (D-06) and the 'Actions for {reference}' menu"
  - "boardModel: BOARD_COLUMNS, ACTIVE_COLUMNS, TERMINAL_COLUMNS, groupByColumn, allowedTargets, resolveDrop, columnDropState, collapseFlags, pickupLabel, isTerminalColumn"
  - "useDriverNames(): driver_id to name map from GET /api/admin/drivers"
affects: [90-09 BookingsWorkspace (mounts the board behind the Board tab)]
key-files:
  created:
    - components/admin/dispatch/boardModel.ts
    - components/admin/dispatch/DispatchBoard.tsx
    - components/admin/dispatch/BoardCard.tsx
    - components/admin/dispatch/useDriverNames.ts
    - tests/dispatch-board.test.tsx
  modified: []
key-decisions:
  - "Column order is written out in boardModel (D-05), never derived from BOOKING_STATUSES; resolveDrop, allowedTargets and the card menu read UI_TRANSITIONS only"
  - "The DragOverlay copy is a presentational BoardCardOverlay: a second useDraggable with the same id would overwrite the original card in the DnD registry"
  - "No KeyboardSensor and no dnd-kit `attributes` on the card: the '...' menu is the keyboard path, and the card keeps its own tabIndex/Enter/Space handler"
  - "The card menu is position: fixed (flips up near the bottom edge, closes on scroll) so a scrolling column cannot clip it; it stops pointer/touch events so a press on it never starts a drag"
  - "On a multi-day range the card shows the Prague day before the time ('2 Nov 09:00'); a single day shows the time only"
  - "The driver list is fetched once on mount; a failed fetch leaves cards saying 'Assigned driver'"
requirements-completed: [DISP-01, DISP-02, DISP-04, DISP-05]
actuals:
  tokens: 16800
  tasks: 3
  commits: 3
plan_head_before: 8b7f003b51081e7a2dabe54bab3ee6d8b099666e
plan_head_after: b7419ea2ae56013cea1414e77df975151cd622a5
commits: 3
completed: 2026-11-10
status: complete
coverage:
  - id: D1
    description: "Ten columns in D-05 order, cards sorted by pickup instant with the reference tie-break, empty range shows ten columns with count 0 and one line"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/dispatch-board.test.tsx (DispatchBoard - tracer, boardModel - grouping, states)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Range bar: Today, Tomorrow, 7 days in Prague dates and a Custom range of at most 62 days; first fetch is today in Prague"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/dispatch-board.test.tsx (range bar D-07, tracer fixed-Date fetch URL)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A card moves through its menu or a drop via requestMove(.., 'board') with no optimistic move; a 409 keeps the card and refetches; only UI_TRANSITIONS targets are offered or accepted"
    requirement: DISP-02
    verification:
      - kind: unit
        ref: "tests/dispatch-board.test.tsx (menu move, 409, resolveDrop matrix, drag and drop, terminal rails)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A card click opens the shared side panel; patched and stale events and syncRows keep board and panel in step"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/dispatch-board.test.tsx (click opens booking-panel PRE-A; patched event moves the card after the server answer)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The board polls every 30 s through useDispatchBookings, pauses while dragging, a move dialog is open or the panel has unsaved input, and shows 'Updated N s ago'"
    requirement: DISP-05
    verification:
      - kind: unit
        ref: "tests/dispatch-board.test.tsx (does not poll while dragged, catch-up fetch after cancel); tests/use-dispatch-bookings.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Drag feel on desktop (6 px start) and touch (250 ms hold), drop highlighting, DragOverlay position, sticky-looking collapsed rails, card layout at 1440 px and on a phone, menu placement"
    requirement: DISP-02
    verification: []
    human_judgment: true
    rationale: "jsdom cannot drive pointer or touch gestures or judge layout; localhost admin login is blocked by the fail-closed Upstash limiter, so this is owner UAT on the deployed admin."
---

# Phase 90 Plan 07: Kanban dispatch board Summary

**A ten-column dispatch board (unpaid to no_show in flow order, completed/cancelled/no_show as collapsed rails) with dnd-kit drag-and-drop restricted to UI_TRANSITIONS targets, a keyboard and touch "..." menu, full D-06 cards, a Prague-date range bar and a one-column phone layout, all moving cards only through the shared `requestMove(.., 'board')` after the server accepted.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Ten ordered columns, menu move through the PATCH and the server's answer, panel open on click | 683030aa |
| 2 | Drag-and-drop, allowed-column highlighting, disabled droppables, collapsed rails, drag pause | 3a03cbc8 |
| 3 | Card content, range bar, load/error/truncated/empty states, phone layout, useDriverNames | b7419ea2 |

Tracer gate: the tracer `<verify>` (board and colour tests, tsc, eslint) was re-run green before expanding ("Tracer verified end-to-end - expanding").

## What was built

- **boardModel.ts** (pure): column constants in D-05 order, `groupByColumn` (comparePickup: instant, then reference; flags never reorder), `allowedTargets` / `resolveDrop` / `columnDropState` from `UI_TRANSITIONS` only, `collapseFlags`, `pickupLabel` (Prague time from the instant, with the day on multi-day ranges).
- **DispatchBoard.tsx**: opens on `dispatchRange('today')`; `useDispatchBookings({ paused: dragged !== null || pausePolling })`; `syncRows` after every load; `patched` events patch the row, `stale` events refetch. One `DndContext` (PointerSensor distance 6, TouchSensor delay 250 / tolerance 8, `pointerWithin`), one permanently mounted `DragOverlay`. Each column is a `useDroppable` disabled when blocked and carries `data-drop`; allowed columns get an accent outline, blocked ones fade. Terminal rails are collapsed buttons (label, count, `aria-expanded`) with the droppable on the rail itself. Range bar, error/truncated/loading/empty lines, and below 768 px a `Column` select with counts, one column, no drag.
- **BoardCard.tsx**: time, reference, route, driver ("Not assigned" / name / "Assigned driver"), vehicle label, `PaymentStateBadge` exactly as the list decides, flags (no-show chip, Fee decision, Cash while not cash_settled, GNet; more than three collapse into `+N` with a title), client name and `amount_czk` as `Intl.NumberFormat('cs-CZ')` plus " CZK", the 409 conflict line, and the `Actions for {reference}` menu (role menu / menuitem, Open then `Move to {Label}` per UI_TRANSITIONS target, Escape and outside click close it and return focus, arrow keys move).
- **useDriverNames.ts**: one fetch of `/api/admin/drivers`, empty map on failure.

## Verification

- `npx vitest run tests/dispatch-board.test.tsx tests/dnd-kit-spike.test.tsx tests/use-booking-moves.test.tsx tests/booking-moves.test.ts tests/admin-no-hardcoded-colors.test.ts tests/use-dispatch-bookings.test.tsx`: 339/339 pass (`tests/dispatch-board.test.tsx` alone: 42).
- `npx tsc --noEmit`: only the 8 baseline errors (`i18n-translate-dnt` 2, `nav-auth` 5, `passenger-actions` 1); none in `components/admin/dispatch` or `tests/dispatch-board`.
- `npx eslint --quiet components/admin/dispatch tests/dispatch-board.test.tsx`: clean.
- Acceptance greps: `requestMove(` in BoardCard (2); no `VALID_TRANSITIONS` outside comments in boardModel; no `pickup_time` on a BoardCard line without `pickupInstantMs` (0, the raw text is never read there); no euro sign under `components/admin/dispatch`; `useDroppable` 2, `disabled` 2, `DragOverlay` 3, `distance: 6` 1, `KeyboardSensor` 0; `/api/admin/drivers` 1, `Not assigned` 2, `validateCustomRange` 2, `PaymentStateBadge` 2; no `transform|will-change|filter|contain:` style in the dispatch folder (one comment line only).

## Deviations from Plan

**1. [Judgment] `columnDropState` and `pickupLabel` written in Task 1, not Task 2/3**
- They are pure helpers next to `resolveDrop`; writing the model once avoided a second edit of the same file. Task 2 still has its own tests for `columnDropState`.

**2. [Judgment] The four-flag case is tested through `FlagRow`, not through a real booking**
- Plan behaviour: "a card with four flags shows three and a '+1' chip". With the four flags the plan names, Fee decision (never for a GNet booking) and the GNet chip are mutually exclusive, so a real booking tops out at three flags and `+N` can never appear from live data today. The collapse is implemented as asked (`collapseFlags`, `FlagRow`) and tested with four synthetic flags; a real three-flag card is tested to show no `+N`. It becomes reachable as soon as a fifth flag type is added.

**3. [Judgment] Overlay content asserted through a wrapped `DragOverlay`**
- `DragOverlay` renders children only for dnd-kit's own active drag, which the tests (calling the `DndContext` handlers directly, per Pitfall 10) do not start. The test wraps `DragOverlay` and reads the children the board passed; "permanently mounted" is asserted as mounted-before-any-drag.

**4. [Rule 2 - Missing critical] Multi-day ranges show the Prague day on the card**
- On a 7-day or custom range a bare time is ambiguous across days. Added the short Prague day before the time only when the range spans several days (`pickupLabel(.., true)`); a single day is unchanged.

**5. [Process] tdd="true" tasks committed test and code together** (no separate RED commit), as in the earlier plans of this phase.

**Total deviations:** 5 (1 Rule 2, 3 judgment, 1 process). No shared module was changed; nothing in BookingPanelProvider, BookingSidePanel, useBookingMoves, bookingMoves, bookingTypes, useDispatchBookings, UpdatedAgo, lib/prague-calendar or lib/admin-shell-prefs was touched.

## Known Stubs

None. The board is not reachable from any route yet: plan 90-09 mounts it behind the Board tab.

## Threat Flags

None. No new endpoint, no new write path: every move goes through `requestMove`, which uses the existing PATCH with `expected_status`, cancel, no-show and assign routes. T-90-17: disallowed columns are disabled droppables, `resolveDrop` and `planMove` both read `UI_TRANSITIONS` (matrix-tested for every status and column), and the board applies nothing before the server accepted (tested: card stays in its column while the PATCH is held, and after a 409).

## Notes for plan 90-09 (and the orchestrator)

- Mount `<DispatchBoard search tripType />` inside `BookingPanelProvider`; it calls `useBookingPanel()` and throws outside it. It owns its range (today by default) and ignores the list's `DispatchDefault`.
- The board has no wrapper with `transform`, `filter`, `will-change` or `contain`; keep the workspace wrappers the same (the side panel and the card menu are `position: fixed`).
- The board fetches `/api/admin/drivers` once on mount (name lookup). Nothing else is requested besides the dispatch route and the shared panel's own calls.

## Needs an owner look in a browser (not coverable in jsdom)

1. Desktop at 1440 px with the sidebar open: seven active columns plus three rails fit without page scroll (the board scrolls inside its own container on narrower screens); cards readable at about 140 px column width.
2. Drag a card with the mouse: a 6 px move starts it, a plain click still opens the panel; only allowed columns light up, others fade; dropping on a blocked column, outside the columns or on the own column changes nothing; the overlay follows the pointer; the dragged card stays dimmed in place.
3. Drag onto a collapsed rail (completed, cancelled): accepted when allowed; cancelled opens the cancel dialog, completed a card_hold or cash booking opens the complete dialog.
4. Touch: a 250 ms hold starts a drag while a plain swipe still scrolls the column; on a phone width (below 768 px) the Column picker shows one column and the "..." menu moves cards.
5. The "..." menu opens above or below the button without clipping inside a scrolling column, and Escape returns focus to the button.
6. Colours and contrast of the allowed-column outline and the faded blocked columns in both admin themes.

## Self-Check: PASSED

- Created files exist: boardModel.ts, DispatchBoard.tsx, BoardCard.tsx, useDriverNames.ts, tests/dispatch-board.test.tsx.
- Commits 683030aa, 3a03cbc8, b7419ea2 present; `git rev-list --count 8b7f003b..HEAD` = 3 before this SUMMARY commit.
- STATE.md and ROADMAP.md untouched; the node_modules symlink is ignored by .gitignore and not committed.
