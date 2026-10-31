---
phase: 85-statistics
verified: 2026-10-31T15:40:00Z
status: human_needed
score: 8/8 must-haves verified
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
covered_digest: "v2:sha256:896478bd0e049b9ff6c6ba9b8d4d197781a9d5688b4c0a72e33e71134644d13f"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Log in to /admin, open Stats, click through Overview, Conversion, Customers and B2B. Change the period (preset and custom range), copy the URL into a new tab, and click a top-customer name and a B2B account name."
    expected: "Each tab renders its tables and KPI cards in the admin dark theme with no layout breakage. The Conversion tab shows the 8 fixed source rows plus a Total row and a Direct bookings table. Customers shows the repeat rate, repeat revenue share and top repeat customers. B2B shows the accounts with revenue, bookings and average. The pasted URL reopens the same tab and period. The customer link opens /admin/bookings pre-filtered by that email. The account link opens /admin/accounts/<id>. Live numbers match the orchestrator probes (90 days: 15 inquiries, 1 converted, 14 window-open; 15 customers, 5 repeat; B2B 4907 of 10120 EUR)."
    why_human: "The authenticated page has never been rendered in a browser. The agent cannot log in, and localhost login is blocked by the fail-closed Upstash limiter. Unit tests use jsdom, so they prove structure and fetch behavior, not visual rendering."
  - test: "Decide on code-review warning WR-01 (bookings that follow an inquiry but are not its first conversion appear in neither the funnel revenue nor the Direct table)."
    expected: "Either accept the gap (document it) or schedule migration 083 and a ConversionTab reconciliation row."
    why_human: "Product and accounting decision. The review disposition lists it as open and owner decision pending."
---

# Phase 85: Statistics Verification Report

**Phase Goal:** The owner can see, on an admin stats dashboard, how conversations and CRM data turn into revenue.
**Verified:** 2026-10-31
**Status:** human_needed
**Re-verification:** No, initial verification.

## Goal Achievement

All code, data and API paths for the three success criteria exist, are wired and are backed by passing tests. The two RPC migrations were smoke-tested live by the orchestrator. The only open items are a browser look at the authenticated page, which the agent cannot do, and the open WR-01 owner decision.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / STAT-01: `/admin/stats` shows inquiries to bookings conversion by source/channel for a chosen period | VERIFIED | `ConversionTab.tsx` fetches `/api/admin/stats/conversion?from&to` and renders one row per FUNNEL_SOURCES entry (Inquiries, Converted, Conversion with counts, Revenue EUR), a Total from `funnel_total`, a window-open note and a Direct bookings table. The route calls `rpc('stats_conversion')`, and `stats_conversion` in migration 081 unions chat_leads, inquiries and abandoned checkouts, matches them to paid trips (90-day window, explicit `converted_booking_id` first), and returns the nine fixed funnel sources and eight direct sources. Orchestrator live probe: funnel_total 15 inquiries, 1 converted, 14 window_open; direct_total 37. |
| 2 | SC2 / STAT-02: `/admin/stats` shows repeat-customer rate and a list of top repeat customers | VERIFIED | `CustomersTab.tsx` renders REPEAT RATE, REPEAT REVENUE SHARE and REPEAT CUSTOMERS KPI cards and a top-10 table with Name, Email, Trips, Revenue, First trip, Last trip. Names link to `/admin/bookings?search=<encodeURIComponent(email)>`. `stats_customers` (migration 082) excludes GNet and anonymised rows, treats a round trip as one trip, and defines repeat as 2 or more trips all-time. Live probe: 15 customers, 5 repeat, repeat revenue 5216 of 10061 EUR. |
| 3 | SC3 / STAT-03: `/admin/stats` shows B2B revenue and bookings per Account | VERIFIED | `B2BTab.tsx` renders B2B REVENUE with its share of all revenue, B2B BOOKINGS and CORPORATE ACCOUNTS cards, and a per-account table (Bookings, Revenue, Avg, Last trip) linking to `/admin/accounts/<user_id>`. `stats_b2b` attributes trips by `COALESCE(user_id, auth.users id by normalised email)` for `account_type='corporate'` profiles. Live probe: 8 accounts, 5 account rows, B2B 10 bookings and 4907 EUR of 24 bookings and 10120 EUR. |
| 4 | D-04: chat channel is stored in Supabase at intake and backfilled; the stats page never calls Chatwoot or EspoCRM at render time | VERIFIED | `chat_leads.channel` with CHECK constraint, `chat_channel_bucket`, and 6-arg `chat_lead_reserve` that writes the channel on the INSERT path only (081). `lib/chat-intake.ts:477` passes `channel: s.conversation.channel`, and `lib/chat-store.ts:238` sends `p_channel`. Backfill ran (email 7, web 2, NULL 0). The stats routes and tabs import no Chatwoot or EspoCRM module, and `infra-vps-isolation-guard.test.ts` passes. |
| 5 | Admin-only access: all three new routes require an admin session and validate the period before any RPC | VERIFIED | Each route calls `getAdminUser()` first (401/403), then `parsePeriod` (400 `Invalid period`), then the RPC. RPC errors and zod-shape failures return a generic 500 `DB read failed` with the message logged server-side only. `admin-stats-routes.test.ts` passes. Orchestrator dev probe: unauthenticated GET returns 401 for all three, and `/admin/stats` returns a 307 redirect to login. |
| 6 | D-13/D-16: tabbed page Overview, Conversion, Customers, B2B; tab and period live in the URL; only the active tab fetches; the period applies to the three new tabs | VERIFIED | `page.tsx` has the four tabs in order, reads `?tab&from&to` once after mount from `window.location` (no search-params hook), and calls `history.replaceState(window.history.state, ...)` on change. `PeriodSelector` is shown for every tab except Overview. Each tab aborts its in-flight request on a period change and ignores stale keys. `stats-page.test.tsx` passes. |
| 7 | D-16: Overview content and its endpoint are unchanged | VERIFIED | `app/api/admin/stats/route.ts` has not changed since its original commit 4db90212. `OverviewTab.tsx` fetches only `/api/admin/stats`, and the Overview tests pass. |
| 8 | No hard-coded currency literals; stats functions are read-only and not callable by anon or authenticated | VERIFIED | No `€` anywhere in `lib/admin-stats.ts`, `components/admin/stats/*` or the stats routes; `formatEur` prints cs-CZ grouping plus the word EUR. Migrations 081 and 082 declare every function STABLE with `SET search_path = ''` and contain no writes besides `chat_lead_reserve`. They REVOKE from PUBLIC, anon, authenticated and GRANT to service_role on the new signatures. The old 5-arg `chat_lead_reserve` is dropped, so there is a single overload. Live advisors show no ERROR and nothing naming a 081 or 082 function. |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified).

SQL behavior (window edges, paid-status filtering, abandoned dedup, explicit conversion beyond 90 days, shared-phone exclusion, Prague day boundaries, GNet exclusion, round-trip handling) is covered by the rolled-back live smokes. `85-01-smoke.sql` and `85-03-smoke.sql` contain dozens of named `SMOKE_FAIL_*` assertions. The orchestrator confirmed they returned exactly `SMOKE_OK_85_01` and `SMOKE_OK_85_03` on the live database with 0 leftover rows. I read the smoke files and the migrations. I cannot execute SQL from here, so this rests on the orchestrator evidence.

### Deferred Items

None. Items from the review (WR-01..03, IN-01..07) are not scheduled in a later milestone phase. They stay recorded in `85-REVIEW-DISPOSITION.md`, with no ROADMAP backlog entry yet.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/081_stats_conversion.sql` | channel column, bucket fn, 6-arg reserve, `stats_trips`, `stats_conversion` | VERIFIED | 402 lines, live, smoke OK |
| `supabase/migrations/082_stats_customers_b2b.sql` | `stats_customers`, `stats_b2b` | VERIFIED | 227 lines, live, smoke OK, reuses `stats_trips` (the status list is not repeated) |
| `lib/admin-stats.ts` | period schema, presets, response schemas, labels, formatters | VERIFIED | 251 lines, imports only zod |
| `app/api/admin/stats/{conversion,customers,b2b}/route.ts` | three guarded GET routes | VERIFIED | identical guard, period check and RPC shape |
| `components/admin/stats/{Conversion,Customers,B2B,Overview}Tab.tsx`, `PeriodSelector.tsx`, `StatsTable.tsx` | tab UI | VERIFIED | substantive, wired from `page.tsx` |
| `app/(internal)/admin/(dashboard)/stats/page.tsx` | tab shell with URL state | VERIFIED | |
| `lib/chat-intake.ts`, `lib/chat-store.ts` | channel written at intake | VERIFIED | `p_channel` sent; tests assert null when absent |
| `infra/chatwoot/channel-backfill.mjs` + `tests/channel-backfill.test.ts` | GET-only backfill | VERIFIED | executed once, output files deleted and never tracked |
| `components/admin/BookingsTable.tsx` | strict-email deep link | VERIFIED | `DEEP_LINK_EMAIL`, max 254 characters, seeds search plus horizon=all |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| routes | `rpc('stats_conversion' / 'stats_customers' / 'stats_b2b')` | WIRED | |
| `stats_conversion`, `stats_customers`, `stats_b2b` | `stats_trips()` | WIRED | MATERIALIZED CTE in all three |
| `leadFor` | `reserveLead` | `chat_lead_reserve` | WIRED | `channel: s.conversation.channel`, then `p_channel`, then `chat_channel_bucket(p_channel)` |
| Tabs | their endpoint | WIRED | `fetch` with `periodQuery`, `AbortController` |
| CustomersTab | `/admin/bookings?search=` | `BookingsTable` | WIRED | `encodeURIComponent(email)` |
| B2BTab | `/admin/accounts/<id>` | WIRED | |
| AdminSidebar | `/admin/stats` | WIRED | existing link |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| ConversionTab | `funnel`, `direct`, totals | `stats_conversion` over `chat_leads`, `inquiries`, `bookings`, identity tables | Yes (live probe: 15 inquiries, 37 direct) | FLOWING |
| CustomersTab | KPIs, `top` | `stats_customers` | Yes (live probe: 15 customers, 5 repeat) | FLOWING |
| B2BTab | accounts, totals | `stats_b2b` over `customer_profiles`, `auth.users`, trips | Yes (live probe: 5 account rows, 4907 EUR) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Stats, channel, intake and isolation tests | `npx vitest run` over 12 stats, channel, chat-store, chat-intake, isolation and admin-bookings files | 12 files, 445 tests passed | PASS |
| Types and lint | `npx tsc --noEmit`, `npx eslint --quiet` on the stats files | No errors outside the `tests/` baseline; eslint clean | PASS |
| Full suite (orchestrator) | after final merge | 296 files, 7834 tests passed | PASS |

### Probe Execution

No `probe-*.sh` scripts are declared or present for this phase. Skipped. The rolled-back SQL smokes (live, orchestrator-run) serve as the equivalent runnable proof.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| STAT-01 | 85-01, 85-02, 85-04, 85-05, 85-06 | Inquiries to bookings conversion by source/channel for a chosen period | SATISFIED | Truths 1, 4, 6. Needs a browser check (human item 1). |
| STAT-02 | 85-02, 85-03, 85-06 | Repeat-customer rate and top repeat customers | SATISFIED | Truth 2 |
| STAT-03 | 85-02, 85-03, 85-05 | B2B revenue and bookings per Account | SATISFIED | Truth 3 |

All three IDs appear in the PLAN frontmatter and in REQUIREMENTS.md lines 84-86, and no orphaned requirements exist for Phase 85. Note: REQUIREMENTS.md still shows the checkboxes unchecked and the traceability rows (lines 160-162) as "Pending". The orchestrator should tick them when it closes the phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files) | - | TBD, FIXME, XXX, TODO, HACK | none | None found in any file modified by the phase |
| `supabase/migrations/081_stats_conversion.sql` | 253-318 | WR-01 (review, open): a booking after an inquiry that is not its first conversion is in neither funnel revenue nor the Direct table | Warning | Funnel revenue plus direct revenue can be lower than period revenue. `trips_in_period` and `attributed_bookings` are returned but not rendered. |
| `supabase/migrations/081_stats_conversion.sql` | 158-161, 216-242 | WR-02 (review, open): trip and inquiry person keys come from different tables | Warning | A conversion can be missed. Live impact is 0 trips. |
| `supabase/migrations/081_stats_conversion.sql` | 167-175 | WR-03 (review, open): CZK*0.04 fallback differs from `panel_bookings` (080) and is not labelled as an estimate | Warning | 2 live paid rows are affected. EUR amounts may differ slightly from the Chatwoot panel. |
| IN-01, IN-03, IN-04, IN-06, IN-07 | various | Review info items, open | Info | Edge cases only. IN-02 and IN-05 need no change. |

No review item is a Blocker. The code review reported 0 critical findings. All the warnings are accounting-consistency issues on already-live migrations, so a fix needs a new forward migration 083.

### Human Verification Required

1. **Authenticated browser pass over `/admin/stats`.**
   - Test: log in as admin, open Stats and click all four tabs. Change the preset and the custom range. Copy the URL into a new tab. Click a top-customer name and a B2B account name.
   - Expected: tables and KPI cards render correctly in the dark theme. The URL round-trips tab and period. The deep links open the right filtered view. Numbers are in line with the live probes.
   - Why human: visual rendering of an authenticated page cannot be checked by the agent, and unit tests run in jsdom.

2. **Owner decision on WR-01.** Accept the funnel and direct revenue reconciliation gap, or plan migration 083 plus a UI row. Also decide whether WR-02 and WR-03 are fixed in the same migration.

### Gaps Summary

No goal-blocking gaps. All three success criteria are implemented end to end (migration, RPC, route, UI), wired and backed by tests and live smokes. The status is `human_needed` rather than `passed` for two reasons: the authenticated page has not been seen in a browser, and WR-01 is an open owner decision. WR-01 is flagged as a warning because it affects how completely the revenue columns reconcile. It does not affect the conversion counts themselves.

---

_Verified: 2026-10-31_
_Verifier: Claude (gsd-verifier)_
