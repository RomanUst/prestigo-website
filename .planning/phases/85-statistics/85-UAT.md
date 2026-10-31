---
status: testing
phase: 85-statistics
source: [85-VERIFICATION.md]
started: 2026-10-31T14:29:44Z
updated: 2026-10-31T14:29:44Z
---

## Current Test

number: 1
name: Authenticated browser pass over /admin/stats
expected: |
  All four tabs (Overview, Conversion, Customers, B2B) render with live data; presets and the custom range change the numbers and the URL (?tab&from&to); a copied URL reopens the same tab and period; a top-customer name opens /admin/bookings filtered to that email; a B2B account name opens /admin/accounts/<id>. 90-day figures roughly match the live probes: 15 inquiries / 1 converted / 14 window open; 15 customers, 5 repeat; B2B 4907 of 10120 EUR.
awaiting: user response

## Tests

### 1. Authenticated browser pass over /admin/stats
expected: All four tabs render live data; period presets/custom range work and persist in the URL; customer and account links land on the filtered bookings list / account page; numbers match the live probes.
result: [pending]

### 2. Owner decision on review warning WR-01 (with WR-02, WR-03)
expected: Owner decides whether to ship a forward migration 083 that adds an "other after inquiry" bucket so funnel + direct + other = trips_in_period (plus the WR-02 identity-key and WR-03 amount-fallback fixes), or to accept the current behaviour.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
