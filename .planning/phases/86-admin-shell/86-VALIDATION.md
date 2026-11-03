---
phase: "86"
slug: "admin-shell"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `86-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + @testing-library/react 16 + jest-dom (jsdom default; `// @vitest-environment node` for source-scanning tests) |
| **Config file** | `vitest.config.ts` (`css: false` — CSS tests read files with `fs`) |
| **Quick run command** | `npx vitest run tests/admin-shell-prefs.test.ts tests/admin-theme-css.test.ts tests/admin-no-hardcoded-colors.test.ts tests/AdminSidebar.test.tsx tests/admin-shell-layout.test.tsx` |
| **Full suite command** | `npx vitest run` + `npx tsc --noEmit` + `npx eslint --quiet <changed files>` |
| **Estimated runtime** | ~10 s quick, ~100 s full |

---

## Sampling Rate

- **After every task commit:** Run the quick run command plus the plan's own file tests
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green and `LEGACY_PENDING` allowlist empty
- **Max feedback latency:** 100 seconds

---

## Per-Task Verification Map

Filled by the planner per task (`<automated>` commands in each PLAN.md). Requirement → test map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| ADM-01 | Cookie parse/serialise, fallback to `expanded`, `Path=/admin; Max-Age=31536000; SameSite=Lax` | unit | `npx vitest run tests/admin-shell-prefs.test.ts` | ❌ W0 | ⬜ pending |
| ADM-01 | Server layout renders `data-admin-sidebar` from cookies | unit | `npx vitest run tests/admin-shell-layout.test.tsx` | ❌ W0 | ⬜ pending |
| ADM-01 | Collapse toggle, shortcut, labels in DOM, mobile unchanged | component | `npx vitest run tests/AdminSidebar.test.tsx` | ✅ extend | ⬜ pending |
| ADM-01 | Collapsed styles only inside `@media (min-width: 768px)` | CSS source | `npx vitest run tests/admin-theme-css.test.ts` | ❌ W0 | ⬜ pending |
| ADM-02 | Layout renders `data-admin-theme` from cookie (light default) | unit | `npx vitest run tests/admin-shell-layout.test.tsx` | ❌ W0 | ⬜ pending |
| ADM-02 | Theme toggle flips attribute, writes cookie, correct labels | component | `npx vitest run tests/AdminSidebar.test.tsx` | ✅ extend | ⬜ pending |
| ADM-02 | Public pages unchanged (scoping + golden snapshots) | CSS source + snapshot | `npx vitest run tests/admin-theme-css.test.ts tests/book-page-render.test.tsx tests/fleet-page-render.test.tsx tests/route-page-render.test.tsx tests/routes-hub-render.test.tsx tests/multi-day-page-render.test.tsx tests/nav-locale-render-parity.test.tsx` | partly W0 | ⬜ pending |
| ADM-03 | No colour literal in admin code outside allowlist | source scan | `npx vitest run tests/admin-no-hardcoded-colors.test.ts` | ❌ W0 | ⬜ pending |
| ADM-03 | Token parity + contrast in both themes | CSS source | `npx vitest run tests/admin-theme-css.test.ts` | ❌ W0 | ⬜ pending |
| ADM-03 | `StatusBadge` uses only `var(--status-*)` | component | `npx vitest run tests/StatusBadge.test.tsx` | ❌ W0 | ⬜ pending |
| ADM-03 | Converted screens still behave | component | `npx vitest run tests/BookingsTable.test.tsx tests/erasure-page.test.tsx tests/identities-page.test.tsx tests/PromoCard.test.tsx tests/RoutesTable.test.tsx tests/FlightStatusBlock.test.tsx tests/DriverAssignmentSection.test.tsx tests/stats-page.test.tsx tests/outbox-admin-page.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/admin-shell-prefs.test.ts` — ADM-01/02 parse + serialise
- [ ] `tests/admin-theme-css.test.ts` — scoping, token parity, completeness, contrast, media gate, `.theme-light` untouched
- [ ] `tests/admin-no-hardcoded-colors.test.ts` — ADM-03 guard with seeded `LEGACY_PENDING` allowlist
- [ ] `tests/admin-shell-layout.test.tsx` — server layout cookie handling (mock `next/headers`)
- [ ] `tests/StatusBadge.test.tsx` — variant → family lookup
- [ ] extend `tests/AdminSidebar.test.tsx`
- No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First paint uses saved theme (no flash) | ADM-02 | Needs a running server and raw HTML | `curl -s -H 'Cookie: admin_theme=dark' http://localhost:3000/admin/login \| grep -o 'data-admin-theme="[a-z]*"'` via `preview_start` dev server |
| Every admin screen readable in both themes at 1280px and 390px | ADM-03 | Visual; local admin sign-in blocked by fail-closed limiter | Owner UAT on production with checklist from the verify plan |
| Zones map colour scheme per theme | ADM-02 | `mapId` style not inspectable | Browser check; keep current map style if overridden, record deviation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 100s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
