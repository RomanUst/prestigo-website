---
phase: 94-driver-cabinet
plan: 01
subsystem: auth
tags: [driver-cabinet, otp, session, supabase, rls, csrf, rate-limit, resend]
requires: []
provides:
  - "lib/driver-cabinet/auth.ts: code issue/verify, driver session create/lookup (getDriverSession)"
  - "POST /api/driver/cabinet/request-code and /verify"
  - "sendDriverLoginCodeEmail / buildDriverLoginCodeHtml"
  - "supabase/migrations/100_driver_cabinet.sql (file written, live apply PENDING)"
  - "tests/helpers/fake-driver-cabinet-db.ts (createFakeDriverCabinetDb)"
affects: [94-02, 94-03, 94-04, 94-05, 94-06, 94-07, 94-08, 94-09, 94-10, 94-11, 94-12, 94-13, 94-14]
tech-stack:
  added: []
  patterns:
    - "own auth tables (no Supabase Auth user, no Supabase-Auth cookie helpers), opaque hashed session"
    - "atomic attempt counting in a SECURITY DEFINER RPC under FOR UPDATE"
    - "uniform 200 for unknown / disabled emails; email sent in after()"
key-files:
  created:
    - lib/driver-cabinet/auth.ts
    - app/api/driver/cabinet/request-code/route.ts
    - app/api/driver/cabinet/verify/route.ts
    - supabase/migrations/100_driver_cabinet.sql
    - tests/helpers/fake-driver-cabinet-db.ts
    - tests/driver-cabinet-auth.test.ts
    - tests/driver-cabinet-email.test.ts
    - tests/driver-cabinet-migration.test.ts
    - .planning/phases/94-driver-cabinet/94-01-smoke.sql
  modified:
    - lib/email.ts
    - lib/rate-limit.ts
    - middleware.ts
    - tests/middleware-csrf-forms.test.ts
key-decisions:
  - "Session cookie is SameSite=Lax (Strict would drop it on the email deep link)"
  - "Code email does not use the email dedup log (it would block 'Send a new code' for 10 minutes); the limiter bounds repeats"
  - "A second request-code kills earlier unconsumed codes; verify checks only the newest unconsumed code, so an old code answers wrong_code while a newer one is pending and code_expired once none is pending"
  - "Email is trimmed before validation (z.string().trim().pipe(safeEmail(254))) so ' Ana@Example.com ' works as the plan's behavior list requires"
status: complete
commits: 3
plan_head_before: d134908f6f480595045c0466d9751a54698361c2
plan_head_after: 56253244e2211e98e2919da979547afdce382639
actuals:
  tokens: 16800
  tasks: 3
  commits: 3
completed: 2026-11-25
---

# Phase 94 Plan 01: Driver cabinet sign-in tracer Summary

Invited drivers sign in with a 6-digit emailed code and hold a 30-day opaque driver-only session (sha256 at rest, checked against `drivers.cabinet_enabled` on every request); migration 100 is written and text-pinned, live apply is handed to the orchestrator.

## What was built

- **Task 1 (tracer, commit 065719f6, `security:`)**: `lib/driver-cabinet/auth.ts` (code, hash, session, `getDriverSession`), the two route handlers, the sign-in code email in `lib/email.ts`, the shared fake DB helper and the end-to-end in-process test (request-code -> email -> verify -> cookie -> `getDriverSession`). 22 + 4 tests.
- **Task 2 (commit f6c77dcb, `security:`)**: `supabase/migrations/100_driver_cabinet.sql`, its text-pin test, six `/api/driver/cabinet/*` keys in `LIMITS` plus the 10-minute window for the hashed-email key, `/api/driver/cabinet` in both CSRF lists, middleware CSRF tests (evil Origin 403, missing Origin 403, site Origin passes).
- **Task 3 (commit 56253244)**: only the executor half: `94-01-smoke.sql` written. The live apply and the smoke run are the orchestrator's.

## Verification run by the executor

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-auth.test.ts tests/driver-cabinet-email.test.ts tests/driver-cabinet-migration.test.ts tests/middleware-csrf-forms.test.ts tests/middleware-matcher.test.ts`: 5 files, 130 tests passed.
- `npx tsc --noEmit`: 8 errors, all the old baseline in `tests/` (i18n-translate-dnt, nav-auth, passenger-actions); none in this plan's files.
- `npx eslint --quiet` on all new/changed source and test files: exit 0.
- Acceptance greps: no `@/lib/supabase/server` in auth.ts or the routes; `failClosed: true` twice in request-code, once in verify; no `logEmail` in request-code; `sameSite: 'lax'` present.

## Task 3: live apply (PENDING, ORCHESTRATOR_MCP_REQUIRED)

Executors have no Supabase MCP. The orchestrator must:

0. STEP 0 (before apply, read-only): run the two SELECTs at the top of `.planning/phases/94-driver-cabinet/94-01-smoke.sql` and paste the output below.
1. Apply `supabase/migrations/100_driver_cabinet.sql` to project enakcryrtxlnjvjutfpv (`apply_migration`, name `100_driver_cabinet`).
2. Run the DO block (STEP 1) of `94-01-smoke.sql`; expected result: an ERROR starting `SMOKE_OK_94_01` with only `true` values.
3. `SELECT count(*) FROM public.drivers WHERE email = 'smoke-94@example.invalid'` must be 0.
4. Re-run the pg_policies query: drivers / driver_assignments / bookings policy list unchanged; `get_advisors` (security) shows no new RLS warning for the three new tables.

Results to record here once done:

- STEP 0 output: PENDING
- apply result ("100 live"): PENDING
- SMOKE_OK_94_01 output: PENDING
- zero-row check: PENDING
- unchanged pg_policies rows: PENDING
- advisors: PENDING

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `tests/driver-cabinet-email.test.ts`**
- **Found during:** Task 1
- **Issue:** The plan listed no test for the new email builder/sender, which inlines the code into HTML and must never log the code or address.
- **Fix:** 4 tests: spec typography, no link/button, 6-digit gate, sender success/failure with a log-content check.
- **Files modified:** tests/driver-cabinet-email.test.ts
- **Commit:** 065719f6

**2. [Rule 1 - Bug avoided] Email trimmed before validation**
- **Found during:** Task 1
- **Issue:** zod's email check rejects surrounding spaces, but the behavior list requires `' Ana@Example.com '` to succeed.
- **Fix:** `z.string().trim().pipe(safeEmail(254))` in both routes.
- **Commit:** 065719f6

### Notes

- The plan's behavior line "verifying the first code answers code_expired" holds when no newer code is pending (the first row is deleted, verify finds no unconsumed row). While a newer code is pending, the first code answers `wrong_code` (it is checked against the newest row and counts one attempt). Both cases are tested. This follows the plan's own verify design (newest unconsumed row).
- The `verify` skill is not present in this worktree's `.claude/skills` (it lives in the main checkout); its steps (tsc, eslint, tests of changed modules, invariants) were run by hand as listed above.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-94-01..08 are all implemented: hashed codes and tokens, 5-attempt RPC, uniform answers, fail-closed limits, per-request `cabinet_enabled` check, no Supabase Auth mixing, deny-all tables, strict-Origin CSRF).

## Self-Check: PASSED

- FOUND: lib/driver-cabinet/auth.ts, app/api/driver/cabinet/request-code/route.ts, app/api/driver/cabinet/verify/route.ts, supabase/migrations/100_driver_cabinet.sql, tests/helpers/fake-driver-cabinet-db.ts, tests/driver-cabinet-auth.test.ts, tests/driver-cabinet-email.test.ts, tests/driver-cabinet-migration.test.ts, .planning/phases/94-driver-cabinet/94-01-smoke.sql
- FOUND commits: 065719f6, f6c77dcb, 56253244
