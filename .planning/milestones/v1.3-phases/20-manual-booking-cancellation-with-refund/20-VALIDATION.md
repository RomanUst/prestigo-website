---
phase: 20
slug: manual-booking-cancellation-with-refund
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run tests/admin-bookings.test.ts`
- **After every plan wave:** Run `cd prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | BOOKINGS-06 | unit | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` | ✅ extend | ⬜ pending |
| 20-01-02 | 01 | 1 | BOOKINGS-06 | unit | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` | ✅ extend | ⬜ pending |
| 20-01-03 | 01 | 1 | BOOKINGS-06 | unit | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` | ✅ extend | ⬜ pending |
| 20-02-01 | 02 | 1 | BOOKINGS-08 | unit | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | BOOKINGS-08 | unit | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-03 | 02 | 1 | BOOKINGS-08 | unit | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-04 | 02 | 1 | BOOKINGS-08 | unit | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-05 | 02 | 2 | BOOKINGS-08 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | ❌ W0 extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/admin-bookings-cancel.test.ts` (or extend `tests/admin-bookings.test.ts`) — stubs for BOOKINGS-08 cancel endpoint
- [ ] Stripe mock for `stripe.refunds.create` in test setup — needed for cancel and refund tests
- [ ] Extend `tests/webhooks-stripe.test.ts` — add `charge.refunded` test case stub

*Wave 0 must create stub files before plan execution begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe refund visible in Stripe Dashboard | BOOKINGS-08 | Requires live Stripe test account; can't assert Dashboard state programmatically | 1. Cancel a Stripe-paid booking via admin. 2. Log into Stripe Dashboard > Payments > find PI. 3. Confirm refund status = "Refunded". |
| Confirmation modal appears before refund | BOOKINGS-08 | UI interaction — modal display is a browser behaviour | 1. Open admin bookings page. 2. Expand a Stripe-paid booking row. 3. Click "Cancel". 4. Confirm modal appears with refund warning and "Confirm Cancel + Refund" / "Keep Booking" buttons. |
| Manual booking shows "Cancel" only (no refund language) | BOOKINGS-08 | UI branch — modal variant based on booking_source | 1. Open a manual booking row. 2. Click "Cancel". 3. Confirm modal shows "Cancel Booking" only — no refund text. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
