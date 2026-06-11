---
phase: 57
slug: customer-auth-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (verify in repo; Wave 0 installs if missing) |
| **Quick run command** | `npx vitest run <changed-test-file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <relevant-test-file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Filled by gsd-planner from RESEARCH.md Validation Architecture. Each task's secure behavior, requirement, and automated command are mapped here during planning/execution.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | AUTH-01..07, ACCT-04 | TBD | TBD | unit/integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for `customer_profiles` RLS isolation (one user cannot read/write another's row)
- [ ] Test stubs for middleware route gating (non-admin → `/admin` redirect to `/`; unauth → `/account` redirect to `/login`)
- [ ] Test stubs for `return-to` open-redirect validation (relative-path-only)
- [ ] Test stubs for `bookings.user_id` nullable FK (anonymous insert still succeeds with null)
- [ ] Confirm vitest config present; install if missing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth round-trip | AUTH-03 | Requires live Google provider + browser redirect | Sign in via Google, confirm landing authenticated as customer, `customer_profiles` row created |
| Apple OAuth round-trip | AUTH-04 | Requires live Apple provider + 6-month secret key | Sign in via Apple, confirm landing authenticated, profile row created |
| Magic-link email delivery | AUTH-01 | Requires real email inbox | Request magic link, click email link, confirm authenticated session |
| Password reset email delivery | AUTH-02 | Requires real email inbox | Request reset, click email link, set new password, sign in |

*Profile-creation and session/RLS behaviors are automated via DB queries (Supabase MCP) where possible.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
