---
phase: 64-admin-created-bookings-with-payment-link
reviewed: 2026-08-25T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - app/api/admin/bookings/[id]/payment-link/route.ts
  - app/api/admin/bookings/route.ts
  - app/api/calculate-price/route.ts
  - app/api/webhooks/stripe/route.ts
  - components/admin/BookingsTable.tsx
  - components/admin/ManualBookingForm.tsx
  - components/booking/RouteMap.tsx
  - components/booking/StickyBookingPanel.tsx
  - components/booking/steps/Step3Vehicle.tsx
  - lib/booking-store.ts
  - lib/email.ts
  - lib/stripe-payment-links.ts
  - lib/supabase.ts
  - lib/travel-time.ts
  - supabase/migrations/056_bookings_payment_link.sql
  - types/booking.ts
  - tests/admin-bookings-payment-link.test.ts
  - tests/admin-bookings.test.ts
  - tests/email-payment-request.test.ts
  - tests/payment-links.test.ts
  - tests/travel-time.test.ts
  - tests/webhooks-stripe-checkout-session.test.ts
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-08-25
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the admin-created-bookings-with-payment-link feature (server-authoritative
pricing, Stripe Payment Link generation/resend, `checkout.session.completed`
reconciliation, round-trip sibling linking) plus the previously-merged
booking-fix files (calculate-price, RouteMap, StickyBookingPanel, Step3Vehicle,
booking-store, travel-time, types/booking) that shipped alongside it.

The webhook idempotency machinery (`stripe_processed_events` claim-after-side-effect
ordering, `reconcileBookingByIdToConfirmed`'s status-gated UPDATE, the union-of-both-legs
"newly reconciled" gate) is solid and well-tested. The core price-authority pattern
(server recompute + tolerance + explicit `override_price`) is correctly applied to both
the manual-booking POST and the new PATCH price-affecting sub-branch.

However, two BLOCKER-level gaps were found in the **payment-link lifecycle** —
both stem from the same root cause: a Stripe Payment Link, once minted, is a static
object whose price and existence are never re-synchronized with the booking row after
creation, and the code has no mechanism to detect or prevent a second live link (or a
now-stale live link) for the same booking/pair. Both directly touch the "payment amount
authority" and "no-duplicate reconciliation" areas this review was asked to focus on.

## Critical Issues

### CR-01: Round-trip sibling payment link can be duplicated — real risk of a client paying twice for one trip

**File:** `app/api/admin/bookings/[id]/payment-link/route.ts:104-121, 161-164, 182-193`

**Issue:** For a Phase-62-captured round-trip pair (two `bookings` rows sharing one
`payment_intent_id`, one `outbound` leg + one `return` leg), generating a payment link
on one leg persists `payment_link_url`/`payment_link_id` **only on that row**
(`.update(...).eq('id', booking.id)`, line ~185-188). The sibling row's
`payment_link_url` is never written.

The "one link per booking" guard (D-04, line 162-164) only inspects the **current**
row's own `payment_link_url`:
```ts
if (booking.payment_link_url) {
  return NextResponse.json({ error: 'A payment link already exists for this booking' }, { status: 409 })
}
```
It never checks whether the **sibling** (found via the very same sibling-detection
query two lines above) already has a link. Since the sibling's `payment_link_url` stays
`null` forever, an operator can:
1. Generate a link on the `outbound` leg → succeeds, emailed, `payment_link_url` set
   on the outbound row only. Sibling detection sets `linkedBookingId` and the email says
   "covers both legs."
2. Because the `return` leg's own `status` is untouched (still `unpaid`) and its own
   `payment_link_url` is still `null`, `BookingsTable`'s `PaymentLinkSection` still
   renders "No payment link yet — Generate Payment Link" for that row.
3. Clicking generate on the `return` leg passes every guard (status is `unpaid`,
   `payment_link_url` is `null`) and mints a **second, independent** Stripe Payment
   Link for the same combined amount, which gets emailed to the client as well.

The client now holds two live, distinct, payable links for the same trip. Both are
`completed_sessions: { limit: 1 }`, so **each** can independently be paid once —
if the client (or two family members) uses both, Stripe captures the charge twice with
no application-level guard against it (the webhook's `reconcileBookingByIdToConfirmed`
only prevents the *booking row* from being re-confirmed twice; it does not refund or
flag the second real charge).

This directly contradicts the code's own stated invariant: "D-04: never mint a second,
different URL."

**Fix:**
```ts
// When a sibling is found, also select its payment_link_url and short-circuit
// instead of silently allowing a second mint:
const { data: sibling } = await supabase
  .from('bookings')
  .select('id, amount_eur, payment_link_url, payment_link_id')
  .eq('payment_intent_id', booking.payment_intent_id)
  .neq('leg', booking.leg)
  .eq('status', 'unpaid')
  .maybeSingle()

if (sibling?.payment_link_url) {
  // Reuse the sibling's existing link instead of minting a new one.
  return NextResponse.json({
    paymentLinkUrl: sibling.payment_link_url,
    linkedBookingId: sibling.id,
  })
}
```
And when a fresh link IS minted for a linked pair, persist `payment_link_url` /
`payment_link_id` onto **both** rows in one query (`.in('id', [booking.id, linkedBookingId])`)
so the sibling's own row correctly reflects "already linked" the next time its
`PaymentLinkSection` renders, closing the loophole at the UI layer too.

---

### CR-02: Editing price or manually confirming an `unpaid` booking never invalidates its live Stripe Payment Link — stale/duplicate real-money charges go untracked

**File:** `app/api/admin/bookings/route.ts:451-703` (PATCH trip-edit branch), `287-438`
(PATCH status branch), `app/api/webhooks/stripe/route.ts:263-300` (`handlePaymentLinkSucceeded`),
`lib/stripe-payment-links.ts` (no deactivate/update export exists)

**Issue:** Once a Stripe Payment Link is created (`createBookingPaymentLink`), its
`unit_amount` is fixed forever — Stripe Payment Links cannot be edited, only
deactivated. Two admin-reachable code paths change a booking's authoritative state
without touching (or even checking for) an existing `payment_link_url`:

1. **Price edit while a link is live.** The PATCH price-affecting sub-branch
   (`app/api/admin/bookings/route.ts:489-626`) recomputes and persists a new
   `amount_czk`/`amount_eur` for an `unpaid` booking. It only gates on
   `current.status === 'completed' || current.status === 'cancelled'` (line 463) —
   there is no check for `current.payment_link_url !== null`. If the operator fixes a
   price typo (or a legitimate vehicle-class change) on a booking that already has an
   emailed, live payment link, the **link still charges the old amount**. The DB row
   ("source of truth") and the actual Stripe-collectible amount silently diverge.

2. **Manual `unpaid → confirmed` transition while a link is live.**
   `VALID_TRANSITIONS` (`lib/booking-transitions.ts:12`) permits `unpaid → confirmed`
   directly — this is the intended path for "client paid by cash/invoice, mark it
   confirmed." Nothing in the PATCH status branch (`app/api/admin/bookings/route.ts:287-317`)
   checks/clears `payment_link_url`. The email the client already received with the
   "PAY NOW" link is still fully functional.

   If that client later clicks the old link and pays, `checkout.session.completed`
   fires `handlePaymentLinkSucceeded` (`app/api/webhooks/stripe/route.ts:263-300`),
   which calls `reconcileBookingByIdToConfirmed(bookingId, paymentIntentId)`. That
   function's UPDATE is gated on `.eq('status', 'unpaid')`
   (`lib/supabase.ts:174-187`) — since the booking is already `confirmed`, **zero rows
   match**, `reconciledRows.length === 0`, and `handlePaymentLinkSucceeded` returns
   silently (line 300: `if (reconciledRows.length === 0) return`). No log, no alert, no
   admin-visible trace that Stripe just captured a real charge for that booking.

   The code comments treat "0 rows reconciled" as exclusively meaning "Stripe retry /
   duplicate delivery, correctly a no-op" — but it is indistinguishable from "a brand
   new, previously-unseen payment just succeeded against a booking that's no longer in
   the unpaid state," which is exactly what a stale/forgotten payment link produces.
   Money moves with no application-level record of it.

**Fix:**
- Add `stripe.paymentLinks.update(paymentLinkId, { active: false })` (new export in
  `lib/stripe-payment-links.ts`) and call it whenever a booking's `status` leaves
  `unpaid` via any path other than the payment-link webhook itself, and whenever a
  price-affecting field is edited on a booking that still carries a `payment_link_url`
  — regenerate a fresh link with the corrected amount if the operator still wants one
  live.
- At minimum, block the price-edit sub-branch with a 409 when
  `current.payment_link_url` is set and `override_price` wasn't explicitly passed,
  mirroring the existing "D-04: one link per booking" philosophy.
- In `handlePaymentLinkSucceeded`, distinguish "reconcile found 0 rows because the
  booking was already confirmed via *this same* payment_intent_id" (a genuine retry —
  safe to ignore) from "0 rows because status is no longer `unpaid` for any reason" —
  the latter should at minimum `console.error`/alert so a human notices an
  out-of-band Stripe capture landed on a non-unpaid booking.

## Warnings

### WR-01: TOCTOU race lets two concurrent "Generate Payment Link" requests both succeed

**File:** `app/api/admin/bookings/[id]/payment-link/route.ts:162-193`

**Issue:** The "already has a link" guard reads `booking.payment_link_url` from the
initial `SELECT` (line 77-87), then — after an `await createBookingPaymentLink(...)`
network round-trip — writes the result with a plain `.update(...).eq('id', booking.id)`
(no `.eq('payment_link_url', null)` / `.eq('status', 'unpaid')` condition, and the
result isn't checked for `data.length === 0`). Two near-simultaneous POSTs to this
route for the same booking id (double-click, two admin tabs, a retried fetch) can both
pass the initial read-check, both call Stripe, and both persist — whichever `update`
runs last wins in the DB, but **two** Payment Links were minted and (if `logEmail`'s
dedup window doesn't happen to collide) potentially two payment-request emails sent.

**Fix:** Make the persist step conditional and check the row count, the same pattern
already used by `reconcileBookingToConfirmed`/`reconcileBookingByIdToConfirmed`
elsewhere in this codebase:
```ts
const { data: updated, error: updateError } = await supabase
  .from('bookings')
  .update({ payment_link_url: link.url, payment_link_id: link.id, status: 'unpaid' })
  .eq('id', booking.id)
  .is('payment_link_url', null)
  .select('id')
if (updated && updated.length === 0) {
  // lost the race — another request already persisted a link; do not send a second email
}
```

### WR-02: `distance_km` is a fully client-controlled price input with no server-side sanity check

**File:** `app/api/admin/bookings/route.ts:120-121` (PATCH schema), `508-527` (PATCH
recompute), `809-840` (POST recompute)

**Issue:** The server-recompute pattern here correctly refuses to trust a
client-submitted **amount**, but the recompute itself is driven by a client-submitted
**`distance_km`**, which is taken at face value with no independent verification (the
code comments explicitly acknowledge this as "Pitfall 2 — trusted only at the price
level, no second geocode call"). Because the tolerance check compares the server's
own recompute (using the attacker-supplied distance) against the attacker-supplied
amount, a compromised admin session (XSS, CSRF bypass, leaked session cookie) can
submit a correctly-addressed transfer with an artificially small `distance_km` and the
server will happily accept it with **no mismatch, no override flag required** — the
"never trust a client-submitted amount" guarantee is only as strong as the least-verified
input that feeds the recompute.

**Fix:** At minimum, compute a cheap haversine estimate from `origin_lat/lng` and
`destination_lat/lng` (already present in the payload) and require `override_price`
(with the existing audit-log trail) whenever `distance_km` diverges from the haversine
estimate by more than a generous multiplier (chauffeur routes are rarely >2x straight-line
distance). This closes the gap without adding a second paid Google Routes call.

### WR-03: Duplicate URL-truncation and clipboard-copy logic between the two payment-link UI surfaces

**File:** `components/admin/BookingsTable.tsx:775-781, 834-853` and
`components/admin/ManualBookingForm.tsx:75-79, 237-258`

**Issue:** `truncatePaymentLinkUrl`/`truncateMiddle` and `handleCopyLink` are
byte-for-byte duplicated between `BookingsTable.tsx` (row-level payment-link panel) and
`ManualBookingForm.tsx` (create-with-payment result panel). Any future fix (e.g. a
clipboard-permission edge case, a truncation-length change) has to be applied in two
places and will silently drift if one is missed.

**Fix:** Extract both into a shared module (e.g. `lib/ui/payment-link-display.ts`) and
import from both components.

## Info

### IN-01: Hardcoded `/ 0.04` conversion instead of the existing `eurToCzk()` helper

**File:** `app/api/webhooks/stripe/route.ts:320`

**Issue:**
```ts
amountCzk: row.amount_czk ?? Math.round(row.amount_eur ? row.amount_eur / 0.04 : 0),
```
`lib/currency.ts` already exports `eurToCzk(eur)` (`Math.round(eur * EUR_TO_CZK_RATE)`,
`EUR_TO_CZK_RATE = 25`), which is the correct, single-source-of-truth equivalent of
`/ 0.04`. The inline magic number will silently go stale if the exchange rate constant
is ever updated in one place and not the other.

**Fix:** `amountCzk: row.amount_czk ?? eurToCzk(row.amount_eur ?? 0)` (import `eurToCzk`
from `@/lib/supabase`'s existing import, or directly from `@/lib/currency`).

### IN-02: `RouteMap`'s `distanceKm` prop is unused dead weight

**File:** `components/booking/RouteMap.tsx:143, 153, 289`

**Issue:** `distanceKm` is declared in `RouteMapProps`, destructured in the component
signature, and included in the `useEffect` dependency array (line 289), but it is never
referenced anywhere inside the effect body or the render — the animated route is
computed entirely from Directions/Polyline data. Both call sites
(`StickyBookingPanel.tsx:173`, presumably others) pass it in for no effect, and the
unused dependency causes the effect to be considered for re-run on every `distanceKm`
change even though nothing inside actually uses it.

**Fix:** Remove the `distanceKm` prop from `RouteMapProps` and both call sites, or wire
it into something meaningful (e.g. an on-map distance label) if that was the intent.

### IN-03: `escapeHtml()` applied to an email `subject` (plain-text header), not just the HTML body

**File:** `lib/email.ts:1390`

**Issue:**
```ts
subject: `Complete your payment for ${escapeHtml(data.bookingReference)} — Prestigo`,
```
`escapeHtml` HTML-entity-encodes its input (`&` → `&amp;`, etc.) — correct for the HTML
body, but semantically wrong for a mail `subject` header, which is plain text. Currently
harmless because `generateBookingReference()` only emits `[A-Z0-9-]` characters, but if
that invariant ever changes, subjects would visibly show `&amp;` instead of `&` to the
recipient.

**Fix:** Use the raw `data.bookingReference` in the subject (booking references are
already constrained to a safe charset elsewhere) or apply RFC 2047 encoding if arbitrary
Unicode is ever allowed in a booking reference.

---

_Reviewed: 2026-08-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
