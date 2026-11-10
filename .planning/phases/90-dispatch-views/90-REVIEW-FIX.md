---
phase: 90-dispatch-views
fixed_at: 2026-11-10T18:30:00Z
review_path: .planning/phases/90-dispatch-views/90-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 90: Code Review Fix Report

**Fixed at:** 2026-11-10
**Source review:** .planning/phases/90-dispatch-views/90-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (0 critical, 8 warning; Info findings out of scope)
- Fixed: 8
- Skipped: 0

Verification ran in the main checkout (no worktree). Each fix has a test in the same commit that fails without the fix. Full suite at the end: 400 files passed, 2 skipped; 12474 tests passed, 10 skipped, 138 todo. `npx tsc --noEmit` shows the 8 baseline errors only (tests/i18n-translate-dnt, nav-auth, passenger-actions).

## Fixed Issues

### WR-05: A poll that was already in flight overwrites an accepted move

**Files modified:** `components/admin/dispatch/useDispatchBookings.ts`, `tests/use-dispatch-bookings.test.tsx`
**Commit:** ff5391b9
**Applied fix:** `patchRow` now replaces a poll that is still in flight with a new one that starts after the patch, so the old response is dropped by the existing seq check. The loading flag cannot stick, because the new request settles it. Without a request in flight, `patchRow` does not fetch (the existing "patchRow then refresh" test still sees exactly 2 calls).

### WR-04: Completing a card_hold booking does not refresh the open payment panel

**Files modified:** `components/admin/useBookingMoves.tsx`, `tests/use-booking-moves.test.tsx`
**Commit:** 4011cf8b
**Applied fix:** `handleCompleted` calls `bumpPayment(booking.id)`; the test checks the counter stays 0 until the PATCH answers, then is 1.

### WR-06: Panel-driven assignment patches status to "assigned" unconditionally and never refreshes the driver name

**Files modified:** `components/admin/DriverAssignmentSection.tsx`, `components/admin/useBookingMoves.tsx`, `components/admin/BookingDetailPanel.tsx`, `tests/booking-detail-panel.test.tsx`
**Commit:** 9527ae22
**Applied fix:** `DriverAssignmentSection.onAssigned` now passes the `booking_status` the assign route returns (falls back to `'assigned'` when absent). The panel patches that status only when it is real and different (`'unknown'` is ignored), then calls the new `moves.refreshBooking(id)` (publishes `stale`, so every mounted view refetches and shows the driver name). `refreshBooking` was added to `BookingMovesApi`; the `fakeMoves` helper in the test was updated.

### WR-03: A pickup date/time edit leaves `pickup_utc` stale

**Files modified:** `components/admin/BookingDetailPanel.tsx`, `tests/booking-detail-panel.test.tsx`
**Commit:** 0b673911
**Applied fix:** `handleTripUpdated` adds `pickup_utc: null` to the row patch when `pickup_date` or `pickup_time` is in it, so `pickupInstantMs` falls back to the Prague wall clock. Other edits (phone etc.) leave `pickup_utc` alone (tested).
**Not applied:** the suggested extra `onStale` refetch after a datetime save. It is not needed: `bookings.pickup_utc` is a generated column (`prestigo_text_to_utc(pickup_date, pickup_time)`, checked on the live database by the orchestrator), so the next poll returns the correct instant.

### WR-08: A failed save leaves the panel "dirty", which silently freezes all polling

**Files modified:** `components/admin/BookingDetailPanel.tsx`, `components/admin/dispatch/UpdatedAgo.tsx`, `components/admin/dispatch/DispatchBoard.tsx`, `components/admin/dispatch/DispatchCalendar.tsx`, `tests/booking-detail-panel.test.tsx`, `tests/use-dispatch-bookings.test.tsx`
**Commit:** 92667ee8
**Applied fix:** both parts of the suggestion. A notes save that errored and a driver price the save rejected no longer count as dirty, so they do not pause polling. `UpdatedAgo` takes a `paused` prop and shows "Refresh paused while editing" next to "Updated N s ago"; board and calendar pass `pausePolling`. The open trip-edit form still pauses, by design, and now says so.

### WR-07: Old rows stay on screen under a new range or filter; `loading` can stick after a 401

**Files modified:** `components/admin/dispatch/useDispatchBookings.ts`, `tests/use-dispatch-bookings.test.tsx`
**Commit:** 6792ca24
**Applied fix:** when the URL (query) changes, rows, truncated, updatedAt and a non-401 error are reset; `setLoading(true)` is skipped once the hook is stopped by a 401. Reset happens only on a real query change, not on an `enabled` toggle or the repeating poll (tested).

### WR-01: Escape in a board card menu also closes the booking side panel

**Files modified:** `components/admin/BookingSidePanel.tsx`, `tests/booking-detail-panel.test.tsx`
**Commit:** 05cb0e98
**Applied fix:** the panel's Escape listener ignores `defaultPrevented` events, an open `[role="menu"]`, and Escape whose target is inside `input, textarea, select, [role="listbox"], [role="combobox"]`.
**Requires human verification:** a dnd-kit drag cancelled by Escape (mentioned in the review) is not covered; only menu, field, select and listbox are.

### WR-02: Unsaved panel input is discarded silently on Escape or when another card is opened

**Files modified:** `components/admin/BookingDetailPanel.tsx`, `components/admin/BookingPanelProvider.tsx`, `tests/booking-detail-panel.test.tsx`
**Commit:** 1382c4b1
**Applied fix:** the panel now reports a second flag, `discardable`: a typed or invalid driver price, an open trip-edit form, or notes whose save failed. A note still in its debounce is not discardable, because unmount sends it. When the flag is set, `closePanel` (Escape, close button) and `openBooking(other)` ask with `window.confirm('This booking has unsaved changes. Close it and discard them?')` and do nothing if declined. `window.confirm` was chosen because the admin has no shared confirm component (it uses native `alert` elsewhere). English only. With WR-01, Escape typed inside a field no longer reaches the guard at all.
**Requires human verification:** the guard fires for an open trip-edit form even if nothing was typed in it, because the panel cannot see the form's field values. Product call: accept the extra prompt, or have TripEditPanel report whether any field differs.

## Notes for the orchestrator

- Orchestrator correction (WR-03): the fixer suspected that the PATCH route leaves `pickup_utc` stale on the server. That is not the case: `bookings.pickup_utc` is a generated column, `GENERATED ALWAYS AS prestigo_text_to_utc(pickup_date, pickup_time)` (live database, 97 rows, 0 mismatched). No server change is needed; reminders and calendar sync read a correct value.
- `.planning/milestone.lock` and `.planning/state.json` were left uncommitted as instructed; no untracked file was staged.

---

_Fixed: 2026-11-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
