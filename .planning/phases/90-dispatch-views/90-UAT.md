---
status: testing
phase: 90-dispatch-views
source: [90-VERIFICATION.md]
started: 2026-11-10T15:40:00Z
updated: 2026-11-10T15:40:00Z
---

## Current Test

number: 1
name: Drag a card with a real mouse and with touch on /admin/bookings?view=board (1440 px and a phone width)
expected: |
  A 6 px mouse move starts a drag, a plain click still opens the side panel; touch needs a ~250 ms hold so scrolling still works; only allowed columns are outlined, others fade; a drop on an allowed column sends the move and the card stays in place until the server answers; on a phone the cards are not draggable and the "..." menu moves them.
awaiting: user response

## Tests

### 1. Drag a card with a real mouse and with touch on /admin/bookings?view=board (1440 px and a phone width)
expected: A 6 px mouse move starts a drag, a plain click still opens the side panel; touch needs a ~250 ms hold so scrolling still works; only allowed columns are outlined, others fade; a drop on an allowed column sends the move and the card stays in place until the server answers; on a phone the cards are not draggable and the "..." menu moves them.
result: [pending]

### 2. Move a card to Completed (card-hold booking) and to Cancelled from the board; then provoke a stale move (change the booking's status in another tab or via a driver step, then move the old card)
expected: Completed opens a dialog that states "Completing captures <amount> from the client's card" before anything is sent; Cancelled opens the cancel dialog with the release / fee sentence; the stale move shows the conflict line, the card stays in its column, and the board refetches.
result: [pending]

### 3. Open the Calendar tab with the OS timezone set to a non-Prague zone (for example America/Los_Angeles and Asia/Tokyo) and navigate to the week of 2027-03-28 and 2027-10-31 (or the equivalent live DST weeks), with a booking just after and just before Prague midnight
expected: Each booking sits in the column of its Prague date at its Prague wall-clock time, in day, week and month views; colours follow the status.
result: [pending]

### 4. With the Board and then the Calendar open and idle, let a driver tap a step (or change the booking's status from the driver trip page), do not reload
expected: Within about 30 s (plus request time) the card changes column / the calendar block changes colour and "Updated N s ago" resets. The board does not freeze while a detail panel is open without edits.
result: [pending]

### 5. Right-hand panel layering and Escape behaviour: open a card, open another card's "..." menu and press Escape; open the cancel dialog from the panel and press Escape; type in the notes / driver-price field and press Escape
expected: Panel sits above the sidebar and below modals, no clipped fixed positioning inside the admin shell. Known open review warnings WR-01 / WR-02: Escape in a card menu or in an input currently ALSO closes the panel and drops unsaved input; decide whether that is acceptable before release.
result: [pending]

### 6. Accepted-move race (review WR-05): drop a card on an allowed column exactly while a 30 s poll is in flight (throttle the network in devtools to make the poll slow)
expected: Documented risk: the card may jump back for up to one poll and then settle in the new column. Confirm this is tolerable or schedule the fix.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
