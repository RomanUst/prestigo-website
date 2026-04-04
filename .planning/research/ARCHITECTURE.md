# Architecture Research

**Domain:** Round-trip booking integration — Next.js 14 App Router chauffeur service
**Researched:** 2026-04-04
**Confidence:** HIGH (based on direct codebase inspection, all findings verified against source)

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                               │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Booking Wizard  (6 steps, /book)                                 │  │
│  │  Step1 → Step2 → Step3 → Step4 → Step5 → Step6                  │  │
│  │  [TripType] [DateTime] [Vehicle] [Extras] [Pax] [Payment]        │  │
│  └────────────────────────┬─────────────────────────────────────────┘  │
│                           │ Zustand store (sessionStorage)              │
│                           │ useBookingStore                             │
└───────────────────────────┼────────────────────────────────────────────┘
                            │ HTTP (Route Handlers)
┌───────────────────────────▼────────────────────────────────────────────┐
│                       SERVER (Vercel Serverless)                        │
│                                                                         │
│  /api/calculate-price   /api/create-payment-intent   /api/webhooks/    │
│  ├─ Google Routes API   ├─ Re-compute price           stripe            │
│  ├─ Zone check          ├─ Claim promo (RPC)          ├─ buildBookingRow│
│  └─ PricingConfig DB    ├─ Create PaymentIntent        ├─ saveBooking   │
│                         └─ Embed metadata              └─ sendEmail     │
│                                                                         │
│  lib/pricing.ts  lib/pricing-config.ts  lib/supabase.ts  lib/email.ts  │
└───────────────────────────┬────────────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                                  │
│  Supabase (Postgres)   Stripe   Google Routes API   Resend              │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (current, pre-v1.4)

| Component | Responsibility | Location |
|-----------|---------------|----------|
| `BookingWizard` | Renders active step, handles step navigation | `components/booking/BookingWizard.tsx` |
| `useBookingStore` | Zustand store — all wizard state, persisted to sessionStorage | `lib/booking-store.ts` |
| `BookingStore` type | TypeScript interface for the full store shape | `types/booking.ts` |
| `Step1TripType` | Trip type selector + origin/destination inputs | `components/booking/steps/Step1TripType.tsx` |
| `Step2DateTime` | Pickup date/time; return date for daily hire | `components/booking/steps/Step2DateTime.tsx` |
| `Step3Vehicle` | Fetches prices, renders vehicle cards | `components/booking/steps/Step3Vehicle.tsx` |
| `Step6Payment` | Creates PaymentIntent, renders Stripe Elements | `components/booking/steps/Step6Payment.tsx` |
| `/api/calculate-price` | Server-side pricing: Google Routes + zone check + globals | `app/api/calculate-price/route.ts` |
| `/api/create-payment-intent` | Re-computes price, claims promo, creates Stripe PI with metadata | `app/api/create-payment-intent/route.ts` |
| `/api/webhooks/stripe` | Receives `payment_intent.succeeded`, writes Supabase row, sends email | `app/api/webhooks/stripe/route.ts` |
| `buildBookingRow` | Maps Stripe metadata → Supabase column shape | `lib/supabase.ts` |
| `saveBooking` | Upserts one booking row with `onConflict: 'payment_intent_id'` | `lib/supabase.ts` |
| `sendClientConfirmation` | Resend email with booking details + calendar link | `lib/email.ts` |

---

## Recommended Project Structure Changes for v1.4

```
types/
└── booking.ts                 # MODIFY — add 'round_trip' to TripType union;
                               # add returnTime, returnDistanceKm, returnPriceBreakdown,
                               # returnBookingReference to BookingStore

lib/
├── booking-store.ts           # MODIFY — add 6 new fields + 4 setters; extend resetBooking
├── supabase.ts                # MODIFY — buildBookingRow gains leg + linkedRef params;
│                              #   add buildReturnMeta helper; add saveBothLegs via RPC
├── email.ts                   # MODIFY — BookingEmailData gains returnLeg?: ReturnLegData;
│                              #   sendClientConfirmation renders two ICS events when present
└── pricing-config.ts          # MODIFY — PricingGlobals gains returnDiscountPct: number

app/api/
├── calculate-price/route.ts   # MODIFY — accept returnDate/returnTime;
│                              #   return returnPrices alongside outbound prices
├── create-payment-intent/route.ts  # MODIFY — compute combined amount (outbound + discounted
│                              #   return); embed all return metadata in single PaymentIntent;
│                              #   generate second bookingReference for return leg
└── webhooks/stripe/route.ts   # MODIFY — detect isRoundTrip from metadata;
                               #   atomically create two booking rows via RPC

components/booking/steps/
├── Step1TripType.tsx          # MODIFY — add 'Round Trip' as 6th trip type option
├── Step2DateTime.tsx          # MODIFY — show return time picker when tripType='round_trip'
│                              #   (return date already collected; repurpose existing returnDate field)
├── Step3Vehicle.tsx           # MODIFY — display combined price card showing outbound + return
└── Step6Payment.tsx           # MODIFY — pass combined amount to PI creation;
                               #   show both booking references on success

app/admin/(dashboard)/pricing/
└── page.tsx                   # MODIFY — add return discount % field to pricing globals editor

supabase/migrations/
└── YYYYMMDD_round_trip.sql    # NEW — leg column, linked_booking_id, composite UNIQUE,
                               #   create_round_trip_booking RPC
```

---

## Architectural Patterns

### Pattern 1: Stripe Metadata as Portable Booking Record

**What:** All booking data is embedded in the Stripe PaymentIntent metadata at creation time. The webhook handler reads only from this metadata — never trusts client-passed data again at webhook time.

**When to use:** Whenever the webhook must reconstruct booking state without a separate DB read.

**Trade-offs:** Stripe has a hard 50-key / 500-char-per-value limit. Adding return leg data for round-trips will push against this limit. Each key added must be budgeted carefully.

**Round-trip extension — budgeted metadata keys:**
```typescript
// create-payment-intent metadata additions for round_trip
// Existing keys: ~26. New keys needed:
metadata: {
  // ... existing 26 keys ...
  isRoundTrip: 'true',                                  // +1 (key 27)
  returnTime: bookingData.returnTime ?? '',              // +1 (key 28)
  returnDistanceKm: bookingData.returnDistanceKm ?? '',  // +1 (key 29)
  returnAmountEur: String(returnAmountEur),              // +1 (key 30)
  returnBookingReference: returnBookingRef,              // +1 (key 31)
  outboundAmountEur: String(outboundAmountEur),          // +1 (key 32)
  // returnDate already exists in metadata (was unused for non-daily)
  // returnOriginAddress = destinationAddress (already in metadata)
  // returnDestinationAddress = originAddress (already in metadata)
}
// Total keys: ~32. Comfortably under the 50-key limit.
```

### Pattern 2: Webhook as Sole Writer (Source of Truth)

**What:** The webhook at `/api/webhooks/stripe` is the ONLY code path that creates booking rows. The PaymentIntent creation route only creates the PI and returns the client secret — it never writes to Supabase.

**When to use:** Prevents double-saves if the client retries; Stripe deduplication ensures the webhook fires once per successful payment.

**Round-trip implication:** Both booking rows must be created in the single `payment_intent.succeeded` handler. The webhook must be the atomic writer for both rows. No second webhook event will fire for the return leg.

### Pattern 3: Server-Side Price Recomputation at Payment Time

**What:** `/api/create-payment-intent` re-runs the pricing engine independently — it does not trust the price shown in the browser. The server is the authority.

**When to use:** Always, for any price that becomes a charge. Prevents client-side tampering.

**Round-trip extension:** The PI creation route must compute both outbound and return prices server-side, apply the return discount (fetched from `pricing_globals`), and charge the combined total. The discount percentage comes from `rates.globals.returnDiscountPct` (new field).

### Pattern 4: Zustand `partialize` — What to Persist vs. What to Recompute

**What:** The `partialize` function in `booking-store.ts` explicitly lists only the fields that survive page refresh in sessionStorage. Price breakdowns are intentionally excluded so Step 3 always fetches fresh data from the server.

**Round-trip extension:** New return-leg fields follow the same rules:
- Persist: `returnTime` (user's selection, survives refresh)
- Do NOT persist: `returnPriceBreakdown`, `returnDistanceKm` (recomputed on Step 3 mount)

---

## Integration Points — New vs. Modified

### Question 1: Zustand Store Extension

The `BookingStore` type in `types/booking.ts` must be extended. The key constraint is **backward compatibility** — `tripType: TripType` currently covers `'transfer' | 'hourly' | 'daily'`. Adding `'round_trip'` widens the union without breaking existing narrowing in switch/if blocks (new branch added, no existing branches changed).

**Fields to add to `BookingStore` interface:**
```typescript
// Step 2 — round_trip only
returnTime: string | null           // 'HH:MM' format, mirrors pickupTime

// Step 3 — not persisted, recomputed on mount
returnDistanceKm: number | null
returnPriceBreakdown: Record<VehicleClass, PriceBreakdown> | null

// Set by create-payment-intent response (second booking reference)
returnBookingReference: string | null
```

**Actions to add:**
```typescript
setReturnTime: (time: string | null) => void
setReturnDistanceKm: (km: number | null) => void
setReturnPriceBreakdown: (p: Record<VehicleClass, PriceBreakdown> | null) => void
setReturnBookingReference: (ref: string | null) => void
```

**`resetBooking` must include all new fields** with their null/false defaults to avoid stale return state if the user starts a new booking after a round-trip session.

**`partialize` additions** — persist only user-entered selections:
```typescript
returnTime: state.returnTime,
// returnDistanceKm and returnPriceBreakdown intentionally excluded (matches priceBreakdown decision)
```

**`setTripType` side-effect:** When `tripType` changes away from `'round_trip'`, clear `returnTime`, `returnDistanceKm`, `returnPriceBreakdown` alongside existing price/distance clears. Prevents stale return data if user backtracks to Step 1.

---

### Question 2: `payment_intent_id` UNIQUE Constraint

**Current state:** `saveBooking` calls `upsert([row], { onConflict: 'payment_intent_id', ignoreDuplicates: true })`. This works because one PaymentIntent → one booking row. The UNIQUE constraint on `payment_intent_id` provides idempotency against webhook replays.

**Problem:** A round-trip needs two rows that both reference the same `payment_intent_id`. The current single-column UNIQUE constraint blocks the second insert with a duplicate key violation.

**Three options analyzed:**

| Option | Description | Verdict |
|--------|-------------|---------|
| **Suffix approach** | Store `pi_xxx_outbound` and `pi_xxx_return` in `payment_intent_id` column | Rejected |
| **Composite unique** | Replace UNIQUE on `payment_intent_id` with UNIQUE on `(payment_intent_id, leg)`; add `leg TEXT` column | Recommended |
| **Relax constraint** | Remove UNIQUE from `payment_intent_id` entirely | Rejected |

**Recommended: Composite unique with `leg` column.**

Rationale:

1. **Suffix approach** creates synthetic Stripe IDs in a column named `payment_intent_id`. The `charge.refunded` handler queries `.eq('payment_intent_id', charge.payment_intent)` using the real Stripe ID (e.g. `pi_3xyz`). Suffixed values (`pi_3xyz_return`) would not match — the refund handler would cancel only the outbound row, leaving the return row in `confirmed` state after a refund. Every present and future payment_intent lookup must be aware of the suffix convention. The column's semantic meaning is destroyed.

2. **Relaxing the constraint** removes the idempotency guard. Stripe can deliver `payment_intent.succeeded` more than once (retry on 5xx, network blip, Vercel function timeout). Without the UNIQUE constraint, a webhook replay creates duplicate booking rows. The original UNIQUE was added deliberately for this reason (v1.0 decision).

3. **Composite unique** `(payment_intent_id, leg)` preserves the idempotency guarantee — the same PI + same leg cannot be inserted twice. Real Stripe PI IDs remain in the column. The data model is self-documenting. The `charge.refunded` handler query `.eq('payment_intent_id', piId)` without a `leg` filter correctly cancels both rows on refund, which is the desired behavior.

**Migration:**
```sql
-- 1. Add leg column — default 'outbound' so all existing rows are non-breaking
ALTER TABLE bookings
  ADD COLUMN leg TEXT NOT NULL DEFAULT 'outbound';

-- 2. Drop old single-column UNIQUE
ALTER TABLE bookings
  DROP CONSTRAINT bookings_payment_intent_id_key;

-- 3. Add composite UNIQUE
ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_intent_id_leg_key
  UNIQUE (payment_intent_id, leg);

-- 4. Add linked_booking_id for admin cross-reference
ALTER TABLE bookings
  ADD COLUMN linked_booking_id UUID REFERENCES bookings(id);
```

**`charge.refunded` handler:** No change needed. `.eq('payment_intent_id', charge.payment_intent)` without a leg filter matches both rows — cancels the entire round-trip on refund. Correct behavior.

---

### Question 3: Atomic Creation of Two Linked Booking Records

**Current state:** The webhook calls `withRetry(() => saveBooking(bookingRow), 3, 1000)` — a single upsert.

**Requirement:** Two rows must either both succeed or both fail. A partial write (outbound saved, return not) leaves the operator dashboard with an orphaned outbound booking and no return row.

**Recommended approach: Supabase RPC (PostgreSQL function) for atomic two-row insert.**

A PostgreSQL function executes inside an implicit transaction. If either insert fails, Postgres rolls back both. This is the correct tool in a serverless environment where client-side multi-statement transactions would require a persistent connection that Vercel serverless functions cannot maintain.

**PostgreSQL RPC:**
```sql
CREATE OR REPLACE FUNCTION create_round_trip_booking(
  outbound_row JSONB,
  return_row   JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  outbound_id UUID;
  return_id   UUID;
BEGIN
  -- Insert outbound leg
  INSERT INTO bookings
  SELECT * FROM jsonb_populate_record(null::bookings, outbound_row)
  RETURNING id INTO outbound_id;

  -- Attach linked_booking_id before inserting return
  return_row := return_row || jsonb_build_object('linked_booking_id', outbound_id);

  -- Insert return leg
  INSERT INTO bookings
  SELECT * FROM jsonb_populate_record(null::bookings, return_row)
  RETURNING id INTO return_id;

  -- Back-link outbound to return
  UPDATE bookings SET linked_booking_id = return_id WHERE id = outbound_id;

  RETURN jsonb_build_object('outbound_id', outbound_id, 'return_id', return_id);
END;
$$;
```

**Webhook handler change:**
```typescript
if (meta.isRoundTrip === 'true') {
  const outboundRow = buildBookingRow(meta, paymentIntent.id, 'confirmed', 'outbound')
  const returnMeta = buildReturnMeta(meta)
  const returnRow = buildBookingRow(returnMeta, paymentIntent.id, 'confirmed', 'return')
  await withRetry(
    () => supabase.rpc('create_round_trip_booking', { outbound_row: outboundRow, return_row: returnRow }),
    3, 1000
  )
} else {
  // existing single-row path unchanged
  await withRetry(() => saveBooking(buildBookingRow(meta, paymentIntent.id, 'confirmed')), 3, 1000)
}
```

**`buildReturnMeta` helper** — pure function in `lib/supabase.ts`:
- Swaps `originAddress`/`destinationAddress`
- Swaps `originLat`/`originLng` with `destinationLat`/`destinationLng`
- Sets `pickupDate = meta.returnDate`, `pickupTime = meta.returnTime`
- Sets `amountEur = meta.returnAmountEur`
- Sets `bookingReference = meta.returnBookingReference`
- Clears `returnDate`, `returnTime` (not applicable on the return row)

**Emergency fallback:** Extend `sendEmergencyAlert` to include both booking references and the full return metadata when the RPC fails after 3 retries.

---

### Question 4: Suggested Build Order

| Phase | Name | Key Work | Why This Order |
|-------|------|----------|---------------|
| 1 | Schema | Add `leg` column (default `'outbound'`); add `linked_booking_id`; composite UNIQUE; `create_round_trip_booking` RPC | Foundation. All other phases depend on DB shape. Migration is backward-compatible — no existing row changes. |
| 2 | Store + Types | Add `'round_trip'` to `TripType`; add 4 fields + 4 setters to `BookingStore`; extend `booking-store.ts` and `resetBooking`; update `partialize` | Wizard steps and pricing both read from the store. Types must compile before any step component is modified. |
| 3 | Wizard UX (Step 1 + Step 2) | Add Round Trip tab in Step 1; add return time picker to Step 2 (the returnDate field already exists — repurpose for `'round_trip'`); conditional rendering based on `tripType === 'round_trip'` | No pricing changes yet. Can be built and visually tested without a working pricing endpoint. Step 2 already has `setReturnDate` wired; `setReturnTime` is the only new action needed here. |
| 4 | Pricing | Add `returnDiscountPct` to `pricing_globals` DB + `PricingGlobals` type + `getPricingConfig`; extend `/api/calculate-price` to return `returnPrices` when `tripType === 'round_trip'`; extend Step 3 to show combined price per vehicle | Pricing is the core calculation. Isolated in its own phase to allow focused testing before connecting real money. Step 3 is the consumer of the pricing API response. |
| 5 | Payment | Extend `/api/create-payment-intent` to compute combined amount and embed all return metadata; generate `returnBookingReference`; extend Step 6 to surface combined price and pass `isRoundTrip` flag | Depends on Phase 4 (verified pricing). The combined amount derives directly from the pricing engine. |
| 6 | Webhook + Notifications | Update webhook to detect `isRoundTrip === 'true'`, call `create_round_trip_booking` RPC, extend emergency fallback; extend `BookingEmailData` for return leg; two ICS events in confirmation email; update `/book/confirmation` to surface both references | Must be last in the payment chain — consumes the metadata written in Phase 5. The RPC from Phase 1 is the dependency. Email and confirmation page are the final output surface. |
| 7 | Admin | Add `returnDiscountPct` field to admin pricing editor (GET/PUT `/api/admin/pricing`); surface `leg` and `linked_booking_id` in bookings table (linked badge, expandable return row); add `leg` filter | Admin is a read/config layer. No upstream blocking dependencies once Phases 1 and 4 exist. Can be built in parallel with Phase 5 or 6 if bandwidth allows. |

---

## Data Flow

### Round-Trip Booking — Happy Path

```
User selects "Round Trip" in Step 1
    ↓
Step 2: picks outbound date + time + return date + return time
    store: pickupDate, pickupTime, returnDate, returnTime
    ↓
Step 3 mounts
    POST /api/calculate-price {
      origin, destination,
      tripType: 'round_trip',
      pickupDate, pickupTime,
      returnDate, returnTime
    }
    server: compute outbound distance (Google Routes API)
    server: apply outbound globals (night/holiday/airport/minFare)
    server: compute return prices (same distanceKm, reversed airport flag,
            return night/holiday detection from returnTime/returnDate)
    server: apply returnDiscountPct from pricing_globals
    response: { outboundPrices, returnPrices, returnDiscountPct, distanceKm }
    store: priceBreakdown, returnPriceBreakdown, distanceKm, returnDistanceKm
    ↓
Step 4-5: extras + passenger details (unchanged flow)
    ↓
Step 6 mounts
    POST /api/create-payment-intent {
      ...bookingData,
      isRoundTrip: 'true',
      returnTime,
      returnDistanceKm
    }
    server: re-compute outbound price (no trust in client amount)
    server: re-compute return price + apply discount
    server: combined = outbound + returnDiscounted
    server: generate outboundRef + returnRef
    server: create PaymentIntent(amount=combined, metadata={...all fields, ~32 keys})
    response: { clientSecret, bookingReference, returnBookingReference }
    store: paymentIntentClientSecret, bookingReference, returnBookingReference
    ↓
User pays via Stripe Elements
    ↓
Stripe fires payment_intent.succeeded
    ↓
/api/webhooks/stripe
    detect isRoundTrip === 'true' in metadata
    buildBookingRow(meta, piId, 'confirmed', 'outbound')
    buildReturnMeta(meta) → buildBookingRow(returnMeta, piId, 'confirmed', 'return')
    supabase.rpc('create_round_trip_booking', { outbound_row, return_row })
    on RPC failure after 3 retries: sendEmergencyAlert (both references)
    sendClientConfirmation (single email, both legs, two ICS events)
    sendManagerAlert
    ↓
Browser at /book/confirmation?ref={bookingReference}
    display outbound + return leg details
    ICS download buttons for both legs
```

### Return Pricing Calculation Logic

```
outboundDistanceKm (from Google Routes API — one call)
returnDistanceKm = outboundDistanceKm  (symmetric; same road reversed — no second API call)

outbound:
  base = calculatePrice('transfer', vehicleClass, distanceKm, 0, 0, rates)
  isNight = pickupTime hour >= 22 || < 6
  isHoliday = pickupDate in holidayDates
  isAirport = isNearAirport(origin) || isNearAirport(destination)
  adjusted = applyGlobals(base, globals, isAirport, isNight, isHoliday, minFare)

return:
  base = calculatePrice('transfer', vehicleClass, distanceKm, 0, 0, rates)
  isNight = returnTime hour >= 22 || < 6   ← independent from outbound
  isHoliday = returnDate in holidayDates   ← independent from outbound
  isAirport = isNearAirport(destination) || isNearAirport(origin)  ← route is reversed
  adjusted = applyGlobals(base, globals, isAirport, isNight, isHoliday, minFare)
  discounted = Math.round(adjusted * (1 - returnDiscountPct / 100))

combined = adjusted (outbound) + discounted (return)
```

Note: Extras apply only to the outbound leg. Charging extras twice for a round-trip would be unexpected and incorrect (child seat is needed once, not twice).

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (< 1k bookings/yr) | RPC for atomic two-row insert is sufficient; no queue needed |
| 1k-10k bookings/yr | No changes required; Supabase handles this comfortably |
| 10k+ bookings/yr | Add index on `linked_booking_id` for admin join queries; consider materialized view for round-trip grouping in stats |

---

## Anti-Patterns

### Anti-Pattern 1: Splitting Round-Trip into Two PaymentIntents

**What people do:** Create one PaymentIntent per leg, requiring the client to confirm payment twice.

**Why it's wrong:** Clients must interact with Stripe Elements twice, breaking the "confirmed in seconds" UX promise. Partial payment (outbound paid, return payment abandoned) creates an inconsistent booking state. Refund logic doubles in complexity.

**Do this instead:** Single combined PaymentIntent with total (outbound + discounted return). Both booking rows are created by the webhook from this one PI.

### Anti-Pattern 2: Storing Fake Stripe IDs (Suffix Approach)

**What people do:** Store `pi_xxx_outbound` and `pi_xxx_return` as the `payment_intent_id` value to work around the UNIQUE constraint.

**Why it's wrong:** The `charge.refunded` handler queries `.eq('payment_intent_id', charge.payment_intent)` using the real Stripe ID. Suffixed values will not match — refunds cancel only the outbound row. Every query touching `payment_intent_id` must be updated to strip or wildcard the suffix. The column no longer contains what its name says.

**Do this instead:** Composite UNIQUE `(payment_intent_id, leg)` with a real `leg` column. The Stripe ID stays authentic.

### Anti-Pattern 3: Two Sequential Inserts in the Webhook

**What people do:** Call `saveBooking(outboundRow)` then `saveBooking(returnRow)` sequentially in the webhook handler.

**Why it's wrong:** If the second insert fails (Supabase timeout, transient network error, Vercel function timeout on Hobby plan), the outbound row exists but the return row does not. The operator sees a dangling outbound booking. There is no automatic rollback.

**Do this instead:** PostgreSQL RPC (`create_round_trip_booking`) that wraps both inserts in an implicit transaction. One failure rolls back both.

### Anti-Pattern 4: Persisting Return Price Breakdown to sessionStorage

**What people do:** Add `returnPriceBreakdown` to the `partialize` list so the combined price survives page refresh on Step 3.

**Why it's wrong:** The established decision (documented in PROJECT.md `Key Decisions`) is that price breakdowns are intentionally not persisted because admin pricing changes must reflect immediately. A persisted stale breakdown would show an outdated price to the client. The same reasoning applies to `returnPriceBreakdown`.

**Do this instead:** Exclude both `returnPriceBreakdown` and `returnDistanceKm` from `partialize`. Step 3 always re-fetches fresh prices for both legs on mount.

### Anti-Pattern 5: Charging Extras Twice for Round-Trip

**What people do:** Include extras (child seat, meet & greet) in the return leg calculation.

**Why it's wrong:** A child seat is rented once. Meet & greet at the airport applies to the arrival leg only. Charging twice is both incorrect and unexpected to the client.

**Do this instead:** Apply extras only to the outbound leg. The return leg is priced as base transfer only (plus applicable night/holiday coefficients). Confirm this rule with the operator before implementation.

---

## Sources

All findings based on direct inspection of:
- `/prestigo/lib/booking-store.ts` — Zustand store implementation
- `/prestigo/types/booking.ts` — TypeScript type definitions
- `/prestigo/app/api/webhooks/stripe/route.ts` — Webhook handler
- `/prestigo/app/api/create-payment-intent/route.ts` — Payment intent creation
- `/prestigo/app/api/calculate-price/route.ts` — Pricing engine
- `/prestigo/lib/supabase.ts` — DB helpers including `saveBooking` and `buildBookingRow`
- `/prestigo/lib/pricing-config.ts` — Pricing config types and loader
- `/prestigo/lib/email.ts` — Email data types
- `/prestigo/components/booking/steps/Step2DateTime.tsx` — Existing return date UI (daily-hire path)
- `/prestigo/app/api/admin/bookings/route.ts` — Admin bookings API
- `.planning/PROJECT.md` — Key decisions, constraints, milestone requirements

Confidence: HIGH — all integration points verified against live source code, no training-data assumptions.

---
*Architecture research for: Prestigo v1.4 — Round-Trip Booking Integration*
*Researched: 2026-04-04*
