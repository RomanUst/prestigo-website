---
phase: 64
slug: admin-created-bookings-with-payment-link
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
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
| 64-01-01 | 01 | 1 | ANEW-02/04/03 | — | Wave 0: RED scaffolds for payment-link create, checkout-session reconcile, payment-request email | unit | `npx vitest run tests/payment-links.test.ts tests/webhooks-stripe-checkout-session.test.ts tests/email-payment-request.test.ts` | ❌ W0 | ⬜ pending |
| 64-01-02 | 01 | 1 | ANEW-02 | T-64-01 | Payment link created server-side with booking UUID in metadata; `unit_amount = Math.round(amount_eur*100)`, never client-supplied | unit | `npx vitest run tests/payment-links.test.ts` | ❌ W0 | ⬜ pending |
| 64-01-02 | 01 | 1 | ANEW-04 | T-64-02/03 | `checkout.session.completed` reconciles the `unpaid` row keyed on `session.metadata.bookingId` → `confirmed`; duplicate delivery idempotent; already-confirmed no-op | unit | `npx vitest run tests/webhooks-stripe-checkout-session.test.ts` | ❌ W0 | ⬜ pending |
| 64-01-02 | 01 | 1 | ANEW-03 | T-64-05/06 | Payment-request email built (Pay Now CTA, EUR amount) with escapeHtml; no admin internals | unit | `npx vitest run tests/email-payment-request.test.ts` | ❌ W0 | ⬜ pending |
| 64-01-02 | 01 | 1 | ANEW-01/05 | T-64-01 | POST status choice: `collect_payment` → `unpaid`; no-link → operator status (default `confirmed`) | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend) | ⬜ pending |
| 64-02-01 | 02 | 2 | ANEW-02/03/05 | T-64-04/07 | `[id]/payment-link` route: pending→unpaid direct, guard confirmed/existing-link, round-trip linkedBookingId, resend bypasses logEmail | unit | `npx vitest run tests/admin-bookings-payment-link.test.ts` | ❌ W0 | ⬜ pending |
| 64-02-02 | 02 | 2 | ANEW-04 | T-64-03 | Round-trip: linkedBookingId reconciles both legs once, single confirmation, idempotent | unit | `npx vitest run tests/webhooks-stripe-checkout-session.test.ts` | ❌ W0 | ⬜ pending |
| 64-03-01 | 03 | 3 | ANEW-01/03/05 | T-64-08 | ManualBookingForm toggle + status choice + result panel; copy uses full URL | typecheck | `npx tsc --noEmit` | n/a | ⬜ pending |
| 64-03-02 | 03 | 3 | ANEW-02/03 | T-64-04/09 | BookingsTable row action + result panel; guards status/existing-link client-side | typecheck | `npx tsc --noEmit` | n/a | ⬜ pending |
| 64-04-01 | 04 | 4 | ANEW-02/04/05 | T-64-11 | [BLOCKING] migration 056 applied to live DB; columns confirmed via Supabase MCP | manual/MCP | Supabase MCP `list_tables` / probe | n/a | ⬜ pending |
| 64-04-02 | 04 | 4 | ANEW-04 | T-64-10 | Stripe webhook subscribes to `checkout.session.completed`; live E2E reconcile no-duplicate | human-verify | manual (Stripe Dashboard + live smoke) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Test files use the repo `tests/` convention (not `lib/__tests__/`) — matches tests/admin-bookings.test.ts, tests/webhooks-stripe.test.ts. Wave 0 authored in Plan 01 Task 1.*

---

## Wave 0 Requirements (authored in Plan 01 Task 1)

- [ ] `tests/payment-links.test.ts` — RED stubs for ANEW-02 (Stripe Payment Link creation + metadata keying + amount source)
- [ ] `tests/webhooks-stripe-checkout-session.test.ts` — RED stubs for ANEW-04 (reconcile-in-place, no duplicate, idempotency, payment_status guard, round-trip)
- [ ] `tests/email-payment-request.test.ts` — RED stubs for ANEW-03 (payment-request email + Pay Now CTA + conditional row + logEmail dedup)
- [ ] `tests/admin-bookings-payment-link.test.ts` — RED stubs for the D-05 `[id]/payment-link` route (Plan 02) + the ANEW-05 no-link invariant
- [ ] Stripe SDK mock/fixtures for `paymentLinks.create` and `checkout.session.completed` event payloads (vi.hoisted, mirroring tests/webhooks-stripe.test.ts)

*Repo test convention is `tests/` (flat), not `lib/__tests__/` — file names above are final.*

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
