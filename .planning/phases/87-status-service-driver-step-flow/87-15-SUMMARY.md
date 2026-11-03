---
phase: 87-status-service-driver-step-flow
plan: 15
subsystem: driver-notifications
tags: [email, resend, driver, trip-link, gap-closure, security]
status: complete
gap_closure: true
requirements: [DRV-01]

requires:
  - phase: 87-status-service-driver-step-flow
    provides: "/driver/trip/<trip_token> step page, isTripLinkValid (lib/trip-token.ts)"
  - phase: 40
    provides: "driver assignment email, driver_assigned notification flag, logEmail dedupe"
provides:
  - "sendDriverAcceptedTripEmail(assignmentId): one email to the driver after Accept with the order details and an OPEN TRIP button to /driver/trip/<trip_token>"
  - "DriverAcceptedEmailData, buildDriverAcceptedEmailHtml, sendDriverAcceptedEmail in lib/email.ts"
  - "driverTripDetailsRows: one detail-rows builder shared by the assignment and accept emails"
affects: [87-20 human inbox check]

tech-stack:
  added: []
  patterns:
    - "side effect inside after() with its own service client; outcome-code-only logging"
    - "golden-HTML fixture captured before a refactor to prove byte identity"

key-files:
  created:
    - lib/driver-accept-email.ts
    - tests/driver-accept-email.test.ts
    - tests/fixtures/driver-assignment-email-golden.json
  modified:
    - app/api/driver/respond/route.ts
    - lib/email.ts
    - tests/admin-assignment.test.ts
    - tests/email-reply-to.test.ts

key-decisions:
  - "The existing Driver assigned notification toggle governs both driver assignment emails; no new settings key"
  - "Dedupe key driver_accepted:<assignmentId> through logEmail (bookingId null, as the assignment email)"
  - "Golden assignment HTML stored as a JSON fixture (four variants) instead of an inline string constant, to keep the test file readable"

metrics:
  duration: "~35 min"
  completed: 2026-11-03

commits: 3
plan_head_before: 21dc8556785013ed7fce08dcb82d8d0cec80ae86
plan_head_after: 78564cc375792ece56b5750589b3dcb0065691df
actuals:
  tokens: 12000
  tasks: 3
  commits: 3
---

# Phase 87 Plan 15: Driver accept email Summary

After the driver taps Accept on /driver/response, the driver now gets one email with the full order (pickup date and time, from, to, passenger, passenger phone, vehicle, passengers, luggage, flight, notes, own fee) and an OPEN TRIP button to the Phase 87 step page; accept/decline still answer exactly as before (87-UAT gap 1).

## What was built

- **Route** (`app/api/driver/respond/route.ts`): after the successful single-use update, `action === 'accepted'` schedules `sendDriverAcceptedTripEmail(assignment.id)` in `after()` with a catch. The decline branch, lookup, update and every response are untouched.
- **Helper** (`lib/driver-accept-email.ts`): one join read (driver_assignments with bookings!inner and drivers; selects `driver_price_czk`, never the client price columns), then guards in this order: row found, driver email, trip token, `isTripLinkValid` (reassigned / declined / completed / cancelled / no_show are skipped), `pricing_globals.notification_flags.driver_assigned !== false`, `logEmail` with key `driver_accepted:<assignmentId>`. Trip URL is `(NEXT_PUBLIC_SITE_URL || https://rideprestigo.com)` trimmed and stripped of trailing slashes. Logs carry the assignment id and an outcome code only.
- **Email** (`lib/email.ts`): `buildDriverAcceptedEmailHtml` and `sendDriverAcceptedEmail` (same from address as the assignment email, no replyTo, non-fatal, tag `[driver-accept]`). Heading "Thank you. You accepted this trip.", OPEN TRIP button, day-of-trip paragraph, help line. No Accept/Decline buttons, no 48-hour note, no HTML entities other than the five escape entities.
- **Shared rows**: `driverTripDetailsRows` now renders the TRIP DETAILS table for both emails. The Phase 40 assignment email is byte-identical (four golden variants: fee/no fee x notes/no notes).

## Tasks and commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Accept -> one email with the order details and the trip link | 3b2e78e8 |
| 2 | Guards: flag, dedupe, link validity, missing email, failure isolation | 79655178 |
| 3 | Shared detail rows; assignment email byte-identical; accept content and hygiene | 78564cc3 |

## Verification

- `npx vitest run tests/driver-accept-email.test.ts tests/email-reply-to.test.ts tests/admin-assignment.test.ts tests/email.test.ts`: 4 files, 103 tests passed.
- `npx eslint --quiet` on the changed lib/app/test files: clean. `npx tsc --noEmit`: no error in any changed file (baseline errors in other tests/ files untouched).
- Mutation check: replacing the `isTripLinkValid` guard with a constant made 6 guard tests fail, then restored.
- Acceptance greps: `sendDriverAcceptedTripEmail` in the route (import + call), `driver_accepted:` present, `amount_(eur|czk)` count 0 in the helper, `driverTripDetailsRows(` appears 3 times (definition + 2 callers), no components/ or messages/ changes.

## Deviations from Plan

**1. [Rule 3 - Blocking] Rate limiter mocked in the new test file.** `/api/driver/respond` is limited to 10 requests/min/IP with an in-memory fallback; the 20+ route calls in `tests/driver-accept-email.test.ts` started getting 429, which made the "no send" guard tests pass for the wrong reason. The test now mocks `@/lib/rate-limit` (allowed: true) and every route call goes through an `accept()` helper that asserts the unchanged `200 { ok: true }` first. Files: tests/driver-accept-email.test.ts. Commit 79655178.

**2. [Style] Golden assignment HTML kept as a JSON fixture** (`tests/fixtures/driver-assignment-email-golden.json`, four variants) rather than a string constant inside the test, since each variant is about 6 KB. It was captured from the pre-refactor `sendDriverAssignmentEmail` and verified green against the old builder before the refactor. Commit 78564cc3.

Otherwise: plan executed as written. `driverTripDetailsRows` was introduced in Task 1 (used by the accept email) and the assignment email was moved onto it in Task 3, as planned.

## Notes for the orchestrator

- Tests ran green through the node_modules symlink in the worktree, including the next-intl-free email/route tests; re-run on the main checkout for the full suite as usual.
- The client price is never read or shown. The only money row is the driver's own fee, formatted identically to the Phase 40 assignment email (asserted by test).
- Real inbox check on a phone belongs to 87-20 (human check).

## Known Stubs

None.

## Threat Flags

None. The new surface (email carrying the bearer trip link and passenger contact data to the assignment's own driver) is covered by T-87-47..T-87-50 in the plan.

## Self-Check: PASSED

- lib/driver-accept-email.ts, tests/driver-accept-email.test.ts, tests/fixtures/driver-assignment-email-golden.json: found.
- Commits 3b2e78e8, 79655178, 78564cc3: found in `git log`.
