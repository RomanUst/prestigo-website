---
phase: 69
slug: string-externalization-ui-chrome
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-04
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run <touched test file(s)>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60–90 seconds (full suite, ~104 files) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file(s)>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _(seeded — filled by the planner / validate-phase from the PLAN.md task breakdown)_ | | | STR-01 | | | unit | `npx vitest run` | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `messages/en.json` present + loaded by `i18n/request.ts` before any `useTranslations`/`getTranslations` call site renders (else non-EN routes throw on missing catalog — RESEARCH open question #1).
- [ ] `NextIntlClientProvider` wraps the client subtree (via `getMessages()`/`getLocale()`) so client components can call `useTranslations` without a context error.
- [ ] Test harness: `vitest.config.ts` `test.server.deps.inline: ['next-intl']` and a shared render helper wrapping components in `NextIntlClientProvider` (else `tests/nav-auth.test.tsx` and peers throw — RESEARCH pitfall #4).

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Byte-for-byte EN rendering unchanged after externalization | STR-01 | Visual fidelity of externalized copy (whitespace/punctuation/aria/alt) not fully assertable in unit tests | Live dev server: compare key pages (/ , /fleet, /services) against pre-phase render; confirm no copy drift |
| Locale-aware links keep the prefix from a non-EN subpath | STR-01 | Cross-navigation prefix retention is experiential | From `/ru/`, click Nav/Footer/Fleet/CookieBanner internal links → URL keeps `/ru/` prefix |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
