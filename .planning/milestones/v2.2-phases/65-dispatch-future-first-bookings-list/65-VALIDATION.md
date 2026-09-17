---
phase: 65
slug: dispatch-future-first-bookings-list
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-28
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 65-RESEARCH.md §"Validation Architecture". Refine during planning.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (see project testing patterns) |
| **Config file** | vitest config at repo root (confirm during Wave 0) |
| **Quick run command** | `npx vitest run <changed test file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~TBD seconds (measure Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

*Filled by the planner against final task IDs. Core invariants to cover (from RESEARCH §Validation Architecture):*

| Invariant | Requirement | Test Type | Notes |
|-----------|-------------|-----------|-------|
| Future-cutoff at Prague day boundary — a booking with `pickup_date == today (Europe/Prague)` is INCLUDED; `today − 1` is EXCLUDED in Future view | DISP-01 | unit (date helper) + integration (loader) | "today in Prague" computed via `Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague'})`; assert at midnight-boundary dates |
| Adaptive sort — Future view returns `pickup ASC`, Past/All view returns `pickup DESC`; pagination order matches display order | DISP-01 | integration (RPC / handler) | RPC `ORDER BY` exists in TWO places — both must apply identical CASE expression |
| Persisted default-horizon round-trip — PATCH `/api/admin/settings` writes horizon; reload of bookings page reads the same value | DISP-02 | integration (settings API) | dedicated typed columns on `pricing_globals` |
| In-session override does NOT mutate saved default — switching segmented control to Past/All then reloading restores saved default | DISP-03 | unit (BookingsTable state) | ephemeral React state only |
| KPI decoupling invariant — KPI totals unchanged across every list horizon/filter value | DISP-04 | integration/guard | KPIs use independent date-scoped fetches; guard the list query never feeds KPI totals |

---

## Wave 0 Requirements

- [ ] Confirm vitest config + existing admin test patterns (`.planning/codebase` / project testing memory)
- [ ] Test stub for the "today in Europe/Prague" date helper (DISP-01)
- [ ] Test stub for the KPI-decoupling guard (DISP-04)

*Refine against final plan task IDs during planning.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live RPC migration (058/059) applied by operator | DISP-01/02 | Migration applied live by user (blocking hand-off), not MCP auto-apply | Operator runs SQL; then run integration suite against the DB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
