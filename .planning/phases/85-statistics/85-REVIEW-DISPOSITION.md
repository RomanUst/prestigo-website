---
phase: 85
review: 85-REVIEW.md
updated: 2026-10-31
---

# Phase 85 — Review Disposition

| ID | Severity | Disposition | Note |
|----|----------|-------------|------|
| WR-01 | warning | open | Bookings after an inquiry that are not its first conversion appear in neither funnel revenue nor the direct table; fix needs migration 083 + ConversionTab row. Owner decision pending. |
| WR-02 | warning | open | identity key split (booking_identity vs identity_emails). Live probe 2026-10-31: 0 affected trips. Fix in 083 if done. |
| WR-03 | warning | open | CZK*0.04 fallback differs from panel_bookings (080). Live probe: 2 paid rows without amount_eur. |
| IN-01 | info | open | malformed pickup_date -> zod 500 on Customers tab |
| IN-02 | info | no_change_needed | live probe: 0 bookings with NULL booking_source |
| IN-03 | info | open | strict email deep link rejects apostrophes; API caps search at 100 chars |
| IN-04 | info | open | unreachable empty states |
| IN-05 | info | no_change_needed | NULL channel merged into Chat · Other is by design (CONTEXT); backfill left 0 NULL |
| IN-06 | info | open | backfill aborts on network error (one-time script, already run successfully) |
| IN-07 | info | open | B2B note wording vs account detail page OR-attribution (accepted D-19 trade-off) |
