# Pitfalls Research — v1.3 Pricing & Booking Management

**Domain:** Adding Stripe refunds, promo codes, zone logic fix, holiday dates, manual bookings, status workflow, and mobile admin UI to an existing Next.js 14 App Router + Supabase + Stripe chauffeur booking app.
**Researched:** 2026-04-03
**Confidence:** HIGH (Stripe refund behavior verified against official API docs; PostgreSQL race condition prevention verified against multiple authoritative sources; timezone behavior verified; zone logic derived from existing `calculate-price/route.ts` code analysis)

> This document covers ONLY new pitfalls introduced by v1.3 features.
> v1.1 pitfalls (Stripe webhook, Resend domain, Google Maps key types, Vercel env scoping) and v1.2 pitfalls (Supabase Auth middleware loop, terra-draw SSR, pricing cache invalidation, zone geojson coordinate order) remain valid — do not re-do that work.

---

## Critical Pitfalls

### Pitfall 1: Refunding an Already-Refunded PaymentIntent Without a Guard

**What goes wrong:**
The operator clicks "Cancel + Refund" on a booking that was already refunded (e.g., by a previous admin action or directly in the Stripe dashboard). The API route calls `stripe.refunds.create({ payment_intent: booking.payment_intent_id })`. Stripe throws an error: "This PaymentIntent has already been fully refunded." The admin UI shows an unhandled 500, the booking status in Supabase is not updated, and the operator is confused about the true state.

**Why it happens:**
The existing webhook handler stores `payment_intent_id` in every booking row. When the refund route is added, developers reach for the simplest possible call — pass the PI id, get a refund — without checking the current Stripe object state first. Stripe does not silently no-op a duplicate refund; it throws an `StripeInvalidRequestError` with code `charge_already_refunded`.

**How to avoid:**
Before calling `stripe.refunds.create`, check the booking's `status` column in Supabase. Enforce a server-side guard: only bookings with status `confirmed` or `pending` are eligible for refund. Additionally, check the local `status` before hitting Stripe — do not rely on Stripe's error as your only guard. If the booking already has `status = 'cancelled'` or `status = 'refunded'`, return a 409 Conflict to the client immediately, without calling Stripe.

Always wrap `stripe.refunds.create` in a try/catch and handle `StripeInvalidRequestError` explicitly: map it to a user-readable message rather than a raw 500.

```typescript
// Correct pattern
if (!['confirmed', 'pending'].includes(booking.status)) {
  return NextResponse.json({ error: 'Booking is not eligible for refund' }, { status: 409 })
}
try {
  const refund = await stripe.refunds.create({ payment_intent: booking.payment_intent_id })
  // update Supabase status to 'cancelled'
} catch (err) {
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
  throw err
}
```

**Warning signs:**
- Admin sees 500 errors in Vercel logs with message "This PaymentIntent has already been fully refunded"
- Booking status stuck at `confirmed` after a manual Stripe dashboard refund

**Phase to address:** Booking cancellation + refund phase (BOOKINGS-08)

---

### Pitfall 2: Refunding a Manual Booking That Has No payment_intent_id

**What goes wrong:**
Manual bookings created by the operator (BOOKINGS-06, phone orders) have no Stripe payment — `payment_intent_id` is NULL. When the operator later tries to cancel + refund a manual booking, the refund API route passes `payment_intent: null` to Stripe, which throws. Alternatively, the UI allows "Refund" for manual bookings when it should only offer "Cancel."

**Why it happens:**
The refund action is built generically for all bookings. The code assumes every booking has a `payment_intent_id`. Manual bookings intentionally lack one.

**How to avoid:**
Distinguish manual bookings from Stripe-paid bookings by checking `payment_intent_id IS NULL` (or a dedicated `booking_source: 'manual' | 'stripe'` column). In the admin UI, show "Cancel" (no refund) for manual bookings and "Cancel + Refund" only for Stripe-paid bookings. The server-side route must also guard: if `payment_intent_id` is NULL, skip the Stripe call entirely and only update the booking status.

**Warning signs:**
- Stripe errors with "No such PaymentIntent: null" in Vercel logs
- Admin tries to refund a phone-order booking

**Phase to address:** Manual booking creation (BOOKINGS-06) + booking cancellation (BOOKINGS-08) — must coordinate the `payment_intent_id` null case across both phases

---

### Pitfall 3: Promo Code Race Condition — Over-Redemption Past Usage Limit

**What goes wrong:**
A promo code has `max_uses = 10` and `current_uses = 9`. Two clients simultaneously submit the checkout (both at Step 6, both call `/api/create-payment-intent` with the promo code). Both server instances read `current_uses = 9`, both conclude the code is still valid, both create PaymentIntents with the discounted amount, and both increment to 10. The code is redeemed 11 times total.

This vulnerability is documented in the wild: Stripe's own HackerOne bug reports include a race condition on promotion code redemption limits (HackerOne report #1717650).

**Why it happens:**
The naive implementation does: (1) SELECT the promo code row, (2) check `current_uses < max_uses`, (3) UPDATE `current_uses = current_uses + 1`. Steps 1–3 are not atomic. Two concurrent requests both pass step 2 before either reaches step 3.

**How to avoid:**
Use an atomic UPDATE with a WHERE guard instead of a read-then-write pattern:

```sql
-- Atomic: only succeeds if the limit is not yet reached
UPDATE promo_codes
SET current_uses = current_uses + 1
WHERE code = $1
  AND is_active = true
  AND (max_uses IS NULL OR current_uses < max_uses)
  AND (expires_at IS NULL OR expires_at > NOW())
RETURNING id, discount_type, discount_value;
```

If 0 rows are returned, the code is invalid or exhausted — reject the request. This single statement is atomic at all PostgreSQL isolation levels. Do NOT use a SELECT followed by an UPDATE — the gap between them is the race window.

This increment should happen inside `create-payment-intent`, not at the promo-code validation step. Validate first (read-only check for user feedback), but only commit the increment when the PaymentIntent is created.

**Warning signs:**
- `current_uses` exceeds `max_uses` in the database
- High-demand promo campaigns with concurrent users
- Load testing reveals codes redeemed more than max_uses

**Phase to address:** Promo code system — server validation and PaymentIntent creation (PROMO-04)

---

### Pitfall 4: Price Mismatch — Client Displays Discounted Price, Server Charges Full Price

**What goes wrong:**
The client applies a promo code in Step 4 or Step 6 of the wizard. The displayed price is updated. But when Step 6 calls `/api/create-payment-intent`, the promo code is not included in the request body (forgotten, or the Zustand store doesn't pass it). The PaymentIntent is created at full price. The client pays more than shown. This is a serious trust violation with premium clients.

**Why it happens:**
The wizard Zustand store in Prestigo holds wizard step data. If the promo code field is added to the UI but not wired into the `bookingData` object passed to `create-payment-intent`, the server never sees it. The discounted amount shown to the user is calculated client-side only — the PaymentIntent reflects the unmodified server calculation.

**How to avoid:**
- The promo code must be stored in the Zustand wizard store and included in `bookingData` sent to `create-payment-intent`.
- The server must re-apply the discount during PaymentIntent creation and embed the discount details in Stripe metadata.
- Never trust a client-provided amount. The server must independently recalculate: fetch the promo code from DB, verify it's valid, compute discounted total, create PaymentIntent with that amount.
- Add an assertion in the server: `if (requestedAmount !== computedAmount) log warning and use computedAmount`.

**Warning signs:**
- Stripe Dashboard shows PaymentIntent amounts inconsistent with what clients report paying
- Client emails asking why they were charged more than the displayed price

**Phase to address:** Promo code client integration (PROMO-03) and server validation (PROMO-04) — must implement as a single coordinated change

---

### Pitfall 5: Zone Logic Regression — ZONES-06 Fix Breaks Existing Quote Mode

**What goes wrong:**
The current zone check in `calculate-price/route.ts` (lines 132–138) returns `quoteMode: true` if `originOutside || destOutside`. The v1.3 requirement (ZONES-06) inverts this: show a price if pickup OR dropoff is within a zone; only go to quoteMode if NEITHER point is in any zone.

A naive search-and-replace of `||` to `&&` in the zone check:

```typescript
// WRONG — accidentally allows trips entirely outside all zones
if (originOutside && destOutside) { return quoteMode }
```

...looks correct in isolation but the variable names are `isOutsideAllZones` return values. The logic must be:

```typescript
// CORRECT — quoteMode only when BOTH points are outside all zones
const originInAnyZone = !isOutsideAllZones(origin.lat, origin.lng, zones)
const destInAnyZone   = !isOutsideAllZones(destination.lat, destination.lng, zones)
if (!originInAnyZone && !destInAnyZone) { return quoteMode }
```

The confusion arises from the negated naming. Getting this wrong causes previously-working routes to fall into quoteMode (breaking paid bookings) or previously-quoteModed routes to show prices (booking trips the operator cannot service).

**Why it happens:**
The existing function is named `isOutsideAllZones` — it returns `true` when the point is OUTSIDE. Developers mentally invert the logic incorrectly when applying the new OR rule.

**How to avoid:**
Rename to a positive-assertion function `isInAnyZone` to avoid double-negation confusion:

```typescript
function isInAnyZone(lat: number, lng: number, zones: Zone[]): boolean {
  if (zones.length === 0) return false
  const pt = point([lng, lat])
  return zones.some(zone => booleanPointInPolygon(pt, zone.geojson))
}
// quoteMode = neither pickup nor dropoff is in any zone
const quoteMode = !isInAnyZone(origin.lat, origin.lng, zones) &&
                  !isInAnyZone(destination.lat, destination.lng, zones)
```

Write explicit unit tests for all four zone cases before touching production code:
1. Pickup inside zone, dropoff outside → price shown
2. Pickup outside zone, dropoff inside → price shown
3. Both inside zone → price shown
4. Both outside zone → quoteMode

**Warning signs:**
- Existing routes that currently show prices suddenly enter quoteMode after the deploy
- Routes between two Prague locations show quoteMode when Prague zone is active

**Phase to address:** Zone logic fix phase (ZONES-06) — must include regression tests

---

### Pitfall 6: Holiday Date Timezone Bug — Prague Date vs UTC Date

**What goes wrong:**
The operator configures "2026-12-25" (Christmas Day CET) in the holiday dates admin panel. The date is stored as a plain date string `2026-12-25` in Supabase. When a client books a midnight trip on Dec 25 at 00:30 CET, the server converts the pickup datetime to UTC: 00:30 CET = 23:30 UTC on Dec 24. The server compares `2026-12-24` (UTC date) against the holiday list `['2026-12-25']` — no match. The holiday coefficient is not applied.

This is the inverse problem too: a trip booked at 23:30 CET on Dec 25 = 22:30 UTC on Dec 25 — this DOES match and correctly applies the coefficient. But the midnight edge case fails silently with no error.

Prague operates on CET (UTC+1) in winter and CEST (UTC+2) in summer. The DST transition itself (last Sunday of March, last Sunday of October) can also cause off-by-one day errors.

**Why it happens:**
JavaScript `new Date()` in a Node.js serverless environment (Vercel) operates in UTC. `new Date().toISOString().slice(0, 10)` gives the UTC date, not the Prague local date. Supabase also stores timestamps in UTC. Operators think in local time; the system computes in UTC.

**How to avoid:**
When checking if a pickup date is a holiday, derive the local Prague date from the pickup datetime, not from UTC:

```typescript
import { toZonedTime, format } from 'date-fns-tz'

function getLocalDateString(pickupDate: string, pickupTime: string): string {
  // pickupDate is 'YYYY-MM-DD', pickupTime is 'HH:MM' — treat as Prague local
  const localDatetime = new Date(`${pickupDate}T${pickupTime}:00`)
  // This is already a local wall-clock time from the user's perspective
  // Prague stores dates as local dates — compare directly
  return pickupDate // The date the operator set IS already local
}
```

Actually simpler: since `pickupDate` and `pickupTime` are stored as the local Prague time that the client entered (the wizard date picker is unaware of timezone), the server should compare `pickupDate` string directly against the holiday dates list — NOT convert to UTC first. The pitfall appears when code does `new Date(pickupDate).toISOString().slice(0, 10)` which is safe for dates but dangerous for datetimes near midnight.

Do NOT use `new Date(pickupDate + 'T' + pickupTime + 'Z')` (forcing UTC) — this misinterprets local times. The existing `dateDiffDays` function in `lib/pricing.ts` correctly appends `T00:00:00` (no Z) to treat dates as local — follow this exact same pattern for holiday comparison.

**Warning signs:**
- Holiday coefficient not applied for bookings with `pickupTime` between 00:00–01:00 or 22:00–23:59
- Complaints around Christmas/New Year bookings where prices seem wrong

**Phase to address:** Holiday dates configuration (PRICING-07)

---

### Pitfall 7: Manual Booking — Status Confusion with Webhook-Saved Bookings

**What goes wrong:**
Webhook-saved bookings are created with `status = 'confirmed'` (set in the webhook handler after `payment_intent.succeeded`). Manual bookings created by the operator for phone orders have no payment and no webhook. If the manual booking is saved with `status = 'confirmed'`, it looks identical to a paid online booking in the admin bookings table. There is no way to distinguish "confirmed by Stripe payment" from "confirmed by operator assertion."

A related risk: if the manual booking accidentally gets a `payment_intent_id` from a stale form state (wizard leftover in the store), then the operator's "cancel + refund" action tries to refund a PaymentIntent that doesn't belong to this booking.

**Why it happens:**
Reusing the same `status` values and `booking_type` without a dedicated field to track booking origin. The Supabase `bookings` table has `booking_type: 'confirmed' | 'quote'` (from `buildBookingRow`) — but this does not capture the manual creation path.

**How to avoid:**
Introduce a `booking_source` column (or use `payment_intent_id IS NULL` as a reliable proxy) to distinguish:
- `booking_source = 'online'` — created via Stripe webhook
- `booking_source = 'manual'` — created by operator via admin form

Initial status for manual bookings should be `'confirmed'` (operator explicitly confirms the booking exists) but the admin UI must show the source badge and disable the "Refund" action for manual bookings.

Never populate `payment_intent_id` for manual bookings — it must be NULL. Validate this server-side: the manual booking creation API route must not accept a `payment_intent_id` parameter.

Clear the Zustand booking wizard store state before showing the admin manual booking form — they share no state.

**Warning signs:**
- All bookings look identical in the table regardless of how they were created
- Operator accidentally tries to refund a phone order

**Phase to address:** Manual booking creation (BOOKINGS-06)

---

### Pitfall 8: Booking Status Workflow — Invalid Transitions Not Guarded

**What goes wrong:**
The operator can change status from any value to any value. A booking in `completed` status gets moved back to `pending`. A `cancelled` booking gets moved back to `confirmed` and then the client is charged again. Or a `cancelled` booking that was already refunded in Stripe gets moved to `completed` — triggering confusion if emails are sent on status change.

**Why it happens:**
The PATCH endpoint for status change only validates that the new status is a valid enum value — it doesn't enforce that the transition is legal.

**How to avoid:**
Enforce a state machine at the server side. Valid transitions:

```
pending    → confirmed | cancelled
confirmed  → completed | cancelled
completed  → (no transitions — terminal state)
cancelled  → (no transitions — terminal state)
```

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

if (!VALID_TRANSITIONS[currentStatus]?.includes(newStatus)) {
  return NextResponse.json({ error: `Invalid status transition: ${currentStatus} → ${newStatus}` }, { status: 422 })
}
```

**Warning signs:**
- Bookings with `status = 'completed'` appearing with a later `status = 'pending'` in audit logs
- Duplicate refund attempts on cancelled bookings that were reopened

**Phase to address:** Booking status workflow (BOOKINGS-07)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Validating promo code only client-side at Step 4 | Instant UX feedback without API call | Code can be exhausted or deactivated between Step 4 and Step 6; client shows valid, server rejects at payment | Never — always re-validate server-side at PaymentIntent creation |
| Storing holiday dates as an array in `pricing_globals` JSON column | No schema migration needed | Hard to query, no index, no validation per-row | Only for MVP with <20 holiday dates; prefer a dedicated `holiday_dates` table |
| Using `booking_type` field to infer booking source instead of a dedicated column | No migration | `booking_type = 'confirmed'` means both Stripe-confirmed and operator-manual | Never — add `booking_source` or use `payment_intent_id IS NULL` reliably |
| Allowing status changes via simple PUT with no transition guard | Simpler endpoint | Data integrity violations, refund confusion | Never for a production booking system |
| Skipping `charge.refunded` webhook handler (relying on the admin-initiated refund) | Less webhook complexity | If operator refunds directly in Stripe Dashboard, local `status` and `refunded_amount` are never updated | Never — webhooks must stay the authoritative source |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe Refunds API | Passing `payment_intent` when `payment_intent_id` is NULL (manual bookings) | Guard: `if (!booking.payment_intent_id) skip Stripe call` |
| Stripe Refunds API | Not catching `StripeInvalidRequestError` separately from network errors | Wrap in typed catch; `charge_already_refunded` → 409, network error → 503 |
| Stripe Webhooks | Not handling `refund.created` / `charge.refunded` events to sync local status | Add handler for `charge.refunded` to update `status = 'cancelled'` and store `refunded_amount` |
| Stripe Webhooks | Webhook handler doesn't deduplicate refund events (Stripe retries) | Check `payment_intent_id` in DB before updating — idempotent UPSERT pattern |
| Supabase promo_codes table | Read-then-write for `current_uses` increment | Single atomic `UPDATE ... WHERE current_uses < max_uses RETURNING id` |
| Supabase promo_codes table | Not expiring codes by `expires_at` server-side | Include `expires_at > NOW()` in the WHERE clause of every validation query |
| Stripe PaymentIntent metadata | Promo code not included in metadata → webhook has no record of discount | Add `promoCode`, `discountAmount` to PI metadata at creation time |
| Vercel Hobby (10s timeout) | Stripe refund API call + Supabase update in sequence can exceed 10s under load | Use `Promise.all` for independent operations; Stripe refund is typically <2s |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching all bookings to count promo code uses in application code | Slow promo validation as bookings grow | Use `current_uses` counter column with atomic increment — never count from bookings table | At ~500 bookings with high-traffic promo campaign |
| Zone check on every `/api/calculate-price` call with no zone caching | Supabase query on every price calculation | Cache active zones in memory for 60s with a simple module-level variable (acceptable for low-traffic admin zone changes) | At >50 concurrent price calculations |
| TanStack Table rendering 200+ bookings without pagination on mobile | 3–5s render freeze on low-end mobile | Server-side pagination already implemented (existing GET /api/admin/bookings); pass `limit=20` and use TanStack's manual pagination mode | First mobile admin visit with a large bookings dataset |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Promo code validated only client-side | Client modifies discount amount before submit; pays less than shown | Server MUST recompute total with promo applied — never trust client-provided amount |
| Refund endpoint accessible without admin auth check | Any authenticated user (if anon key leaks) issues refunds | Reuse the existing `getAdminUser()` guard (checks `is_admin` app_metadata) on every new admin API route |
| Manual booking creation endpoint accepts `payment_intent_id` from client | Operator (or attacker) links a manual booking to a real customer's PaymentIntent | The manual booking creation route must generate its own booking reference and never accept external PaymentIntent IDs |
| Promo code brute-force — no rate limiting on validation endpoint | Attacker enumerates valid codes | Apply the existing rate-limit middleware (`checkRateLimit`) to the promo code validation route |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing "Refund" button for manual bookings (no payment_intent_id) | Operator clicks, gets confusing error | Show "Cancel" (no refund) for `payment_intent_id IS NULL` bookings; show "Cancel + Refund" only for Stripe-paid bookings |
| Promo code applied at Step 4, but discounted total not shown on Step 6 payment card | Client pays and is surprised by the final amount | Persist applied promo in Zustand store; re-display discount line on Step 6 summary before payment |
| Admin mobile table with 8+ columns at 375px | Horizontal scroll is unusable with no visual affordance | Use responsive column collapse (TanStack `columnVisibility` with `useWindowSize`) — hide secondary columns below 640px; show only reference, client name, date, amount, status |
| Status change dropdown shows all statuses including current | Operator selects same status accidentally, triggers unnecessary DB write | Only show VALID_TRANSITIONS[currentStatus] in the status dropdown; grey out or hide invalid options |
| No confirmation dialog before issuing a Stripe refund | Operator mis-clicks; irreversible action taken | Require a modal confirmation: "Refund CZK 3,200 to {client name}? This cannot be undone." |

---

## "Looks Done But Isn't" Checklist

- [ ] **Promo code**: Code shown as valid to client — verify server-side re-validation happens at PaymentIntent creation, not just at code entry step
- [ ] **Stripe refund**: Refund button works in test mode — verify `payment_intent_id IS NULL` guard exists for manual bookings before going live
- [ ] **Zone logic (ZONES-06)**: Unit tests pass for "both outside" case — verify "only pickup inside" and "only dropoff inside" cases also produce prices (not quoteMode)
- [ ] **Holiday dates**: Coefficient applies on Dec 25 — verify midnight edge case: a booking at 00:30 CET on Dec 25 still gets the holiday coefficient (compare `pickupDate` string, not UTC datetime)
- [ ] **Status workflow**: PATCH endpoint accepts valid enum — verify invalid transitions (e.g., `completed → pending`) return 422, not 200
- [ ] **Webhook sync**: Admin-initiated refund updates Supabase status — verify `charge.refunded` webhook also updates status for refunds issued directly in Stripe Dashboard
- [ ] **Manual booking**: Created with `status = 'confirmed'` — verify `payment_intent_id` is NULL and "Cancel + Refund" button is not shown
- [ ] **Mobile admin**: Bookings table renders on 375px — verify TanStack Table does not cause horizontal overflow; check that column collapse or card layout is active below 640px

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Promo over-redeemed past max_uses | MEDIUM | Manually set `current_uses = max_uses` and `is_active = false` in Supabase; issue apology credits to extra redeemers if discount was significant |
| Wrong PaymentIntent refunded | HIGH | Contact Stripe support; re-issue correct refund manually in Dashboard; update Supabase status manually; notify affected clients |
| Zone logic regression (quoteMode applied to valid routes) | MEDIUM | Revert `calculate-price/route.ts` to previous logic; redeploy; affected clients saw "Request a Quote" instead of price — no financial damage |
| Holiday coefficient missed for midnight bookings | LOW | Manually apply a partial refund in Stripe Dashboard for the coefficient difference; add a Supabase UPDATE to fix affected booking records |
| Manual booking linked to wrong PaymentIntent | HIGH | NULL out `payment_intent_id` in Supabase; add a migration guard to prevent this in future |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Refunding already-refunded PI | BOOKINGS-08 (cancellation + refund) | Test: attempt double-refund → expect 409 response |
| Refunding manual booking (null PI) | BOOKINGS-06 + BOOKINGS-08 | Test: manual booking cancel → no Stripe call made |
| Promo race condition (over-redemption) | PROMO-04 (server validation) | Concurrent test: 2 requests with max_uses=1 code → only 1 succeeds |
| Price mismatch (client discount vs server amount) | PROMO-03 + PROMO-04 | Test: promo not passed to create-payment-intent → server applies 0 discount |
| Zone logic regression (ZONES-06) | ZONES-06 | 4-case unit test suite before deploy |
| Holiday timezone midnight bug | PRICING-07 | Test: pickupTime=00:30, pickupDate=holiday → coefficient applied |
| Manual booking status confusion | BOOKINGS-06 | Check: `payment_intent_id = NULL` in all manually-created rows |
| Invalid status transitions | BOOKINGS-07 | Test: PATCH completed→pending → 422; PATCH confirmed→cancelled → 200 |
| Webhook not handling refund events | BOOKINGS-08 | Test: Stripe CLI send `charge.refunded` → booking status updates |
| Mobile admin horizontal overflow | UX-01 | Manual test: Chrome DevTools 375px → no horizontal scroll |

---

## Sources

- Stripe Refunds API documentation: https://docs.stripe.com/api/refunds/create — confirmed `payment_intent` parameter is valid; error raised on fully-refunded PI
- Stripe Refund and cancel payments: https://docs.stripe.com/refunds — webhook events `refund.created`, `charge.refunded` confirmed
- HackerOne report #1717650 — Stripe promotion code race condition on redemption limits (MEDIUM confidence — public disclosure, not official Stripe docs)
- PostgreSQL atomic UPDATE for race condition prevention: https://medium.com/harrys-engineering/atomic-increment-decrement-operations-in-sql-and-fun-with-locks-f7b124d37873 — verified pattern
- SELECT FOR UPDATE for race conditions: https://leapcell.io/blog/preventing-race-conditions-with-select-for-update-in-web-applications — HIGH confidence
- Vercel Hobby plan 10s function timeout: https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out — confirmed
- TanStack Table responsive column collapse: https://dev.to/juancruzroldan/responsive-collapse-of-columns-in-tanstack-table-2175 — MEDIUM confidence
- Prestigo existing code analysis: `calculate-price/route.ts` zone logic (lines 132–138), `lib/pricing.ts` `dateDiffDays` UTC-safe pattern, `lib/pricing-config.ts` Supabase NUMERIC→Number cast — HIGH confidence (first-party)

---
*Pitfalls research for: v1.3 Pricing & Booking Management additions to Prestigo chauffeur booking app*
*Researched: 2026-04-03*
