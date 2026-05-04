---
phase: 48
slug: gnet-client-libraries
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/gnet-token.test.ts tests/gnet-client.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/gnet-token.test.ts tests/gnet-client.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 0 | CLIENT-01 | — | N/A | setup | `npx vitest run tests/gnet-token.test.ts` | ✅ | ✅ green |
| 48-01-02 | 01 | 1 | CLIENT-01 | — | Token not logged/exposed | unit | `npx vitest run tests/gnet-token.test.ts` | ✅ | ✅ green |
| 48-01-03 | 01 | 1 | CLIENT-01 | — | Stale/invalid token triggers fresh fetch | unit | `npx vitest run tests/gnet-token.test.ts` | ✅ | ✅ green |
| 48-02-01 | 02 | 0 | CLIENT-02 | — | N/A | setup | `npx vitest run tests/gnet-client.test.ts` | ✅ | ✅ green |
| 48-02-02 | 02 | 1 | CLIENT-02 | — | Non-2xx throws typed error | unit | `npx vitest run tests/gnet-client.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/gnet-token.test.ts` — stubs for CLIENT-01 (token cache hit, miss, retry-on-401) ✅
- [x] `tests/gnet-client.test.ts` — stubs for CLIENT-02 (success, non-2xx error) ✅

*Existing vitest infrastructure covers test framework — only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `.env.example` documents all 5 GNET_* vars | CLIENT-01, CLIENT-02 | File read | `grep GNET_ .env.example` — must show GNET_UID, GNET_PW, GNET_WEBHOOK_KEY, GNET_WEBHOOK_SECRET, GNET_GRIDDID |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ✅ complete — 24/24 tests green (2026-05-04)
