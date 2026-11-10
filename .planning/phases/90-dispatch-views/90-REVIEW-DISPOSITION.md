---
phase: 90
review: 90-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Escape in a board card menu also closes the booking side panel"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Unsaved panel input is discarded silently on Escape or when another card is opened"
  - id: WR-03
    severity: warning
    disposition: open
    title: "A pickup date/time edit leaves `pickup_utc` stale, so the board and calendar show the old time"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Completing a card_hold booking does not refresh the open payment panel"
  - id: WR-05
    severity: warning
    disposition: open
    title: "A poll that was already in flight overwrites an accepted move (card jumps back, panel reverts)"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Panel-driven assignment patches status to \"assigned\" unconditionally and never refreshes the driver name"
  - id: WR-07
    severity: warning
    disposition: open
    title: "Old rows stay on screen under a new range or filter, and `loading` can stick after a 401"
  - id: WR-08
    severity: warning
    disposition: open
    title: "A failed save leaves the panel \"dirty\", which silently freezes all polling"
  - id: IN-01
    severity: info
    disposition: open
    title: "Unused dependency and a leftover spike test"
  - id: IN-02
    severity: info
    disposition: open
    title: "The 62-day cap is duplicated between route and client library"
  - id: IN-03
    severity: info
    disposition: open
    title: "Complete dialog keeps an enabled \"Complete trip\" button after a 409"
  - id: IN-04
    severity: info
    disposition: open
    title: "Capture amount shown in the dialog comes from a snapshot taken when the move was requested"
  - id: IN-05
    severity: info
    disposition: open
    title: "Focus is not restored when the opener unmounts, and the calendar view toggle is not a complete tablist"
  - id: IN-06
    severity: info
    disposition: open
    title: "Driver names are loaded once per board mount, and the board range never rolls over at Prague midnight"
open: 14
total: 14
recorded: 2026-11-10T14:01:57.163Z
---

# Phase 90: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-08 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
