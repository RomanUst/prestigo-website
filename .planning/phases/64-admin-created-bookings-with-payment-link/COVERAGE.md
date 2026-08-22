# Phase 64 — Stripe API Coverage Matrix

**Generated:** 2026-08-22 (plan-phase, ai-integration contribution)
**API:** Stripe (Node SDK `^21.0.1`, already installed)
**Rule:** INTEGRATE is the default. Every OPT-OUT carries a one-line reason. This matrix is the subtraction record read by the seal-time `api-coverage.verify-pre` gate.

| Stripe capability | Surface | Disposition | Reason / Notes |
|-------------------|---------|-------------|----------------|
| `paymentLinks.create` | `lib/stripe-payment-links.ts` → `createBookingPaymentLink` | INTEGRATE | Core ANEW-02. Inline `price_data` (EUR, `unit_amount` cents), `metadata.{bookingId,leg,linkedBookingId?}`, `payment_intent_data.metadata`, `payment_method_types:['card']`, `restrictions.completed_sessions.limit:1`. |
| Payment Link `metadata` propagation → Checkout Session | webhook read path | INTEGRATE | Load-bearing keying (D-09): session inherits link metadata; PI does NOT. Read `session.metadata.bookingId`. |
| Webhook event `checkout.session.completed` | `app/api/webhooks/stripe/route.ts` (new branch) | INTEGRATE | Core ANEW-04 reconciliation trigger. |
| Webhook signature verification `webhooks.constructEvent` | webhook route (existing) | INTEGRATE (reuse) | Already guards the endpoint; new branch inherits it unchanged. T-64-02. |
| `session.payment_status` guard | webhook branch | INTEGRATE | Defense for delayed methods (no-op unless `'paid'`). |
| `session.payment_intent` capture | webhook branch | INTEGRATE | Persisted to `bookings.payment_intent_id` on reconcile. |
| `paymentLinks.update` (deactivate) | — | OPT-OUT | D-04: no expiry/regenerate lifecycle this phase; `restrictions.completed_sessions.limit:1` handles single-use auto-deactivate at create time. |
| Pre-created `Price` / `Product` catalog objects | — | OPT-OUT | Each booking is a unique dynamic amount; inline `price_data` is the documented one-off pattern (RESEARCH Alternatives). |
| `checkout.sessions.create` (server-created session) | — | OPT-OUT | Sessions expire (24h default); would force the regenerate-on-expiry machinery D-04 excludes. Payment Link chosen instead. |
| `checkout.session.async_payment_succeeded` | — | OPT-OUT | `payment_method_types:['card']` sidesteps delayed/async completion; no poller (RESEARCH Don't-Hand-Roll). Future scope. |
| `checkout.session.expired` | — | OPT-OUT | Payment Links never expire (D-04); event not applicable. |
| Refund / `charge.refunded` (extend for links) | — | OPT-OUT | Refunds explicitly out of scope (REQUIREMENTS.md); existing `charge.refunded` branch unchanged. |
| Top-up / partial payment for price-difference | — | OPT-OUT | Explicitly re-deferred to a future phase (CONTEXT.md Deferred Ideas). |
| Stripe Customer / saved cards | — | OPT-OUT | Out of scope (REQUIREMENTS.md: Stripe one-off / payment links only). |

**Operational (non-code, human) prerequisite:** the live Stripe Dashboard webhook endpoint must subscribe to `checkout.session.completed` (RESEARCH Pitfall 4 / Assumption A2). Tracked as the `checkpoint:human-verify` in Plan 04.
