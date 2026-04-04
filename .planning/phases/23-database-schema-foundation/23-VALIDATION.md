---
phase: 23
slug: database-schema-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | SQL queries via Supabase MCP (no unit test framework — schema-only phase) |
| **Config file** | none — no Vitest/Jest coverage for DDL |
| **Quick run command** | Supabase MCP `execute_sql` query against staging DB |
| **Full suite command** | Run all 5 SQL verification queries from RESEARCH.md Validation Architecture |
| **Estimated runtime** | ~10 seconds (5 SQL queries) |

---

## Sampling Rate

- **After every task commit:** Run the SQL verification query specified in the task's acceptance criteria
- **After every plan wave:** Run all 5 SQL verification queries
- **Before `/gsd:verify-work`:** All 5 SQL success criteria must return expected results
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists |
|---------|------|------|-------------|-----------|-------------------|-------------|
| 23-01-01 | 01 | 1 | RTPM-02, RTPM-03 | SQL query | `SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name IN ('leg', 'linked_booking_id', 'outbound_amount_czk', 'return_amount_czk')` | ✅ |
| 23-01-02 | 01 | 1 | RTPM-02 | SQL query | `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='bookings' AND constraint_name='bookings_payment_intent_id_leg_key'` | ✅ |
| 23-01-03 | 01 | 1 | RTPM-03 | SQL query | `SELECT column_name FROM information_schema.columns WHERE table_name = 'pricing_globals' AND column_name = 'return_discount_pct'` | ✅ |
| 23-01-04 | 01 | 1 | RTPM-02 | SQL query | `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'create_round_trip_bookings'` | ✅ |
| 23-01-05 | 01 | 2 | RTPM-02, RTPM-03 | SQL + manual | Run all 5 success criteria queries; verify atomicity with intentional-fail test | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new test files needed — this is a SQL-only migration phase verified by direct DB queries.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Atomicity of `create_round_trip_bookings` on failure | RTPM-02 | Cannot automate transaction abort simulation without a test-specific PL/pgSQL call | Call `SELECT create_round_trip_bookings(valid_outbound_json, invalid_return_json)` and verify no rows were inserted |
| Existing booking rows unaffected by migration | RTPM-02 | Requires checking real data in staging | After applying migration, run `SELECT COUNT(*) FROM bookings WHERE leg != 'outbound'` — must return 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
