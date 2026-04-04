# Feature Research

**Domain:** Round-trip / return transfer booking — premium chauffeur service (Prestigo v1.4)
**Researched:** 2026-04-04
**Confidence:** MEDIUM (industry patterns from competitor analysis + community discussions; no single authoritative spec for chauffeur-specific round-trip booking)

---

## Context

This is a **subsequent milestone** research document. The existing Prestigo wizard already has: 5 trip types, 6-step booking wizard, Stripe payment, Supabase persistence, Resend emails, admin dashboard with FSM booking management, promo codes, and per-booking cancellation with Stripe refund. Research focuses exclusively on what changes or additions are needed to support a 6th trip type: "Round Trip."

**Key competitive finding:** Blacklane — the most-referenced global premium chauffeur platform — does NOT offer single-session round-trip booking. They require two separate transactions. Building it properly in a single wizard session is a genuine differentiator.

---

## Feature Landscape

### Table Stakes (Clients Expect These)

Features that any premium transfer service offering "round trip" must have. Missing any of these will make the feature feel incomplete or broken to the client.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Return date and time collected in the same session | Client expects to specify both legs at once without repeating the full booking flow | LOW | Extend Step 2 with a second date/time block, shown conditionally when Round Trip is selected. Must validate: return datetime must be after outbound datetime |
| Return route auto-reversed (dropoff becomes pickup) | Client entered addresses once in Step 1 — they should not re-enter them for the return | LOW | Derive return pickup/dropoff by swapping Step 1 values. Display as read-only confirmation in Step 2 |
| Return leg priced via the same pricing engine | Client expects a concrete price for the return, not a blank field | MEDIUM | Call `/api/calculate-price` a second time with reversed route + same vehicle class + return datetime. Night/holiday coefficient applies independently to return leg based on its own datetime |
| Return discount applied automatically | Standard industry incentive: booking both legs together earns a discount. Premium clients expect the platform to reward the commitment | LOW | Operator configures `return_discount_pct` in admin pricing settings. Applied automatically to return leg price. Shown visibly as a line item in Step 3 |
| Combined total shown before payment | Client expects to see one number before entering card details | LOW | Step 3 shows: Outbound price + Return price (discounted) + Extras = Total. Single clear number |
| Single Stripe charge for both legs | Premium clients expect one charge on their card statement. Two charges for the same booking create confusion and support tickets | MEDIUM | One `PaymentIntent` with `amount = outbound_price + return_discounted_price + extras`. Store per-leg amounts in `metadata` and in Supabase for refund accuracy |
| Passenger details shared across both legs | Client already provided their details — they should not re-enter them for the return | LOW | Mirror all passenger fields from outbound to return record at webhook/booking-creation time. No UI change needed |
| Confirmation email covers both legs | Client needs date, time, pickup, and dropoff for each leg in one place | LOW | Extend the existing Resend confirmation template to show Leg 1 and Leg 2 as separate sections under one booking reference |
| Two ICS calendar events — one per leg | Client uses calendar apps. A single event would only block one journey | LOW | Generate two VEVENT blocks in the `.ics` file (or two separate `.ics` attachments). Leg 1 at outbound datetime, Leg 2 at return datetime |
| Admin sees both legs as linked rows | Operator needs to see the return alongside the outbound. They share a client and a payment | MEDIUM | Two Supabase `bookings` records, each with a `linked_booking_id` pointing to the other's `id`. Admin bookings list shows a "Return" badge on the return row and a visible link to the outbound |
| Per-leg status management in admin | Operator must confirm, complete, or cancel each leg independently. A client may cancel only the return | LOW | Both records use the existing FSM independently. No joint-status logic. The linkage is informational only |
| Per-leg cancellation with correct partial Stripe refund | If only the return is cancelled, the refund must equal only the return leg's price — not the full combined charge | HIGH | Requires per-leg amounts stored at booking creation time (`outbound_amount_czk`, `return_amount_czk` columns or Stripe metadata). Stripe partial refund via `stripe.refunds.create({ payment_intent, amount: return_amount })`. Existing refund infrastructure from v1.3 applies |

### Differentiators (Competitive Advantage)

Features that make the round-trip booking UX exceptional. Competitors either skip single-session round-trip entirely (Blacklane) or offer it without a return discount (most others).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Transparent price split in Step 3 | Client sees "Outbound: 1,200 CZK + Return: 1,080 CZK (10% off) = 2,280 CZK" — trust through transparency | LOW | Extend the existing price breakdown display. Both amounts visible; discount percentage shown as a badge or strikethrough. Aligns with existing promo code breakdown pattern |
| Single booking reference with leg suffix | "PRST-2847-A (Outbound) / PRST-2847-B (Return)" keeps all communications traceable under one reference | LOW | String convention at booking-creation time in the webhook. No new infrastructure. Both Supabase records store the full reference; suffix distinguishes legs in emails |
| Return discount percent visible on the UI | "You save 10% on your return leg" stated explicitly in Step 3 builds confidence that a deal is being offered | LOW | A small badge or savings-callout next to the return price. Operator-configured `return_discount_pct` drives the copy dynamically |
| Promo code applies to the combined total | Client who has a promo code gets it on top of the return discount — compounding savings | LOW | No change to promo system. The combined total (outbound + discounted return) is the base for promo code calculation. Server independently re-validates promo and recomputes total at PaymentIntent creation |
| Return-leg reschedule in admin (v2 candidate) | Operator can update return datetime if client calls to change plans without creating a new booking | MEDIUM | Admin booking detail edit for date/time fields. Not in v1.4; add if operators report change requests frequently |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| "Book return later" / open-return option | Clients who don't know their return date | Requires partial booking state, held-discount expiry, reminder flows, and a deferred payment trigger — significant scope | Offer a separate one-way booking for the return when the date is known. The wizard already supports one-way transfers |
| Return date before outbound | Some clients assume unordered entry | Logically invalid; breaks driver scheduling and admin display | Hard validation at Step 2: return datetime must be at least 1 hour after outbound datetime. Show inline error, not a toast |
| Automatic cancellation of both legs when one is cancelled | Seems consistent | Clients frequently cancel one leg intentionally (extending a stay, flight change). Forced joint cancellation creates disputes | Legs are independent after booking. Operator cancels each row separately. Linkage is display-only |
| Single combined cancel + refund for both legs | Operator convenience | Risks refunding a leg that has already been completed. Completed legs cannot be refunded | Require explicit per-leg cancellation. Each cancel triggers a Stripe partial refund for that leg's stored amount only |
| Re-entry of passenger details for the return leg | "Two separate bookings" implementation shortcut | Premium clients find re-entry insulting. Guaranteed to generate complaints | Mirror all passenger fields automatically from outbound to return at booking-creation time. One entry point, no re-entry |
| Two separate Stripe charges (one per leg) | Implementation simplicity | Two charges for the same booking confuse clients and generate duplicate-charge disputes | One `PaymentIntent`. Allocate per-leg amounts in Stripe `metadata` and in the Supabase records |
| Different vehicle class per leg | Technically possible | Adds a second vehicle selector to Step 3, complicates price display, and is almost never needed | Same vehicle class for both legs. No UI change to Step 3 vehicle selector |
| Extras selectable per leg | Maximum flexibility | HIGH complexity. Adds conditional UI in Step 4 for leg assignment. Covers <5% of real use cases (most extras apply to both legs) | Apply extras once to the combined booking. If per-leg extras are needed, client calls operator who notes it manually |

---

## Feature Dependencies

```
[Round Trip selected in Step 1]
    └──enables──> [Return date/time pickers in Step 2]
                      └──requires──> [return datetime validation: must be > outbound datetime]
                      └──enables──> [Reverse-route price calculation]
                                        └──requires──> [existing /api/calculate-price engine (no change)]
                                        └──requires──> [return_discount_pct in pricing_config]

[return_discount_pct in pricing_config]
    └──requires──> [new field added to pricing_config DB table]
    └──requires──> [admin pricing editor UI to set the value]
    └──read by──> [/api/calculate-price for return leg]

[Combined price in Step 3]
    └──requires──> [both leg prices returned from pricing engine]
    └──feeds──> [promo code validation (existing system, no change)]
    └──feeds──> [Stripe PaymentIntent amount]

[Single Stripe PaymentIntent (combined amount)]
    └──requires──> [combined price computed]
    └──requires──> [per-leg amounts available to store]
    └──enables──> [webhook creates two linked Supabase records]

[Two linked Supabase bookings records]
    └──requires──> [linked_booking_id column in bookings table (new migration)]
    └──requires──> [outbound_amount_czk + return_amount_czk columns OR Stripe metadata (new)]
    └──enables──> [admin linked-row display]
    └──enables──> [per-leg partial refund]

[Per-leg partial refund]
    └──requires──> [per-leg amount stored at creation time]
    └──requires──> [existing stripe.refunds.create infrastructure (v1.3, no change)]
    └──requires──> [admin cancellation UI to know which leg is being cancelled]

[Confirmation email with both legs]
    └──requires──> [return datetime stored in the return booking record]
    └──requires──> [existing Resend email infrastructure (no change to sending logic)]

[Two ICS events]
    └──requires──> [return datetime available at email-send time]
    └──requires──> [existing ICS generation logic (extend, not replace)]

[Admin linked-row display]
    └──requires──> [linked_booking_id populated on both records]
    └──requires──> [admin bookings list UI update to show badge + link]
```

### Dependency Notes

- **`linked_booking_id` is the critical new schema change.** Both records need it. The webhook creates the outbound record first, gets its `id`, then creates the return record with `linked_booking_id = outbound_id`, and finally updates the outbound record with `linked_booking_id = return_id`. This mutual reference enables bidirectional lookup.
- **Per-leg amounts must be stored at booking creation time.** If only the combined total is stored, accurate per-leg partial refunds become impossible without re-deriving prices — which may have changed in admin since booking. Store `outbound_amount_czk` and `return_amount_czk` as integer columns (paise/haléře) on the `bookings` table.
- **`return_discount_pct` is a single new field on `pricing_config`.** No table redesign. Extend the existing admin pricing editor with one new input for this value.
- **Promo code system needs no changes.** Apply the code to the combined total (outbound + discounted return). The existing `claim_promo_code` RPC works on any total amount. The server re-validates independently at PaymentIntent creation — same pattern as today.
- **Extras system needs no changes for v1.4.** Extras are added once to the combined booking. The extra amounts are part of the single `PaymentIntent`.
- **ICS generation is an extension, not a replacement.** The existing single-event ICS generation can be extended to produce two VEVENT blocks when the booking has a return leg.

---

## MVP Definition

### Launch With (v1.4)

Minimum set to deliver a working, shippable round-trip feature.

- [ ] "Round Trip" as 6th trip type in Step 1 — entry point to the feature
- [ ] Return date/time pickers in Step 2 (conditional on Round Trip) with validation (return > outbound) — required to capture return timing
- [ ] Reverse-route return price calculation — required for correct pricing
- [ ] `return_discount_pct` field in `pricing_config` + admin pricing editor UI — required for operator control
- [ ] Combined price breakdown displayed in Step 3 (outbound + discounted return + extras) — required for client trust
- [ ] Single Stripe `PaymentIntent` for combined amount — required for single-charge UX
- [ ] Webhook atomically creates two linked Supabase records, each storing its own amount — required for per-leg refund accuracy
- [ ] Confirmation email lists both legs (datetime, pickup, dropoff per leg) — required for client-facing completeness
- [ ] Two ICS calendar events in confirmation email — required (ICS is already expected from v1.0)
- [ ] Admin bookings list shows return row linked to outbound with a "Return" badge — required for operator visibility
- [ ] Per-leg cancellation with Stripe partial refund of that leg's stored amount — required for correct financial handling

### Add After Validation (v1.x)

- [ ] Return-leg datetime edit in admin (reschedule without rebooking) — add if operators report change requests frequently after launch
- [ ] Savings amount shown in CZK ("You save 120 CZK") alongside the percentage — add if conversion data suggests it helps

### Future Consideration (v2+)

- [ ] Leg-specific extras selection (e.g. child seat on outbound only) — HIGH complexity, covers <5% of use cases
- [ ] Open-return / book-return-later flow — requires auth, partial-booking state, reminder emails, deferred payment trigger
- [ ] Different vehicle class per leg — edge case, low demand
- [ ] SMS notification per leg — deferred with all SMS work to v2

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Round Trip trip type in Step 1 | HIGH | LOW | P1 |
| Return date/time in Step 2 with validation | HIGH | LOW | P1 |
| Reverse-route price + return discount | HIGH | LOW | P1 |
| `return_discount_pct` in admin pricing | HIGH | LOW | P1 |
| Combined price breakdown in Step 3 | HIGH | LOW | P1 |
| Single Stripe PaymentIntent (combined amount) | HIGH | MEDIUM | P1 |
| Two linked Supabase records (per-leg amounts) | HIGH | MEDIUM | P1 |
| Confirmation email with both legs | HIGH | LOW | P1 |
| Two ICS calendar events | HIGH | LOW | P1 |
| Admin linked rows with Return badge | HIGH | MEDIUM | P1 |
| Per-leg cancel + Stripe partial refund | HIGH | HIGH | P1 |
| Discount badge / savings callout in Step 3 | MEDIUM | LOW | P2 |
| Return-leg reschedule in admin | LOW | MEDIUM | P3 |
| Leg-specific extras | LOW | HIGH | P3 |

**Priority key:** P1 = must ship in v1.4. P2 = ship with v1.4 if no time cost. P3 = defer to v2.

---

## Competitor Feature Analysis

| Feature | Blacklane | Transfeero | QuanticaLabs (plugin) | Prestigo v1.4 Approach |
|---------|-----------|------------|-----------------------|------------------------|
| Single-session round-trip booking | No — two separate transactions required | Yes — return toggle in booking form | Yes — return checkbox in booking form | Yes — 6th trip type, both legs collected in one wizard session |
| Return discount applied automatically | Not advertised; no built-in return discount | Not documented | Not built-in; requires custom coding per community forum | Yes — operator-configurable `return_discount_pct`; applied automatically when Round Trip selected |
| Single payment for both legs | No — two separate Stripe charges | Yes | Depends on implementation | Yes — one `PaymentIntent` for the combined amount |
| Per-leg amounts stored for refund accuracy | N/A (separate bookings, each with own charge) | Unknown | Not documented | Yes — `outbound_amount_czk` + `return_amount_czk` stored at webhook time |
| Confirmation email covering both legs | One email per booking (two emails total) | One email per booking | One email per booking | One combined email with Leg 1 + Leg 2 sections |
| ICS calendar events | One per booking (two files for two bookings) | Not documented | Not documented | Two VEVENT blocks in one `.ics` file |
| Admin linked-row display | N/A — bookings are entirely separate | N/A | N/A | Explicit `linked_booking_id` in DB; admin shows badge + link between rows |
| Per-leg independent cancellation | Yes (separate bookings, each cancelled independently) | Yes | Yes | Yes — each Supabase record goes through its own FSM; partial Stripe refund per leg |

---

## UX Behavior Specifications

Research-informed behavior expectations for premium transfer context.

### Return Date/Time Collection (Step 2)

When Round Trip is selected, Step 2 expands to show two date/time blocks:
- Block 1 (Outbound): same as current Step 2
- Block 2 (Return): labeled "Return Journey" with a note showing the auto-reversed route ("Prague Airport → Wenceslas Square"). Second date picker defaults to the day after outbound date. Validation: return datetime must be at least 1 hour after outbound datetime. Inline error if violated.

**Open-return is not offered.** No "I'll decide later" option. If the client doesn't know their return date, they book a one-way now and a separate one-way later. This constraint is a product decision, not a technical limitation.

### Price Display in Step 3 (Round Trip)

The vehicle card shows the combined total prominently. Below it, a collapsible or always-visible breakdown:

```
Outbound: 1,200 CZK
Return:   1,200 CZK → 1,080 CZK  [10% return discount]
─────────────────────────────────
Total:    2,280 CZK
```

If a promo code is applied later, the discount applies to the 2,280 CZK total, same as any other booking.

**Premium feel:** No "DEAL" badges or celebration animations. The discount is stated factually and precisely — premium clients respond to clarity, not marketing noise.

### Confirmation Email (Both Legs)

Single email with a clear structure:

```
Your booking is confirmed — PRST-2847

LEG 1 — OUTBOUND
Date: 15 April 2026, 09:00
From: Wenceslas Square, Prague
To:   Prague Airport (PRG)
Vehicle: Business Class

LEG 2 — RETURN
Date: 22 April 2026, 14:30
From: Prague Airport (PRG)
To:   Wenceslas Square, Prague
Vehicle: Business Class

Total charged: 2,280 CZK

Two calendar events are attached to this email.
```

Both ICS events attached. Subject line references the booking reference once.

### Per-Leg Cancellation in Admin

When an operator opens a round-trip booking row, they see both legs clearly labeled. Cancellation is initiated per leg:
- Cancel outbound → modal shows outbound amount (1,200 CZK) as the refund, warns that the return leg remains active
- Cancel return → modal shows return amount (1,080 CZK) as the refund, warns that the outbound leg remains active
- Cancel both → operator cancels each leg in sequence (two separate actions)

The modal must explicitly state which leg is being cancelled and the exact refund amount for that leg. This prevents operator errors and client disputes.

---

## Sources

- [Does Blacklane offer round trip bookings? — Blacklane Help Center](https://help.blacklane.com/en/articles/8070374-does-blacklane-offer-round-trip-bookings) — Confirmed: Blacklane does NOT support single-session round-trip booking; two separate transactions required. HIGH confidence — official documentation.
- [Transfeero booking guide — Transfeero Help Center](https://help.transfeero.com/en/articles/4251934-step-by-step-guide-to-book-a-ride-with-transfeero) — Transfeero supports return date selection in booking form. MEDIUM confidence — 403 on direct fetch; verified via search result summaries.
- [Pricing Rules Overview — QuanticaLabs Chauffeur Booking System](https://quanticalabs.com/docs/chauffeur-booking-system/knowledge-base/pricing-rules-overview/) — Industry pattern for return-leg pricing rules in chauffeur software. MEDIUM confidence — official plugin documentation.
- [Discount on Return Ride — WordPress.org Support Thread](https://wordpress.org/support/topic/discount-on-return-ride-using-woocommerce-with-chauffeur-booking-system/) — Return discount on chauffeur booking is not standard out-of-the-box in existing platforms; typically requires custom implementation. HIGH confidence — direct community discussion with plugin vendor responses.
- [Refund and Cancellation Policy — Easy Chauffeurs](https://easychauffeurs.com/cancellation-policy/) — Per-leg free cancellation up to 24h before pickup. No documented joint-cancellation policy. MEDIUM confidence — official policy page.
- [Booking confirmation timelines — GetTransfer Blog](https://blog.gettransfer.com/when-do-i-receive-my-booking-confirmation-a-quick-guide-to-timelines-and-next-steps) — Industry standard content for transfer confirmation emails: booking ref, pickup/dropoff, datetime, contact details. MEDIUM confidence.
- [Stripe Refunds API — official documentation](https://docs.stripe.com/refunds) — `stripe.refunds.create({ payment_intent, amount })` for partial refunds. HIGH confidence — official.
- Existing codebase: `lib/pricing.ts`, `app/api/calculate-price/route.ts`, `app/book/`, `supabase/migrations/`, `app/admin/` — HIGH confidence — source of truth for what is already built.

---

*Feature research for: Prestigo v1.4 Return Transfer Booking*
*Researched: 2026-04-04*
