# Phase 62 — External API Coverage Declaration

**No external API integration.** This phase extends the EXISTING Stripe PaymentIntent
creation (`app/api/create-payment-intent/route.ts`) and the EXISTING Stripe webhook
reconciliation (`app/api/webhooks/stripe/route.ts`). It adds no new external capability
surface: no new third-party SDK, no new outbound integration, no new provider account.

All work is internal:
- a new DB status value (`unpaid`) + `attempt_id` column (Supabase migration),
- a capture-time INSERT and a webhook UPDATE against the existing `bookings` table,
- an admin list filter param threaded through the existing `admin_search_bookings` RPC,
- a `StatusBadge` variant and a `BookingsTable` chip/tint.

The Stripe surface is unchanged in shape — same `paymentIntents.create`, same
`webhooks.constructEvent` signature verification, same `stripe_processed_events`
idempotency table. No new Stripe capability (no Payment Links, no Refunds, no
Customers API) is introduced (those are Phase 64 / out of scope).

This satisfies the seal-time api-coverage gate: nothing to cover.
