---
phase: "85"
slug: "statistics"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-31"
---

# Phase 85 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 85-RESEARCH.md § Validation Architecture (B2B attribution updated per CONTEXT D-19: user_id OR client_email).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.1 (jsdom default; `// @vitest-environment node` for server/SQL-text tests) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/stats-migration.test.ts tests/admin-stats-routes.test.ts tests/admin-stats-period.test.ts tests/stats-page.test.tsx` |
| **Full suite command** | `npx vitest run` + `npx tsc --noEmit` + `npx eslint --quiet <changed files>` (`verify` skill) |
| **Estimated runtime** | ~90 seconds (full), ~10 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** quick run command (files touched)
- **After every plan wave:** quick run + `tests/chat-store.test.ts tests/chat-intake.test.ts tests/BookingsTable.test.tsx tests/panel-bookings-migration.test.ts tests/infra-vps-isolation-guard.test.ts` + `npx tsc --noEmit`
- **Before `/gsd-verify-work`:** full suite green, `verify` skill PASS, live smokes `SMOKE_OK_85_01` and `SMOKE_OK_85_03` returned, backfill applied and `channel IS NULL` count reported
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| STAT-01 | 081 text contract: channel column + CHECK, `chat_channel_bucket`, 6-arg reserve REVOKE/GRANT, `stats_*` STABLE SECURITY DEFINER `search_path ''`, 90-day window, `LIMIT 1` lateral, `Europe/Prague`, five paid statuses, `leg IS DISTINCT FROM 'return'`, no `pickup_date ::` cast | unit (static SQL) | `npx vitest run tests/stats-migration.test.ts` | ❌ W0 | ⬜ pending |
| STAT-01 | live funnel correctness (converts once, one booking closes two inquiries, 90-day edge, explicit converted_booking_id beyond window, cancelled excluded, Prague-midnight edge, channel buckets, direct rows) | live rolled-back SQL smoke | MCP `execute_sql` `85-01-smoke.sql` → `SMOKE_OK_85_01` | ❌ W0 (orchestrator) | ⬜ pending |
| STAT-01 | intake persists raw channel via `reserveLead` | unit | `npx vitest run tests/chat-store.test.ts tests/chat-intake.test.ts` | ✅ edit | ⬜ pending |
| STAT-01/02/03 | stats routes: 401, 403, 400 (bad/reversed/impossible dates), 200 passes `p_from/p_to`, generic 500 | unit | `npx vitest run tests/admin-stats-routes.test.ts` | ❌ W0 | ⬜ pending |
| D-13 | period presets + `parsePeriod` with injected `now` (Prague midnight) | unit | `npx vitest run tests/admin-stats-period.test.ts` | ❌ W0 | ⬜ pending |
| STAT-02 | `stats_customers` contract (migration 082): GNet excluded by `booking_source`, anonymised excluded, `>= 2`, `LIMIT 10` | unit (static SQL) | `npx vitest run tests/stats-customers-b2b-migration.test.ts` | ❌ W0 | ⬜ pending |
| STAT-02 | live: round trip = one trip, repeat rate num/den, revenue share, top 10, GNet with real email excluded | live smoke | MCP `85-03-smoke.sql` → `SMOKE_OK_85_03` (customers + B2B, plan 85-03) | ❌ W0 (orchestrator) | ⬜ pending |
| STAT-02 | Customers tab: rate with counts, rows link `/admin/bookings?search=<encoded email>` | component | `npx vitest run tests/stats-customers-tab.test.tsx` | ❌ W0 | ⬜ pending |
| STAT-02 | `BookingsTable` accepts email deep link | component | `npx vitest run tests/BookingsTable.test.tsx` | ✅ edit | ⬜ pending |
| STAT-03 | `stats_b2b` contract (migration 082): `account_type = 'corporate'`, COALESCE(user_id, email owner) attribution (D-19), period on `pickup_date` text | unit (static SQL) | `npx vitest run tests/stats-customers-b2b-migration.test.ts` | ❌ W0 | ⬜ pending |
| STAT-03 | live: personal accounts excluded, avg/last trip, share of total revenue | live smoke | MCP `85-03-smoke.sql` → `SMOKE_OK_85_03` | ❌ W0 (orchestrator) | ⬜ pending |
| STAT-03 / D-16 | B2B tab + tab shell: URL `?tab&from&to`, default 90 days, Overview unchanged | component | `npx vitest run tests/stats-page.test.tsx` | ❌ W0 | ⬜ pending |
| D-04 | backfill helper: pure parse/SQL emit, never prints names/emails | unit | `npx vitest run tests/channel-backfill.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/stats-migration.test.ts` — static contract for 081
- [ ] `tests/admin-stats-routes.test.ts` — three routes
- [ ] `tests/admin-stats-period.test.ts` — period helper
- [ ] `tests/stats-page.test.tsx` — tab shell + three tabs
- [ ] `tests/channel-backfill.test.ts` — backfill helper
- [ ] `.planning/phases/85-statistics/85-01-smoke.sql` (`SMOKE_OK_85_01`, migration 081) and `85-03-smoke.sql` (`SMOKE_OK_85_03`, migration 082) — live smokes (orchestrator-run)
- [ ] `tests/stats-customers-b2b-migration.test.ts`, `tests/stats-conversion-tab.test.tsx`, `tests/stats-customers-tab.test.tsx`
- [ ] Edit: `tests/chat-store.test.ts`, `tests/chat-intake.test.ts`, `tests/BookingsTable.test.tsx`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chatwoot channel backfill of existing rows | STAT-01 / D-04 | Needs Chatwoot API token on owner Mac (`~/.config/prestigo/chatwoot-api.env`) | Owner runs `node infra/chatwoot/channel-backfill.mjs`, orchestrator applies printed UPDATE SQL via MCP, reports `channel IS NULL` count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
