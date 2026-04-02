---
phase: 15
slug: ui-design-contract
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — Phase 15 produces a Markdown document only |
| **Config file** | none |
| **Quick run command** | `ls .planning/phases/15-ui-design-contract/*-UI-SPEC.md` |
| **Full suite command** | `ls .planning/phases/15-ui-design-contract/*-UI-SPEC.md` |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run `ls .planning/phases/15-ui-design-contract/*-UI-SPEC.md`
- **After every plan wave:** Verify UI-SPEC.md sections are complete
- **Before `/gsd:verify-work`:** UI-SPEC.md must exist and cover all 4 admin pages
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | PRICING-01–04 | manual | `grep "PricingForm" .planning/phases/15-ui-design-contract/*-UI-SPEC.md` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | ZONES-01–03 | manual | `grep "ZoneMap" .planning/phases/15-ui-design-contract/*-UI-SPEC.md` | ✅ | ✅ green |
| 15-01-03 | 01 | 1 | BOOKINGS-01–05 | manual | `grep "BookingsTable" .planning/phases/15-ui-design-contract/*-UI-SPEC.md` | ✅ | ✅ green |
| 15-01-04 | 01 | 1 | STATS-01–05 | manual | `grep "StatsChart" .planning/phases/15-ui-design-contract/*-UI-SPEC.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Phase 15 output is a spec document — no test stubs required
- Existing infrastructure (vitest) not applicable to this phase

*Wave 0: "No automated tests — Phase 15 produces a design contract document only."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UI-SPEC.md covers AdminSidebar component | Design foundation | Document content check | `grep "AdminSidebar" UI-SPEC.md` |
| UI-SPEC.md covers StatusBadge variants | Design foundation | Document content check | `grep "StatusBadge" UI-SPEC.md` |
| UI-SPEC.md covers KPICard component | STATS-01–05 | Document content check | `grep "KPICard" UI-SPEC.md` |
| UI-SPEC.md covers BookingsTable | BOOKINGS-01–05 | Document content check | `grep "BookingsTable" UI-SPEC.md` |
| UI-SPEC.md covers PricingForm | PRICING-01–04 | Document content check | `grep "PricingForm" UI-SPEC.md` |
| UI-SPEC.md covers ZoneMap | ZONES-01–03 | Document content check | `grep "ZoneMap" UI-SPEC.md` |
| UI-SPEC.md covers StatsChart | STATS-01–05 | Document content check | `grep "StatsChart" UI-SPEC.md` |
| UI-SPEC.md covers FilterChips | BOOKINGS-01–05 | Document content check | `grep "FilterChips" UI-SPEC.md` |
| Color tokens use existing design-system values | Design foundation | Visual review | Review token values against design-system/MASTER.md |
| Responsive breakpoints defined (min 1024px) | Design foundation | Document content check | `grep "1024" UI-SPEC.md` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — 2026-04-02
