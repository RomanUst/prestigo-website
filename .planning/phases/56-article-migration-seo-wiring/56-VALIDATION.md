---
phase: 56
slug: article-migration-seo-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/sitemap.test.ts tests/blog.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/sitemap.test.ts tests/blog.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-W0-01 | 01 | 0 | MIG-04 | — | N/A | unit | `npx vitest run tests/sitemap.test.ts` | ✅ (update needed) | ⬜ pending |
| 56-01-01 | 01 | 1 | MIG-01 | — | N/A | shell | `git log --follow -- app/blog/prague-airport-to-city-center/page.tsx \| head -1` | ✅ | ⬜ pending |
| 56-01-02 | 01 | 1 | MIG-02 | — | N/A | smoke | `grep -rn "guides\|/compare" app/blog/` returns 0 | ✅ | ⬜ pending |
| 56-02-01 | 02 | 2 | MIG-03 | — | N/A | smoke | `grep -c "permanent: true" next.config.ts` ≥ 5 | ✅ | ⬜ pending |
| 56-03-01 | 03 | 3 | MIG-04 | — | N/A | unit | `npx vitest run tests/sitemap.test.ts` | ✅ | ⬜ pending |
| 56-04-01 | 04 | 4 | MIG-05 | — | N/A | shell | `ls app/guides/page.tsx 2>&1` exits 1 | N/A | ⬜ pending |
| 56-00-01 | all | all | MIG-06 | — | N/A | unit | `npx vitest run tests/blog.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sitemap.test.ts` — invert `'does NOT include /blog/{slug} for any JSX_POSTS entry'` test BEFORE implementing MIG-04; add assertions for `/guides/*` and `/compare/*` absence

*All other test infrastructure exists — no new files required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 301 redirect from `/guides/prague-airport-to-city-center` to `/blog/prague-airport-to-city-center` | MIG-03 | Requires running server | `curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center` — verify single 301 hop, no chain |
| 301 redirect from `/compare/prague-airport-taxi-vs-chauffeur` to `/blog/prague-airport-taxi-vs-chauffeur` | MIG-03 | Requires running server | `curl -sIL https://rideprestigo.com/compare/prague-airport-taxi-vs-chauffeur` |
| 301 redirect from `/compare/prague-vienna-transfer-vs-train` to `/blog/prague-vienna-transfer-vs-train` | MIG-03 | Requires running server | `curl -sIL https://rideprestigo.com/compare/prague-vienna-transfer-vs-train` |
| 301 redirect from `/guides` to `/blog` | MIG-03 | Requires running server | `curl -sIL https://rideprestigo.com/guides` |
| 301 redirect from `/compare` to `/blog` | MIG-03 | Requires running server | `curl -sIL https://rideprestigo.com/compare` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
