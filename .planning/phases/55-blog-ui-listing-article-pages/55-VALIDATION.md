---
phase: 55
slug: blog-ui-listing-article-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npx vitest run tests/blog.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/blog.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 0 | LIST-02 | — | N/A | unit | `npx vitest run tests/BlogCard.test.tsx` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 0 | ART-04 | — | N/A | unit | `npx vitest run tests/blog-jsonld.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-03 | 01 | 0 | ART-05 | — | N/A | unit | `npx vitest run tests/sitemap.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-04 | 01 | 1 | LIST-01, LIST-02 | — | N/A | unit | `npx vitest run tests/BlogCard.test.tsx` | ❌ W0 | ⬜ pending |
| 55-01-05 | 01 | 1 | LIST-03 | — | N/A | manual | `next build` — verify sitemap.xml and OG tags | N/A | ⬜ pending |
| 55-02-01 | 02 | 2 | ART-01, ART-02 | T-55-01 | Slug allowlist `/^[a-z0-9-]+$/` preserved | manual | `next build && curl /blog/non-existent-slug → 404` | N/A | ⬜ pending |
| 55-02-02 | 02 | 2 | ART-03 | — | N/A | visual | `next dev` → navigate to test MDX post | N/A | ⬜ pending |
| 55-02-03 | 02 | 2 | ART-04 | — | N/A | unit | `npx vitest run tests/blog-jsonld.test.ts` | ❌ W0 | ⬜ pending |
| 55-02-04 | 02 | 2 | ART-05 | — | N/A | unit | `npx vitest run tests/sitemap.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/BlogCard.test.tsx` — stubs for LIST-02 (BlogCard field rendering)
- [ ] `tests/blog-jsonld.test.ts` — stubs for ART-04 (BlogPosting JSON-LD shape)
- [ ] `tests/sitemap.test.ts` — stubs for ART-05 (sitemap /blog entries present)

*Note: `tests/blog.test.ts` already exists and covers LIST-01, ART-02.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/blog` canonical + OG tags correct | LIST-03 | Next.js metadata is server-rendered; no automated metadata assertion in unit tests | `next build && curl -s http://localhost:3000/blog \| grep -E 'canonical\|og:title\|og:description'` |
| `/blog/[slug]` hero, byline, MDX body render correctly | ART-03 | UI rendering requires visual confirmation | `next dev` → navigate to `/blog/prague-chauffeur-service` → verify layout |
| `/blog/non-existent-slug` returns 404 | ART-01 | HTTP status check requires running server | `next build && npx serve@latest .next -p 3000 && curl -o /dev/null -s -w '%{http_code}' http://localhost:3000/blog/non-existent-slug` (expect `404`) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
