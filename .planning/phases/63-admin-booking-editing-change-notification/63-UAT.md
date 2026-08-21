---
status: partial
phase: 63-admin-booking-editing-change-notification
source: [63-VERIFICATION.md]
started: 2026-08-21T14:20:00Z
updated: 2026-08-21T15:20:00Z
---

## Current Test

[testing paused — 1 item outstanding (test 2 deferred/unverified)]

## Tests

### 1. Interactive TripEditPanel per-field editing
expected: Each per-field save persists only that field, shows the Saving.../Saved/Error hint, and the row updates without a page reload.
result: pass

### 2. Vehicle-class / route change → live price-review round trip
expected: Selecting a new vehicle class or editing the pickup/destination address and clicking "Review Price →" opens the price-review panel with a live /api/calculate-price + Google Maps round trip; the recomputed amount is real (not stale/hardcoded), the old→new amount renders correctly, origin/destination diff wraps without truncation, and Confirm & Save persists the new price.
result: skipped
reason: "User: не могу проверить — deferred for now"

### 3. 422 price-mismatch + override checkbox gating
expected: Triggering a deliberate 422 price mismatch renders computedCzk/submittedCzk inline in #f87171, and Confirm & Save stays disabled until the "I confirm overriding the price…" checkbox is checked.
result: pass

### 4. Terminal-status (completed/cancelled) and GNet-source conditional rendering
expected: A completed/cancelled booking's expanded row shows only the read-only notice (no edit form); a booking_source='gnet' booking shows the passive banner while edit controls remain usable.
result: pass

### 5. Real branded change-notification email
expected: Toggling "Notify client of this change" on a save sends a branded change-notification email that renders correctly in a real inbox — brand chrome (logo, gold gradient, WHAT CHANGED diff table), only the fields that changed shown, old→new legible.
result: pass

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
