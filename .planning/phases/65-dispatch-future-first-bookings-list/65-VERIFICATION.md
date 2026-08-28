---
phase: 65-dispatch-future-first-bookings-list
verified: 2026-08-28T19:55:00Z
status: human_needed
score: 20/21 must-haves verified
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "Open /admin/bookings on the live site with real booking rows spanning past and future pickup dates (no manual Date Range set)."
    expected: "The list renders only bookings with pickup_date >= today (Europe/Prague), ordered soonest-first (nearest upcoming trip at the top). Zero rows renders 'No upcoming trips' + the explanatory sentence, not a blank/loading table."
    why_human: "The horizon resolver (route.ts), the RPC's static-CASE ORDER BY (migration 059), and BookingsTable's fetch wiring are all proven correct at the unit/component level (mocked RPC args, mocked fetch responses) — code review independently confirmed the two ORDER BY sites are byte-identical and injection-proof. But no automated test in this phase executes the RPC against real Supabase rows and inspects the actual returned order; the 65-02 and 65-04 SUMMARYs both explicitly defer this to 'phase-level UAT' as a manual/UAT item, not an automated gate. This is an ordering invariant that presence+wiring checks cannot observe."
  - test: "In admin Settings, set Dispatch Default to 'Last N days' = 14 (or 'All'), save, then load /admin/bookings fresh (new tab / hard reload)."
    expected: "The Bookings page opens honoring the persisted choice (not the hardcoded 'future' fallback) — this is CR-01, the headline DISP-02 bug found by code review and fixed via the settingsLoaded mount-gate in bookings/page.tsx. A live click-through confirms the fix in the real browser, matching the passing 'CR-01 regression' test in tests/admin-bookings-kpi-decoupling.test.tsx."
    why_human: "The fix and its regression test are verified in code (see Goal Achievement below) and are strong evidence, but this is the single most consequential behavior in the phase and the plan's own <verification> sections list a live click-through as an explicit Manual/UAT item."
  - test: "On the live Settings page, click through Future only / Last N days / All, confirm the copper radio dot, conditional Days field + helper-text wrap at a narrow viewport, and the 'Saved'/'Failed to save — try again' feedback timing."
    expected: "Matches the UI-SPEC visuals; the widget never submits an invalid PATCH body when Days is cleared."
    why_human: "Visual/CSS fidelity (wrap behavior, timing) — code inspection confirms the correct logic and tokens (grep-verified: rgba(191,160,106,0.09) count 1, no stale rgb(184,115,51) literal), but rendering fidelity itself needs a browser."
behavior_unverified_items:
  - truth: "E2 populated: rows render future-first (nearest upcoming trip first), matching D-01 (65-02 must-have)"
    test: "Load /admin/bookings with real rows spanning past/future pickup dates, no manual Date Range."
    expected: "Rows appear ordered by pickup_date ascending, nearest-future trip first."
    why_human: "This is an ordering invariant enforced by a live Postgres RPC (static CASE ORDER BY) against real data; unit tests only assert the RPC is CALLED with p_sort='pickup_asc' and p_start_date=today (mocked), and the migration file's SQL is structurally correct, but no test executes the RPC against seeded rows and asserts the returned array order."
---

# Phase 65: Dispatch Future-First Bookings List Verification Report

**Phase Goal:** Dispatcher opens the admin bookings list page and by default sees only
relevant upcoming trips (future), with control over the time horizon that PERSISTS across
visits (a saved default) but can be OVERRIDDEN per session; KPI counters stay
accurate/independent of the filtered list.

**Verified:** 2026-08-28T19:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getPragueTodayISO()` returns server-computed Europe/Prague today, correct across DST/UTC boundary (D-01) | ✓ VERIFIED | `lib/prague-date.ts:13-15` uses `Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Prague'})`; `npx vitest run tests/prague-date.test.ts` — 5/5 pass |
| 2 | `shiftIsoDate(iso, days)` does whole-day calendar arithmetic | ✓ VERIFIED | `lib/prague-date.ts:23-27`; covered by the same passing test file |
| 3 | `admin_search_bookings` accepts `p_sort` and orders by `pickup_date` ASC/DESC/`created_at DESC` in BOTH ORDER BY sites (paged CTE + jsonb_agg), identical CASE expressions | ✓ VERIFIED | `supabase/migrations/059_admin_search_bookings_sort.sql:87-90,95-98` — `grep -c "CASE WHEN p_sort = 'pickup_asc'"` = 2 |
| 4 | `p_sort` ORDER BY is static CASE, never dynamic/concatenated SQL (T-65-01) | ✓ VERIFIED | Migration 059 body inspected — no `\|\| p_sort` or `EXECUTE '` construction; code review (65-REVIEW.md) independently confirmed |
| 5 | `pricing_globals` gains `dispatch_default_horizon` (default `'future'`) and `dispatch_horizon_days` (default `7`) | ✓ VERIFIED | `supabase/migrations/058_pricing_globals_dispatch_horizon.sql:20-24` matches spec exactly |
| 6 | Migrations 058/059 applied LIVE, 8-arg RPC re-GRANTed to `service_role` only | ✓ VERIFIED | 65-01-SUMMARY.md documents operator-run confirmation queries with exact outputs (`'future', 7`; RPC executes with no error; grants `{postgres, service_role}` only); task context corroborates live apply. Live DB re-query not possible in this sandbox (no service-role key in `.env.local`), so this rests on the documented operator confirmation rather than an independent re-query — reasonably strong evidence given the specific query outputs recorded, but noted as a limitation |
| 7 | GET `/api/admin/bookings` with `horizon=future` (no manual dates) resolves `p_start_date=<Prague today>`, `p_sort=pickup_asc` (DISP-01 tracer) | ✓ VERIFIED | `app/api/admin/bookings/route.ts:254-258`; `tests/admin-bookings.test.ts` — horizon-resolution describe block passes (11 tests) |
| 8 | E2 populated: rows render future-first (nearest upcoming trip first) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Resolver + RPC SQL are correct and unit-tested against mocked RPC args; no test exercises real DB row ordering. 65-02-SUMMARY and 65-04-SUMMARY both explicitly flag this as deferred to phase-level UAT |
| 9 | `horizon=past/all/last_n_days` resolve correct date bounds + adaptive sort; D-06 open-ended last_n_days | ✓ VERIFIED | `route.ts:259-284`; all cases covered and passing in `tests/admin-bookings.test.ts` |
| 10 | Explicit manual `startDate`/`endDate` take session precedence over horizon (D-07) | ✓ VERIFIED | `route.ts:254` (`if (horizon && !startDate && !endDate)`); D-07 test cases pass |
| 11 | `horizon` whitelisted via `KNOWN_HORIZONS`; `horizonDays` clamped to a positive integer, default 7 (V5) | ✓ VERIFIED | `route.ts:44,242-243,276-277`; clamp/whitelist tests pass. Code-review WR-01 (missing upper bound) is now fixed — `route.ts:277` adds `&& rawDays <= 3650` — though no dedicated regression test asserts the extreme-value case (minor, non-blocking gap, see Anti-Patterns) |
| 12 | Horizon resolution sits behind existing `getAdminUser()` 401/403 guard, no new auth surface (V4) | ✓ VERIFIED | `route.ts:220-222` guard runs before any horizon parsing |
| 13 | PATCH `/api/admin/settings` persists `dispatch_default_horizon`/`dispatch_horizon_days`; GET round-trips them (DISP-02, D-03) | ✓ VERIFIED | `app/api/admin/settings/route.ts:29,63-68`; `tests/admin-settings.test.ts` round-trip tests pass |
| 14 | Invalid horizon rejected 400; `dispatch_horizon_days` clamped 1..365 | ✓ VERIFIED | `settingsPatchSchema` (`route.ts:7-19`) enum + `min(1).max(365)`; 400 tests pass |
| 15 | PATCH `.update()` built only from present fields — no clobbering | ✓ VERIFIED | `route.ts:59-68` field-by-field assembly; non-clobber test passes |
| 16 | DispatchDefault widget renders persisted horizon (copper dot); Days field + helper text only for Last N days | ✓ VERIFIED | `components/admin/DispatchDefault.tsx:131-193,195-242` — conditional render on `horizon === 'last_n_days'`; grep-verified styling tokens |
| 17 | Invalid/cleared Days clamps to persisted/default 7 on blur, never PATCHes invalid body | ✓ VERIFIED | `DispatchDefault.tsx:56-64` — `handleDaysBlur` returns early without calling `persist()` when invalid |
| 18 | Save failure shows 'Failed to save — try again' + reverts; success shows 'Saved' | ✓ VERIFIED | `DispatchDefault.tsx:46-53,77-85` |
| 19 | BookingsTable holds TWO state slots (persisted default from props, read-only after mount; ephemeral override); control NEVER PATCHes settings; remount resets to persisted default (D-04) | ✓ VERIFIED | `BookingsTable.tsx:1070` (`useState<string>(defaultHorizon)`), segmented control only calls `setHorizon` (`:1530`); `tests/BookingsTable.test.tsx` D-04 remount test (unmount + remount with same prop) passes |
| 20 | Future/Past/All segmented control, exactly one active with copper styling, switching changes only the horizon fetch param | ✓ VERIFIED | `BookingsTable.tsx:1502-1548`; `grep -c "rgba(191,160,106,0.09)"` = 1; component test passes |
| 21 | Horizon-aware empty state in BOTH mobile and desktop renders, distinct Future-vs-Past/All copy | ✓ VERIFIED | `BookingsTable.tsx:1752-1763` (mobile), `:2171-2182` (desktop) — verbatim distinct strings; test passes |
| 22 | Manual Date Range grays the active segment to inactive style (D-07) | ✓ VERIFIED | `BookingsTable.tsx:1498,1526` (`dateRangeActive` forces `isActive=false`); test passes |
| 23 | Distinct refetch-error state, not confused with empty state (backstop truth) | ✓ VERIFIED | `BookingsTable.tsx:1742,2156` (`fetchFailed`), color `#f87171`, distinct copy in both renders; test passes |
| 24 | `bookings/page.tsx` fetches `/api/admin/settings` on mount, passes `dispatch_default_horizon`/`dispatch_horizon_days` to BookingsTable as `defaultHorizon`/`horizonDays` (DISP-02 read side) | ✓ VERIFIED | `app/admin/(dashboard)/bookings/page.tsx:81-90,150-152` — CR-01-fixed: BookingsTable mount gated on `settingsLoaded` |
| 25 | KPI counters (TODAY, THIS WEEK) keep independent fetches, never gain a `horizon` param, unaffected by toggles (DISP-04, D-05) | ✓ VERIFIED | `page.tsx:50-75` unmodified two-fetch block; `tests/admin-bookings-kpi-decoupling.test.tsx` — 4/4 tests pass including exact-call-count assertion across a toggle |
| 26 | CR-01 fix: persisted default (differing from hardcoded 'future') is honored on initial load, not silently dropped | ✓ VERIFIED | `page.tsx:35-43,150` (`settingsLoaded` mount gate); dedicated regression test `'CR-01 regression: a persisted horizon that differs from the hardcoded "future" fallback is honored on initial load'` passes |

**Score:** 25/26 truths verified (1 present, behavior-unverified) — expressed against the phase's `success_criteria`/`must_haves` this maps to **20/21 distinct must-have bullets** (several PLAN.md bullets bundle 2+ of the above table rows).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/prague-date.ts` | Prague-today + shift helper | ✓ VERIFIED | Present, substantive, tested |
| `tests/prague-date.test.ts` | Unit tests | ✓ VERIFIED | 5 tests pass |
| `supabase/migrations/058_pricing_globals_dispatch_horizon.sql` | Horizon columns | ✓ VERIFIED | Present, exact shape, applied live per operator confirmation |
| `supabase/migrations/059_admin_search_bookings_sort.sql` | p_sort RPC | ✓ VERIFIED | Present, exact shape (incl. live-added REVOKE fix), applied live |
| `app/api/admin/bookings/route.ts` | Horizon resolver | ✓ VERIFIED | KNOWN_HORIZONS + resolver + WR-01 upper-bound fix present |
| `types/database.types.ts` | p_sort/p_status + pricing_globals columns | ✓ VERIFIED | WR-02 fix confirmed: `dispatch_default_horizon`/`dispatch_horizon_days` present in Row/Insert/Update (lines 802,804,823-824,843-844) |
| `components/admin/BookingsTable.tsx` | Segmented control, empty/error states | ✓ VERIFIED | All must-have behaviors present and wired |
| `app/api/admin/settings/route.ts` | Extended GET/PATCH | ✓ VERIFIED | Schema, GET select, PATCH assembly all match spec |
| `components/admin/DispatchDefault.tsx` | Settings widget | ✓ VERIFIED | Full component matches UI-SPEC contract |
| `app/admin/(dashboard)/settings/page.tsx` | Mounts DispatchDefault | ✓ VERIFIED | `grep -c DispatchDefault` = 2 |
| `app/admin/(dashboard)/bookings/page.tsx` | Settings-driven default, KPI decoupling | ✓ VERIFIED | CR-01 fix present and tested |
| `tests/admin-bookings.test.ts`, `tests/admin-settings.test.ts`, `tests/BookingsTable.test.tsx`, `tests/admin-bookings-kpi-decoupling.test.tsx` | Test coverage | ✓ VERIFIED | All pass (130/130 across the 5 phase-relevant test files; full suite 1100 passed, 0 failed) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| BookingsTable fetch | route.ts horizon resolution | `?horizon=<value>` query param | ✓ WIRED | Confirmed by code + `admin-bookings.test.ts`/`BookingsTable.test.tsx` |
| route.ts | `admin_search_bookings` RPC | `p_sort` named arg | ✓ WIRED | `route.ts:305`; `types/database.types.ts` Args includes `p_sort`/`p_status` (tsc clean for this file) |
| DispatchDefault PATCH | `/api/admin/settings` | `dispatch_default_horizon`/`dispatch_horizon_days` fields | ✓ WIRED | Round-trip test passes |
| settings GET | `bookings/page.tsx` settings fetch | Same `/api/admin/settings` response shape | ✓ WIRED | `page.tsx:82-89` reads `data.dispatch_default_horizon`/`data.dispatch_horizon_days` |
| `bookings/page.tsx` settings fetch | `BookingsTable` `defaultHorizon`/`horizonDays` props | `settingsLoaded` mount gate (CR-01 fix) | ✓ WIRED | Regression-tested; previously broken (code review CR-01), now fixed |
| segmented-control state | KPI fetches | Structural isolation (3rd independent `useEffect`) | ✓ NOT COUPLED (verified) | `admin-bookings-kpi-decoupling.test.tsx` proves 0 additional KPI fetches across a toggle |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DISP-01 | 65-01, 65-02 | Admin bookings list defaults to showing only future trips (pickup ≥ now) on load | ✓ SATISFIED (server logic fully proven; live-render ordering deferred to human verification) | Resolver + RPC static-CASE sort; `admin-bookings.test.ts` |
| DISP-02 | 65-01, 65-03, 65-04 | Admin can set a persistent default horizon that applies on every visit | ✓ SATISFIED | Settings round-trip + CR-01 fix + regression test |
| DISP-03 | 65-02, 65-04 | In-session UI filters override the saved default without changing the persisted setting | ✓ SATISFIED | Segmented control never PATCHes settings; D-04 remount test |
| DISP-04 | 65-04 | KPI counters remain accurate regardless of the active default/filter | ✓ SATISFIED | Dedicated D-05 guard test, structural isolation |

No orphaned requirements — REQUIREMENTS.md lists exactly DISP-01..04 for Phase 65, all four are claimed across the four plans' frontmatter `requirements:` fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/api/admin/bookings/route.ts` | 262-277 | `horizonDays` upper-bound clamp (WR-01 fix) has no dedicated regression test for the extreme-value case (e.g. `horizonDays=200000000`) | ℹ️ Info | Non-blocking — the fix itself is present and structurally correct (`&& rawDays <= 3650`); only test coverage for the specific overflow scenario is missing |

No debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) found in any phase-modified file. No stub patterns (empty returns, static fallback data, hardcoded-empty props) found in the reviewed source.

### Code Review Findings — Fix Verification

A code-review pass (65-REVIEW.md) found 1 critical + 2 warnings + 1 info issue. All four were independently re-verified against the CURRENT code in this pass:

- **CR-01** (critical — persisted default never applied, DISP-02 broken): **FIXED and regression-tested.** `bookings/page.tsx` now gates `<BookingsTable>` rendering behind a `settingsLoaded` flag set only after the `/api/admin/settings` fetch resolves (success or failure), so `BookingsTable`'s `useState(defaultHorizon)` initializer always sees the real persisted value on its one true mount. A dedicated regression test (`'CR-01 regression...'` in `tests/admin-bookings-kpi-decoupling.test.tsx`) stubs a persisted horizon (`'all'`) that differs from the hardcoded fallback (`'future'`) and asserts every list fetch carries `horizon=all`, never `horizon=future`. Passes.
- **WR-01** (warning — no upper bound on `horizonDays`, uncaught RangeError risk): **FIXED**, no upper-bound overflow was ever thrown in this pass's checks (clamp visually inspected: `rawDays > 0 && rawDays <= 3650`). No dedicated automated test for the extreme-value path (see Anti-Patterns, non-blocking).
- **WR-02** (warning — `types/database.types.ts` missing the two new `pricing_globals` columns): **FIXED.** `dispatch_default_horizon`/`dispatch_horizon_days` present in Row/Insert/Update shapes.
- **IN-01** (info — no test exercises "settings resolve after mount" scenario): **FIXED** — this is exactly the CR-01 regression test described above.

### Human Verification Required

1 item deferred from automated coverage plus 2 supplementary live-sanity checks (all listed in frontmatter `human_verification`):

1. **Future-first ordering with real data** — Load `/admin/bookings` with real rows spanning past/future pickup dates; confirm soonest-upcoming trip renders first. Why human: this is an ordering invariant enforced by a live Postgres RPC against real rows; unit tests only assert the RPC is *called* with the right sort/date args (mocked), not that the *returned* array is actually ordered correctly.
2. **CR-01 fix, live click-through** — Set a non-default horizon in Settings, reload the Bookings page fresh, confirm it opens honoring the persisted choice. Why human: highest-consequence behavior in the phase; code + regression test are strong evidence but the plans' own verification sections call for a live confirmation.
3. **DispatchDefault widget visual fidelity** — Copper radio dot, conditional Days field, helper-text wrap at narrow widths, Saved/Failed timing. Why human: CSS/visual rendering fidelity.

### Gaps Summary

No blocking gaps. All must-have artifacts exist, are substantive, and are wired correctly; all four requirement IDs (DISP-01..04) are satisfied at the code/test level; the full project test suite is green (100 files passed, 1100 tests passed, 0 failed) with no regressions. The one critical issue found by code review (CR-01 — the headline DISP-02 behavior) was fixed and is now covered by a passing regression test that specifically distinguishes "settings value propagated" from "hardcoded fallback silently used." One ordering-invariant truth (future-first row rendering against real data) cannot be proven by unit/component tests alone and is routed to human verification per the verifier's behavior-dependent-truth rule — this is not a code defect, just an inherent limit of mocked-RPC unit tests. Status is `human_needed`, not `gaps_found`.

---

*Verified: 2026-08-28T19:55:00Z*
*Verifier: Claude (gsd-verifier)*
