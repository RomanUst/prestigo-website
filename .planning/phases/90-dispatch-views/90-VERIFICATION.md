---
phase: 90-dispatch-views
verified: 2026-11-10T19:10:00Z
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
  - "components/admin/DriverAssignmentSection.tsx"
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
  - "tests/BookingsTable.test.tsx"
  - "tests/DriverAssignmentSection.test.tsx"
  - "tests/PaymentPanel.test.tsx"
  - "tests/admin-bookings-dispatch.test.ts"
  - "tests/admin-shell-prefs.test.ts"
  - "tests/booking-detail-panel.test.tsx"
  - "tests/booking-moves.test.ts"
  - "tests/bookings-workspace.test.tsx"
  - "tests/cancel-booking-dialog.test.tsx"
  - "tests/complete-trip-dialog.test.tsx"
  - "tests/dispatch-board.test.tsx"
  - "tests/dispatch-calendar.test.tsx"
  - "tests/dispatch-range.test.ts"
  - "tests/dnd-kit-spike.test.tsx"
  - "tests/no-show-banner.test.tsx"
  - "tests/prague-calendar.test.ts"
  - "tests/prague-date.test.ts"
  - "tests/use-booking-moves.test.tsx"
  - "tests/use-dispatch-bookings.test.tsx"
covered_digest: "v2:sha256:10b87381b4f399defe566c9a928fdae54e296479b3ed91dd409eca05a7e95dcc"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/4
  gaps_closed:
    - "WR-05 accepted move undone by an in-flight poll (ff5391b9)"
    - "WR-04 open payment panel not refreshed after a complete-trip capture (4011cf8b)"
    - "WR-06 panel assign forced status 'assigned' and never refreshed the driver name (9527ae22)"
    - "WR-03 pickup edit left pickup_utc stale in the client row (0b673911)"
    - "WR-08 failed save silently froze polling, no hint in the toolbar (92667ee8)"
    - "WR-07 old rows stayed under a new range; loading stuck after a 401 (6792ca24)"
    - "WR-01 Escape in a card menu / field / select closed the side panel (05cb0e98)"
    - "WR-02 unsaved panel input discarded silently on Escape / close / switching card (1382c4b1)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Drag a card with a real mouse and with touch on /admin/bookings?view=board (1440 px and a phone width)"
    expected: "A 6 px mouse move starts a drag, a plain click still opens the side panel; touch needs a ~250 ms hold so scrolling still works; only allowed columns are outlined, others fade; a drop on an allowed column sends the move and the card stays in place until the server answers; on a phone the cards are not draggable and the '...' menu moves them. Also press Escape in the middle of a mouse drag with the panel open: dnd-kit cancels the drag, and the panel may close at the same time (not covered by the WR-01 fix)."
    why_human: "jsdom cannot measure pointer feel, sensor activation or layout. Tests only assert the sensor configuration and the drop handler."
  - test: "Move a card to Completed (card-hold booking) and to Cancelled from the board; then provoke a stale move (change the booking's status in another tab / via a driver step, then move the old card)"
    expected: "Completed opens a dialog that states 'Completing captures <amount> from the client's card' before anything is sent; Cancelled opens the cancel dialog with the release / fee sentence; the stale move shows the conflict line, the card stays in its column, and the board refetches. With the booking's panel open during a Completed move, the payment section stops offering capture/release for the hold that was just captured (WR-04)."
    why_human: "Needs a real hold, real Stripe test state and a real race; unit tests mock the PATCH."
  - test: "Open the Calendar tab with the OS timezone set to a non-Prague zone (for example America/Los_Angeles and Asia/Tokyo) and navigate to the week of 2027-03-28 and 2027-10-31 (or the equivalent live DST weeks), with a booking just after and just before Prague midnight"
    expected: "Each booking sits in the column of its Prague date at its Prague wall-clock time, in day, week and month views; colours follow the status. After editing a booking's pickup date or time in the panel, the block moves to the new day/time at once (WR-03)."
    why_human: "Tests run Intl under TZ=America/Los_Angeles and several zones in Node, not in a real browser engine with a real OS zone."
  - test: "With the Board and then the Calendar open and idle, let a driver tap a step (or change the booking's status from the driver trip page), do not reload"
    expected: "Within about 30 s (plus request time) the card changes column / the calendar block changes colour and 'Updated N s ago' resets. The board does not freeze while a detail panel is open without edits. While the panel holds unsaved input or a dialog is open the toolbar shows 'Refresh paused while editing' (WR-08)."
    why_human: "Needs a real driver trip link and a deployed build; tests prove the 30 s interval, pause rules and row replacement with fake timers only."
  - test: "Right-hand panel layering and Escape behaviour: open a card, open another card's '...' menu and press Escape; open the cancel dialog from the panel and press Escape; focus the notes field, the driver-price field and the Status select and press Escape; type a driver price (do not save), press Escape with focus on the close button; open 'Edit Trip Details' and click the close button or another card"
    expected: "Panel sits above the sidebar and below modals, no clipped fixed positioning inside the admin shell. Escape in a card menu closes only the menu; Escape inside a field or select does not close the panel (WR-01). With a typed driver price or an open trip-edit form, Escape outside a field, the close button and opening another card ask 'This booking has unsaved changes. Close it and discard them?' and keep the panel when declined (WR-02). Known edge to judge (see Warning W-1): typing a driver price and then clicking the close button or another card goes through blur, which already sends the save, yet the prompt still appears for the length of that request; declining is harmless. Escape typed in a toolbar field outside the panel (board custom range, search box) no longer closes the panel either."
    why_human: "Visual stacking, focus and native confirm dialogs; the prompt behaviour is a product call."
  - test: "Accepted-move race (WR-05): drop a card on an allowed column exactly while a 30 s poll is in flight (throttle the network in devtools to make the poll slow)"
    expected: "The card stays in the new column and does not jump back (WR-05, fixed: the in-flight poll is replaced by a fresh request). After a pickup time edit in the panel the card moves at once (WR-03); while the panel holds unsaved input the toolbar shows 'Refresh paused while editing' (WR-08)."
    why_human: "Timing race that needs a real browser network."
---

# Phase 90: Dispatch Views Verification Report

**Phase Goal:** The operator sees and moves the day's bookings visually - a kanban board by status and a calendar in Prague time - and watches driver progress appear without reloading.
**Verified:** 2026-11-10 (re-verification, after the 8 review-warning fixes ff5391b9..1382c4b1)
**Status:** human_needed
**Re-verification:** Yes - after code-review fixes. The four roadmap criteria were re-checked against the code as it is now; the nine files changed since 6df2948c were read in full.

## Goal Achievement

The code review fixes touch the polling hook, the panel provider, the side panel, the detail panel, the move hook and the assign callback. I read each in full and traced the paths the fixes could have disturbed. None of the four success criteria regressed, and all eight warnings are closed in code. One new warning (W-1, a false-positive confirm prompt) and a few notes are below; none is a blocker. The status stays `human_needed` because drag feel, layout, a real non-Prague OS timezone, a real driver step and native confirm behaviour need a browser, which was not available.

### Observable Truths

| #   | Truth (ROADMAP success criterion) | Status | Evidence |
| --- | --------------------------------- | ------ | -------- |
| 1 | Operator sees bookings as a kanban board by status for a chosen date range; clicking any card or calendar entry opens the same booking detail panel as the list | VERIFIED | Unchanged wiring: `DispatchBoard` and `DispatchCalendar` use `useBookingPanel().openBooking`, `BookingsTable` uses the same call, `BookingDetailPanel` is mounted only by `BookingPanelProvider.tsx:153-165`. The fixes added behaviour on the open path only: `openBooking` now calls `confirmDiscard()` when switching to a different booking and returns early for the same id (`BookingPanelProvider.tsx:98-110`), so it cannot block a first open (`selectedRef.current` is null) and does not fire for the open booking. WR-07 now clears rows when the range or filter changes (`useDispatchBookings.ts:122-129`), so the cards under a new range label are never the old range's. `dispatch-board.test.tsx`, `dispatch-calendar.test.tsx`, `bookings-workspace.test.tsx`, `booking-detail-panel.test.tsx` pass. |
| 2 | Move a card by drag-and-drop or card menu; only allowed transitions accepted; money-effect moves ask for confirmation stating the effect; a stale move is rejected and the card returns to its column | VERIFIED | Move path unchanged: `requestMove` -> `planMove` -> direct PATCH with `expected_status` / dialogs; `useBookingMoves.tsx:97-157` untouched except `handleCompleted` now also `bumpPayment(booking.id)` (line 182, WR-04) and the new `refreshBooking` (lines 170-172). 409 handling at lines 107-111 unchanged (conflict line + `onStale`). WR-05 closes the one caveat from the first report: `patchRow` now replaces an in-flight poll (`useDispatchBookings.ts:151-156`), so the accepted move is not undone by a pre-move response. `use-booking-moves.test.tsx`, `dispatch-board.test.tsx` pass. |
| 3 | Calendar with day, week and month views in Prague time, coloured by status; a booking around midnight lands on the correct Prague day regardless of browser timezone, including DST weeks | VERIFIED (browser confirmation under human) | Placement code (`lib/prague-calendar.ts`, `calendarModel.ts`) is untouched. WR-03 patches `pickup_utc: null` into the client row when `pickup_date` or `pickup_time` was saved (`BookingDetailPanel.tsx:172-178`); `pickupInstantMs` falls back to the Prague wall clock for a null `pickup_utc` (`lib/prague-calendar.ts:47, 74-75` use it that way), and the server column is generated from date + time, so the next load returns the right instant. Edits that touch neither field leave `pickup_utc` alone. `prague-calendar.test.ts` (several zones, both DST changes) and `dispatch-calendar.test.tsx` pass. |
| 4 | When a driver taps a step, board and calendar update on their own without a reload | VERIFIED mechanism (live end-to-end under human) | Hook still loads on mount and every `DISPATCH_POLL_MS = 30_000` while the tab is visible and not paused, newest request wins, 401 stops it (`useDispatchBookings.ts:70-148`). See "Regression check" below for pause/resume and the changed `patchRow`. `UpdatedAgo` now also says "Refresh paused while editing" when `pausePolling` is true. `use-dispatch-bookings.test.tsx` (30 s tick, no tick at 29.999 s, pause + catch-up, hidden tab, 401, 500 retry, WR-05/07/08 cases) passes. |

**Score:** 4/4 roadmap truths verified (0 present-but-behaviour-unverified).

### Regression check of the review fixes

Method: read the nine changed files in full, traced each path, and for the three scenarios that had no test ran a throwaway test (created and deleted again; `git status` shows no leftover file).

| Area | Result | Evidence |
| ---- | ------ | -------- |
| Polling every 30 s, pause/resume | No regression | The interval, `pausedRef`, `missedTickRef`, visibility handler and catch-up effect are unchanged (`useDispatchBookings.ts:60-68, 113-137`). The new `loadedUrlRef` reset only runs inside the `[url, enabled, intervalMs]` effect and only when the URL differs from the one the rows belong to, so neither the repeating poll nor an `enabled` toggle clears rows (test "keeps the rows when only the poll repeats"). |
| `patchRow` re-request while the hook is stopped by a 401 | Safe | A 401 sets `stoppedRef`, and the `finally` block resets `inFlightRef` (lines 84-88, 102-106), so `patchRow` sees no request in flight; `load()` also returns at once when stopped (line 74). Throwaway test: after a 401, `patchRow` then 60 s of timers = still exactly 1 fetch. Also with the 401 arriving on a request that `patchRow` itself started: `loading` ends false, later `patchRow` is silent. |
| `patchRow` re-request while polling is paused | Not a new violation | It only fires when a request is already in flight, and it replaces that request one for one (the old response would have been applied while paused anyway). With no request in flight, `patchRow` does nothing even when paused. Throwaway test: paused + in flight + `patchRow` = exactly one replacement request, then no further request for 25 s of paused ticks. |
| Reload loops (patchRow -> load -> syncRows -> patchRow) | None found | `load` never calls `patchRow`; `syncRows` (`BookingPanelProvider.tsx:122-133`) calls `commitSelected` and a state bump but never `publish`, so it cannot call `patchRow`. `handleAssigned` calls `onPatched` (publish `patched` -> `patchRow`) and `refreshBooking` (publish `stale` -> `refresh`); `refresh` does not publish. The one cycle with moving parts is PaymentPanel `onPaymentState` -> `handlePaymentState` -> `onPatched` -> `patchRow` -> (reload only if a poll is in flight) -> `syncRows` -> `refreshSignal` -> PaymentPanel refetch; each lap needs a request in flight again, so it ends after one lap and cannot spin. |
| `inFlightRef` / `loadedUrlRef` consistency | OK | `inFlightRef` is set true in `load`, reset only by the settling request of the current seq or by the effect cleanup; a request that was replaced or aborted leaves it to its successor (the replaced one fails the `seq !== seqRef.current` guard in `try` and `finally`). `loading` cannot stick: the request that replaces another is the one that settles it (test WR-05 asserts `loading === false`). |
| `handleAssigned` identity churn | Harmless | `handleAssigned` (`BookingDetailPanel.tsx:182-187`) lists `moves` in its deps, and `moves` is a new object each provider render, so the callback is re-created on most renders. It is only handed to `DriverAssignmentSection` as `onAssigned`, which calls it once after the assign request and never uses it in an effect or dependency array (`DriverAssignmentSection.tsx:68-112` depends on `bookingId` only). `moves.refreshBooking` itself is stable (`useCallback([onStale])`, `onStale` = stable `handleStale`). One stale-closure detail: the callback captured at click time compares against the `booking.status` of that render; a status change during the assign request at worst causes one redundant patch or none, and the `stale` refetch that follows corrects it. The status the server reports is honoured (`assign/route.ts:101, 127, 205`), so a reassign from `en_route` no longer forces `assigned`. |
| Confirm firing twice | No | One capture-phase Escape listener (`BookingSidePanel.tsx:31-41`), `closePanel`/`confirmDiscard` are stable (no re-registration), no other component handles Escape for the panel (`grep` over `components/admin`: only `Modal` and the card menu). A same-booking `openBooking` returns before `confirmDiscard`. Switching booking asks once; the old panel's unmount cleanup resets the flag (`BookingDetailPanel.tsx:167-169`) before the new one mounts. |
| Confirm when nothing was typed | No for the plain cases | `discardable` is false by default; a note still in its debounce is not discardable (the unmount sends it); an untouched driver price equals the saved value. Test "does not ask when nothing would be lost" passes. Two false-positive edges are listed under W-1 and I-1. |
| Escape closes the panel where it should | Yes, with a narrowing | Escape with focus on the close button, a card, the panel background or the body still closes it (guarded only by a modal dialog, an open `[role="menu"]`, or a target inside `input, textarea, select, [role="listbox"], [role="combobox"]`). Only the card "..." menu renders `role="menu"` in the admin (conditionally, `BoardCard.tsx:155-158`), so no permanent element can swallow Escape. The target test is not limited to the panel (see I-2). |
| Panel assign flow | Works | Assign -> `handleAssigned` -> status patched only when real and different, then `refreshBooking` -> every view refetches and shows the driver name. The picker path (`useBookingMoves.handleAssigned`, lines 160-166) is unchanged and still patches `assigned` and calls `onStale`. `DriverAssignmentSection.test.tsx` and `booking-detail-panel.test.tsx` pass. |

### Deferred Items

None. No gap is addressed by a later phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `components/admin/BookingDetailPanel.tsx` (515 lines) | Shared detail panel | VERIFIED | Mounted once by the provider; now reports `dirty` and `discardable`, patches `pickup_utc: null` on a pickup edit, follows the assign route's reported status |
| `components/admin/BookingPanelProvider.tsx`, `BookingSidePanel.tsx` | One host, one move hook, one side panel | VERIFIED | `confirmDiscard` guard on close and on switching card; Escape guard for menu, fields, selects |
| `components/admin/useBookingMoves.tsx`, `bookingMoves.ts` | Shared routing, pure planner | VERIFIED | New `refreshBooking` on `BookingMovesApi`; `handleCompleted` bumps the payment panel |
| `components/admin/DriverAssignmentSection.tsx` | Assign entry shared by the panel and the picker | VERIFIED | `onAssigned(status: string)` passes the route's `booking_status`, falls back to `'assigned'` |
| `components/admin/CompleteTripDialog.tsx`, `DriverPickerDialog.tsx` | Money-effect confirmation; assign entry | VERIFIED | Unchanged |
| `components/admin/dispatch/DispatchBoard.tsx`, `BoardCard.tsx`, `boardModel.ts` | Kanban | VERIFIED | Board only changed by passing `paused` to `UpdatedAgo` |
| `components/admin/dispatch/DispatchCalendar.tsx`, `calendarModel.ts` | Calendar | VERIFIED | Same one-line change |
| `components/admin/dispatch/useDispatchBookings.ts`, `UpdatedAgo.tsx`, `useDriverNames.ts` | Polling hook and freshness label | VERIFIED | `inFlightRef`, `loadedUrlRef`, re-request in `patchRow`, paused hint |
| `components/admin/BookingsWorkspace.tsx`, `app/(internal)/admin/(dashboard)/bookings/page.tsx` | Tabs, shared filters, remembered view | VERIFIED | Unchanged |
| `app/api/admin/bookings/dispatch/route.ts` | Admin-only range read | VERIFIED | Unchanged |
| `lib/prague-calendar.ts`, `lib/prague-date.ts`, `lib/trip-duration.ts`, `lib/admin-shell-prefs.ts` | Prague maths, duration, remembered view | VERIFIED | Unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `BookingsWorkspace` | `DispatchBoard` / `DispatchCalendar` / `BookingsTable` | tabs inside one `BookingPanelProvider` | WIRED | |
| `DispatchBoard`, `DispatchCalendar` | `/api/admin/bookings/dispatch` | `useDispatchBookings` (fetch, 30 s) | WIRED | |
| dispatch route | `admin_search_bookings` RPC | `supabase.rpc`, `p_sort: 'pickup_asc'` | WIRED | returns `to_jsonb(row)` incl. status, driver_id, pickup_utc |
| `BoardCard` / `CalendarBlock` / `BookingsTable` row | `BookingDetailPanel` | `openBooking` -> provider -> `BookingSidePanel` | WIRED | one panel instance |
| Board drop / card menu | PATCH / cancel / no-show / assign routes | `requestMove` -> `planMove` -> handler or dialog | WIRED | all PATCHes carry `expected_status` |
| `useBookingMoves` outcomes | views | `onPatched` -> `publish('patched')` -> `patchRow`; `onStale` -> `refresh` | WIRED | `refreshBooking` (panel assign) also goes through `onStale` |
| Panel assign | views | `handleAssigned` -> `onPatched` (real status) + `moves.refreshBooking` | WIRED | new in this round |
| Panel dirty state | polling | `onDirtyChange(dirty, discardable)` -> `panelDirty` -> `pausePolling` -> hook `paused`; `discardable` -> `confirmDiscard` | WIRED | `dirty` pauses, `discardable` asks |
| Panel / views | each other | `syncRows(rows)` after every load | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `DispatchBoard` cards | `rows` | `useDispatchBookings` -> dispatch route -> `admin_search_bookings` | Yes | FLOWING |
| `DispatchCalendar` blocks | `rows` -> `toCalendarItems` | same | Yes | FLOWING |
| Card driver name | `driverNames` | `useDriverNames`; refreshed by the `stale` event after a panel assign | Yes | FLOWING |
| Card pickup time | `pickupInstantMs(pickup_utc / pickup_date+time)` | row; after a pickup edit the client row carries `pickup_utc: null`, so the wall clock is used until the next load, which returns the generated column | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase test files plus consumers of the changed code (19 files) | `npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**' tests/BookingsTable.test.tsx tests/DriverAssignmentSection.test.tsx tests/PaymentPanel.test.tsx tests/admin-bookings-dispatch.test.ts tests/admin-shell-prefs.test.ts tests/booking-detail-panel.test.tsx tests/booking-moves.test.ts tests/bookings-workspace.test.tsx tests/cancel-booking-dialog.test.tsx tests/complete-trip-dialog.test.tsx tests/dispatch-board.test.tsx tests/dispatch-calendar.test.tsx tests/dispatch-range.test.ts tests/prague-calendar.test.ts tests/use-booking-moves.test.tsx tests/use-dispatch-bookings.test.tsx tests/no-show-banner.test.tsx tests/dnd-kit-spike.test.tsx tests/prague-date.test.ts` | 19 files, 834 tests passed | PASS |
| Hook edge cases without a test (throwaway file, deleted): `patchRow` after 401; 401 on a `patchRow`-started request; `patchRow` paused with nothing in flight; `patchRow` paused with a request in flight | `npx vitest run tests/zz-tmp-reverify2.test.tsx` | 4/4 passed (no request after 401, `loading` false, one replacement request while paused and no loop) | PASS |
| Confirm prompt while the driver-price save is already in flight (throwaway file, deleted) | type 1200, `blur` (PATCH sent), click the close button, assert no confirm | FAILED the assertion: `window.confirm` was called once | Confirms W-1 |
| Type check / full suite | measured by the orchestrator | `tsc`: 8 baseline errors in `tests/` only; full vitest 400 files, 12474 passed, 0 failed | PASS |
| Lint of changed files | `npx eslint --quiet components/admin/BookingDetailPanel.tsx components/admin/BookingPanelProvider.tsx components/admin/BookingSidePanel.tsx components/admin/DriverAssignmentSection.tsx components/admin/useBookingMoves.tsx components/admin/dispatch` | no findings | PASS |
| Debt markers | grep `TBD|FIXME|XXX` over the same files | none | PASS |

No server or browser was started. Both throwaway test files were removed; `git status` shows only the pre-existing `.planning/milestone.lock` and `.planning/state.json` changes and untracked files.

### Probe Execution

SKIPPED: no probes are declared in the phase plans and none exist for this phase.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| DISP-01 | 90-02, 90-03, 90-07, 90-09 | Kanban board by status for a chosen date range | SATISFIED | Truth 1 |
| DISP-02 | 90-04, 90-06, 90-07 | Move by drag-and-drop or menu; allowed transitions only; money-effect confirmation | SATISFIED (WR-05 now closed) | Truth 2 |
| DISP-03 | 90-02, 90-08, 90-09 | Calendar day / week / month in Prague time, coloured by status | SATISFIED | Truth 3 |
| DISP-04 | 90-01, 90-05, 90-07, 90-08, 90-09 | Click opens the same detail panel as the list | SATISFIED | Truth 1 |
| DISP-05 | 90-03, 90-07, 90-08 | Board and calendar refresh automatically | SATISFIED (mechanism) | Truth 4 |

No orphaned requirements. Housekeeping unchanged: REQUIREMENTS.md still shows DISP-01..05 as `[ ]` / "Pending"; tick them at phase transition.

### Anti-Patterns Found

No stubs, placeholders, static returns, hollow props or unreferenced debt markers in the changed files. All eight review warnings from the first report are closed in code (see `re_verification.gaps_closed`). New findings from this round, none blocking:

| ID | Where | Severity | Finding |
| -- | ----- | -------- | ------- |
| W-1 | `components/admin/BookingDetailPanel.tsx:156-159` | WARNING (UX, not a phase criterion) | `discardable` counts `driverPrice.trim() !== savedDriverPrice` even while that very value is being saved. The price field saves on blur (`:438`) and on Enter (`:429`), and `savedDriverPrice` only moves forward after the PATCH answers (`:138`). A click on the close button or on another card first blurs the field (the save is sent), then runs `closePanel` / `openBooking`, which asks "This booking has unsaved changes. Close it and discard them?" for the length of the request. Failing scenario (reproduced with a throwaway test): type 1200 in Driver Price, blur, click "Close booking panel" with the PATCH still pending -> `window.confirm` is called once, although nothing would be lost. Declining is harmless, accepting is also safe (the save continues), so it is a nuisance, not data loss. Suggested fix: add `&& driverPriceSaving !== 'saving'` to the price term of `discardable` (the existing test only changes the field without blurring, so it does not cover this). |
| I-1 | `BookingDetailPanel.tsx:151-153` | INFO | Edge: a value that parses to the saved number but is spelled differently (`007`, `10.0`, `1e3`) stays unequal to `savedDriverPrice` after a successful save, so the panel stays dirty (polling paused, confirm on close). Rare; same cause existed for the polling pause before this round. |
| I-2 | `components/admin/BookingSidePanel.tsx:36` | INFO | The Escape exemption is not limited to the panel: with the focus in a toolbar input outside the panel (board custom range dates, the search box) or a toolbar select, Escape no longer closes the open panel. Matches the UAT wording for fields inside the panel; whether to scope it to `aside` is a product call. A dnd-kit drag cancelled with Escape still also closes the panel (the fixer already flagged this). |
| I-3 | `BookingDetailPanel.tsx:106-118, 156-159` | INFO | After a failed notes save the field stays in `error`; text typed afterwards is still in its debounce and counts as discardable although the unmount would send it. The prompt says "discard" when the close actually saves it. Over-cautious, not lossy. |
| I-4 | `useBookingMoves.tsx:170-172`, `BookingDetailPanel.tsx:186` | INFO | `refreshBooking` publishes `stale`, which refetches regardless of the pause flag (same as the existing 409 path). A panel assign while the price field holds unsaved input therefore refetches during the pause; the panel keeps its local input (keyed by booking id), so nothing is lost. |

**W-1 closed after this report (orchestrator, commit b4dfbb0c):** `discardable` now ignores a driver price whose save is in flight (`driverPriceSaving !== 'saving'`); regression test "does not ask while a blurred driver price is still being saved" in `tests/booking-detail-panel.test.tsx` fails without the fix. Type check at baseline, panel and dispatch test files green.

### Human Verification Required

See the `human_verification` list in the frontmatter (six items, expectations aligned with `90-UAT.md`): drag feel with mouse and touch plus layout at 1440 px and a phone width; money-effect dialogs and a real stale move (plus the payment panel refresh after Completed); calendar under a non-Prague OS timezone across the DST weeks (plus the pickup-edit move); a real driver step appearing without reload and the "Refresh paused while editing" hint; panel layering, Escape and the unsaved-input prompt (including W-1); the accepted-move race.

### Gaps Summary

No gaps. All four roadmap success criteria still hold in the code after the eight review fixes, the requirement IDs are accounted for, and the fixes introduced no regression in polling, pause/resume, move/drag and conflict handling, side panel open/close/Escape, the panel assign flow, or the 401 and reload-loop paths. One warning (W-1, a false-positive confirm while the driver price is being saved) is worth a one-line fix before release; it does not affect any success criterion. The phase is `human_needed` only because browser behaviour could not be checked here.

---

_Verified: 2026-11-10 (re-verification)_
_Verifier: Claude (gsd-verifier)_
