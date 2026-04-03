---
phase: 18
slug: schema-foundation-zone-logic-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/calculate-price.test.ts` |
| **Full suite command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/calculate-price.test.ts`
- **After every plan wave:** Run `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 0 | ZONES-06 | unit | `npx vitest run tests/calculate-price.test.ts` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | ZONES-06 | unit | `npx vitest run tests/calculate-price.test.ts` | ✅ | ⬜ pending |
| 18-01-03 | 01 | 1 | ZONES-06 | unit | `npx vitest run tests/calculate-price.test.ts` | ✅ | ⬜ pending |
| 18-02-01 | 02 | 2 | schema | manual | Supabase Dashboard → Table Editor → verify columns | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/lib/zones.ts` — must be created (exports `isInAnyZone`) before Wave 1 tests can import from it
- [ ] 4 new `isInAnyZone` unit tests in `tests/calculate-price.test.ts` — written as Wave 0 stubs (red) before production code

*Wave 0 is part of Plan 01 (TDD flow): write failing tests first, then create `lib/zones.ts` to make them green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `bookings` has `status`, `operator_notes`, `booking_source` columns | schema | DB migration applied via Supabase Dashboard — no CLI | Supabase Dashboard → Table Editor → bookings → verify 3 columns present |
| `payment_intent_id` is nullable | schema | DB state verification | Supabase Dashboard → Table Editor → bookings → check nullable flag on payment_intent_id |
| `promo_codes` table exists (empty) | schema | DB migration verification | Supabase Dashboard → Table Editor → promo_codes table visible |
| `pricing_globals` has `holiday_dates JSONB` column | schema | DB migration verification | Supabase Dashboard → Table Editor → pricing_globals → holiday_dates column visible |
| Backfill: existing rows have status='confirmed', booking_source='online' | schema | Requires DB query | Supabase Dashboard → SQL Editor → `SELECT status, booking_source FROM bookings LIMIT 10` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`lib/zones.ts` must exist before tests run)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
