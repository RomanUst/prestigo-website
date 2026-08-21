---
phase: 64
slug: admin-created-bookings-with-payment-link
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-21
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (repo root — confirm during Wave 0) |
| **Quick run command** | `npx vitest run <changed test file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Seeded from RESEARCH.md Validation Architecture. The planner MUST refine this table so every plan task maps to a row with an automated command or a Wave 0 dependency.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-----------|--------|
| 64-01-01 | 01 | 1 | ANEW-02 | T-64-01 | Payment link created server-side with booking UUID in metadata; amount from server-authoritative recompute, never client-supplied | unit | `npx vitest run lib/__tests__/payment-link.test.ts` | ❌ W0 | ⬜ pending |
| 64-02-01 | 02 | 2 | ANEW-04 | T-64-02 | `checkout.session.completed` reconciles the existing `unpaid` row keyed on `session.metadata.bookingId` → `confirmed`; no duplicate row inserted | unit | `npx vitest run app/api/webhooks/__tests__/checkout-session.test.ts` | ❌ W0 | ⬜ pending |
| 64-02-02 | 02 | 2 | ANEW-04 | T-64-03 | Replayed/duplicate `checkout.session.completed` event is idempotent — side-effects fire once, `stripe_processed_events` claim honored | unit | `npx vitest run app/api/webhooks/__tests__/checkout-session.test.ts` | ❌ W0 | ⬜ pending |
| 64-03-01 | 03 | 2 | ANEW-03 | T-64-04 | Payment-request email logged via `logEmail` before Resend send (dedup gate); resend bypasses dedup by explicit operator action | unit | `npx vitest run lib/__tests__/email-payment-request.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Planner to expand: add rows for ANEW-01 (create form status choice, D-02) and ANEW-05 (no-link save), and for the D-05 attach-later path.*

---

## Wave 0 Requirements

- [ ] `lib/__tests__/payment-link.test.ts` — stubs for ANEW-02 (Stripe Payment Link creation + metadata keying)
- [ ] `app/api/webhooks/__tests__/checkout-session.test.ts` — stubs for ANEW-04 (reconcile-in-place, no duplicate, idempotency)
- [ ] `lib/__tests__/email-payment-request.test.ts` — stubs for ANEW-03 (payment-request email + logEmail dedup)
- [ ] Stripe SDK mock/fixtures for `paymentLinks.create` and `checkout.session.completed` event payloads
- [ ] Confirm vitest config + existing webhook test harness (Phase 62 tests are the reuse reference)

*Planner refines exact file names against the repo's existing test conventions (see project_testing_patterns memory: vi.hoisted pattern, component mocks).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe Dashboard webhook subscription includes `checkout.session.completed` | ANEW-04 | Stripe Dashboard config is external to the codebase — cannot be asserted in-repo (RESEARCH flagged this as the one MEDIUM-confidence pitfall) | In Stripe Dashboard → Developers → Webhooks, confirm the endpoint subscribes to `checkout.session.completed`; trigger a test payment via a generated link and confirm the `unpaid` row flips to `confirmed` with no duplicate |
| End-to-end pay-link flow: operator creates booking → generates link → client pays → row reconciled | ANEW-02/03/04 | Full Stripe live/test round-trip crosses the browser, Stripe-hosted page, and webhook — not fully reproducible in unit tests | Create an admin booking with payment, open the emailed/copied link, complete a Stripe test payment, verify status + no duplicate + confirmation side-effects |
| Operator copies link URL + "send again" resend control | ANEW-03 (D-03) | UI clipboard + resend is a browser interaction | Verified via UI-SPEC-driven checks and manual smoke |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
