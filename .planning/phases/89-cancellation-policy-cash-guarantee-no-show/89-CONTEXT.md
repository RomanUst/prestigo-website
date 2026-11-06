# Phase 89: Cancellation Policy, Cash Guarantee & No-Show - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Clients get clear, fair terms and card payments open to everyone. A booking is cancelled under one policy (free until 1 h or 12 h before pickup, otherwise 100%), by the operator or by the client from a manage-booking page linked in the confirmation email. A client can pay cash to the driver with the card saved as a guarantee. A no-show is charged only by the operator, after the server-enforced wait, with evidence stored. The terms, FAQ, checkout and emails carry the policy in all 7 locales, and the owner opens the card flow to all clients at the end.

Requirements: HOLD-06, CANC-01, CANC-02, CASH-01, CASH-02, CASH-03, CASH-04.

Added by the owner in this discussion: client self-cancel through a manage-booking page (D-01 to D-04). Full self-service editing is not in this phase.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (decided before this discussion: do not re-ask)
- Policy: free until 1 h before pickup for trips up to 100 km, until 12 h before for longer trips, otherwise 100%. Km, hours and percent are admin settings (ROADMAP, 2026-11-02).
- No-show is operator-charged, never automatic on the driver's tap. Wait thresholds are the live settings `noshow_wait_city_min` 30 and `noshow_wait_airport_min` 60 (counted as in `lib/no-show.ts`).
- GNet / partner bookings get no cash guarantee and no no-show charge. Card flow covers one-way `transfer` and `hourly` only; `round_trip` and `daily` stay on pay-now (88 D-19).
- Status CAS runs before any money step; a failed money step keeps the cancel, leaves `refund_failed` and alerts (88 D-20).
- Only `lib/payments/state.ts` writes `payment_state`. Stripe SDK stays 21.0.1, no new runtime dependencies.

### Client manage-booking page
- **D-01:** The confirmation email carries a button to a manage-booking page. There the client can cancel, book a new ride, and ask for a change. A change is a request to the operator, who edits the booking in admin; no self-service editing here.
- **D-02:** Access is a secret per-booking link from the email, no password, for guests and account holders alike. Cancelling still asks for confirmation on the page. Signed-in clients get the same actions from My trips. — **Reversibility:** costly — links already sent in emails must keep working or be revoked deliberately.
- **D-03:** The client can cancel up to the pickup time, whatever the booking status, also when the driver is already on the way. The policy decides the money; the status does not. If a driver is assigned they are told at once.
- **D-04:** In time: the cancel applies at once, a hold is released or a payment refunded with no human. Late: the client sees that 100% applies and confirms; the booking is cancelled at once and the driver told; the money waits for the operator. An uncaptured hold stays in place until the operator decides.

### Late cancellation
- **D-05:** The operator decides late cancellations: the dialog proposes 100%, and the operator charges or waives with a reason (flight cancelled, regular client). The site already promises a full refund for a cancelled flight.
- **D-06:** Hourly bookings have no km: they use the 12 h rule by default, through their own admin setting.
- **D-07:** Pay-now bookings follow the same policy: on a late cancel the money stays unless the operator waives it. This changes today's full refund in the admin cancel route.

### Cash guarantee
- **D-08:** "Pay cash to driver" is offered to everyone offered the card flow, on the same bookings. No amount limit.
- **D-09:** A late cancel of a cash booking is handled as for a card booking: the operator charges 100% to the saved card or waives. No hold is ever placed on a cash booking.
- **D-10:** If the client rode and did not pay the driver, the operator can charge the saved card with one action and a note on the reason. Never automatic. The consent text must cover this.
- **D-11:** On a cash booking the driver gets a warning at completion that cash must be collected, with the amount in the booking currency, and confirms receipt. That confirmation settles the booking in cash. This is an exception to Phase 87's rule that the driver never sees an amount: it applies only to cash bookings. The operator can also mark it settled (CASH-04).
- **D-12:** Cash is taken in the booking currency, the same amount and currency the client saw.

### No-show
- **D-13:** The operator's contact-attempt note is required before a no-show charge. Driver timestamps are stored automatically.
- **D-14:** The operator can charge any amount up to 100%, or waive. The server enforces the upper limit. `lib/payments/actions.ts` says no function there takes an amount: this action needs a deliberate, validated exception.
- **D-15:** With no decision on a no-show or late cancel: email reminder to the operator after 24 h and a red badge in admin. Nothing is charged without a person. The hold lapses by itself; the operator can still charge the saved card afterwards.

### Go-live
- **D-16:** No lawyer or ČOI review: the owner decided to go without one and accepts the risk (disputes, ČOI complaints). This replaces the ROADMAP legal checkpoint and CANC-02's counsel sign-off. Record the owner's decision in place of a counsel sign-off. — **Reversibility:** costly — wording shown to clients is stored per booking; later changes need a new version.
- **D-17:** Go-live is for everyone at once after the owner's own test, no staged client list. The owner flips the flag. The flag has no `on` value yet (migration 085 allows off and canary).
- **D-18:** Public wording changes together with go-live: terms, FAQ, checkout, emails, `lib/llms-content.ts`, in all 7 locales. Each booking stores the policy version it was made under; older bookings keep their terms. — **Reversibility:** one-way — a booking's accepted terms cannot be changed afterwards.
- **D-19:** An unpaid booking is never cancelled automatically: the operator decides, with the existing 24 h alert (closes the question left open by 88 D-15).

### Claude's Discretion
- Link token design, expiry after the trip, rate limits, and how the page reads in all 7 locales.
- Layout of the operator's charge or waive dialog and of the cash step on the trip screen.
- Which client emails go out for late-cancel decisions and no-show charges, as long as they use the booking language.
- How a change request reaches the operator (email alert, admin badge, or chat).
- Behaviour when a charge to the saved card is declined: reuse the recovery flow from Phase 88.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § Phase 89 — goal, success criteria, owner decisions
- `.planning/REQUIREMENTS.md` — HOLD-06, CANC-01/02, CASH-01..04

### Prior phase decisions
- `.planning/phases/88-card-on-file-scheduled-holds/88-CONTEXT.md` — D-04, D-15, D-19, D-20, D-23
- `.planning/phases/88-card-on-file-scheduled-holds/88-17-SUMMARY.md` — open list for Phase 89
- `.planning/phases/88-card-on-file-scheduled-holds/88-VERIFICATION.md` — checklist of what is not proven live
- `.planning/phases/87-status-service-driver-step-flow/87-REVIEW-DISPOSITION.md` — WR-02 (edit and assign gates ignore no_show), WR-04 (admin no_show skips wait and open-request check), WR-06 (settings route). WR-04 must close here, since no-show now charges money.

No external specs: requirements are captured in the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/admin/bookings/cancel/route.ts` — CAS-first cancel, money failure handling, `scheduleCancelRouteEmail`
- `lib/payments/hold.ts` `releaseHold`, `lib/payments/settle.ts` `settleBooking`, `lib/payments/recovery.ts`, `lib/payments/actions.ts` (`allowedPaymentActions`, `waive`)
- `lib/no-show.ts` — `confirmNoShow`, `noShowAvailableAtMs`, thresholds
- `lib/payments/consent-text.ts` `CARD_CONSENT_VERSION` (still `2026-11-draft-1`), `lib/payments/emails/`
- `app/[locale]/account/trips/page.tsx` — My trips, read-only today
- `app/(internal)/driver/trip/[token]/` — token link pattern, `NoShowBlock.tsx`, trip completion

### Established Patterns
- Driver token links: never mount third-party widgets on a token URL (`Referrer-Policy: no-referrer` on `/driver/:path*`); the manage page needs the same care.
- `middleware.ts` matcher and next-intl rules from CLAUDE.md; real translations in all locales.
- Next free migration is 087 (ROADMAP's "expected 086" was out of date).

### Integration Points
- `lib/payments/config.ts` is the only reader of `card_flow_mode`; `on` needs a migration and this reader.
- `lib/booking-status-service.ts` `advanceBookingStatus`: client cancel must go through it.
- `pricing_globals` for policy settings; `bookings.distance_km` for the 100 km rule; `pickup_utc` for time.

</code_context>

<specifics>
## Specific Ideas

- Owner's picture of the manage page: from the confirmation email, one button leads to the client's order, where they can cancel, order a new ride, or change the order.
- The policy is what matters, not the booking status.
- FAQ must be updated with the terms at go-live.

</specifics>

<deferred>
## Deferred Ideas

- Full self-service editing of a booking (date, address, vehicle, with repricing): its own phase.
- Staged rollout to a client list: rejected for now.

### Must be settled before go-live, carried from Phase 88
- D-23 erasure of consent IP, user agent and Stripe Customer.
- Radar for saved cards, pricing plan, MCC 4121 confirmation.
- Live proofs: tick-placed hold, decline and recovery, Arabic `card_saved` email, site refund of a captured card booking.
- Confirmation page and cancelled email are English in every locale; English "or" in the contact line; chat button over the consent text on a phone.

</deferred>
