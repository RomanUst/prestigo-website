# Deferred Items — Phase 64 Plan 01

Out-of-scope discoveries logged per the executor's scope-boundary rule (do not
auto-fix pre-existing issues unrelated to the current task's files).

## Pre-existing full-suite test failures (unrelated to Phase 64)

Running `npx vitest run` (full suite) in this environment shows 66 pre-existing
failures across 12 test files, none of which import or exercise any file this
plan touches (`lib/stripe-payment-links.ts`, `lib/supabase.ts`, `lib/email.ts`,
`app/api/admin/bookings/route.ts`, `app/api/webhooks/stripe/route.ts`, or the
three new Wave-0 test files). Confirmed pre-existing by running the same suite
against the Plan 01 Task-1-only commit (`716dc4d`, before any Task 2
production-code changes) — the failure set and count were identical.

Affected files: `tests/BookingWidget.test.tsx`, `tests/BookingWizard.test.tsx`,
`tests/Step3Vehicle.test.tsx`, `tests/Step5Passenger.test.tsx`,
`tests/VehicleSlideshow.test.tsx`, `tests/account-trips.test.tsx`,
`tests/admin-assignment.test.ts`, `tests/admin-zones.test.ts`,
`tests/gnet-farmin.test.ts`, `tests/gnet-status-push.test.ts`,
`tests/google-reviews.test.ts`, `tests/validate-promo.test.ts`.

Also pre-existing (unrelated `tsc --noEmit` errors, same files at HEAD before
this plan): `tests/account-trips.test.tsx`, `tests/gnet-farmin.test.ts`,
`tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts`.

**Root cause (best-effort diagnosis, not fixed — out of scope):** this sandbox
shell does not have `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` exported
(`.env.local` is intentionally unreadable to the executor per project
convention). Several of these suites appear to assume those vars ARE present
(or exercise code paths unrelated to that fallback) and fail differently in
this environment than they likely do in the user's normal shell/CI. This is a
pre-existing environment-coupling issue, not a Phase 64 regression.

**Deviation note:** `tests/admin-bookings.test.ts` Tests 5/6 (POST, pre-Phase-64)
DID fall in scope and were fixed (see 64-01-SUMMARY.md Deviations) because
they live in the same file/describe block this plan's Tests 7-9 extend, and
the acceptance criteria requires the whole file green. All other failures
above are left untouched.

## Status

Deferred — no action taken. Not blocking Phase 64 Plan 01 completion.
