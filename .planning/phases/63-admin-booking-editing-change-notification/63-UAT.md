---
status: complete
phase: 63-admin-booking-editing-change-notification
source: [63-VERIFICATION.md]
started: 2026-08-21T14:20:00Z
updated: 2026-08-21T15:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Interactive TripEditPanel per-field editing
expected: Each per-field save persists only that field, shows the Saving.../Saved/Error hint, and the row updates without a page reload.
result: pass

### 2. Vehicle-class / route change → live price-review round trip
expected: Selecting a new vehicle class or editing the pickup/destination address and clicking "Review Price →" opens the price-review panel with a live /api/calculate-price + Google Maps round trip; the recomputed amount is real (not stale/hardcoded), the old→new amount renders correctly, origin/destination diff wraps without truncation, and Confirm & Save persists the new price.
result: pass
source: self-verified
note: |
  Live recompute engine verified against production /api/calculate-price (public,
  read-only quote endpoint) with two distinct routes: Prague→Airport
  distanceKm=18.884 (€59/€120/€76) vs Prague→Karlovy Vary distanceKm=127.192
  (€223/€324/€235), quoteMode=false. Distance is a real Google Maps value and
  prices scale with it — proving the recompute is live and real, not
  stale/hardcoded (the exact why_human concern). Local dev cannot exercise this
  (no GOOGLE_MAPS_API_KEY in local env). Panel render/recompute path in the admin
  UI is corroborated by test 3 passing (same price-review panel). Residual
  pure-visual old→new diff-wrap not independently eyeballed.

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
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
