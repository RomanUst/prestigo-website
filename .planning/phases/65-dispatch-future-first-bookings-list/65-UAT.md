---
status: testing
phase: 65-dispatch-future-first-bookings-list
source: [65-VERIFICATION.md]
started: 2026-08-28T20:05:00Z
updated: 2026-08-28T20:05:00Z
---

## Current Test

number: 1
name: Future-first ordering with real data
expected: |
  Open /admin/bookings on the live site with real booking rows spanning past and
  future pickup dates (no manual Date Range set). The list renders only bookings
  with pickup_date >= today (Europe/Prague), ordered soonest-first (nearest
  upcoming trip at the top). Zero rows renders "No upcoming trips" + the
  explanatory sentence, not a blank/loading table.
awaiting: user response

## Tests

### 1. Future-first ordering with real data
expected: Open /admin/bookings with real rows spanning past/future pickup dates (no manual Date Range). Only pickup_date >= today (Europe/Prague) show, ordered soonest-first (nearest upcoming trip at top). Zero rows → "No upcoming trips" + explanatory sentence, not a blank/loading table.
result: [pending]

### 2. CR-01 fix — persisted default applied on load (live click-through)
expected: In admin Settings, set Dispatch Default to "Last N days" = 14 (or "All"), save, then load /admin/bookings fresh (new tab / hard reload). The Bookings page opens honoring the persisted choice (NOT the hardcoded "future" fallback). This is the DISP-02 headline behavior — the settingsLoaded mount-gate fix in bookings/page.tsx.
result: [pending]

### 3. DispatchDefault widget visual fidelity
expected: On the live Settings page, click through Future only / Last N days / All. Confirm the copper radio dot, the conditional Days field + helper-text wrap at a narrow viewport, and the "Saved" / "Failed to save — try again" feedback timing. Matches the UI-SPEC visuals; the widget never submits an invalid PATCH body when Days is cleared.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
