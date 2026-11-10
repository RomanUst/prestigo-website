---
phase: 90-dispatch-views
verified: 2026-11-10T15:20:00Z
status: human_needed
score: 4/4 must-haves verified
covered_files:
  - ".planning/phases/90-dispatch-views/90-01-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-01-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-02-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-02-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-03-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-03-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-04-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-04-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-05-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-05-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-06-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-06-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-07-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-07-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-08-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-08-SUMMARY.md"
  - ".planning/phases/90-dispatch-views/90-09-PLAN.md"
  - ".planning/phases/90-dispatch-views/90-09-SUMMARY.md"
  - "app/(internal)/admin/(dashboard)/bookings/page.tsx"
  - "app/api/admin/bookings/dispatch/route.ts"
  - "components/admin/BookingDetailPanel.tsx"
  - "components/admin/BookingPanelProvider.tsx"
  - "components/admin/BookingSidePanel.tsx"
  - "components/admin/BookingsTable.tsx"
  - "components/admin/BookingsWorkspace.tsx"
  - "components/admin/CompleteTripDialog.tsx"
  - "components/admin/DetailField.tsx"
  - "components/admin/DriverPickerDialog.tsx"
  - "components/admin/PaymentLinkSection.tsx"
  - "components/admin/TripEditPanel.tsx"
  - "components/admin/bookingMoves.ts"
  - "components/admin/bookingTypes.ts"
  - "components/admin/dispatch/BoardCard.tsx"
  - "components/admin/dispatch/DispatchBoard.tsx"
  - "components/admin/dispatch/DispatchCalendar.tsx"
  - "components/admin/dispatch/UpdatedAgo.tsx"
  - "components/admin/dispatch/boardModel.ts"
  - "components/admin/dispatch/calendarModel.ts"
  - "components/admin/dispatch/useDispatchBookings.ts"
  - "components/admin/dispatch/useDriverNames.ts"
  - "components/admin/useBookingMoves.tsx"
  - "lib/admin-shell-prefs.ts"
  - "lib/prague-calendar.ts"
  - "lib/prague-date.ts"
  - "lib/trip-duration.ts"
covered_digest: "v2:sha256:96b8d65f5b046bfd794c9b26a3fce8467aadf3a7970b486320d58e9e85f27889"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Drag a card with a real mouse and with touch on /admin/bookings?view=board (1440 px and a phone width)"
    expected: "A 6 px mouse move starts a drag, a plain click still opens the side panel; touch needs a ~250 ms hold so scrolling still works; only allowed columns are outlined, others fade; a drop on an allowed column sends the move and the card stays in place until the server answers; on a phone the cards are not draggable and the '...' menu moves them."
    why_human: "jsdom cannot measure pointer feel, sensor activation or layout. Tests only assert the sensor configuration and the drop handler."
  - test: "Move a card to Completed (card-hold booking) and to Cancelled from the board; then provoke a stale move (change the booking's status in another tab / via a driver step, then move the old card)"
    expected: "Completed opens a dialog that states 'Completing captures <amount> from the client's card' before anything is sent; Cancelled opens the cancel dialog with the release / fee sentence; the stale move shows the conflict line, the card stays in its column, and the board refetches."
    why_human: "Needs a real hold, real Stripe test state and a real race; unit tests mock the PATCH."
  - test: "Open the Calendar tab with the OS timezone set to a non-Prague zone (for example America/Los_Angeles and Asia/Tokyo) and navigate to the week of 2027-03-28 and 2027-10-31 (or the equivalent live DST weeks), with a booking just after and just before Prague midnight"
    expected: "Each booking sits in the column of its Prague date at its Prague wall-clock time, in day, week and month views; colours follow the status."
    why_human: "Tests run Intl under TZ=America/Los_Angeles and several zones in Node, not in a real browser engine with a real OS zone."
  - test: "With the Board and then the Calendar open and idle, let a driver tap a step (or change the booking's status from the driver trip page), do not reload"
    expected: "Within about 30 s (+ request time) the card changes column / the calendar block changes colour and 'Updated N s ago' resets. Also confirm the board does not freeze while a detail panel is open without edits."
    why_human: "Needs a real driver trip link and a deployed build; tests prove the 30 s interval, pause rules and row replacement with fake timers only."
  - test: "Right-hand panel layering and Escape behaviour: open a card, open another card's '...' menu and press Escape; open the cancel dialog from the panel and press Escape; type in the notes/driver-price field and press Escape"
    expected: "Panel sits above the sidebar and below modals, no clipped fixed positioning inside the admin shell. NOTE review WR-01/WR-02: Escape in a card menu or in an input is expected to ALSO close the panel and drop unsaved input today; the operator should decide whether that is acceptable before release."
    why_human: "Visual stacking and focus behaviour; known open review warnings affect it."
  - test: "Accepted-move race (WR-05): drop a card on an allowed column exactly while a 30 s poll is in flight (hard to time; throttle the network in devtools to make the poll slow)"
    expected: "Documented risk: the card may jump back for up to one poll and then settle in the new column. Operator should confirm this is tolerable or schedule the fix."
    why_human: "Timing race that needs a real browser network."
---

# Phase 90: Dispatch Views Verification Report

**Phase Goal:** The operator sees and moves the day's bookings visually - a kanban board by status and a calendar in Prague time - and watches driver progress appear without reloading.
**Verified:** 2026-11-10
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

Everything the four roadmap success criteria require exists, is substantive, is wired end to end (workspace tabs -> board / calendar -> polling hook -> admin-only range route -> existing `admin_search_bookings` RPC -> rows -> shared panel provider -> shared move hook -> existing PATCH / cancel / no-show / assign routes) and is covered by tests that I re-ran and that pass. No criterion is failed. The status is `human_needed` rather than `passed` because several things that make this phase's goal real (drag feel, layout, a real browser under a non-Prague timezone, a real driver step reaching the board) cannot be proven without a browser, and because eight code-review warnings are still open (two of them touch the move and refresh behaviour the criteria describe).

### Observable Truths

| #   | Truth (ROADMAP success criterion) | Status | Evidence |
| --- | --------------------------------- | ------ | -------- |
| 1 | Operator sees bookings as a kanban board by status for a chosen date range; clicking any card or calendar entry opens the same booking detail panel as the list | VERIFIED | `BoardColumn` model has the ten ordered columns (`boardModel.ts` ACTIVE_COLUMNS + TERMINAL_COLUMNS, sorted by pickup instant with reference tie-break). `DispatchBoard.tsx` has Today / Tomorrow / 7 days / Custom (validated, max 62 days) and fetches `/api/admin/bookings/dispatch`. `BoardCard` (click, Enter, Space), `CalendarBlock` and `MonthItem` all call `openBooking` from `useBookingPanel`; `BookingsTable.tsx` rows and mobile cards call the same `openBooking` (lines 695, 967); `BookingDetailPanel` is mounted in exactly one place (`BookingPanelProvider`, plus its own file and `PaymentPanel` reference). Tests: `dispatch-board.test.tsx` (click opens panel, ranges), `dispatch-calendar.test.tsx` (block / month item open panel), `bookings-workspace.test.tsx`, `booking-detail-panel.test.tsx` all pass. |
| 2 | Move a card by drag-and-drop or card menu; only allowed transitions accepted; money-effect moves ask for confirmation stating the effect; a stale move is rejected and the card returns to its column | VERIFIED (see WR-05 caveat) | Drag: `DndContext` with `PointerSensor` (distance 6) + `TouchSensor` (250 ms), `resolveDrop` returns a target only when `UI_TRANSITIONS` allows it, blocked columns are disabled droppables (tests assert resolveDrop === UI_TRANSITIONS for every status x column). Menu: `CardMenu` offers exactly `UI_TRANSITIONS[status]`. Both go through `moves.requestMove(booking, to, 'board')` -> pure `planMove` (`bookingMoves.ts`): assign -> driver picker (assign route), no_show -> confirm modal, cancel on board -> `CancelBookingDialog` (states release / refund / late-fee sentence), complete on card_hold / cash_guarantee -> `CompleteTripDialog` ("Completing captures <amount> from the client's card" / cash sentence) which is the only thing that sends the PATCH; partner (GNet) bookings skip money paths. Stale: every PATCH carries `expected_status`; server route accepts it (`app/api/admin/bookings/route.ts` line 92/378); on 409 `status_conflict` the hook shows the conflict line, calls `onStale` (refetch) and applies nothing. There is no optimistic update, so the card never leaves its column unless the server accepted - tests `dispatch-board.test.tsx` ("a 409 status_conflict keeps the card where it is ... refetches at once", "card moves only after the answer"), `use-booking-moves.test.tsx` (complete dialog sends nothing until primary, double-submit guard, rejected `confirmed -> completed`) pass. Caveat: WR-05 (accepted move can be visually undone by an in-flight poll for up to one interval) is real in code - see warnings. |
| 3 | Calendar with day, week and month views in Prague time, coloured by status; a booking around midnight lands on the correct Prague day regardless of browser timezone, including DST weeks | VERIFIED (browser confirmation listed under human) | `DispatchCalendar.tsx` renders Day / Week / Month with Prev / Next / Today, remembered view (cookie), Show all toggle; colours come from `--status-<family>-*` tokens via `STATUS_FAMILY`. Day, minute and weekday come only from `lib/prague-calendar.ts` / `calendarModel.ts` (Intl with `Europe/Prague`, UTC calendar arithmetic) - I found no local Date getter, `Date(y,m,d)` or local `toISOString` on the placement path. `pickupInstantMs` resolves the DST gap/overlap. The fetch window and the RPC both use the Prague `pickup_date` text, so fetch and display agree. Tests: `prague-calendar.test.ts` runs the helpers under several `TZ` values (describe.each ZONES) including both DST changes; `dispatch-calendar.test.tsx` runs under `TZ=America/Los_Angeles`: 2027-10-31T00:30Z lands in the Sunday column at 02:30, 2027-10-31T23:30Z lands on 1 Nov (week and month), 2027-03-28 01:00Z sits at 03:00, both 02:30 pickups show on the 25 h day. All pass. |
| 4 | When a driver taps a step, board and calendar update on their own without a reload | VERIFIED mechanism (live end-to-end listed under human) | `useDispatchBookings` loads at once and every `DISPATCH_POLL_MS = 30_000` while the tab is visible and not paused; the newest request wins (seq guard); a 401 stops polling; `UpdatedAgo` shows freshness. Board and calendar both use it, and the workspace mounts only the active view. The route returns `to_jsonb(bookings.*)` rows, so a driver-driven `status` / `driver_id` change is in the next payload. Pauses only for drag, open money dialog, or an unsaved panel (D-16). Tests: `use-dispatch-bookings.test.tsx` (30 s tick, no tick at 29.999 s, pause + catch-up, hidden tab, 401, 500 retry), `dispatch-calendar.test.tsx` (polls every 30 s, pause while dialog open), `dispatch-board.test.tsx` (no poll while dragging), `bookings-workspace.test.tsx` (only active view polls). No Supabase Realtime (DISP-F2 is deferred by design). |

**Score:** 4/4 roadmap truths verified (0 present-but-behaviour-unverified: each behaviour-dependent truth has a passing test that exercises the transition / pause / refetch).

### Deferred Items

None. No gap is addressed by a later phase; later phases (91+) do not cover dispatch views.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `components/admin/BookingDetailPanel.tsx` (488 lines) | Shared detail panel extracted from `BookingsTable` | VERIFIED | Mounted once by `BookingPanelProvider`; `BookingsTable` shrank to 1077 lines and delegates via `useBookingPanel` |
| `components/admin/BookingPanelProvider.tsx`, `BookingSidePanel.tsx` | One host, one move hook, one side panel for list / board / calendar | VERIFIED | Events (`patched` / `stale`), `syncRows`, `pausePolling`, Escape guard, focus return |
| `components/admin/useBookingMoves.tsx`, `bookingMoves.ts` | Shared routing; pure planner on `UI_TRANSITIONS` | VERIFIED | `requestMove`, double-submit guard, toast, no optimism |
| `components/admin/CompleteTripDialog.tsx`, `DriverPickerDialog.tsx` | Money-effect confirmation; assign entry | VERIFIED | Effect stated before PATCH; assign goes through the assign route |
| `components/admin/dispatch/DispatchBoard.tsx`, `BoardCard.tsx`, `boardModel.ts` | Kanban | VERIFIED | Ten columns, drag + menu, ranges, states, phone layout |
| `components/admin/dispatch/DispatchCalendar.tsx`, `calendarModel.ts` | Calendar | VERIFIED | Day / week / month, overlap layout, "+N", Show all |
| `components/admin/dispatch/useDispatchBookings.ts`, `UpdatedAgo.tsx`, `useDriverNames.ts` | Polling hook and freshness label | VERIFIED | See truth 4 |
| `components/admin/BookingsWorkspace.tsx`, `app/(internal)/admin/(dashboard)/bookings/page.tsx` | List / Board / Calendar tabs, shared filters, remembered view | VERIFIED | Server page resolves first view from ?view / ?search / cookie via closed unions; only active view mounted |
| `app/api/admin/bookings/dispatch/route.ts` | Admin-only range read | VERIFIED | Admin gate first (401/403), strict date parse with round trip, 62-day cap, trip-type whitelist, 100-char search cap, page loop capped at 500 rows, `no-store` |
| `lib/prague-calendar.ts`, `lib/prague-date.ts`, `lib/trip-duration.ts`, `lib/admin-shell-prefs.ts` | Prague maths, duration, remembered-view cookies | VERIFIED | Pure, Intl-based |
| `@dnd-kit/core` 6.3.1 | DnD library | VERIFIED | In `package.json`, used by board and card |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `BookingsWorkspace` | `DispatchBoard` / `DispatchCalendar` / `BookingsTable` | tabs inside one `BookingPanelProvider` | WIRED | `view === 'board'` / `'calendar'` / `'list'` |
| `DispatchBoard`, `DispatchCalendar` | `/api/admin/bookings/dispatch` | `useDispatchBookings` (fetch, 30 s) | WIRED | URL built from range + search + tripType |
| dispatch route | `admin_search_bookings` RPC | `supabase.rpc` with `p_sort: 'pickup_asc'`, page loop | WIRED | RPC returns `to_jsonb(row)` incl. status, driver_id, pickup_utc |
| `BoardCard` / `CalendarBlock` / `BookingsTable` row | `BookingDetailPanel` | `openBooking` -> provider -> `BookingSidePanel` | WIRED | one panel instance |
| Board drop / card menu | PATCH / cancel / no-show / assign routes | `requestMove` -> `planMove` -> handler or dialog | WIRED | all PATCHes carry `expected_status` |
| `useBookingMoves` outcomes | views | `onPatched` -> `publish('patched')` -> `useBookingEvents` -> `patchRow`; `onStale` -> `refresh` | WIRED | |
| Panel / views | each other | `syncRows(rows)` after every load | WIRED | keeps open panel current |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `DispatchBoard` cards | `rows` | `useDispatchBookings` -> dispatch route -> `admin_search_bookings` over `bookings` | Yes (DB query, not static) | FLOWING |
| `DispatchCalendar` blocks | `rows` -> `toCalendarItems` | same | Yes | FLOWING |
| Card driver name | `driverNames` | `useDriverNames` (existing drivers endpoint) | Yes; falls back to "Assigned driver" | FLOWING |
| Card pickup time | `pickupInstantMs(pickup_utc / pickup_date+time)` | row; `pickup_utc` is a generated column in the DB (D-22, see `lib/payments/edit-hook.ts`) | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase's own 15 test files | `npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**' <15 phase files>` | 15 files, 701 tests passed | PASS |
| Type check | `npx tsc --noEmit` | 8 errors = the documented baseline (tests/ only) | PASS |
| Lint of phase sources | `npx eslint --quiet components/admin/dispatch components/admin/BookingsWorkspace.tsx components/admin/BookingPanelProvider.tsx components/admin/useBookingMoves.tsx app/api/admin/bookings/dispatch lib/prague-calendar.ts` | no findings | PASS |
| Debt markers | grep `TBD|FIXME|XXX` over phase sources | none | PASS |

Step 7b note: I did not start a server or a browser (none available; localhost admin login is rate-limit blocked). The full workspace suite was run once by the orchestrator (400 files / 12455 tests); I re-ran only the phase files.

### Probe Execution

SKIPPED: no probes are declared in the phase plans and none exist for this phase.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| DISP-01 | 90-02, 90-03, 90-07, 90-09 | Kanban board by status for a chosen date range | SATISFIED | Truth 1 |
| DISP-02 | 90-04, 90-06, 90-07 | Move by drag-and-drop or menu; allowed transitions only; money-effect confirmation | SATISFIED (WR-05 caveat) | Truth 2 |
| DISP-03 | 90-02, 90-08, 90-09 | Calendar day / week / month in Prague time, coloured by status | SATISFIED | Truth 3 |
| DISP-04 | 90-01, 90-05, 90-07, 90-08, 90-09 | Click opens the same detail panel as the list | SATISFIED | Truth 1 |
| DISP-05 | 90-03, 90-07, 90-08 | Board and calendar refresh automatically | SATISFIED (mechanism) | Truth 4 |

All five IDs appear in plan frontmatter and in REQUIREMENTS.md; REQUIREMENTS.md maps no other ID to Phase 90, so there are no orphaned requirements. Housekeeping for the orchestrator: REQUIREMENTS.md still shows DISP-01..05 as `[ ]` / "Pending" (lines 64-68, 154-158); tick them at phase transition.

### Anti-Patterns Found

No stubs, placeholders, static-return endpoints, hollow props or unreferenced debt markers in the phase's files. The open items are the code-review warnings below; none is a BLOCKER by the criteria's wording because the server-side state is always correct and each one self-heals or is cosmetic to the operator, but they should be triaged before release (the disposition file still has all 14 findings at `open`).

| Finding | Where | Severity here | Effect on the success criteria |
| ------- | ----- | ------------- | ------------------------------ |
| WR-05 in-flight poll overwrites an accepted move | `useDispatchBookings.ts:135-139` (`patchRow` does not bump `seqRef`) - confirmed in code | WARNING (most relevant) | Criterion 2/4: after a direct (no-dialog) move the card can jump back to the old column and the panel snapshot revert until the next poll (<= 30 s). Server is correct. Recommend the one-line fix from the review before release. |
| WR-03 pickup edit leaves `pickup_utc` stale in the client row | `BookingDetailPanel.tsx:157-160`, `TripEditPanel.tsx:245-253` | WARNING | Criterion 3: shown time/day stale only until the next refetch. `pickup_utc` is a generated column, so the server value is correct on the next load; polling is paused while the edit form is open, so it is stale for as long as the form is open. Not a permanent wrong-day. |
| WR-08 failed save / open edit form freezes polling silently | `BookingDetailPanel.tsx:143-154` | WARNING | Criterion 4: auto-refresh can be paused with no indication while the panel is "dirty". |
| WR-07 old rows stay under a new range; `loading` can stick after 401 | `useDispatchBookings.ts:68-132` | WARNING | Criterion 1: stale cards under a new range label after a failed load. |
| WR-01 Escape in a card menu also closes the panel | `BookingSidePanel.tsx:28-36` | WARNING | UX; closes panel and drops input. |
| WR-02 unsaved panel input discarded on Escape / switching card | `BookingPanelProvider.tsx` | WARNING | UX; data loss of unsaved notes / driver price / trip-edit form. |
| WR-04 completing a card_hold does not refresh the open payment panel | `useBookingMoves.tsx:172-178` | WARNING | Panel can show a hold that was just captured until the next poll; the server rejects duplicate capture, so no money risk was found. |
| WR-06 panel-driven assign always patches status "assigned", no driver-name refetch | `BookingDetailPanel.tsx:430-434` | WARNING | Card may be in the wrong column / say "Not assigned" for up to one poll. |
| IN-01..IN-06 | various | INFO | Unused `@dnd-kit/utilities`, duplicated 62-day constant, 409 dialog wording, snapshot capture amount, focus restore, board range does not roll over at Prague midnight. |

### Human Verification Required

See the `human_verification` list in the frontmatter (six items): drag feel with mouse and touch plus layout at 1440 px and phone width; money-effect dialogs and a real stale move; calendar under a non-Prague OS timezone across the DST weeks; a real driver step appearing on board and calendar without reload; panel layering and the Escape behaviour (WR-01/WR-02); and the WR-05 race.

### Gaps Summary

No gaps. All four roadmap success criteria are implemented, wired and test-backed, and all five requirement IDs are accounted for. The phase is not marked `passed` only because browser-only behaviour must be confirmed by a person and eight open review warnings (notably WR-05, WR-03, WR-08 on the refresh/move path) should be consciously accepted or fixed before this goes to production. If the operator wants the warnings closed first, run `/gsd-code-review 90 --fix` (or a targeted plan), starting with WR-05 (a one-line `seqRef.current++` in `patchRow`), WR-04, WR-06, WR-03.

---

_Verified: 2026-11-10_
_Verifier: Claude (gsd-verifier)_
