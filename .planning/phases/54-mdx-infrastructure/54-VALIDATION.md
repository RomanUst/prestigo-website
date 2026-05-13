---
phase: 54
slug: mdx-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 + @testing-library/react 16 |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npx vitest run tests/blog.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx vitest run tests/blog.test.ts && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green + `npm run build` passes
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 0 | INFRA-04 | — | N/A | unit stub | `npx vitest run tests/blog.test.ts` | ❌ W0 | ⬜ pending |
| 54-01-02 | 01 | 1 | INFRA-02 | — | N/A | build smoke | `npx tsc --noEmit` | N/A | ⬜ pending |
| 54-01-03 | 01 | 1 | INFRA-01 | — | N/A | build smoke | `npx tsc --noEmit` | N/A | ⬜ pending |
| 54-01-04 | 01 | 1 | INFRA-03 | — | N/A | build smoke | `npm run build` | N/A | ⬜ pending |
| 54-01-05 | 01 | 2 | INFRA-04 | — | N/A | unit | `npx vitest run tests/blog.test.ts` | ❌ W0 | ⬜ pending |
| 54-01-06 | 01 | 2 | INFRA-05 | — | N/A | compile | `npx tsc --noEmit` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/blog.test.ts` — unit tests for `getAllPosts()`: merged result, sort order, `source` field discrimination (`'mdx'`|`'jsx'`), all 3 JSX_POSTS entries present, newest-first ordering

*No framework install needed — Vitest already configured in the project.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Test MDX renders at route in browser | INFRA-03 | Requires browser; `next build` + `next start` or dev server | Run `npm run dev`, navigate to `/blog/[slug]` where `[slug]` is the test MDX filename |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
