---
status: partial
phase: 65-dispatch-future-first-bookings-list
source: [65-VERIFICATION.md]
started: 2026-08-28T20:05:00Z
updated: 2026-08-29T00:00:00Z
---

## Current Test

[testing paused — 3 items outstanding: phase 65 changes not deployed to production]

## Tests

### 1. Future-first ordering with real data
expected: Open /admin/bookings with real rows spanning past/future pickup dates (no manual Date Range). Only pickup_date >= today (Europe/Prague) show, ordered soonest-first (nearest upcoming trip at top). Zero rows → "No upcoming trips" + explanatory sentence, not a blank/loading table.
result: blocked
blocked_by: release-build
reason: "User reported: пока как было так и остается, изменения еще не в проде — phase 65 commits (35 ahead of origin/main) not yet pushed/deployed to Vercel prod."

### 2. CR-01 fix — persisted default applied on load (live click-through)
expected: In admin Settings, set Dispatch Default to "Last N days" = 14 (or "All"), save, then load /admin/bookings fresh (new tab / hard reload). The Bookings page opens honoring the persisted choice (NOT the hardcoded "future" fallback). This is the DISP-02 headline behavior — the settingsLoaded mount-gate fix in bookings/page.tsx.
result: blocked
blocked_by: release-build
reason: "Same deploy gate as test 1 — changes not in production."

### 3. DispatchDefault widget visual fidelity
expected: On the live Settings page, click through Future only / Last N days / All. Confirm the copper radio dot, the conditional Days field + helper-text wrap at a narrow viewport, and the "Saved" / "Failed to save — try again" feedback timing. Matches the UI-SPEC visuals; the widget never submits an invalid PATCH body when Days is cleared.
result: blocked
blocked_by: release-build
reason: "Same deploy gate as test 1 — changes not in production."

## Summary

total: 3
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 3

## Gaps
