---
phase: 47
slug: db-migration-vehicle-map
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run tests/gnet-vehicle-map.test.ts` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run tests/gnet-vehicle-map.test.ts`
- **After every plan wave:** Run `cd prestigo && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | GNET-01 | — | Migration rejects FK violation | integration (Supabase MCP) | verify via Supabase MCP execute_sql | ✅ | ⬜ pending |
| 47-01-02 | 01 | 1 | GNET-01 | — | gnet_res_no UNIQUE enforced | integration (Supabase MCP) | verify via Supabase MCP execute_sql | ✅ | ⬜ pending |
| 47-02-01 | 02 | 0 | GNET-02 | — | N/A | unit | `cd prestigo && npx vitest run tests/gnet-vehicle-map.test.ts` | ❌ W0 | ⬜ pending |
| 47-02-02 | 02 | 1 | GNET-02 | — | returns null for unknown codes | unit | `cd prestigo && npx vitest run tests/gnet-vehicle-map.test.ts` | ❌ W0 | ⬜ pending |
| 47-02-03 | 02 | 1 | CLIENT-03 | — | all VehicleClass values covered | unit | `cd prestigo && npx vitest run tests/gnet-vehicle-map.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/tests/gnet-vehicle-map.test.ts` — stubs for GNET-02, CLIENT-03
- [ ] `prestigo/lib/gnet-vehicle-map.ts` — stub file (type signature only, throws NotImplemented)

*Framework (vitest) already installed — no install step needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies to live Supabase | GNET-01 | Requires Supabase MCP or CLI with project credentials | Run `supabase db push` or use MCP apply_migration; verify table via `\d gnet_bookings` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
