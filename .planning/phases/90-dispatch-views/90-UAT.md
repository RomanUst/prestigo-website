---
status: complete
phase: 90-dispatch-views
source: [90-VERIFICATION.md]
started: 2026-11-10T15:40:00Z
updated: 2026-11-11T19:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Drag a card with a real mouse and with touch on /admin/bookings?view=board (1440 px and a phone width)
expected: A 6 px mouse move starts a drag, a plain click still opens the side panel; touch needs a ~250 ms hold so scrolling still works; only allowed columns are outlined, others fade; a drop on an allowed column sends the move and the card stays in place until the server answers; on a phone the cards are not draggable and the "..." menu moves them.
result: pass
verified_by: Claude in the owner's Chrome on production (rideprestigo.com), TEST bookings only, 2026-11-11
note: Real mouse drag Pending -> Confirmed sent PATCH with expected_status and the card stayed (faded) in Pending until the 200 arrived (3.9 s). Plain click opens the side panel. Mid-drag: only Assigned (dashed outline) and Cancelled stay at opacity 1, every other column fades to 0.45; a drop on a blocked column sends nothing. Touch: a quick swipe does not start a drag, a 320 ms hold does (touch events were synthesised in the page, not a physical finger). Below 768 px the board shows one column with a column select, the card is not draggable and the "..." menu offers Open / Move to Assigned / Move to Cancelled.

### 2. Move a card to Completed (card-hold booking) and to Cancelled from the board; then provoke a stale move (change the booking's status in another tab or via a driver step, then move the old card)
expected: Completed opens a dialog that states "Completing captures <amount> from the client's card" before anything is sent; Cancelled opens the cancel dialog with the release / fee sentence; the stale move shows the conflict line, the card stays in its column, and the board refetches.
result: pass
verified_by: Claude in the owner's Chrome on production, TEST bookings only, 2026-11-11
note: Move to Cancelled opens the cancel dialog (who cancelled, "Nothing was collected. Only the status changes." for a booking without money) and nothing is sent before Cancel booking; confirming calls POST /api/admin/bookings/cancel (200) and the card leaves its column. Stale move (status changed outside the page, then the old card dragged): server 409, conflict line on the card, card not moved locally, board refetched. NOT observed in a browser: the "Completing captures <amount> from the client's card" dialog and the release / fee sentence for a card booking, because a manual TEST booking has no card on file; both stay covered by automated tests only (owner decision 2026-11-11, see Deferred Follow-Ups).

### 3. Open the Calendar tab with the OS timezone set to a non-Prague zone (for example America/Los_Angeles and Asia/Tokyo) and navigate to the week of 2027-03-28 and 2027-10-31 (or the equivalent live DST weeks), with a booking just after and just before Prague midnight
expected: Each booking sits in the column of its Prague date at its Prague wall-clock time, in day, week and month views; colours follow the status.
result: pass
verified_by: Claude in the owner's Chrome on production, TEST bookings only, 2026-11-11
note: Browser timezone was Europe/Prague. Week, day and month views put the four TEST bookings (15:00, 16:00, 17:00->19:00, 23:30) in the Thu 12 Nov column / cell at their Prague times; the 23:30 booking stays on 12 Nov and is marked "continues"; confirmed is blue, cancelled is red. The DST weeks render seven distinct days and 24 hour rows (Mon 22 - Sun 28 Mar 2027, Mon 25 - Sun 31 Oct 2027), month grids for March and October 2027 have no duplicate or missing day. NOT observed in a browser: a non-Prague OS timezone (the tools cannot change it); that case is covered by tests/prague-calendar.test.ts and tests/dispatch-calendar.test.tsx under America/Los_Angeles, Pacific/Auckland and UTC (see Deferred Follow-Ups).

### 4. With the Board and then the Calendar open and idle, let a driver tap a step (or change the booking's status from the driver trip page), do not reload
expected: Within about 30 s (plus request time) the card changes column / the calendar block changes colour and "Updated N s ago" resets. The board does not freeze while a detail panel is open without edits.
result: pass
verified_by: Claude in the owner's Chrome on production, TEST bookings only, 2026-11-11
note: Status changed outside the page (direct admin API call, not a driver tap). Board with a detail panel open and no edits: the card left Confirmed on the next 30 s poll and "Updated" reset to 0 s. Calendar: the block turned from blue to red 28 s after the change and "Updated" reset.

### 5. Right-hand panel layering and Escape behaviour: open a card, open another card's "..." menu and press Escape; open the cancel dialog from the panel and press Escape; type in the notes / driver-price field and press Escape
expected: Panel sits above the sidebar and below modals, no clipped fixed positioning inside the admin shell. Escape in a card menu closes only the menu; Escape inside a field or select does not close the panel (review WR-01, fixed). With a typed driver price or an open trip-edit form, Escape outside a field, the close button and opening another card ask "This booking has unsaved changes. Close it and discard them?" and keep the panel when declined (WR-02, fixed).
result: pass
verified_by: Claude in the owner's Chrome on production, TEST bookings only, 2026-11-11
note: Panel z-index 80 above the sidebar (50), card menu 90, dialogs 100. Escape in a card menu closes only the menu; Escape inside the notes or driver-price field keeps the panel; Escape in the cancel dialog closes only the dialog. With the trip-edit form open, Escape outside a field, the close button and a click on another card each asked "This booking has unsaved changes. Close it and discard them?" and kept the panel when declined. A typed driver price saves itself on blur, so it only counts as unsaved while the cursor is still in the field; after the blur-save the panel closes without a prompt (expected).

### 6. Accepted-move race (review WR-05): drop a card on an allowed column exactly while a 30 s poll is in flight (throttle the network in devtools to make the poll slow)
expected: The card stays in the new column and does not jump back (review WR-05, fixed: the in-flight poll is replaced by a fresh request). After a pickup time edit in the panel the card moves at once (WR-03); while the panel holds unsaved input the toolbar shows "Refresh paused while editing" (WR-08).
result: pass
verified_by: Claude in the owner's Chrome on production, TEST bookings only, 2026-11-11
note: A dispatch poll was held for 12 s in the page; the card was dropped on Confirmed 0.6 s after the poll started. PATCH 200, a fresh dispatch request followed, and the card stayed in Confirmed after the held (stale) poll was released. Pickup time edit 17:00 -> 19:00 in the panel moved the calendar block at once, while refresh was paused. "Refresh paused while editing" shows while the trip-edit form or a dialog is open.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Deferred Follow-Ups

- test: 2
  idea: "Look once at the Completed dialog on a real card-hold booking (states 'Completing captures <amount> from the client's card') and at the cancel dialog's release / fee sentence on a card booking; not reachable with a manual TEST booking"
  deferred_at: 2026-11-11
- test: 3
  idea: "Open the Calendar once with the OS timezone set to a non-Prague zone (America/Los_Angeles or Asia/Tokyo) and confirm bookings stay on their Prague date and time"
  deferred_at: 2026-11-11

## Observations (not gaps)

- The 409 conflict line reads "This booking was just changed to Confirmed by the driver" even when the change came from another admin session.
- Admin PATCH /api/admin/bookings took 3.9 s (status) and 6.2 s (pickup time) on production.
- `/admin/bookings?view=board&search=UAT90` does not pre-fill the search box (the deep link accepts a booking reference or an email only).
- With the 560 px side panel open at 1440 px the calendar toolbar wraps to a second row.
- TEST bookings created for this session, all cancelled, none deleted: PRG-20261111-CED961, PRG-20261111-3C7CC6, PRG-20261111-FA5AA3, PRG-20261111-05603C (client TEST UAT90-A..D).
