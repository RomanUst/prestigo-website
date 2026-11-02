---
status: complete
phase: 85-statistics
source: [85-VERIFICATION.md]
started: 2026-10-31T14:29:44Z
updated: 2026-11-01T15:11:23Z
---

## Current Test

[testing complete]

## Tests

### 1. Authenticated browser pass over /admin/stats
expected: All four tabs render live data; period presets/custom range work and persist in the URL; customer and account links land on the filtered bookings list / account page; numbers match the live probes.
result: pass

### 2. Owner decision on review warning WR-01 (with WR-02, WR-03)
expected: Owner decides whether to ship a forward migration 083 that adds an "other after inquiry" bucket so funnel + direct + other = trips_in_period (plus the WR-02 identity-key and WR-03 amount-fallback fixes), or to accept the current behaviour.
result: pass — owner chose to fix WR-01 (2026-10-31). Migration 083 applied live, SMOKE_OK_85_07; Conversion tab now has an "All paid bookings created in this period" table (after inquiry + direct = total). WR-02/WR-03 left open (0 and 2 live rows).

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
