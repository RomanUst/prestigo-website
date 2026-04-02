---
phase: 11
slug: database-schema
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run tests/pricing.test.ts` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** N/A — SQL migrations have no unit test equivalent
- **After every plan wave:** Run `SELECT * FROM pricing_config; SELECT * FROM pricing_globals; SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'coverage_zones';` in Supabase Dashboard SQL Editor
- **Before `/gsd:verify-work`:** All three tables visible in Dashboard with correct schema and seed data
- **Max feedback latency:** Manual SQL query — immediate in Dashboard

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | PRICING-05 | manual | `SELECT * FROM pricing_config;` in Dashboard | N/A — DB migration | ⬜ pending |
| 11-01-02 | 01 | 1 | PRICING-05 | manual | `SELECT * FROM pricing_globals;` in Dashboard | N/A — DB migration | ⬜ pending |
| 11-01-03 | 01 | 1 | ZONES-04 | manual | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'coverage_zones';` | N/A — DB migration | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

*No new test files needed — schema verification is manual SQL query, not unit test. `prestigo/tests/pricing.test.ts` exists with `it.todo` stubs; those will be filled in Phase 12 when the DB reader is implemented.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `pricing_config` table exists with correct columns and 3 seed rows | PRICING-05 | DB migration — not testable via Vitest/jsdom | After `supabase db push`, run `SELECT * FROM pricing_config;` in Dashboard SQL Editor; verify 3 rows: business/2.80/55/320, first_class/4.20/85/480, business_van/3.50/70/400 |
| `pricing_globals` table exists with correct singleton seed row | PRICING-05 | DB migration — not testable via Vitest/jsdom | Run `SELECT * FROM pricing_globals;` — must return 1 row with: airport_fee=0, night_coefficient=1.0, holiday_coefficient=1.0, extra_child_seat=15, extra_meet_greet=25, extra_luggage=20 |
| `coverage_zones` table exists with correct schema, no seed data | ZONES-04 | DB migration — not testable via Vitest/jsdom | Run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'coverage_zones' ORDER BY ordinal_position;` — must return: id/uuid, name/text, geojson/jsonb, active/boolean, created_at/timestamp with time zone |
| RLS enabled on all 3 new tables with public-read policy | PRICING-05, ZONES-04 | RLS policy check requires DB introspection | Run `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('pricing_config','pricing_globals','coverage_zones');` — rowsecurity must be `t` for all 3 |
| Seed values match `lib/pricing.ts` constants exactly | PRICING-05 | Cross-file comparison — not automatable in current test setup | Cross-check INSERT values in migration 0002 against `prestigo/lib/pricing.ts` constants and `prestigo/lib/extras.ts` extra fees |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (manual SQL in Dashboard is immediate)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
