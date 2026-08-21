# Deferred Items — Phase 63

Out-of-scope discoveries logged during plan execution (per executor scope-boundary rule: only auto-fix issues directly caused by the current task's changes).

## From Plan 01 (63-01)

- **Pre-existing test failures in `tests/admin-bookings.test.ts`** — `POST /api/admin/bookings` Test 5 and Test 6 fail with `TypeError: supabase.from(...).insert is not a function`. Confirmed via `git stash` that these failures exist on clean HEAD (before this plan's changes) — the shared `makeChainable()` mock's `insert()` returns a non-thenable chain object in a code path that calls `.insert([row]).select().single()` without an intervening `.select()` mock branch matching what Test 5/6 expect. Not caused by Plan 01's changes (Plan 01 only touched `lib/email.ts`, added a new migration file, added a new test file, and added *new* unused fixtures to `tests/admin-bookings.test.ts` before the existing `describe` blocks — it did not modify the `beforeEach`/`makeChainable` mock or the POST test cases). Left unfixed; someone touching the POST handler test suite should investigate.
