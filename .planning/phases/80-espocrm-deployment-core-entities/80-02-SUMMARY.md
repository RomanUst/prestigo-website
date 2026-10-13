---
phase: 80-espocrm-deployment-core-entities
plan: 02
subsystem: admin
tags: [admin, bookings, deep-link, crm, d-18]
requires: []
provides:
  - "/admin/bookings?search={ref} opens one booking across all dates (consumed by CRM Admin link, plan 80-03 buildAdminLink)"
affects:
  - components/admin/BookingsTable.tsx
tech-stack:
  added: []
  patterns:
    - "lazy useState initializer reading window.location (no next/navigation hook, no Suspense boundary)"
key-files:
  created: []
  modified:
    - components/admin/BookingsTable.tsx
    - tests/BookingsTable.test.tsx
key-decisions:
  - "Deep link starts the session on horizon=all but never writes the persisted dispatch default"
  - "Allowlist ^[A-Za-z0-9-]{1,40}$ after trim; anything else ignored"
requirements-completed: [CRM-03]
status: complete
commits: 1
plan_head_before: 5e8b249eef1185a7ee9dae10742f268fae73c02c
plan_head_after: 113c7d4110f5fed83647739ffda42801b7c5fef6
actuals:
  tokens: 3500
  tasks: 2
  commits: 1
duration: 8 min
completed: 2026-10-13
---

# Phase 80 Plan 02: Admin bookings deep link Summary

`/admin/bookings?search=PRG-...` now seeds the search box and the first fetch (`search` + `horizon=all`), so the CRM Booking "Admin link" opens that exact booking even if it is in the past.

## Accomplishments

- Added module-level `readBookingDeepLink()` in `components/admin/BookingsTable.tsx`: SSR-safe (`typeof window` guard), trims the `search` param and accepts only `^[A-Za-z0-9-]{1,40}$`.
- `BookingsTable` seeds `search`, `debouncedSearch` (so the very first fetch already carries it) and `horizon` (`'all'` when a valid deep link is present, else the persisted `defaultHorizon`). The `horizon` comment notes the D-18 behaviour.
- No API change, no new strings, no `next/navigation` hook, no settings PATCH.
- Tests (describe "BookingsTable deep link (Phase 80 D-18)"): valid ref (search + horizon=all + input value + no settings call); 5 distinct rejected inputs (empty, whitespace, 41 chars, script-like, underscore/space) keep `horizon=future` and send no search; no query string unchanged; clearing the box after a deep link refetches without `search` and keeps `horizon=all`.

## Task Commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) + 2 | deep link + guard tests | 113c7d41 |

## Verification

- `npx vitest run tests/BookingsTable.test.tsx tests/infra-vps-isolation-guard.test.ts`: 56/56 passed (RED observed first: 2 deep-link tests failed before the change)
- `npx eslint --quiet components/admin/BookingsTable.tsx`: exit 0
- `npx tsc --noEmit`: no error in BookingsTable files
- `grep -c "function readBookingDeepLink"` = 1; `grep -c useSearchParams` = 0
- Tracer gate: `<verify>` re-run end-to-end passed before Task 2, expansion continued.

## Deviations from Plan

**1. [Process] Tasks 1 and 2 share one commit.** The Task 2 guard test rows (invalid/absent params, clear-after-deep-link) were authored together with the Task 1 tests, and `readBookingDeepLink` already satisfied them, so Task 2 produced no separate diff. Its verification (isolation guard, ESLint, tsc) was run and passed; no second commit was made rather than creating an empty one.

Otherwise: none - plan executed as written.

## Notes

- The CRM link works on production only after this change is merged to main and deployed.
- The project `verify` skill was not run separately; its checks (tsc, eslint, related tests, no `€`, no secrets, no i18n change) are covered by the commands above and the pre-commit hook passed.

## Known Stubs

None.

## Threat Flags

None. T-80-05 mitigated (allowlist + tests); T-80-06 accepted (admin is auth-gated); T-80-SC: no installs.

## Self-Check: PASSED

- components/admin/BookingsTable.tsx and tests/BookingsTable.test.tsx modified and committed (113c7d41 present in git log)
- All acceptance criteria re-run and pass
