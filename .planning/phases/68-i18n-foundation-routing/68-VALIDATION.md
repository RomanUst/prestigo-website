---
phase: 68
slug: i18n-foundation-routing
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-03
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <path>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60–120 seconds (full suite; ~150 test files) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <path>` for the touched area
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | I18N-{XX} | T-68-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner fills this map from PLAN.md tasks. Key regression-proof targets for this phase: CSP nonce still present in response headers, Supabase `updateSession` still refreshes the session, CSRF Origin-guard still enforced, existing EN URLs unchanged, `/ru/*` renders EN without 404, `<html lang>`/`dir` correct per locale.*

---

## Wave 0 Requirements

- [ ] `tests/middleware-i18n.test.ts` — composed-middleware regression stubs (CSP nonce, Supabase session, CSRF, locale detection) for I18N-01/02
- [ ] `tests/i18n-routing.test.ts` — locale config + `[locale]` resolution stubs for I18N-03/04

*Existing vitest infrastructure (`vitest.config.ts`, `tests/setup.ts`) covers execution; new test files above are the Wave 0 additions. Planner confirms exact file names.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `<html dir="rtl">` visually correct for `ar` in a real browser | I18N-03 | Visual/RTL rendering not assertable in unit tests | Load `/ar/` in the browser preview, confirm `dir="rtl"` on `<html>` and no mirrored-layout breakage |

*Automated coverage handles header/route/config assertions; the RTL visual check is browser-only.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
