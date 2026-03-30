---
phase: 5
slug: backend-notifications
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts tests/submit-quote.test.ts` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts tests/submit-quote.test.ts`
- **After every plan wave:** Run `cd prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | BACK-03 | unit | `cd prestigo && npx vitest run tests/submit-quote.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-01-02 | 01 | 1 | BACK-01 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | Partial (stub) | ⬜ pending |
| 5-01-03 | 01 | 1 | BACK-01 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | Partial (stub) | ⬜ pending |
| 5-01-04 | 01 | 1 | BACK-02 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | Partial (stub) | ⬜ pending |
| 5-01-05 | 01 | 1 | BACK-03 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | Partial (stub) | ⬜ pending |
| 5-01-06 | 01 | 1 | BACK-04 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | Partial (stub) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/tests/submit-quote.test.ts` — covers BACK-03 (manager alert from quote flow) and Supabase save from quote route
- [ ] Supabase and Resend mock setup in `prestigo/tests/setup.ts` (extend existing setup file)

*Note: Existing `tests/webhooks-stripe.test.ts` has `.todo` stubs — converting these to real tests is Wave 1 implementation work, not Wave 0 infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Resend domain verified for `bookings@rideprestige.com` | BACK-02, BACK-03 | DNS verification external to codebase | Check Resend dashboard → Domains → rideprestige.com shows Verified status |
| Supabase project created and `bookings` table exists | BACK-01 | External service provisioning | Run SQL in Supabase SQL editor, confirm table visible in Table Editor |
| Email received in client inbox within seconds of payment | BACK-02 | End-to-end email delivery | Use Stripe test webhook + test card; verify email received in test inbox |
| Manager alert received in inbox within seconds of payment | BACK-03 | End-to-end email delivery | Same as above; check manager inbox |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
