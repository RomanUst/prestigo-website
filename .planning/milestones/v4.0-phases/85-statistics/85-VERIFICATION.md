---
phase: 85-statistics
verified: 2026-11-01T15:15:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - ".planning/phases/85-statistics/85-01-PLAN.md"
  - ".planning/phases/85-statistics/85-01-SUMMARY.md"
  - ".planning/phases/85-statistics/85-02-PLAN.md"
  - ".planning/phases/85-statistics/85-02-SUMMARY.md"
  - ".planning/phases/85-statistics/85-03-PLAN.md"
  - ".planning/phases/85-statistics/85-03-SUMMARY.md"
  - ".planning/phases/85-statistics/85-04-PLAN.md"
  - ".planning/phases/85-statistics/85-04-SUMMARY.md"
  - ".planning/phases/85-statistics/85-05-PLAN.md"
  - ".planning/phases/85-statistics/85-05-SUMMARY.md"
  - ".planning/phases/85-statistics/85-06-PLAN.md"
  - ".planning/phases/85-statistics/85-06-SUMMARY.md"
  - "app/(internal)/admin/(dashboard)/stats/page.tsx"
  - "app/api/admin/stats/b2b/route.ts"
  - "app/api/admin/stats/conversion/route.ts"
  - "app/api/admin/stats/customers/route.ts"
  - "components/admin/BookingsTable.tsx"
  - "components/admin/stats/B2BTab.tsx"
  - "components/admin/stats/ConversionTab.tsx"
  - "components/admin/stats/CustomersTab.tsx"
  - "components/admin/stats/OverviewTab.tsx"
  - "components/admin/stats/PeriodSelector.tsx"
  - "components/admin/stats/StatsTable.tsx"
  - "infra/chatwoot/channel-backfill.mjs"
  - "lib/admin-stats.ts"
  - "lib/chat-intake.ts"
  - "lib/chat-store.ts"
  - "supabase/migrations/081_stats_conversion.sql"
  - "supabase/migrations/082_stats_customers_b2b.sql"
  - "supabase/migrations/083_stats_conversion_period_totals.sql"
covered_digest: "v2:sha256:b71074a0868b958294ee059264e81f193110766cbfb41a6958075d263612300a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 8/8
  gaps_closed:
    - "Human item 1 (authenticated browser pass over /admin/stats): passed in 85-UAT.md test 1 (owner, production, 2026-11-01)"
    - "Human item 2 (owner decision on WR-01): owner chose to fix it; migration 083 applied live (SMOKE_OK_85_07) and ConversionTab got the 'All paid bookings created in this period' table (85-UAT.md test 2)"
  gaps_remaining: []
  regressions: []
---

# Phase 85: Statistics Verification Report

**Phase Goal:** The owner can see, on an admin stats dashboard, how conversations and CRM data turn into revenue.
**Verified:** 2026-11-01
**Status:** passed
**Re-verification:** Yes. The previous report (2026-10-31, `human_needed`, 8/8) went stale when commit cef7df94 (WR-01 fix) changed `lib/admin-stats.ts` and `components/admin/stats/ConversionTab.tsx` and added migration 083.

## Goal Achievement

The previous report had no `gaps:`. It was `human_needed` with two items, and both are now closed:

1. **Authenticated browser pass:** `85-UAT.md` test 1 passed. The owner checked `/admin/stats` on production: all four tabs, period presets and custom range, the URL round-trip, the customer and account deep links, and the live numbers.
2. **WR-01 decision:** `85-UAT.md` test 2 passed. The owner chose to fix it, and the fix is verified below as truth 9. WR-02 and WR-03 stay open by owner decision and are recorded as warnings, not gaps.

Truths 1-8 got a regression check (existence, wiring and the test run). Truth 9, the WR-01 fix and the only changed code, got the full three-level check.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / STAT-01: `/admin/stats` shows inquiries to bookings conversion by source/channel for a chosen period | VERIFIED | Regression: `ConversionTab` is still mounted from `page.tsx:119`. The funnel and direct tables are unchanged. In 083 the funnel CTEs are byte-identical to 081, which `stats-conversion-083-migration.test.ts` enforces. `stats-conversion-tab.test.tsx` passes. The owner confirmed it in the browser (UAT 1). |
| 2 | SC2 / STAT-02: `/admin/stats` shows repeat-customer rate and a list of top repeat customers | VERIFIED | Regression: `CustomersTab`, the customers route and migration 082 are unchanged since the last report. `stats-customers-tab.test.tsx` and `stats-customers-b2b-migration.test.ts` pass. Confirmed in UAT 1. |
| 3 | SC3 / STAT-03: `/admin/stats` shows B2B revenue and bookings per Account | VERIFIED | Regression: `B2BTab`, the b2b route and `stats_b2b` are unchanged. `stats-page.test.tsx` passes. Confirmed in UAT 1, including the account deep link. |
| 4 | D-04: chat channel is stored in Supabase at intake and backfilled; the stats page never calls Chatwoot or EspoCRM at render time | VERIFIED | Regression: `chat-store.test.ts`, `chat-intake.test.ts`, `channel-backfill.test.ts` and `infra-vps-isolation-guard.test.ts` pass. The stats routes and tabs import no Chatwoot or EspoCRM module. |
| 5 | Admin-only access: all three routes require an admin session and validate the period before any RPC | VERIFIED | Regression: `conversion/route.ts` still runs `getAdminUser()`, then 401/403, then `parsePeriod` (400), then `rpc('stats_conversion')`, then `conversionStatsSchema.safeParse`. A failure returns a generic 500. `admin-stats-routes.test.ts` passes, and its fixtures now include the 083 keys. |
| 6 | D-13/D-16: tabbed page with tab and period in the URL; only the active tab fetches | VERIFIED | Regression: `page.tsx` is unchanged and `stats-page.test.tsx` passes. Confirmed in UAT 1, including the URL round-trip. |
| 7 | D-16: Overview content and its endpoint are unchanged | VERIFIED | `app/api/admin/stats/route.ts` was last changed in 4db90212, its original commit. |
| 8 | No hard-coded currency literals; stats functions are read-only and not callable by anon or authenticated | VERIFIED | No `€` in 083, `ConversionTab.tsx` or `lib/admin-stats.ts`. The new table uses `formatEur`. 083 is `STABLE SECURITY DEFINER SET search_path = ''`, contains no writes, re-runs `REVOKE ... FROM PUBLIC, anon, authenticated` and `GRANT ... TO service_role`, and has exactly one `CREATE OR REPLACE FUNCTION` and no `DROP FUNCTION` (test-enforced). SMOKE_FAIL_7 and SMOKE_FAIL_8 in `85-07-smoke.sql` check the live privileges and function attributes. |
| 9 | WR-01 fix: every paid booking created in the period is accounted for (after a recorded inquiry + direct = period total) and shown on the Conversion tab | VERIFIED | **Migration:** `083_stats_conversion_period_totals.sql` adds `attributed_total` (period_trips where NOT is_direct) and `period_total` (all period_trips). Both come from the same `period_trips` CTE as `direct_total`, so the split adds up exactly. `amount_eur` is an integer column, so there is no per-bucket rounding drift. **Schema:** `conversionStatsSchema` in `lib/admin-stats.ts` requires both new objects. **Route:** passes the parsed data through unchanged. **UI:** `ConversionTab.tsx` renders the "All paid bookings created in this period" table with rows "After a recorded inquiry" and "Direct (no recorded inquiry)", a Total row from `period_total`, and an explanatory note. **Tests:** `stats-conversion-tab.test.tsx` ("ConversionTab period bookings table (WR-01)") asserts the rows 2/1216, 37/13407 and Total 39/14623. `stats-conversion-083-migration.test.ts` asserts that 083 equals 081 plus exactly the two added keys. **Live:** the orchestrator recorded `SMOKE_OK_85_07` (`85-07-smoke.sql`), which asserts funnel unchanged, direct 1/25, attributed 2/140, period 3/165, and period = attributed + direct. The owner confirmed it in UAT 2. |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified).

The SQL behavior of truth 9 rests on the rolled-back live smoke `85-07-smoke.sql`. I read the file. The verifier cannot run SQL, so the `SMOKE_OK_85_07` result comes from the orchestrator record in `85-UAT.md` and `85-REVIEW-DISPOSITION.md`. The smoke uses the same real paths as production (`identity_resolve_booking`, then `stats_conversion`), so it is a behavioral test rather than a fixture-only proof.

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/083_stats_conversion_period_totals.sql` | `stats_conversion` with `attributed_total` and `period_total` | VERIFIED | 235 lines. Same signature, grants re-run, applied live, smoke OK. |
| `lib/admin-stats.ts` | response schema with the 083 keys | VERIFIED | lines 189-191 |
| `components/admin/stats/ConversionTab.tsx` | period bookings table | VERIFIED | `periodRows` and `periodTotal` render through `StatsTable` with `totalRow` |
| `app/api/admin/stats/conversion/route.ts` | guarded route, schema-validated | VERIFIED | Unchanged. It validates the response with the extended schema. |
| `tests/stats-conversion-083-migration.test.ts` | text contract for 083 | VERIFIED | 3 tests pass |
| Migrations 081 and 082, the customers and b2b routes, the other tabs, `page.tsx`, intake, backfill and `BookingsTable` | as in the previous report | VERIFIED | regression check passed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `stats_conversion` (083) | `period_trips` CTE | `attributed_total` / `period_total` / `direct_total` | WIRED | All three come from one CTE, so the bucket sum equals the total. |
| `conversion/route.ts` | `conversionStatsSchema` | `safeParse(data)` | WIRED | Keys are required. A missing key would return a 500, which UAT 1 on production rules out. |
| `ConversionTab` | `stats.attributed_total` / `stats.period_total` | `periodRows` / `periodTotal` → `StatsTable` | WIRED | asserted by the WR-01 tab test |
| `page.tsx` | `ConversionTab` | `tab === 'conversion'` | WIRED | |
| Other links (RPCs to `stats_trips`, intake to `chat_lead_reserve`, deep links) | | | WIRED | unchanged since the previous report |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| ConversionTab (period table) | `attributed_total`, `period_total`, `direct_total` | `stats_conversion` (083), whose `period_trips` reads `stats_trips()` over `bookings` | Yes. Live 90 days: after inquiry 2 / 1216 EUR, direct 37 / 13407 EUR, total 39 / 14623 EUR (85-REVIEW-DISPOSITION.md) | FLOWING |
| ConversionTab (funnel, direct) | `funnel`, `direct` | `stats_conversion` | Yes | FLOWING |
| CustomersTab | KPIs, `top` | `stats_customers` | Yes | FLOWING |
| B2BTab | accounts, totals | `stats_b2b` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Stats, 083 contract, intake, backfill, isolation and bookings tests | `npx vitest run` over 13 files: admin-stats-period, admin-stats-routes, stats-conversion-083-migration, stats-conversion-tab, stats-customers-b2b-migration, stats-customers-tab, stats-migration, stats-page, channel-backfill, chat-store, chat-intake, infra-vps-isolation-guard, admin-bookings | 13 files, 449 tests passed | PASS |
| Type check | `npx tsc --noEmit` | 8 errors, all in the `tests/` baseline (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1) | PASS |
| Lint | `npx eslint --quiet` on the stats components, routes, page and `lib/admin-stats.ts` | clean | PASS |
| 083 live behavior | `85-07-smoke.sql` (orchestrator, Supabase MCP) | `SMOKE_OK_85_07` (recorded) | PASS (recorded evidence) |

### Probe Execution

No `probe-*.sh` scripts are declared or present for this phase. The rolled-back SQL smokes (85-01, 85-03, 85-07) are the equivalent runnable proof, run live by the orchestrator.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| STAT-01 | 85-01, 85-02, 85-04, 85-05, 85-06 (+ WR-01 fix) | Inquiries to bookings conversion by source/channel for a chosen period | SATISFIED | Truths 1, 4, 6, 9; UAT 1 |
| STAT-02 | 85-02, 85-03, 85-06 | Repeat-customer rate and top repeat customers | SATISFIED | Truth 2; UAT 1 |
| STAT-03 | 85-02, 85-03, 85-05 | B2B revenue and bookings per Account | SATISFIED | Truth 3; UAT 1 |

No requirements are orphaned. Housekeeping: `.planning/REQUIREMENTS.md` still shows STAT-01..03 unchecked (lines 84-86) and "Pending" (lines 160-162). The orchestrator should tick them when it closes the phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| 083, `ConversionTab.tsx`, `lib/admin-stats.ts` | - | TBD, FIXME, XXX, TODO, HACK, `€` | none | none found |
| `081`/`083` `stats_conversion` | inq_all / trips keys | WR-02 (open by owner decision): trip and inquiry person keys come from different identity tables | Warning | Live impact is 0 trips. Accepted. |
| `081_stats_conversion.sql` | stats_trips amount fallback | WR-03 (open by owner decision): the CZK*0.04 fallback differs from `panel_bookings` | Warning | 2 live paid rows are affected. Accepted. |
| IN-01, IN-03, IN-04, IN-06, IN-07 | various | Review info items, open | Info | Edge cases only, recorded in 85-REVIEW-DISPOSITION.md |

### Human Verification Required

None. Both items from the previous report are resolved in `85-UAT.md`: test 1 (the browser pass) passed, and test 2 (WR-01) was decided as "fix" and the fix is verified as truth 9.

### Gaps Summary

There are no gaps. All three success criteria (STAT-01..03) are implemented end to end, from migration through RPC and route to UI. They are wired, covered by passing unit tests and live rolled-back smokes, and the owner confirmed them in an authenticated browser pass on production. The WR-01 reconciliation fix (migration 083, the schema keys and the ConversionTab period table) is wired and tested, and its live behavior is backed by `SMOKE_OK_85_07`. WR-02 and WR-03 stay open as accepted warnings by owner decision. They do not block the phase goal.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
