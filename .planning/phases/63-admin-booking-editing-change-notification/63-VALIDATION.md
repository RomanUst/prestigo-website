---
phase: 63
slug: admin-booking-editing-change-notification
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (see [[project_testing_patterns]]) |
| **Config file** | vitest.config.ts (repo root) |
| **Quick run command** | `npx vitest run <changed test files>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~TBD (planner to confirm against current suite) |

---

## Sampling Rate

- **After every task commit:** Run the quick command on the changed test files
- **After every plan wave:** Run the full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** TBD (planner to set)

---

## Per-Task Verification Map

*Seeded by plan-phase; the planner/validate-phase fills concrete task IDs and commands.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | AEDIT-07 | — | server recompute is authoritative; client amount never trusted | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for AEDIT-01…07 (edit PATCH recompute+override, notification gating, leg isolation, audit-log write)
- [ ] Shared fixtures for admin PATCH handler + Supabase mocks (follow existing `vi.hoisted` pattern)

*Planner to finalize the exact Wave 0 test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Branded change-email visual rendering (old → new layout) | AEDIT-05 | HTML email rendering is visual | Trigger an edit with "notify client" on; inspect the received email in a client |
| Inline edit UX in the expanded booking row | AEDIT-01…04 | Interactive UI | Edit each field type in the admin panel; confirm per-field save + price-review step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < target
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
