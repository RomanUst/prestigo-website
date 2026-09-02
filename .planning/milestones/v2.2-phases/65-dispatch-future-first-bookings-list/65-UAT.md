---
status: complete
phase: 65-dispatch-future-first-bookings-list
source: [65-VERIFICATION.md]
started: 2026-08-28T20:05:00Z
updated: 2026-08-31T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Future-first ordering with real data
expected: Open /admin/bookings with real rows spanning past/future pickup dates (no manual Date Range). Only pickup_date >= today (Europe/Prague) show, ordered soonest-first (nearest upcoming trip at top). Zero rows → "No upcoming trips" + explanatory sentence, not a blank/loading table.
result: pass

### 2. CR-01 fix — persisted default applied on load (live click-through)
expected: In admin Settings, set Dispatch Default to "Last N days" = 14 (or "All"), save, then load /admin/bookings fresh (new tab / hard reload). The Bookings page opens honoring the persisted choice (NOT the hardcoded "future" fallback). This is the DISP-02 headline behavior — the settingsLoaded mount-gate fix in bookings/page.tsx.
result: pass

### 3. DispatchDefault widget visual fidelity
expected: On the live Settings page, click through Future only / Last N days / All. Confirm the copper radio dot, the conditional Days field + helper-text wrap at a narrow viewport, and the "Saved" / "Failed to save — try again" feedback timing. Matches the UI-SPEC visuals; the widget never submits an invalid PATCH body when Days is cleared.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
