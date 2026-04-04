# Stack Research — Prestigo v1.4 Return Transfer Booking

**Domain:** Round-trip / return transfer booking — additions to an existing Next.js 16 / Supabase / Stripe app
**Researched:** 2026-04-04
**Confidence:** HIGH (Stripe metadata limits verified from official Stripe docs; Supabase FK patterns confirmed from official docs and PostgreSQL documentation; ICS generation verified against existing working implementation)

> This document covers ONLY the delta from v1.3. Every package in the current `package.json`
> is assumed validated and in production. This research answers: do the four v1.4 feature areas
> require new libraries, version upgrades, or new usage patterns?
>
> **Existing stack (do not re-research):** Next.js 16.1.7, React 19.2.3, TypeScript, Tailwind CSS 4,
> Supabase (`@supabase/supabase-js` ^2.101.0, `@supabase/ssr` ^0.10.0), `stripe` ^21.0.1,
> `@stripe/react-stripe-js` ^6.0.0, `@stripe/stripe-js` ^9.0.0, Resend ^6.9.4, Google Maps Platform,
> `@tanstack/react-table` ^8.21.3, `recharts` ^3.8.1, `terra-draw` ^1.27.0,
> `react-hook-form` ^7.72.0 + `@hookform/resolvers` ^5.2.2 + `zod` ^4.3.6,
> `zustand` ^5.0.12, `react-day-picker` ^9.14.0, Vitest ^4.1.1.

---

## Decision: No New npm Packages Required

All four v1.4 feature areas — linked Supabase records, combined Stripe charge, two-event ICS,
return discount admin — are implementable with the current `package.json`. The analysis below
explains the reasoning and the correct usage patterns for each area.

---

## Feature Area Analysis

### 1. Two Linked Supabase Booking Records via FK

**Verdict:** Pure SQL migration — no new library. The existing `@supabase/supabase-js` ^2.101.0
handles the insert pattern. A nullable self-referential FK column `return_for_booking_id` added to
the `bookings` table is the correct Postgres pattern.

**Schema migration (new column on existing `bookings` table):**

```sql
-- 023_return_booking_fk.sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_for_booking_id UUID
    REFERENCES bookings(id) ON DELETE SET NULL;

-- Index for fast admin lookup of the paired booking
CREATE INDEX IF NOT EXISTS idx_bookings_return_for_booking_id
  ON bookings(return_for_booking_id)
  WHERE return_for_booking_id IS NOT NULL;
```

**Semantics:**
- The outbound booking row has `return_for_booking_id = NULL`.
- The return booking row has `return_for_booking_id = <outbound booking UUID>`.
- `ON DELETE SET NULL` is deliberate: if the outbound booking is deleted, the return leg
  is not cascade-deleted (both must be independently cancellable by the operator).

**Atomic insert pattern in the Stripe webhook handler:**

The webhook receives a single `payment_intent.succeeded` for the combined charge. It must
insert two rows — outbound first, then return referencing the outbound `id`. Because Supabase
does not expose transactions via the JS client, use a Postgres stored procedure (RPC) that
wraps both inserts in a `BEGIN`/`COMMIT` block. This ensures both rows are created or neither
is, with no orphan state if the second insert fails.

```sql
-- Stored procedure — add alongside 023_return_booking_fk.sql migration
CREATE OR REPLACE FUNCTION create_round_trip_bookings(
  p_outbound JSONB,
  p_return   JSONB
)
RETURNS TABLE (outbound_id UUID, return_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_outbound_id UUID;
  v_return_id   UUID;
BEGIN
  -- Insert outbound leg
  INSERT INTO bookings (
    booking_reference, payment_intent_id, booking_type, trip_type,
    origin_address, destination_address, pickup_date, pickup_time,
    vehicle_class, passengers, luggage, distance_km,
    amount_czk, amount_eur,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, terminal, special_requests, status, booking_source
  )
  SELECT
    (p_outbound->>'booking_reference'), (p_outbound->>'payment_intent_id'),
    'confirmed', (p_outbound->>'trip_type'),
    (p_outbound->>'origin_address'), (p_outbound->>'destination_address'),
    (p_outbound->>'pickup_date'), (p_outbound->>'pickup_time'),
    (p_outbound->>'vehicle_class'),
    (p_outbound->>'passengers')::int, (p_outbound->>'luggage')::int,
    (p_outbound->>'distance_km')::float8,
    (p_outbound->>'amount_czk')::int, (p_outbound->>'amount_eur')::float8,
    (p_outbound->>'extra_child_seat')::boolean,
    (p_outbound->>'extra_meet_greet')::boolean,
    (p_outbound->>'extra_luggage')::boolean,
    (p_outbound->>'first_name'), (p_outbound->>'last_name'),
    (p_outbound->>'email'), (p_outbound->>'phone'),
    NULLIF(p_outbound->>'flight_number', ''),
    NULLIF(p_outbound->>'terminal', ''),
    NULLIF(p_outbound->>'special_requests', ''),
    'confirmed', 'online'
  RETURNING id INTO v_outbound_id;

  -- Insert return leg with FK reference
  INSERT INTO bookings (
    booking_reference, payment_intent_id, booking_type, trip_type,
    origin_address, destination_address, pickup_date, pickup_time,
    vehicle_class, passengers, luggage, distance_km,
    amount_czk, amount_eur,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    special_requests, status, booking_source, return_for_booking_id
  )
  SELECT
    (p_return->>'booking_reference'), (p_return->>'payment_intent_id'),
    'confirmed', 'transfer',
    (p_return->>'origin_address'), (p_return->>'destination_address'),
    (p_return->>'pickup_date'), (p_return->>'pickup_time'),
    (p_return->>'vehicle_class'),
    (p_return->>'passengers')::int, (p_return->>'luggage')::int,
    (p_return->>'distance_km')::float8,
    (p_return->>'amount_czk')::int, (p_return->>'amount_eur')::float8,
    (p_return->>'extra_child_seat')::boolean,
    (p_return->>'extra_meet_greet')::boolean,
    (p_return->>'extra_luggage')::boolean,
    (p_return->>'first_name'), (p_return->>'last_name'),
    (p_return->>'email'), (p_return->>'phone'),
    NULLIF(p_return->>'special_requests', ''),
    'confirmed', 'online', v_outbound_id
  RETURNING id INTO v_return_id;

  RETURN QUERY SELECT v_outbound_id, v_return_id;
END;
$$;
```

**Call from the webhook handler (TypeScript):**

```typescript
const { data, error } = await supabase.rpc('create_round_trip_bookings', {
  p_outbound: outboundJson,
  p_return: returnJson,
})
```

**Why RPC over two sequential inserts:**
- Sequential `supabase.from('bookings').insert()` calls are not atomic — if the process crashes
  between the two calls, the outbound booking exists without a linked return, leading to an
  orphaned row the operator cannot match. The RPC wraps both in a single DB transaction.
- The existing `claim_promo_code` RPC (Phase 22) validates this pattern works reliably in production.

**Self-referential FK and Supabase query client:** The Supabase JS `.select()` with nested
relationships using a self-referential FK is known to require explicit column hints in the
relationship name (e.g., `return_leg:return_for_booking_id(...)`) to disambiguate. Keep admin
queries explicit and flat — do not use nested select syntax on the FK; instead join with a
second query when loading the paired booking in the admin dashboard. This avoids the documented
PostgREST ambiguity with self-referential FKs (see Sources).

---

### 2. Combined Stripe Charge for Two Legs (Single PaymentIntent)

**Verdict:** No new library or SDK upgrade. The existing `stripe` ^21.0.1 covers this completely.
The implementation is purely additive: the `amount` passed to `stripe.paymentIntents.create()` is
the sum of outbound + discounted return leg prices, and additional return-leg keys are added to
`metadata`.

**Stripe metadata key count — confirmed within limits:**

Stripe enforces a hard limit of 50 keys per metadata object (40 chars per key name, 500 chars per
value). The current `create-payment-intent` route uses 26 keys. Adding return-leg metadata requires
9 additional keys, for a total of **35 keys** — comfortably within the 50-key limit.

| Current keys (26) | New return-leg keys (9) | Total |
|--------------------|------------------------|-------|
| bookingReference, tripType, originAddress, destinationAddress, pickupDate, pickupTime, returnDate, vehicleClass, passengers, luggage, hours, distanceKm, extraChildSeat, extraMeetGreet, extraLuggage, firstName, lastName, email, phone, flightNumber, terminal, specialRequests, amountEur, amountCzk, promoCode, discountPct | returnPickupDate, returnPickupTime, returnOriginAddress, returnDestinationAddress, returnDistanceKm, returnAmountEur, returnAmountCzk, returnDiscountPct, isRoundTrip | **35** |

**New `create-payment-intent` additions (for round_trip tripType only):**

```typescript
// Amount: sum of both legs
const combinedAmountEur = outboundTotalEur + returnTotalEur
const stripeAmount = paymentCurrency === 'eur'
  ? Math.round(combinedAmountEur * 100)
  : Math.round(eurToCzk(combinedAmountEur) * 100)

// Metadata additions
metadata: {
  // ... existing 26 keys unchanged ...
  isRoundTrip: 'true',
  returnPickupDate: bookingData.returnPickupDate ?? '',
  returnPickupTime: bookingData.returnPickupTime ?? '',
  returnOriginAddress: bookingData.returnOriginAddress ?? '',
  returnDestinationAddress: bookingData.returnDestinationAddress ?? '',
  returnDistanceKm: bookingData.returnDistanceKm ?? '',
  returnAmountEur: String(returnTotalEur),
  returnAmountCzk: String(eurToCzk(returnTotalEur)),
  returnDiscountPct: String(returnDiscountPct),
}
```

**Return leg pricing:** The same `calculatePrice()` function in `lib/pricing.ts` is used for the
return leg, called with `(origin, destination)` swapped and the return discount applied as a
multiplier (`1 - returnDiscountPct / 100`). The `return_discount_pct` is read from `pricing_globals`
— a new column added by the schema migration (see Feature Area 4).

**Webhook handler changes:** The `payment_intent.succeeded` handler reads `meta.isRoundTrip`. When
`'true'`, it extracts the return-leg fields from metadata and calls
`supabase.rpc('create_round_trip_bookings', ...)`. When `'false'` or absent, it falls back to the
existing `saveBooking()` single-insert path unchanged. This preserves backward compatibility with
all existing one-way bookings.

**Double-charge protection:** No change needed. The existing `UNIQUE` constraint on
`payment_intent_id` in the `bookings` table plus `ignoreDuplicates: true` in `upsert` already
prevent replay saves. For round-trip, the webhook RPC is idempotent by design: if the outbound
`INSERT` fails with a unique violation, the transaction rolls back and neither row is saved.

---

### 3. ICS with Two Calendar Events

**Verdict:** No new library. The existing hand-written ICS generator in
`app/book/confirmation/page.tsx` is extended to produce a multi-event VCALENDAR file. ICS
format allows multiple `VEVENT` blocks in a single `VCALENDAR` — this is standard RFC 5545 and
requires no npm package.

**Current ICS generator produces a single VEVENT.** For round-trip, the generator receives both
legs and outputs two VEVENTs in one file:

```typescript
function generateRoundTripICSContent(outbound: ICSLeg, returnLeg: ICSLeg): string {
  const format = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const dtstamp = format(new Date())

  const makeEvent = (leg: ICSLeg, suffix: string) => {
    const dt = new Date(`${leg.pickupDate}T${leg.pickupTime}:00`)
    const dtEnd = new Date(dt.getTime() + 60 * 60 * 1000)
    return [
      'BEGIN:VEVENT',
      `UID:${leg.bookingReference}-${suffix}@prestigo.cz`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${format(dt)}`,
      `DTEND:${format(dtEnd)}`,
      `SUMMARY:PRESTIGO Transfer (${suffix}) — ${leg.bookingReference}`,
      `DESCRIPTION:Pickup: ${leg.origin}\\nDropoff: ${leg.destination}\\nRef: ${leg.bookingReference}`,
      `LOCATION:${leg.origin}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n')
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PRESTIGO//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    makeEvent(outbound, 'outbound'),
    makeEvent(returnLeg, 'return'),
    'END:VCALENDAR',
  ].join('\r\n')
}
```

**UID uniqueness:** Each VEVENT has a distinct UID by appending `-outbound` and `-return` to the
booking reference. RFC 5545 requires UIDs to be globally unique per event. This satisfies that
requirement.

**Confirmation page data source:** The return-leg date and time must be passed to the confirmation
page. Currently, the store is reset (`resetBooking()`) on mount and the page reads from a `useRef`
snapshot. The return-leg fields (`returnPickupDate`, `returnPickupTime`) must be snapshotted before
reset and passed to `generateRoundTripICSContent`. These fields are already being added to the
Zustand store (see Feature Area below) as part of the wizard Step 2 changes.

**Email calendar links:** The existing `buildGoogleCalendarUrl()` in `lib/email.ts` generates a
single Google Calendar link for the outbound leg. For round-trip confirmation emails, generate two
separate Google Calendar links (one per leg) and include both in the email HTML. No library change.

**Why no ICS library (e.g. `ical-generator`):**
`ical-generator` is 68 KB gzipped and adds a dependency for functionality that is 30 lines of
string concatenation. The existing generator is already in production and working. Extending it for
two events is trivial. `ical-generator` would add value only if complex recurrence rules, timezone
VTIMEZONE components, or VALARM blocks were required — none of which apply here.

---

### 4. Return Discount % in Admin (Supabase Schema + Admin UI)

**Verdict:** One column addition to `pricing_globals` — no new library. The existing admin pricing
editor (react-hook-form + Zod + Tailwind) gets one new number input.

**Schema migration:**

```sql
-- 023_return_booking_fk.sql (same migration file as the FK column)
ALTER TABLE pricing_globals
  ADD COLUMN IF NOT EXISTS return_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (return_discount_pct >= 0 AND return_discount_pct <= 100);
```

**`getPricingConfig()` update:** Add `return_discount_pct` to the Supabase `SELECT` query and
expose it on the returned `PricingGlobals` type:

```typescript
export type PricingGlobals = {
  // ... existing fields ...
  returnDiscountPct: number   // NEW — percentage applied to return leg price
}
```

**Admin UI:** One new `<input type="number">` field (min 0, max 100, step 0.5) in the existing
pricing globals section of the admin pricing editor. Same `react-hook-form` + `zod` pattern as all
other pricing fields. No new component library needed.

**Pricing engine:** In `create-payment-intent`, the return leg price is calculated as:

```typescript
const returnDiscount = rates.globals.returnDiscountPct
const returnTotalEur = Math.round(returnBasePrice * (1 - returnDiscount / 100))
```

The return leg also inherits night/holiday coefficients based on the return pickup time and date,
applied before the return discount. Coefficient application order: base × night_or_holiday_coefficient
→ + airport_fee (if applicable) → + extras → × (1 - returnDiscountPct / 100).

---

### 5. Zustand Store — Return Leg Fields

**Verdict:** Additive state only — no library change. The existing Zustand store in
`lib/booking-store.ts` needs new fields for the return leg date, time, and computed price.

**New fields to add to the store:**

```typescript
// New state fields
returnPickupDate: string | null       // 'YYYY-MM-DD' of return leg
returnPickupTime: string | null       // 'HH:MM' of return leg
returnPriceBreakdown: PriceBreakdown | null   // NOT persisted (same rationale as outbound)
returnAmountEur: number | null        // for display in wizard

// New setters
setReturnPickupDate: (date: string | null) => void
setReturnPickupTime: (time: string | null) => void
setReturnPriceBreakdown: (p: PriceBreakdown | null) => void
setReturnAmountEur: (amount: number | null) => void
```

**sessionStorage persistence:** `returnPickupDate` and `returnPickupTime` are persisted (they are
user selections that should survive a page refresh, same as `pickupDate`/`pickupTime`).
`returnPriceBreakdown` and `returnAmountEur` are NOT persisted — they are always re-computed from
the server when Step 3 mounts, following the established pattern that prevents stale prices.

---

## Summary: What to Install

```bash
# Nothing to install for v1.4.
# All feature areas are implemented with the current package.json.
```

---

## Schema Migrations Required

| Migration file | What it adds |
|----------------|-------------|
| `supabase/migrations/023_return_booking_fk.sql` | `bookings.return_for_booking_id UUID FK`, `pricing_globals.return_discount_pct`, index on FK, `create_round_trip_bookings()` RPC |

---

## Version Compatibility Notes

| Package | Current in package.json | v1.4 Impact | Action |
|---------|------------------------|-------------|--------|
| `stripe` | ^21.0.1 | Combined amount in `paymentIntents.create()`, additional metadata keys | No change — 35 keys is within 50-key limit |
| `@supabase/supabase-js` | ^2.101.0 | `.rpc('create_round_trip_bookings', ...)` for atomic two-row insert | No change |
| `zustand` | ^5.0.12 | New return-leg state fields | No change — additive only |
| `zod` | ^4.3.6 | Validation of `returnPickupDate`, `returnPickupTime` in API routes | No change |
| `react-day-picker` | ^9.14.0 | Second date/time picker in Step 2 for return leg | No change — existing picker component reused |
| `resend` | ^6.9.4 | Email with two Google Calendar links | No change — string template addition only |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ical-generator` or `ics` npm packages | Hand-written ICS is 30 lines, already in production, and RFC 5545 multi-VEVENT requires only adding a second `BEGIN:VEVENT...END:VEVENT` block | Extend existing `generateICSContent()` function |
| Two separate Stripe PaymentIntents | Would require two separate payment flows, two separate Stripe webhooks, complex state management to link them client-side, and Stripe does not natively link PaymentIntents | Single PaymentIntent with combined amount; two Supabase rows linked by FK |
| `pg` or `postgres` npm packages for raw SQL transactions | Supabase RPC (stored procedures) provides transaction safety without adding a direct DB connection library, which would not work in Vercel serverless anyway | `supabase.rpc('create_round_trip_bookings', ...)` |
| Nested PostgREST joins on self-referential FK | The PostgREST documentation and community reports confirm ambiguity when joining a table to itself via FK — two separate queries are safer and more readable | Two flat `supabase.from('bookings').select().eq()` calls in the admin dashboard |
| `date-fns` as a direct dependency | Still not in `package.json` directly; native `toISOString().slice(0, 10)` is sufficient for all date comparisons | Native `Date` methods |

---

## Sources

- [Stripe — Metadata](https://docs.stripe.com/metadata) — 50-key / 500-char / 40-char-key limits confirmed; HIGH confidence
- [Stripe — Create a PaymentIntent](https://docs.stripe.com/api/payment_intents/create) — `amount`, `currency`, `metadata` parameters; HIGH confidence
- [Supabase — Tables and Data](https://supabase.com/docs/guides/database/tables) — FK relationships, self-referential FK setup; HIGH confidence
- [Supabase — Cascade Deletes](https://supabase.com/docs/guides/database/postgres/cascade-deletes) — `ON DELETE SET NULL` behavior confirmed; HIGH confidence
- [PostgREST — Self-referential FK ambiguity](https://github.com/supabase/supabase/issues/6329) — known issue with nested `.select()` on self-referencing FK; MEDIUM confidence (GitHub issue, confirmed behavior pattern)
- [RFC 5545 — iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545#section-3.6.1) — multiple VEVENT blocks in a single VCALENDAR confirmed valid; HIGH confidence
- Existing codebase — `app/book/confirmation/page.tsx` ICS generator, `app/api/create-payment-intent/route.ts` metadata pattern, `app/api/webhooks/stripe/route.ts` webhook handler, `lib/booking-store.ts` Zustand store — inspected 2026-04-04; HIGH confidence

---

*Stack research for: Prestigo v1.4 Return Transfer Booking*
*Researched: 2026-04-04*
