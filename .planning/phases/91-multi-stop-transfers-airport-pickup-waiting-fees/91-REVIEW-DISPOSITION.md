---
phase: 91
review: 91-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "A `card_extra` PaymentIntent that succeeds after its row was marked failed is only logged; the operator is told \"nothing was charged\" and can charge again"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "A failed receipt email after a successful charge is never retried and nothing tells the operator"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Resume replays at Stripe with no reconciliation, and a row can stay `charging` forever"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "A `card_extra` money event is written to the ledger twice, under kinds shared with the trip charge, and the cash adopt logic cannot tell them apart"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Manual pickup edit has no compare-and-set on the landing columns, so a concurrent \"Move pickup\" can desync landing, offset and pickup"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "The engine's \"fresh\" guard re-reads consent and in-flight but not the booking, and eligibility ignores an erased booking"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "A pay-now booking created by the webhook fallback insert silently drops its paid stops"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Audit rows for `pickup_offset_min`, `landing_date` and `landing_time` render as raw field names"
  - id: IN-02
    severity: info
    disposition: skipped
    title: "Pay-now has no client copy for several new server codes (extends the known item)"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Stop address schema rejects an empty address that storage and email code expect"
  - id: IN-04
    severity: info
    disposition: skipped
    title: "Duplicated magic numbers (waiting caps, Stripe ceiling), one unused export"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "Autumn ambiguous hour: a manual pickup edit can match the wrong offset"
  - id: IN-06
    severity: info
    disposition: skipped
    title: "Google Routes cost control is per-IP only, with no response cache"
  - id: IN-07
    severity: info
    disposition: skipped
    title: "Quote vs checkout distance can differ by a few metres between calls"
  - id: IN-08
    severity: info
    disposition: fixed
    title: "Client emails state the waiting total in EUR even for a CZK booking"
  - id: IN-09
    severity: info
    disposition: skipped
    title: "Admin list and dispatch board fail completely when the stops read fails"
open: 0
total: 16
recorded: 2026-11-12T00:16:20.414Z
---

# Phase 91: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 91-REVIEW-FIX.md |
| WR-01 | warning | fixed | 91-REVIEW-FIX.md |
| WR-02 | warning | fixed | 91-REVIEW-FIX.md |
| WR-03 | warning | fixed | 91-REVIEW-FIX.md |
| WR-04 | warning | fixed | 91-REVIEW-FIX.md |
| WR-05 | warning | fixed | 91-REVIEW-FIX.md |
| WR-06 | warning | fixed | 91-REVIEW-FIX.md |
| IN-01 | info | fixed | 91-REVIEW-FIX.md |
| IN-02 | info | skipped | 91-REVIEW-FIX.md |
| IN-03 | info | fixed | 91-REVIEW-FIX.md |
| IN-04 | info | skipped | 91-REVIEW-FIX.md |
| IN-05 | info | fixed | 91-REVIEW-FIX.md |
| IN-06 | info | skipped | 91-REVIEW-FIX.md |
| IN-07 | info | skipped | 91-REVIEW-FIX.md |
| IN-08 | info | fixed | 91-REVIEW-FIX.md |
| IN-09 | info | skipped | 91-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
