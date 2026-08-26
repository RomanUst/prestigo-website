# Deferred Items — Phase 62 (out of scope for this phase's plans)

## POST /api/admin/bookings test failures (pre-existing, unrelated to Phase 62)

**Found during:** 62-03 Task 2 (`npx vitest run tests/admin-bookings.test.ts`)

**Symptom:** `POST /api/admin/bookings > Test 5` and `Test 6` fail with
`TypeError: supabase.from(...).insert is not a function`.

**Root cause (not fixed — out of scope):** Confirmed via `git show 8d8e9e2:app/api/admin/bookings/route.ts`
(the commit immediately preceding 62-03 work) that the POST handler and its
test mocks are byte-identical to the pre-Phase-62 state — 62-03 only touches
GET and PATCH. This is a pre-existing bug in the manual-booking-creation test
mock chain (`POST /api/admin/bookings`, Phase 64 / ANEW territory), unrelated
to the `unpaid` status work. Left unfixed per the scope-boundary rule (do not
auto-fix pre-existing failures in code the current plan doesn't touch).

**Recommendation:** Fix when Phase 64 (Admin-Created Bookings with Payment
Link, ANEW-01..05) touches this POST handler/test file.

## Stale `getAdminUser` test mock — FIXED during 62-03 (documented for traceability)

**Found during:** 62-03 Task 2. `tests/admin-bookings.test.ts`'s
`vi.mock('@/lib/supabase/server', ...)` factory only exported `createClient`,
but `app/api/admin/bookings/route.ts` imports `getAdminUser` directly (moved
there by commit `9eee3c0`, well before Phase 62). Every test in the file
(GET/PATCH/POST, 34 pre-Task-2 tests) failed with
`No "getAdminUser" export is defined on the "@/lib/supabase/server" mock`.

This blocked Task 2's own required verification (`npx vitest run
tests/admin-bookings.test.ts`), so it was fixed inline per deviation Rule 3
(auto-fix blocking issues) — not left deferred. See the 62-03 SUMMARY
Deviations section for the fix and commit hash.
