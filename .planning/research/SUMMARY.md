# Project Research Summary

**Project:** Prestigo — milestone v5.0 "Payments, Quotes & Day Trips"
**Researched:** 2026-11-02
**Confidence:** MEDIUM-HIGH

## Executive Summary

v5.0 is an integration milestone on a shipped Next.js + Supabase + Stripe + Vercel Hobby codebase and needs **zero new runtime npm dependencies**. The work is:

- New Stripe flows: SetupIntent + Customer, off-session manual-capture holds, capture, and the no-show charge.
- One signed scheduler endpoint.
- A second state machine for money (`payment_state`) that runs alongside `bookings.status`.
- One shared status-mutation service used by both admin and driver.
- Hand-built kanban, calendar and theme on top of the existing `.theme-light` CSS variables.

Quotes and day trips reuse the payment engine, the `route_prices`/`live-prices` pattern and the v4.0 lead outbox.

### The blocker: a hold ~5 days before the trip does not work

All four researchers independently reached the same conclusion: **the owner's "hold ~5 days before" cannot work as stated.**

- A scheduled hold, placed with the customer absent, is merchant-initiated. Visa holds last 4 d 18 h in that case; Mastercard, Amex and Discover holds last 7 d.
- A Visa hold placed at T-5d therefore expires about 6 h before pickup.
- Extended and incremental authorization do not fix this:
  - Both require IC+ pricing.
  - Visa extended authorization applies to customer-initiated payments only (+0.08%).
  - Discover excludes limousines.

### Recommendation (unanimous)

1. Make the hold lead time configurable (`payment_hold_lead_hours`), defaulting to 72 h and never set to 120 h.
2. When pickup is already inside the lead window, place an on-session manual-capture hold at checkout (customer-initiated, 3DS, 7-day window).
3. Store Stripe's `capture_before` and alert on it.
4. Always implement a capture-time fallback:
   - If the PaymentIntent is no longer `requires_capture`, create a fresh off-session automatic-capture charge on the saved card under the SetupIntent mandate.
   - If that charge fails, send a payment link and alert the operator.

The real guarantee is the saved card plus the mandate; the hold is a convenience and a trust signal.

### Other top risks

- The webhook creates bookings from `payment_intent.succeeded` and will mishandle hold, capture and no-show events.
- The driver link becomes a trigger that moves money.
- Mandate wording, and Czech/EU consumer law on a 100% no-show fee.
- Vercel Hobby cron runs only once a day.
- There is no usable local Stripe test key.

## Key Findings

### Stack

Keep everything that is installed: `stripe` stays at 21.0.1, with no major bumps mid-milestone.

**Card on file and holds**
- SetupIntent + Customer with `usage: off_session`, using a deferred-intent PaymentElement and `confirmSetup`.
- Payment methods: `card` only. This covers Apple Pay and Google Pay.
- The scheduled hold is an off-session PaymentIntent with `capture_method: manual` and the idempotency key `hold:<bookingId>:<attempt>`.
- Cancelling the PaymentIntent releases the hold at no fee; capture uses `amount_to_capture`.

**Quotes**
- Use our own `/quote/[token]` page and Supabase tables, not Stripe Quotes or Invoicing.
- The deposit is taken one of two ways: an on-page PaymentElement PaymentIntent with `setup_future_usage`, or a Checkout Session created per attempt. Either way, the deposit is paid and the card saved in a single 3DS step.

**Scheduler**
- One endpoint, `/api/cron/payment-tick`, accepting either a `CRON_SECRET` bearer or a QStash signature.
- The primary trigger is a QStash Schedule every 15–30 min; the daily Vercel cron is the backstop.
- Rejected: pg_cron, and per-booking delayed QStash messages (the free plan caps delays at 7 days).

**Admin shell**
- Theme uses the existing `.theme-light` class plus cookies (`admin_theme`, `admin_sidebar`). No `next-themes`, because of the CSP nonce problem.
- Kanban is hand-built and moves cards through menus only (no drag-and-drop).
- Calendar is a CSS grid built on `lib/prague-date.ts`.
- Live updates use polling with `router.refresh()`.

**Routing**
- Google Routes `computeRoutes` with `intermediates`, which the codebase already uses.
- Do not set `routingPreference`, so requests stay on the Essentials SKU. Cap the number of stops.

**Webhook events to subscribe** (via an owner-run script):
- `setup_intent.succeeded`, `setup_intent.setup_failed`
- `payment_intent.amount_capturable_updated`, `.payment_failed`, `.canceled`
- `charge.expired`, `charge.dispute.created`
- `payment_method.detached`

### Features

**Must have**
- **Card on file:**
  - an unticked consent checkbox with a stored consent record
  - a visible, tiered cancellation policy
- **Holds:**
  - a scheduled hold, released free of charge on cancellation and captured on completion
  - a recovery link plus an operator alert when a hold fails
  - payment status badges
- **Cash:** cash payment backed by a card guarantee, with a 100% no-show charge that an operator must confirm.
- **Driver flow:** a single "next step" flow that writes `booking.status`.
- **Multi-stop pricing:**
  - priced across all legs and recomputed on the server
  - pre-selected waiting time per stop, with the first 15 min free
- **Airport pickup offset:** the free wait is counted from the pickup time.
- **Quotes:**
  - a token page with an itemised body and an expiry
  - a lifecycle that includes "viewed"
  - acceptance recorded with logged evidence
  - a deposit, plus a remainder collected by card, link, cash or invoice
  - versions
- **Admin:** a date-scoped kanban, a day/week/month calendar, a collapsible sidebar and a light theme.
- **Day trips:**
  - a catalogue priced per car (E/S/V) in admin
  - trip pages with online booking
  - a custom-tour form that feeds the lead pipeline and then a quote

**Differentiators**
- the capture-time fallback charge
- cash backed by a card guarantee
- pre-priced waiting time
- airport timeline wording
- the quote "viewed" signal
- prefill for "customise this trip"

**Defer**
- an overstay overage charge
- a calendar showing drivers as resources
- Supabase Realtime
- drag-and-drop
- quote PDF or e-signature
- live GPS
- per-slot inventory
- per-person pricing
- a self-service cancellation portal

### Architecture

**Data model**
- `payment_state`, `payment_mode`, `hold_at` and `capture_before` are independent of `status`.
- A ledger table, `booking_payment_events`, records money events.
- Only `lib/payments/state.ts` writes `payment_state`, using compare-and-set transitions.
- `bookings.status` gains just two values: `on_board` and `no_show`. The driver's `arrived` step maps to the existing `on_location`.
- `payment_intent_id` is set only at capture; the hold's PaymentIntent lives in `hold_payment_intent_id`. This keeps cancel, stats and erasure correct.

**Status service**
- The inline PATCH logic in `app/api/admin/bookings/route.ts` is extracted into `advanceBookingStatus()`.
- It becomes the single status writer for admin, driver, cancel and payments.

**Quotes and day trips**
- Quotes turn into bookings when the deposit is paid, with `payment_mode='quote'`, so the hold engine ignores them.
- Day trips copy the `route_prices` shape (3 price columns, edited in admin); prose lives in `content/day-trips/<locale>/`.

**Main components**
- `lib/stripe.ts` and `lib/stripe-webhook/*`
- `lib/booking-status-service.ts`
- `lib/payments/*` and `/api/cron/payment-tick`
- `lib/checkout/compute.ts` and `lib/route-distance.ts`
- `lib/quotes/*` and `lib/day-trips.ts`
- the admin shell, plus an extracted `BookingDetailPanel`

### Critical Pitfalls

1. **Hold window vs Visa's 4 d 18 h limit.**
   - Use a configurable 72 h lead and an on-session hold for near-term trips.
   - Track `capture_before` and implement the fallback charge.
2. **The webhook assumes pay-now.**
   - Route on `metadata.kind` first, and make `setup_intent.succeeded` the booking trigger.
   - Status-guard `charge.refunded` so that a partial refund cannot cancel a completed trip.
   - The cancel route branches on `payment_state`, choosing between `cancel` and `refund`.
   - Never put `bookingId` in a hold PaymentIntent's metadata.
3. **Failed or double holds.**
   - Write the attempt row before calling Stripe, and use one idempotency key per attempt.
   - Allow only one active hold per booking and leg, and never retry blindly.
   - The recovery link and operator alert must not depend on the VPS.
4. **The driver link moves money.**
   - Use one status writer with compare-and-set.
   - The server enforces step order: skipping a step returns 409, replaying one returns 200.
   - Completing the trip requires confirmation.
   - Capture is retried by the tick and is visible in admin.
   - The driver never sets an amount, and there is no automatic no-show charge.
   - Rewrite the v2.2 isolation grep-gates rather than deleting them.
5. **Consent and legal exposure.**
   - An unticked mandate checkbox in all 7 locales, with a stored hash of the text.
   - A tiered cancellation schedule; a flat 100% fee is a trap under unfair-terms law.
   - Sign-off from Czech counsel or ČOI before payments ship.
   - Quote tokens:
     - hashed and 256-bit
     - immutable versions
     - side-effect-free GET
     - no-referrer, no-store and noindex
6. **Scheduler and time.**
   - Hobby cron runs only once a day, so the tick uses catch-up semantics.
   - Do all scheduling math on `pickup_utc` instants, with DST fixtures for 2027-03-28 and 2027-10-31.
   - Keep `landing_at` separate from `pickup_at`.
   - Recompute `hold_at` whenever admin edits the pickup.

## Implications for Roadmap

Numbering continues from v4.0, which ended at phase 85: the next phase is 86 and the next migration is 084.

- **Phase 86: Admin shell.**
  - Scope:
    - theme stored in a cookie and a collapsible sidebar
    - a codemod converting about 234 hex literals to tokens
    - a test that bans new hex values
  - Why first: it is mechanical and low-risk.
  - Prevents:
    - merge conflicts, and new hex debt piling up in later phases
    - theme flash and CSP nonce issues
    - the theme leaking onto public pages
- **Phase 87: Status vocabulary, status service, driver sync** (migration 084).
  - Scope:
    - a behaviour-preserving extraction of `advanceBookingStatus()`
    - the `on_board` and `no_show` statuses, and a `booking_status_log` table
    - the driver's single-step flow, with idempotent GNet pushes
    - rewritten DTRIP-04 gates, and parity tests
  - Why before payments: capture and no-show hooks need one trusted status writer.
- **Phase 88: Payments** (migration 085), with a legal checkpoint before launch.
  - **Code and plumbing:**
    - consolidate `lib/stripe.ts` and extract the compute module
    - `create-setup-intent`
    - the `payment_state` machine and its ledger
    - split the webhook and add the new events
    - `payment-tick` with its QStash schedule
    - the capture fallback, and cancel-route branching
  - **Admin and operations:**
    - an admin payment panel
    - the recovery link and alerts
    - a feature flag, rolled out with an owner canary
  - **Customer-facing:**
    - consent storage
    - 7-locale mandate and terms copy
    - 3 localized payment emails
  - Highest value and highest risk; quotes, extras and day trips all reuse it.
- **Phase 89: Dispatch views.**
  - Scope: extract `BookingDetailPanel` from the 2886-line `BookingsTable`, then build the kanban and the calendar.
  - Depends on the final status set and the payment badges.
  - Avoid:
    - a kanban that bypasses transitions; it should offer `UI_TRANSITIONS` only, with confirm dialogs that state the money effect
    - grouping by the browser's timezone
  - Can swap or overlap with Phase 90 once 88 is done.
- **Phase 90: Multi-stop, airport offset, waiting fees** (migration 086).
  - Scope:
    - `booking_stops`
    - server-side distance recompute, which also closes the current gap where `distanceKm` is trusted from the client
    - pre-selected waiting per stop
    - airport offset, with the free wait counted from pickup
    - delay handling that notifies the operator
  - Extras above the hold are charged separately, with operator approval.
- **Phase 91: Quotes** (migration 087).
  - Scope:
    - the quote builder and `/quote/[token]`
    - versions
    - the deposit, taken through a per-attempt session
    - remainder methods, including a minimal invoice method (a record plus an email)
    - turning a quote into bookings
  - Needs the payment machinery from 88 and the stop semantics from 90.
- **Phase 92: Day trips + custom tour** (migrations 088–089).
  - Why last:
    - it carries the largest 7-locale batch
    - it benefits from every payment mode
    - the custom-tour loop needs quotes
  - The catalogue and booking can ship before the quote loop.
  - Avoid:
    - thin per-locale pages
    - cannibalising `/routes/*`
    - stale JSON-LD prices (use ISR with revalidation)
    - missing places where the `trip_type` enum is used
- **In parallel with 86–87:** Stripe test-mode setup (owner-run scripts) and the legal review.

### Research Flags

Need research before planning:
- **Phase 88:**
  - `confirmSetup` inside the existing PaymentElement
  - Stripe Customer handling for guest checkouts
  - decline and 3DS recovery, and SCA test cards
  - blended vs IC+ pricing and the merchant category code
  - legal wording
  - the QStash schedule quota
- **Phase 87:** GNet semantics for `on_board` and `no_show` (LOW confidence).
- **Phase 90:** Routes API behaviour with many intermediates, airport detection, and the waiting-fee policy.
- **Phase 91:**
  - the invoice remainder method
  - VAT documents for deposits
  - Payment Link vs Checkout Session restriction parameters
- **Phase 92:** the JSON-LD type, package-travel classification, and a GSC keyword map.

Standard patterns: Phases 86 and 89.

## Owner Decisions Still Open

1. **Hold lead time.**
   - Confirm a configurable 72 h lead instead of "~5 days", with an on-session hold at checkout for near-term trips and the capture-time fallback.
   - Confirm the cutoff for the on-session hold (about 6 days out).
   - Confirm that multi-day quotes use per-day holds or a deposit plus remainder, never one long hold.
2. **`on_board`.**
   - Decide whether it is a real `bookings.status` (recommended) or progress-only, mapped to `on_location`.
   - Decide whether `no_show` is terminal, and how it maps in:
     - leads (`converted` vs `dead`)
     - stats (count revenue only when charged)
     - Chatwoot
3. **No-show charge.**
   - Operator-confirmed (recommended) or automatic.
   - Wait thresholds: Blacklane's benchmark is 30 min in the city and 60 min at the airport, counted from the pickup time.
4. **GNet.**
   - Which statuses are pushed for `on_board` and `no_show`.
   - Whether changes the driver makes are pushed automatically.
   - Partner (`gnet`) bookings must skip the hold, capture and no-show charge.
5. **Legal wording** — needs Czech counsel or ČOI before Phase 88 ships:
   - mandate and consent text
   - the tiered cancellation schedule and the no-show clause
   - the withdrawal-exemption disclosure
   - VAT documents for deposits
   - how day trips are classified
   - Stripe PII erasure vs accounting retention
6. **Lower priority:**
   - booked vs collected revenue in stats
   - waiting-fee collection (operator-approved recommended)
   - localizing the payment-critical emails now
   - the driver UI language
   - kanban drag-and-drop (deferred)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official docs read 2026-11-02; UI build-vs-buy MEDIUM |
| Features | MEDIUM-HIGH | Stripe rules HIGH; competitor policies/structured-data MEDIUM |
| Architecture | HIGH | Read from source; GNet no-show semantics LOW |
| Pitfalls | MEDIUM-HIGH | Stripe HIGH; Czech/EU law MEDIUM-LOW |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Stripe pricing plan and MCC:** confirm in the Dashboard.
- **QStash free-plan schedule count:** sources conflict, so verify in the Upstash console. If the schedule is unavailable, the daily backstop must still place holds, just later.
- **Stripe test key:** the current key is a dead placeholder, so use owner-run scripts and a canary. Hold expiry cannot be simulated with test cards; mock the `canceled` branch instead.
- **GNet:** the semantics for `on_board` and `no_show` are unknown.
- **Legal:** the Czech/EU specifics are unverified.
- **Existing debts found:**
  - the QStash 2 h reminder silently skips bookings more than 7 days out
  - CZK/EUR rate drift (WR-03)
  - stale payment-link deactivation (CR-02)
  - `charge.refunded` has no status guard; fix this one in Phase 88 and backlog the others
- **Day-trip content volume** (N trips × 7 locales): publish a locale only when it is complete, and translate in-session.

## Sources

**HIGH:**
- Stripe docs: hold, extended and incremental authorization, overcapture, save-and-reuse, testing
- Vercel cron and function-duration docs
- Upstash QStash docs
- Google Routes docs
- reading the repo source

**MEDIUM:** Blacklane, Limo Anywhere, Daytrip, Quoter/HubSpot, schema.org TouristTrip.

**LOW:**
- Czech/EU consumer law (from recollection)
- GetYourGuide/Viator summaries
- remarks on card-network misuse fees

---
*Research completed: 2026-11-02*
*Ready for roadmap: yes*
