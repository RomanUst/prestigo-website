---
phase: 67
slug: driver-trip-portal-status-marking-notes-admin-visibility
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-02
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 67-RESEARCH.md `## Validation Architecture`. The planner refines
> the Per-Task Verification Map once tasks are authored.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project convention — see project_testing_patterns memory) |
| **Config file** | vitest.config.ts (repo root) |
| **Quick run command** | `npx vitest run <changed-test-file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~TBD by planner |

Self-verification (per project convention feedback_self_verify): Supabase MCP for
DB assertions + preview API calls against the running dev server — never ask the
user to test manually.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-test-file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green + live self-verification via Supabase MCP / API
- **Max feedback latency:** TBD (planner sets)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _planner fills once tasks are authored_ | | | DTRIP-03/04/05/06 | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for the driver status-mark endpoint (token-gated, unauthenticated write) — DTRIP-03, DTRIP-04
- [ ] Test stub asserting `bookings.status` is untouched and GNet client is NOT invoked when `trip_progress` changes — DTRIP-04 (isolation)
- [ ] Test stub for admin trip-progress visibility (detail view) — DTRIP-05
- [ ] Test stub for driver note submission + admin visibility — DTRIP-06

*Planner confirms whether existing infrastructure covers these or Wave 0 must seed them.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Trip-progress badge renders live in admin on row expand | DTRIP-05 | Visual/UX confirmation in dark-theme admin | Expand a booking row with an assigned driver in admin; confirm current trip_progress badge + note appear |
| Driver status controls usable on mobile (police-show context) | DTRIP-03 | Tap-target ergonomics on phone | Open trip sheet on mobile viewport; confirm status buttons + note field are legible and tappable |

*Most isolation/behavior assertions are automatable; the above are UX confirmations.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
