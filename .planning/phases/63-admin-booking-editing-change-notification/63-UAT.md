---
status: testing
phase: 63-admin-booking-editing-change-notification
source: [63-VERIFICATION.md]
started: 2026-08-21T14:20:00Z
updated: 2026-08-21T14:20:00Z
---

## Current Test

number: 1
name: Interactive TripEditPanel per-field editing
expected: |
  Expand a booking row, edit pickup date/time, name, email, phone, and flight
  number one at a time, clicking each "Save …" control. Each per-field save
  persists only that field, shows the three-state Saving.../Saved/Error hint,
  and the row reflects the new value without a page reload.
awaiting: user response

## Tests

### 1. Interactive TripEditPanel per-field editing
expected: Each per-field save persists only that field, shows the Saving.../Saved/Error hint, and the row updates without a page reload.
result: [pending]

### 2. Vehicle-class / route change → live price-review round trip
expected: Selecting a new vehicle class or editing the pickup/destination address and clicking "Review Price →" opens the price-review panel with a live /api/calculate-price + Google Maps round trip; the recomputed amount is real (not stale/hardcoded), the old→new amount renders correctly, origin/destination diff wraps without truncation, and Confirm & Save persists the new price.
result: [pending]

### 3. 422 price-mismatch + override checkbox gating
expected: Triggering a deliberate 422 price mismatch renders computedCzk/submittedCzk inline in #f87171, and Confirm & Save stays disabled until the "I confirm overriding the price…" checkbox is checked.
result: [pending]

### 4. Terminal-status (completed/cancelled) and GNet-source conditional rendering
expected: A completed/cancelled booking's expanded row shows only the read-only notice (no edit form); a booking_source='gnet' booking shows the passive banner while edit controls remain usable.
result: [pending]

### 5. Real branded change-notification email
expected: Toggling "Notify client of this change" on a save sends a branded change-notification email that renders correctly in a real inbox — brand chrome (logo, gold gradient, WHAT CHANGED diff table), only the fields that changed shown, old→new legible.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
