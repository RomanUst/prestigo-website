# Phase 88: Card on File & Scheduled Holds - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

A client books a transfer or hourly ride by saving a card (3DS at checkout, nothing charged, unticked consent checkbox, consent record stored). The full amount is held automatically 72 h (configurable) before pickup — or at checkout if pickup is already inside that window — captured when the driver completes the trip, charged to the saved card if the hold is gone, and recovered via payment link + operator alert if anything fails. The operator sees payment state, hold expiry and an append-only money ledger in admin, with capture / release / retry / send-link actions. Client payment emails (card saved, hold placed, charged, payment failed with link) go out in the booking language. Everything sits behind an owner-controlled admin feature flag, proven by the owner's canary booking.

Requirements: PAYF-01, PAYF-03, PAYF-04, PAYF-05, HOLD-01, HOLD-02, HOLD-03, HOLD-04, HOLD-05, HOLD-07, MAIL-01.

Not in this phase: policy-driven cancellation fees, cash guarantee, no-show charge, public go-live and legal sign-off (Phase 89); extra waiting charges (Phase 91, reuses this phase's extra-charge path); quotes and multi-day (Phase 92, `payment_mode='quote'`, ignored by the hold engine).

</domain>

<decisions>
## Implementation Decisions

### Carried forward (decided before this discussion — do not re-ask)
- **D-01:** Hold lead time is configurable in admin, default 72 h; never ~5 days / 120 h (Visa merchant-initiated holds last 4 d 18 h). Decided 2026-11-02.
- **D-02:** Partner (GNet, `booking_source` partner) bookings are never held, captured or charged by this engine (`emitBookingCompleted` already carries `partner`).
- **D-03:** Multi-day trips are quotes (Phase 92: deposit + remainder); one long hold is never used.
- **D-04:** The feature flag stays closed to all clients until Phase 89 completes. Before then, cancelling a canary card booking = the operator's release action; the automatic policy cancel is Phase 89.
- **D-05:** Only `lib/payments/state.ts` writes `payment_state`; `payment_intent_id` is set only at capture. Expected migration 085 (payment_state, payment_mode, hold fields, ledger, consent record, settings) — next migration number per memory is 085.
- **D-06:** Capture is triggered by the single Phase 87 completion event (`lib/booking-events.ts` / `emitBookingCompleted` from `lib/booking-status-service.ts`), never by a second status writer.
- **D-07:** Stripe SDK stays 21.0.1, zero new runtime dependencies. The `.env.local` Stripe test key is a dead placeholder → owner-run scripts + canary; hold expiry cannot be simulated with test cards, so the `canceled`/expired branch is mocked in tests.
- **D-08:** QStash schedule quota is unverified; the daily Vercel cron must remain a backstop that still places overdue holds (missed run caught up next run).

### Checkout mode
- **D-09:** When the flag is on for a client, checkout offers **only** "save card, pay after the trip" — the pay-now PaymentIntent path is not shown alongside it (one path, Blacklane-style). With the flag off, today's pay-now flow is unchanged. — **Reversibility:** reversible — adding a pay-now choice later is a UI branch over the existing flow.
- **D-09a:** The admin flag is an owner-controlled switch that can be turned on and off at any time. Turning it off only changes what **new** checkouts see (back to pay-now); card bookings already made keep their full lifecycle (scheduled hold, capture, fallback charge, failure recovery) — the scheduler and capture never read the flag. Until Phase 89 the "on" state is limited to the owner's canary (allowlist); "on for everyone" opens after Phase 89.
- **D-10:** Card-on-file applies to **both transfers and hourly bookings** (every online-paid booking from `/book`). Multi-day stays a quote request.

### Hold timing at checkout
- **D-11:** An on-session hold at checkout is placed **only when pickup is ≤ the hold lead (72 h) away**. Bookings further out only save the card; the hold is placed automatically at pickup − lead. The ~6-day on-session cutoff from research is **rejected** — the client's money is never frozen longer than the lead time.
- **D-12:** The payment step shows the **exact date** of the hold in the booking locale and pickup timezone, e.g. "Nothing is charged now. On 12 November we'll hold the amount; it's charged after your trip." For bookings inside the window it says the amount is held now and charged after the trip. Copy is draft pending the Phase 89 legal review; the consent text version is stored per booking so wording can change.

### Failure recovery
- **D-13:** When a scheduled (off-session) hold or a charge is declined: immediately email the client a payment link and alert the operator; then **one automatic retry ~12 h later**, only if the client has not paid via the link in the meantime. No further automatic retries — after that, the admin "retry" action.
- **D-14:** Operator alert = **email via Resend** (from Vercel, no VPS dependency) plus a visible red badge/state in admin. No Telegram bot in this phase.
- **D-15:** An unpaid booking stays active; the operator decides. A second alert fires **24 h before pickup** if the booking still has no valid hold or payment. No automatic cancellation in Phase 88 (automatic cancel of unpaid bookings is a Phase 89 question, see Deferred).

### Price / time changes after a hold
- **D-16:** Operator **raises the price** after the hold: the hold stays as is; at completion the held amount is captured in full and the **difference is charged separately to the saved card off-session**. If that charge is declined → payment link for the difference + operator alert (same D-13 path, no auto retry needed beyond D-13's one). This is the same extra-charge mechanism Phase 91 will reuse for waiting fees.
- **D-17:** Operator **lowers the price**: capture the new amount with `amount_to_capture`; the rest of the hold is released by Stripe. (No user decision needed; recorded for completeness.)
- **D-18:** Pickup **moved later** so the current hold would expire before the trip (or the new pickup is outside the lead window): **release the old hold immediately** and let the scheduler place a new one at new pickup − lead. Pickup moved earlier into the window with no hold yet: the next scheduler run places it (catch-up). Timing is always computed from the pickup instant (Europe/Prague, DST-safe: 2027-03-28, 2027-10-31).

### Claude's Discretion
- Exact retry delay (≈12 h, clamped so it lands before pickup), scheduler cadence, and how the QStash schedule and daily cron share work.
- Stripe Customer handling for guest checkouts, `confirmSetup` inside the existing PaymentElement, ledger schema, webhook routing by metadata purpose.
- Admin payment panel layout inside the current booking detail UI (Phase 90 extracts `BookingDetailPanel` later — keep the panel self-contained).
- Email template design, as long as all 4 card-lifecycle emails exist in all 7 locales via one language-aware mechanism Phase 89/92 can extend.
- Draft consent/mandate wording (EN + 6 real translations), flagged for counsel review in Phase 89.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §"Phase 88: Card on File & Scheduled Holds" — goal, 5 success criteria, owner checkpoints, research-before-planning list, planning notes
- `.planning/REQUIREMENTS.md` — PAYF-01/03/04/05, HOLD-01..05, HOLD-07, MAIL-01 (HOLD-06, CASH-*, CANC-* belong to Phase 89)
- `.planning/STATE.md` — v5.0 decisions block (hold lead, legal gate, test key, QStash quota, `charge.refunded` guard fixed here)

### Research (v5.0 milestone)
- `.planning/research/SUMMARY.md` — hold-window findings (Visa 4 d 18 h MIT, 7 d CIT), SetupIntent + Customer, webhook events to subscribe, open owner decisions (answered above)
- `.planning/research/STACK.md` — Stripe API usage (SetupIntent `usage: off_session`, manual capture, `amount_to_capture`)
- `.planning/research/ARCHITECTURE.md` — payment state machine, ledger, scheduler design
- `.planning/research/PITFALLS.md` — double charge, duplicate bookings from webhook, DST, partial refund cancelling a completed trip
- `.planning/research/FEATURES.md` — competitor (Blacklane) card-on-file behaviour

### Prior phase decisions
- `.planning/phases/87-status-service-driver-step-flow/87-CONTEXT.md` — single status writer, D-06 completion event
- `.planning/phases/87-status-service-driver-step-flow/87-REVIEW-DISPOSITION.md` — WR-01 open: admin cancel refunds before the status CAS; must be fixed before money moves on held bookings

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/CONVENTIONS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/booking/steps/Step6Payment.tsx`: existing Stripe PaymentElement step — switch to deferred-intent + `confirmSetup` (or on-session manual-capture PaymentIntent inside the window) when the flag is on.
- `app/api/create-payment-intent/route.ts` (443 lines): server-side price recompute + PaymentIntent today (`automatic_payment_methods`); the card-on-file endpoint should reuse its price/validation path.
- `app/api/webhooks/stripe/route.ts` (1052 lines): `if (event.type === …)` chain with `stripe_events` idempotency insert; today handles `charge.refunded`, `payment_intent.succeeded`, `checkout.session.completed` — new routing by metadata purpose goes here.
- `lib/booking-events.ts` + `lib/booking-status-service.ts` (`emitBookingCompleted`, partner flag): capture trigger.
- `lib/stripe-payment-links.ts` (`createBookingPaymentLink`, `deactivateBookingPaymentLink`): payment link for failure recovery.
- `lib/qstash.ts` (`scheduleQStashReminder`) and `app/api/cron/*` (reminder-24h, reminder-2h, outbox-sweep): scheduler patterns and cron auth.
- `lib/email.ts`, `lib/email-log.ts` (`logEmail` dedupe, `.is()` for null booking): email sending + dedupe.
- `bookings.locale` (migration 062): booking language for MAIL-01.
- `pricing_globals` settings + `app/api/admin/settings`: home for the hold-lead setting and the feature flag.

### Established Patterns
- Admin API guard order, 400 vs 422 two-step parse, CSRF (memory `project_api_patterns`).
- SECURITY DEFINER RPCs must re-REVOKE PUBLIC EXECUTE after DROP+CREATE (memory).
- Never create a Supabase client during render; service client inside `after()`.
- Security commits use the `security:` prefix; no hard-coded € in `app/`/`components/`.

### Integration Points
- Checkout (Step6Payment) → new setup/hold endpoint → booking creation via webhook (exactly one booking).
- Completion event → capture/fallback charge → ledger + email.
- Admin booking edit (price/pickup) → hold re-evaluation (D-16..D-18).
- Admin settings → hold lead + feature flag (owner-only canary allowlist).

</code_context>

<specifics>
## Specific Ideas

- Blacklane is the reference for the client experience: one path, card saved, nothing charged, charged after the trip.
- Client copy names the exact hold date, not a generic "72 hours before".

</specifics>

<deferred>
## Deferred Ideas

- **Automatic cancellation of a booking whose hold/payment still failed close to pickup** — consider in Phase 89 alongside the cancellation policy (owner chose operator decision for Phase 88).
- **Telegram bot alerts** for payment failures — not now; email + admin badge only.
- **Pay-now option next to card-on-file** — rejected for now; revisit if corporate clients ask for immediate payment.
- Open Phase 87 review items: WR-01 (cancel refund before CAS) should be fixed in this phase's planning since holds make it live; WR-02/WR-04/WR-06 stay in the review disposition.

</deferred>

---

*Phase: 88-card-on-file-scheduled-holds*
*Context gathered: 2026-11-04*
