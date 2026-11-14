---
phase: 90-dispatch-views
reviewed: 2026-11-10T00:00:00Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - app/(internal)/admin/(dashboard)/bookings/page.tsx
  - app/api/admin/bookings/dispatch/route.ts
  - components/admin/BookingDetailPanel.tsx
  - components/admin/BookingPanelProvider.tsx
  - components/admin/BookingSidePanel.tsx
  - components/admin/BookingsTable.tsx
  - components/admin/BookingsWorkspace.tsx
  - components/admin/CompleteTripDialog.tsx
  - components/admin/DetailField.tsx
  - components/admin/DriverPickerDialog.tsx
  - components/admin/PaymentLinkSection.tsx
  - components/admin/TripEditPanel.tsx
  - components/admin/bookingMoves.ts
  - components/admin/bookingTypes.ts
  - components/admin/dispatch/BoardCard.tsx
  - components/admin/dispatch/DispatchBoard.tsx
  - components/admin/dispatch/DispatchCalendar.tsx
  - components/admin/dispatch/UpdatedAgo.tsx
  - components/admin/dispatch/boardModel.ts
  - components/admin/dispatch/calendarModel.ts
  - components/admin/dispatch/useDispatchBookings.ts
  - components/admin/dispatch/useDriverNames.ts
  - components/admin/useBookingMoves.tsx
  - lib/admin-shell-prefs.ts
  - lib/google-calendar.ts
  - lib/prague-calendar.ts
  - lib/prague-date.ts
  - lib/trip-duration.ts
  - package.json
  - tests/BookingsTable.test.tsx
  - tests/admin-bookings-dispatch.test.ts
  - tests/admin-bookings-kpi-decoupling.test.tsx
  - tests/admin-shell-prefs.test.ts
  - tests/booking-detail-panel.test.tsx
  - tests/booking-moves.test.ts
  - tests/bookings-workspace.test.tsx
  - tests/complete-trip-dialog.test.tsx
  - tests/dispatch-board.test.tsx
  - tests/dispatch-calendar.test.tsx
  - tests/dispatch-range.test.ts
  - tests/dnd-kit-spike.test.tsx
  - tests/prague-calendar.test.ts
  - tests/use-booking-moves.test.tsx
  - tests/use-dispatch-bookings.test.tsx
findings:
  critical: 0
  warning: 8
  info: 6
  total: 14
status: issues_found
---

# Phase 90: Code Review Report

**Reviewed:** 2026-11-10
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

The new range route is sound: admin gate first, strict date parsing with a calendar round trip, a server-side span cap, a whitelisted trip type, a length-capped search term, a bounded page loop and no-store headers. The pure planner (`planMove`) correctly routes every money-affecting target (complete = capture, cancel, no-show, assign) through a dialog or the assign route, and all PATCHes carry `expected_status`. The Prague-time maths (`pickupInstantMs`, `pragueMinuteOfDay`, `layoutDay`, `monthGrid`, `shiftIsoMonth`) is done through Intl and UTC calendar arithmetic and I found no DST or midnight defect in it.

No BLOCKER-level defect was found. The defects are in the seams between the plans, as expected: the polled rows, the provider snapshot and the optimistic row patches disagree in several places, and the unsaved-input guard (`panelDirty`) only pauses polling while the Escape key and card clicks still discard that input. Items 03, 04, 05 and 06 are visible to the operator as wrong board/calendar/payment state for up to 30 s, or indefinitely while the panel is "dirty".

Moved code (BookingDetailPanel, TripEditPanel, PaymentLinkSection) was reviewed for behaviour that changed in its new host only.

## Warnings

### WR-01: Escape in a board card menu also closes the booking side panel

**File:** `components/admin/BookingSidePanel.tsx:28-36` (interacts with `components/admin/dispatch/BoardCard.tsx:83-89`)
**Issue:** The panel's Escape listener is attached to `document` in the capture phase and only backs off when `[role="dialog"][aria-modal="true"]` exists. The board card "..." menu is `role="menu"`, and its `onMenuKeyDown` calls React `e.stopPropagation()`, which cannot stop a native capture listener that has already run. So with a panel open for card A, opening the menu on card B and pressing Escape closes the panel (and drops its unsaved input, see WR-02) as well as the menu. The same applies to any other non-dialog popup that closes on Escape (native `select`, Places suggestion list in TripEditPanel, a dnd-kit drag that Escape cancels).
**Fix:** Let the panel ignore Escape events that originate from, or happen while focus is inside, another widget that owns Escape.
```tsx
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  if (document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')) return
  const t = e.target as HTMLElement | null
  if (t && t.closest('input, textarea, select, [role="listbox"]') ) return // let the field handle it
  onClose()
}
```

### WR-02: Unsaved panel input is discarded silently on Escape or when another card is opened

**File:** `components/admin/BookingPanelProvider.tsx:86-100, 133-144`, `components/admin/BookingSidePanel.tsx:28-36`
**Issue:** `panelDirty` is tracked, but it only pauses polling. `closePanel()` and `openBooking(other)` (which re-keys `BookingDetailPanel`) unmount the panel regardless. Notes are flushed on unmount, but an open TripEditPanel form (`tripEditOpen`) and a typed-but-unsaved driver price are lost with no prompt. Pressing Escape while typing in the driver-price field, or clicking another board card while a trip-edit form is open, is enough.
**Fix:** When `panelDirty` is true, make `closePanel` / `openBooking(other)` ask for confirmation (or keep the panel and flash the dirty state), and make the Escape handler ignore Escape that originates inside an input/textarea (see WR-01).

### WR-03: A pickup date/time edit leaves `pickup_utc` stale, so the board and calendar show the old time

**File:** `components/admin/TripEditPanel.tsx:245-253`, `components/admin/BookingDetailPanel.tsx:157-160`, consumed by `lib/prague-date.ts:66-69` (`pickupInstantMs`)
**Issue:** The trip-edit save publishes `{ pickup_date, pickup_time }` as the row patch. `pickupInstantMs` prefers `pickup_utc` whenever it is a valid timestamp, and the patch does not touch it. Board card time label, board sort order, calendar day/minute and block placement therefore keep the old instant until the next poll (`pickup_utc` is never written by the PATCH route in this repo). Worse, `tripEditOpen` makes the panel dirty, which pauses polling, so the view stays wrong for as long as the edit form is open.
**Fix:** In the patch sink, invalidate the stale instant so the Prague wall clock of the new date/time is used:
```ts
const handleTripUpdated = useCallback((id: string, patch: Partial<AdminBooking>) => {
  const withInstant = 'pickup_date' in patch || 'pickup_time' in patch ? { ...patch, pickup_utc: null } : patch
  onPatchedRef.current(id, withInstant)
  setPaymentBump(n => n + 1)
}, [])
```
Also trigger a refetch (`onStale`) after a datetime save so the server value replaces the guess.

### WR-04: Completing a card_hold booking does not refresh the open payment panel

**File:** `components/admin/useBookingMoves.tsx:172-178` (`handleCompleted`)
**Issue:** The cancel outcomes call `bumpPayment`, but `handleCompleted` does not. The complete dialog's PATCH is the capture, yet an open `PaymentPanel` for that booking keeps showing the held state (with its release/capture actions) until the next poll happens to change `payment_state` and bump `refreshSignal`. That is up to 30 s, and indefinitely if the panel is dirty or no polling view is mounted (list tab). The operator can act on a hold that no longer exists.
**Fix:**
```ts
const handleCompleted = useCallback((booking: AdminBooking) => {
  onPatched(booking.id, { status: 'completed' })
  bumpPayment(booking.id)
  clearConflict(booking.id)
  showMoveToast(booking.booking_reference, 'completed')
  setCompleteTarget(null)
}, [bumpPayment, clearConflict, onPatched, showMoveToast])
```

### WR-05: A poll that was already in flight overwrites an accepted move (card jumps back, panel reverts)

**File:** `components/admin/dispatch/useDispatchBookings.ts:68-102, 135-139`, `components/admin/dispatch/DispatchBoard.tsx:229-237`
**Issue:** `patchRow` applies the server-accepted change but does not invalidate a fetch that started before the PATCH finished. The board is only paused while dragging or while a dialog is open, so a direct move (drop with no dialog) is unprotected. If the tick's response carries the pre-move status it passes the `seq` check, `setRows` restores the old status, the card jumps back to its old column, and `syncRows` then replaces the panel snapshot with the stale row (and bumps `refreshSignal`). It self-heals on the next poll, but the operator sees a successful move undone.
**Fix:** Make `patchRow` bump the sequence so any response in flight is dropped, and re-read:
```ts
const patchRow = useCallback((id: string, patch: Partial<Row>) => {
  seqRef.current++            // a response requested before this change must not overwrite it
  setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
}, [])
```
(and call `loadRef.current()` after a status patch if the loading flag must not stay stuck, since the aborted request's `finally` is also skipped).

### WR-06: Panel-driven assignment patches status to "assigned" unconditionally and never refreshes the driver name

**File:** `components/admin/BookingDetailPanel.tsx:430-434`, `components/admin/DriverAssignmentSection.tsx:155`
**Issue:** `onAssigned` always reports `'assigned'`, ignoring `booking_status` that the assign route returns (the route leaves a `pending`/`unpaid` booking and a reassign from `en_route`/`on_location` untouched). On the board that moves the card into the Assigned column (or back from En route) although the server did not. Also, unlike the picker path (`handleAssigned`), the panel path publishes no `stale` event, so `driver_id` is not refetched and the card says "Not assigned" in the Assigned column for up to 30 s (longer while the panel is dirty).
**Fix:** Use the server's reported status and request a refetch:
```tsx
onAssigned={(newStatus) => { onPatched(booking.id, { status: newStatus }); moves.refreshBooking?.(booking.id) }}
```
(extend `DriverAssignmentSection.onAssigned` to pass `postData.booking_status`, and have the provider publish `{ type: 'stale' }` for the id).

### WR-07: Old rows stay on screen under a new range or filter, and `loading` can stick after a 401

**File:** `components/admin/dispatch/useDispatchBookings.ts:68-132`
**Issue:** When `url` changes, `rows` from the previous query are kept while the new one loads, and kept after it fails (`error: 'failed'`). The board then shows yesterday's cards under a "Tomorrow" label with only a "Could not load bookings" line, and cards can still be dragged. Separately, after a 401 sets `stoppedRef`, a later query change runs `setLoading(true)` and `load()` returns immediately, so `loading` never goes back to false and "Loading bookings…" is shown beside the session-ended notice.
**Fix:** Reset rows when the key changes, and do not set loading when the hook is stopped:
```ts
setRows([]); setTruncated(false); setUpdatedAt(null)
if (!stoppedRef.current) setLoading(true)
```

### WR-08: A failed save leaves the panel "dirty", which silently freezes all polling

**File:** `components/admin/BookingDetailPanel.tsx:143-154`, `components/admin/BookingPanelProvider.tsx:115`
**Issue:** `dirty = notes !== savedNotes || driverPrice.trim() !== savedDriverPrice || tripEditOpen`. A notes save that errors, an invalid driver price ("1.5", which `saveDriverPrice` rejects), or simply an open trip-edit form that is left open keeps `pausePolling` true. Both views then stop refreshing while "Updated N s ago" keeps counting up and no message says why. On a dispatch board this is the one screen where silent staleness matters.
**Fix:** Show a "Paused while editing" line in `UpdatedAgo`/toolbar when `pausePolling` is true, and exclude the error states from `dirty` (or time-box the pause).

## Info

### IN-01: Unused dependency and a leftover spike test

**File:** `package.json` (`@dnd-kit/utilities`), `tests/dnd-kit-spike.test.tsx`
**Issue:** `@dnd-kit/utilities` is not imported anywhere in `app/`, `components/`, `lib/` or `tests/` (it is already a dependency of `@dnd-kit/core`). The spike test only proves the library mounts and is labelled as a research assumption check.
**Fix:** Remove the direct dependency; fold the spike into the board tests or delete it.

### IN-02: The 62-day cap is duplicated between route and client library

**File:** `app/api/admin/bookings/dispatch/route.ts:14`, `lib/prague-calendar.ts:181`
**Issue:** The route re-declares `MAX_RANGE_DAYS = 62` with a "same value as" comment. The library module is pure and importable server-side, so the two can drift.
**Fix:** `import { MAX_RANGE_DAYS } from '@/lib/prague-calendar'` in the route.

### IN-03: Complete dialog keeps an enabled "Complete trip" button after a 409

**File:** `components/admin/CompleteTripDialog.tsx:78-83, 130-143`
**Issue:** After `status_conflict` the dialog shows the conflict line but still states "Completing captures ..." and leaves the primary button live. The retry carries the same stale `expected_status`, so it can only 409 again (safe, no money moves), but the wording is misleading while the row has already changed.
**Fix:** After a conflict, disable the primary button and rename the secondary to "Close".

### IN-04: Capture amount shown in the dialog comes from a snapshot taken when the move was requested

**File:** `components/admin/useBookingMoves.tsx:140-143`, `components/admin/CompleteTripDialog.tsx:36-39`
**Issue:** `effect` (amount, currency, card_hold vs cash) is computed from the row at request time; a poll or edit during the open dialog can change the payment, but the sentence is not recomputed. The server settles on its own data, so the displayed figure can disagree with what is captured.
**Fix:** Recompute `planMove(...).effect` from the live row at render, or disable the dialog when `payment_state`/`payment_mode` of the live row differ.

### IN-05: Focus is not restored when the opener unmounts, and the calendar view toggle is not a complete tablist

**File:** `components/admin/BookingPanelProvider.tsx:94-100`, `components/admin/dispatch/DispatchCalendar.tsx:222-235`
**Issue:** After a move changes a card's column the opener element is replaced, `opener.isConnected` is false, and focus falls to `body` when the panel closes. The Day/Week/Month control uses `role="tablist"`/`role="tab"` with no `aria-controls`, roving `tabIndex` or arrow-key handling (the outer bookings tabs have them).
**Fix:** Fall back to the card with the same `data-reference` (or the workspace tab); give the calendar toggle `aria-pressed` buttons in a `role="group"` instead of tab roles.

### IN-06: Driver names are loaded once per board mount, and the board range never rolls over at Prague midnight

**File:** `components/admin/dispatch/useDriverNames.ts:19-39`, `components/admin/dispatch/DispatchBoard.tsx:208`
**Issue:** A driver created or renamed after the board mounted shows as "Assigned driver" until remount. The board's "today" range (and the calendar anchor) is computed once, so a board left open overnight keeps showing yesterday under the "Today" pill until the operator clicks it.
**Fix:** Refetch drivers when a card shows an unknown id (or on tab visibility), and recompute the preset range when `getPragueTodayISO()` changes (check in the existing tick).

---

_Reviewed: 2026-11-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
