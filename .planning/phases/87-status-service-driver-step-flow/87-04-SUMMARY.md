---
phase: 87-status-service-driver-step-flow
plan: 04
subsystem: booking-status, crm-sync
tags: [booking-status, espocrm, chatwoot, google-calendar, parity-test, on_board, no_show]
requires:
  - phase: 87-02
    provides: lib/booking-status.ts vocabulary and sets, migration 084 (live), tests/helpers/latest-migration.ts
provides:
  - "every TypeScript status list in lib/ derived from lib/booking-status.ts"
  - "EspoCRM CBooking mapping and fields.json know on_board / no_show"
  - "pickupInstantMs in lib/prague-date.ts (re-exported by lib/panel-bookings.ts)"
  - "tests/booking-status-parity.test.ts: SQL-vs-TS parity on the latest migration definitions"
affects: [87-05, 87-08, 87-09, 87-13, 88, 89]
key-files:
  created:
    - tests/booking-status-parity.test.ts
  modified:
    - lib/customer-mapping.ts
    - lib/lead-mapping.ts
    - lib/chatwoot-mapping.ts
    - lib/panel-bookings.ts
    - lib/prague-date.ts
    - lib/google-calendar.ts
    - infra/espocrm/lib/booking-map.mjs
    - infra/espocrm/fields.json
    - tests/customer-mapping-parity.test.ts
    - tests/espocrm-booking-map.test.ts
    - tests/lead-mapping.test.ts
    - tests/chatwoot-mapping.test.ts
    - tests/panel-bookings.test.ts
    - tests/google-calendar-sync.test.ts
    - tests/outbox-migrations.test.ts
key-decisions:
  - "infra/espocrm/lib/booking-map.mjs keeps its own status list (infra never imports lib/); it is pinned to the latest bookings_status_check and the stray-list allowlist names it explicitly"
  - "BOOKING_LEAD_STATUS maps on_board and no_show to 'converted', byte-equal to the latest SQL booking_lead_status()"
  - "An unpaid no_show is 'awaiting_payment' (A6) and a no_show is listed as past, never upcoming; a paid_at still wins and shows 'paid'"
  - "no_show keeps its Google Calendar event and is grey (colorId '8') like completed (A5)"
requirements-completed: [PAYF-02, DRV-02]
duration: ~35 min
completed: 2026-11-03
status: complete
actuals:
  tokens: 21000
  tasks: 3
  commits: 4
plan_head_before: f0bdad82a7754f4a8b5c5e4abaa7b0fdeac799ee
plan_head_after: f8a04b21137b1e4186dde6dbfecab6a970f0bb6d
commits: 4
---

# Phase 87 Plan 04: Status fan-out to CRM, lead, Chatwoot, panel and calendar Summary

**on_board and no_show now flow through every TypeScript and EspoCRM status consumer without a skip or throw; revenue excludes no_show everywhere; and a new parity test reads the LATEST migration definitions so a later `CREATE OR REPLACE` cannot drift silently.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | on_board / no_show booking -> CBooking draft -> EspoCRM payload -> enum option | c345eda7 |
| 2 | lead, Chatwoot value, panel and calendar mappers on the shared sets; pickupInstantMs to prague-date | eb60bfa2 |
| 3 | SQL-vs-TS parity test on the latest migration definitions | 41243bda |
| (deviation) | outbox lead-status parity test reads the latest body | f8a04b21 |

Tracer gate: the tracer `<verify>` (three suites plus scoped tsc) was green and the task carries no `blocking-human` gate, so expansion proceeded.

## What changed

- `lib/customer-mapping.ts`: `BOOKING_STATUS_VALUES = [...BOOKING_STATUSES]`; on_board / no_show map to a CBooking draft, `arrived` is still `booking_unmapped`.
- `infra/espocrm/lib/booking-map.mjs`: list extended with `on_board`, `no_show` (same order as the CHECK); `rowToBooking` no longer throws `unknown_status` for them.
- `infra/espocrm/fields.json`: CBooking `status` options plus `translatedOptions` `On Board` / `No-Show`.
- `lib/lead-mapping.ts`: `BOOKING_LEAD_STATUS` has 10 keys; both new statuses are `converted` (D-10).
- `lib/chatwoot-mapping.ts`: `VALUE_STATUSES = REVENUE_STATUSES`; `tripsOf` unchanged, so a no_show is still a trip but adds no lifetime value (D-11).
- `lib/panel-bookings.ts`: `PANEL_VALUE_STATUSES = REVENUE_STATUSES`; `paymentState('no_show', null)` -> `awaiting_payment`; `isUpcoming` also excludes `no_show`; `pickupInstantMs` re-exported from `lib/prague-date.ts`.
- `lib/prague-date.ts`: now owns `pickupInstantMs`, `pragueOffsetMs`, the Intl formatter and date/time regexes, moved verbatim (all existing panel-bookings cases pass unchanged).
- `lib/google-calendar.ts`: `CALENDAR_ACTIVE_STATUSES` re-exported from `lib/booking-status.ts` (a Set; `.has`); `colorId '8'` for completed and no_show.
- `tests/booking-status-parity.test.ts` (17 tests): latest CHECK vs `BOOKING_STATUSES` / `VALID_TRANSITIONS` / `BOOKING_STATUS_LABELS` / `booking-map.mjs`; latest `booking_lead_status` WHEN/THEN pairs vs `BOOKING_LEAD_STATUS` (with a drifted-copy self-test); latest `stats_trips` and `panel_bookings` IN lists vs `REVENUE_STATUSES`; latest `notify_booking_gcal_sync` array vs `CALENDAR_ACTIVE_STATUSES`; stray-list guard over `lib/` and `infra/` with a reasoned allowlist (`lib/booking-status.ts`, `infra/espocrm/lib/booking-map.mjs`) that fails on stale entries.

## Owner / orchestrator follow-up (no live CRM write was run here)

Live EspoCRM must learn the two new enum values before any driver can reach `on_board` in production (T-87-13). The 87-13 checkpoint covers it. Exact command, run from the main checkout on the VPS/owner machine with the CRM identities configured:

```
node infra/espocrm/sync.mjs --only fields
```

(`infra/espocrm/fields.json` in this branch is the source it applies.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tests/outbox-migrations.test.ts pinned to dead migration 067**
- **Found during:** full-suite run after Task 3
- **Issue:** "parity: booking_lead_status() equals BOOKING_LEAD_STATUS for all 8 statuses" parsed `067_bookings_lead_outbox.sql` and asserted 8 keys. With 10 keys in `BOOKING_LEAD_STATUS` it failed, and it was verifying a function body that 084 superseded (RESEARCH Pitfall 4).
- **Fix:** reads `latestFunctionBody('booking_lead_status')` and compares against `BOOKING_STATUSES.length`.
- **Files modified:** tests/outbox-migrations.test.ts
- **Commit:** f8a04b21

**2. [Rule 3 - Blocking/coverage] tests/google-calendar-sync.test.ts not in the plan's files list**
- The plan's behavior list requires calendar cases (on_board / no_show keep the event, no_show is grey) and its verify command runs this file, so the cases were added there. No other file was touched outside the plan.

Otherwise the plan executed as written.

## Verification

- Plan verify set (customer-mapping-parity, espocrm-booking-map, espocrm-model, lead-mapping, chatwoot-mapping, panel-bookings, google-calendar-sync, booking-status-parity) plus booking-status, booking-status-migration, panel-bookings-migration, driver-trip: 12 files, 507 tests green.
- 13 further test files that reference the changed modules: green after the outbox fix.
- Full `npx vitest run`: 7959 passed, 1 failed; the 8 failing files are exactly the known worktree-only set (five next-intl `server.react-server` resolutions through the symlink, `stats-migration`, `stats-customers-b2b-migration`, `route-metadata-seo`). None touches this plan.
- `npx tsc --noEmit` filtered to every changed lib module and test: no errors. `npx eslint --quiet` on all changed files: clean.
- Acceptance greps: `053_unpaid_booking_status` in booking-map test 0; `no_show: 'converted'` 1; `export function pickupInstantMs` 1 in prague-date and 0 in panel-bookings; `'on_location'` literal 0 in chatwoot-mapping and google-calendar.

## Known Stubs

None.

## Threat Flags

None. T-87-13 mitigated in code (mappers know both statuses, parity test pins booking-map.mjs to the latest CHECK); the live EspoCRM fields sync is the remaining owner step above. T-87-14 mitigated (`paymentState` returns `awaiting_payment` for an unpaid no_show). No package installs.

## Self-Check: PASSED

- FOUND: tests/booking-status-parity.test.ts, lib/prague-date.ts (pickupInstantMs), infra/espocrm/fields.json (On Board / No-Show)
- FOUND commits: c345eda7, eb60bfa2, 41243bda, f8a04b21
- STATE.md and ROADMAP.md untouched.
