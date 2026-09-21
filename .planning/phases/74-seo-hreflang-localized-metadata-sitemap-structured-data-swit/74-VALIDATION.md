---
phase: 74
slug: seo-hreflang-localized-metadata-sitemap-structured-data-swit
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-21
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seed derived from `74-RESEARCH.md` § Validation Architecture — the planner/validate-phase completes the per-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`@vitejs/plugin-react`, jsdom) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npx vitest run tests/seo.test.ts tests/sitemap.test.ts tests/jsonld.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~TBD seconds |

> ⚠ `package.json` has **no `test` script** and there is no CI test workflow — tests run manually via `npx vitest run`. Do not assume `npm test` works.

---

## Sampling Rate

- **After every task commit:** Run the targeted file(s) from the Quick run command
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green **plus** a manual `next build && next start` + live check of at least one previously-broken page (e.g. `/ru/about`) — the Vitest suite mocks `next-intl/server`'s `getLocale`, so it will not catch the force-static locale bug; only a real build/live check exercises it.
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | SEO-01 | — | `getAlternates()` cluster correct for indexable+translated / noindex / EN-fallback | unit | `npx vitest run tests/seo.test.ts` | ❌ W0 | ⬜ pending |
| 74-0X-0X | — | — | SEO-02 | — | Localized `generateMetadata` resolves per-locale content on the 10 fixed pages | unit/integration | `npx vitest run tests/route-page-render.test.tsx` | ⚠ extend | ⬜ pending |
| 74-0X-0X | — | — | SEO-03 | — | Sitemap emits full alternates cluster per URL (D-06/D-07) | unit | `npx vitest run tests/sitemap.test.ts` | ✅ extend | ⬜ pending |
| 74-0X-0X | — | — | SEO-04 | — | JSON-LD `inLanguage` + localized text, EN byte-parity | unit + snapshot | `npx vitest run tests/jsonld.test.ts` | ✅ extend | ⬜ pending |
| 74-0X-0X | — | — | UX-01 | — | Switcher navigates via `@/i18n/routing`, preserves path, EN-fallback | component | `npx vitest run tests/locale-switcher.test.tsx` | ❌ W0 | ⬜ pending |
| 74-0X-0X | — | — | UX-02 | — | Banner shows once, never redirects, dismiss persists | component | `npx vitest run tests/first-visit-banner.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · Task IDs beyond 74-01-01 are seeds — the planner assigns final plan/wave numbers.*

---

## Wave 0 Requirements

- [ ] `tests/seo.test.ts` — `getAlternates()` unit tests for SEO-01 (indexable+all-translated, noindex, partial-translation EN-fallback-excluded)
- [ ] `tests/locale-switcher.test.tsx` — UX-01 component test
- [ ] `tests/first-visit-banner.test.tsx` — UX-02 component test
- [ ] Framework install: none — Vitest already configured project-wide

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Force-static pages serve correct per-locale content (Pitfall 1 `getLocale()` fix) | SEO-02 | Vitest mocks `getLocale`, cannot reproduce the real static-render locale bug | `next build && next start`, then load `/ru/about`, `/es/faq`, etc. and confirm non-EN content renders |
| hreflang cluster validity across live pages | SEO-01/03 | Requires crawler-eye validation of emitted `<link rel="alternate" hreflang>` | Google Rich Results / hreflang validator on built output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
