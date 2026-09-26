---
phase: 75-e2e-verification-launch
plan: 17
subsystem: database
tags: [supabase, postgres, migration, i18n, admin]

requires:
  - phase: 75-e2e-verification-launch (plan 05)
    provides: "PaymentIntent metadata.locale (normalizeSiteLocale) already threaded through create-payment-intent's meta map and the Phase-62 unpaid-capture row input — this plan's buildBookingRow/buildBookingRows locale field reads from that same meta.locale"
provides:
  - "D-11 storage decision recorded: option-a (column + metadata), human-confirmed verbatim"
  - "supabase/migrations/062_bookings_locale.sql — additive nullable bookings.locale text column + bookings_locale_format_check CHECK constraint; no RPC/GRANT touched. NOT YET APPLIED to the live database — Task 3 is pending the orchestrator (see below)."
  - "buildBookingRow/buildBookingRows (lib/supabase.ts) write locale: meta.locale || null on every leg — unpaid capture, confirmed, and both round-trip legs get the same value; admin-created bookings never set meta.locale so they store null"
  - "types/database.types.ts bookings.locale (Row/Insert/Update)"
  - "components/admin/BookingsTable.tsx — LANGUAGE detail field (uppercase code or em dash) in both the desktop and mobile expanded row views"
affects: [75-19 (precondition: migration 062 must be applied live before any deploy that writes bookings.locale — otherwise every booking capture insert fails on an unknown column), 75-20 (re-run scripts/qa/booking_e2e.py / admin-visibility spot check once the column is live)]

actuals:
  tokens: 3050
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "bookings.locale follows the same additive-nullable-column + TEXT+CHECK convention as migrations 058-061 (no ENUM, no RPC touched) — sequential migration numbering (062 after 061)"
    - "buildBookingRows' outbound leg inherits new buildBookingRow fields for free via object spread; the manually-constructed return leg needs the same field added explicitly (locale: meta.locale || null) — a spot to check on any future buildBookingRow field addition"

key-files:
  created:
    - supabase/migrations/062_bookings_locale.sql
  modified:
    - lib/supabase.ts
    - types/database.types.ts
    - components/admin/BookingsTable.tsx
    - tests/supabase.test.ts
    - tests/BookingsTable.test.tsx

key-decisions:
  - "D-11 storage: option-a — Column + metadata (Recommended) — chosen verbatim by the human at the Task 1 checkpoint. Rationale carried in the plan: booking language visible in admin/dispatch, queryable in SQL for revenue-by-language, feeds the payment-link GA4 path; additive nullable column, no RPC touched. Trade-off accepted: one-way production migration that must be applied before Plan 75-19's deploy."
  - "Test-writing found the expanded detail panel renders as a sibling <tr> (colSpan row), not nested inside the clicked row's <tr> — assertions must query at document/container level via the LANGUAGE label's nextElementSibling, not `within(rowEl)`."
  - "Test-writing found both the desktop <table> and the mobile card list render simultaneously in jsdom (visibility is CSS-only, md:hidden/hidden md:block — jsdom does not evaluate media queries) — the mobile locale test scopes every query to the mobile-cards container to avoid ambiguous duplicate-text matches; this is a pre-existing repo-wide jsdom characteristic, not something this plan introduced."

requirements-completed: [VER-01]

duration: ~35min
completed: 2026-09-26
status: halted
---

# Phase 75 Plan 17: Booking Locale Storage — D-11 Decision + Column (Task 3 pending) Summary

**D-11 resolved as option-a (column + metadata); migration 062, buildBookingRow/buildBookingRows, types, and admin display all implemented and unit-tested — but the live schema push (Task 3) has NOT yet happened, so this plan halts pending the orchestrator's Supabase MCP application of the migration.**

## Performance

- **Duration:** ~35 min (Tasks 1–2 only; Task 3 is pending)
- **Tasks:** 2 of 3 complete (Task 3 requires orchestrator action — no Supabase MCP access from this executor)
- **Files modified:** 6 (1 created, 5 modified)

## Task 1: D-11 Storage Decision (RESOLVED)

**The human's choice, recorded verbatim:** `option-a` — "Колонка + metadata (Recommended)" (column + metadata).

This decision was already resolved by the human in the orchestrator session before this executor was dispatched (per the orchestrator's `<checkpoint_resolutions>` instruction). No further confirmation was sought from a human by this executor; Task 2 proceeded directly to implementing option-a.

## Task 2: Tracer — migration + booking row locale + admin display (COMPLETE, TDD)

Executed as `type="tracer" tdd="true"` — RED then GREEN, both committed atomically.

### Accomplishments

- `supabase/migrations/062_bookings_locale.sql` — `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS locale text NULL` + a separate `ADD CONSTRAINT bookings_locale_format_check CHECK (locale IS NULL OR locale ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$')`. No RPC, no GRANT statement anywhere in the file (verified by a non-comment grep). Follows the exact header/style convention of migrations 058–061 (sequential numbering, additive-nullable-column + TEXT+CHECK precedent, no ENUM).
- `lib/supabase.ts`: `buildBookingRow` now returns `locale: meta.locale || null`. `buildBookingRows`' outbound leg inherits this automatically via its existing object-spread of `buildBookingRow(...)`; the manually-built return leg got the same `locale: meta.locale || null` added explicitly so both legs of a round trip always carry the same value.
- `types/database.types.ts`: `locale: string | null` (Row) / `locale?: string | null` (Insert, Update) added to the `bookings` table types, in alphabetical position between `linked_booking_id` and `luggage`.
- `components/admin/BookingsTable.tsx`: `locale?: string | null` added to the `Booking` interface; a `"LANGUAGE"` `DetailField` (uppercase locale code, or an em dash when null) added to both the desktop expanded-row grid and the mobile expanded-card grid.
- Tests extended: `tests/supabase.test.ts` (5 new tests: unpaid-row locale, confirmed-row locale, null-meta -> null, round-trip both-legs-same-locale, round-trip both-legs-null) and `tests/BookingsTable.test.tsx` (3 new tests: desktop 'ru' -> 'RU', desktop null -> em dash, mobile 'zh' -> 'ZH').

### Verification

```
npx vitest run tests/supabase.test.ts tests/BookingsTable.test.tsx tests/webhooks-stripe.test.ts tests/create-payment-intent.test.ts
→ 4 test files passed, 129 passed | 5 todo (134 total)

npx tsc --noEmit
→ Only pre-existing, unrelated errors in tests/i18n-translate-dnt.test.ts,
  tests/nav-auth.test.tsx, tests/passenger-actions.test.ts (none in any file
  this plan touched — confirmed by comparing the error file list against
  key-files above).

npx eslint lib/supabase.ts types/database.types.ts components/admin/BookingsTable.tsx tests/supabase.test.ts tests/BookingsTable.test.tsx
→ clean, no output.

grep -vE '^\s*--' supabase/migrations/062_bookings_locale.sql | grep -iE "DROP|CREATE FUNCTION|GRANT"
→ no match (exit 1) — confirms no DROP/CREATE FUNCTION/GRANT statement.
```

### Task Commits

1. **RED — failing tests for bookings.locale (D-11)** — `eb07308a` (test)
2. **GREEN — migration + buildBookingRow/buildBookingRows locale + admin LANGUAGE field** — `af3deffe` (feat)

**Plan metadata:** this SUMMARY commit (see below).

## Task 3: Apply migration 062 to the live database — **PENDING (orchestrator)**

**Status: NOT DONE.** Executor subagents have no Supabase MCP access (per the plan's own instructions and this executor's dispatch prompt). The orchestrator must:

1. Call the Supabase MCP `apply_migration` with name `"062_bookings_locale"` and the exact SQL body of `supabase/migrations/062_bookings_locale.sql`.
2. Verify with `execute_sql`: `select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='locale'` — expect one row: `text`, `YES`.
3. Verify the constraint: `select conname from pg_constraint where conname='bookings_locale_format_check'` — expect one row.
4. Confirm no function grants changed: `select count(*) from information_schema.routine_privileges where routine_name='admin_search_bookings' and grantee in ('PUBLIC','anon','authenticated')` — expect `0`.

**Query results placeholder — TO BE FILLED IN BY THE ORCHESTRATOR:**

| Check | Expected | Actual result |
|---|---|---|
| `information_schema.columns` (locale column) | 1 row: `text`, `YES` | _pending_ |
| `pg_constraint` (`bookings_locale_format_check`) | 1 row | _pending_ |
| `routine_privileges` (`admin_search_bookings` PUBLIC/anon/authenticated grants) | `0` | _pending_ |

This plan is **not complete** until the table above is filled in with real query results and this SUMMARY is amended/re-committed by the orchestrator (or a continuation executor) confirming the live schema matches the migration file. Plan 75-19 has a hard precondition on this: deploying the code from Task 2 before Task 3's live application succeeds would make every booking-capture insert fail on an unknown column (T-75-34 in the plan's threat register).

## Files Created/Modified

- `supabase/migrations/062_bookings_locale.sql` — new migration (not yet applied live)
- `lib/supabase.ts` — `buildBookingRow`/`buildBookingRows` write `locale`
- `types/database.types.ts` — `bookings.locale` Row/Insert/Update
- `components/admin/BookingsTable.tsx` — `Booking.locale` + LANGUAGE detail field (desktop + mobile)
- `tests/supabase.test.ts` — 5 new locale tests
- `tests/BookingsTable.test.tsx` — 3 new locale tests

## Decisions Made

See `key-decisions` in frontmatter. Summary: D-11 resolved as option-a by the human (verbatim: "option-a" / "Колонка + metadata (Recommended)"); two test-authoring findings (sibling-`<tr>` expanded panel, simultaneous desktop+mobile DOM rendering in jsdom) were necessary to make the RED tests turn GREEN and are documented so future BookingsTable tests don't hit the same friction.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2. Task 3 is explicitly deferred to the orchestrator per this executor's dispatch instructions (not a deviation — it is how the plan itself is structured: `checkpoint:human-action` requiring Supabase MCP access this executor does not have).

## Issues Encountered

- Two test-writing findings while turning the BookingsTable RED tests GREEN (documented above as key-decisions, not code deviations): (1) the expanded detail panel is a sibling `<tr>`, not nested in the clicked row; (2) jsdom renders both the desktop table and the mobile card list at once regardless of viewport width (CSS-only visibility control), so mobile assertions must scope to the `mobile-cards` container. Both are pre-existing characteristics of this test file/component, not introduced by this plan; fixed by adjusting the new tests' query scoping, not by touching the component.

## User Setup Required

None — no external service configuration required. (Task 3's Supabase MCP application is an orchestrator action, not a user-setup step.)

## Next Phase Readiness

- **BLOCKING for Plan 75-19:** migration 062 must be applied to the live database (Task 3) before that plan's deploy. Do not deploy the code from this plan's GREEN commit (`af3deffe`) to production until Task 3's three verification queries are confirmed and recorded above.
- Once Task 3 completes, Plan 75-20's post-deploy verification can spot-check the admin BookingsTable's LANGUAGE field against a real non-EN booking.
- `PaymentLinkReconciledRow.locale` (added in Plan 75-05) will start returning real values with zero further code changes once the column exists and any reconciliation SELECT includes it — no action needed here, already forward-compatible.

## Self-Check: PASSED (Tasks 1–2 only; Task 3 explicitly incomplete)

- `supabase/migrations/062_bookings_locale.sql` confirmed on disk.
- `lib/supabase.ts`, `types/database.types.ts`, `components/admin/BookingsTable.tsx` confirmed modified on disk.
- Both task commit hashes (`eb07308a`, `af3deffe`) confirmed in `git log --oneline`.
- Full required verify command re-run clean: `npx vitest run tests/supabase.test.ts tests/BookingsTable.test.tsx tests/webhooks-stripe.test.ts tests/create-payment-intent.test.ts` → 129 passed, 5 pre-existing `it.todo`; `npx tsc --noEmit` shows only pre-existing unrelated errors in 3 other files; `npx eslint` clean on all 5 touched files.
- Task 3's live-database verification is intentionally NOT marked passed — that is the entire point of this halted status.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-26 (Tasks 1–2 only — Task 3 pending orchestrator)*
