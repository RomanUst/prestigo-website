# Phase 17: Pricing Globals Integration (Gap Closure) - Research

**Researched:** 2026-04-02
**Domain:** Next.js 16 caching API, Supabase pricing data layer, booking price calculation
**Confidence:** HIGH — all findings verified directly against installed package source files and live codebase

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRICING-03 | Operator can edit the airport fee (flat surcharge for airport pickup/dropoff) — changes reflected in booking wizard price calculation | airport_fee in pricing_globals table; route detects airport via PRG_CONFIG.placeId match; apply flat fee to total in calculate-price |
| PRICING-04 | Operator can edit the night coefficient and holiday coefficient (multipliers applied at price calculation time) | night_coefficient and holiday_coefficient in pricing_globals; pickupTime is in booking store and passed to calculate-price; need isNight detection logic |
</phase_requirements>

---

## Summary

Phase 17 closes the final functional gap in the v1.2 Operator Dashboard: `pricing_globals` (airport_fee, night_coefficient, holiday_coefficient, extra_child_seat, extra_meet_greet, extra_luggage) are correctly persisted to the database by the admin PUT route, but the booking wizard's `/api/calculate-price` and `/api/create-payment-intent` routes never read these values. Additionally, the admin pricing PUT route has a TypeScript build error because `revalidateTag()` in Next.js 16.1.7 requires a mandatory second argument `profile`.

Two coordinated changes fix everything: (1) extend `getPricingConfig()` in `lib/pricing-config.ts` to also fetch `pricing_globals` and merge them into the returned type, and (2) update `/api/calculate-price/route.ts` and `/api/create-payment-intent/route.ts` to consume those globals when applying surcharges, coefficients, and extras. The `lib/extras.ts` module currently uses hardcoded prices — these must be replaced with DB values from `pricing_globals`.

The scope is deliberately narrow: no schema changes, no new tables, no new packages. The `pricing_globals` table already has the right columns. The `unstable_cache` key and tag `'pricing-config'` are already correctly set; extending `getPricingConfig()` to include globals under the same cache tag means a single `revalidateTag` call invalidates everything, which is the correct behavior.

**Primary recommendation:** Extend `PricingRates` type and `getPricingConfig()` to include globals fields (single cache tag), then wire those values into both pricing API routes replacing all hardcoded surcharge/extras values.

---

## Standard Stack

No new packages required for this phase. All dependencies are already installed.

### Core (already installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| next | 16.1.7 | `revalidateTag`, `unstable_cache` | New 2-arg revalidateTag signature |
| @supabase/supabase-js | ^2.101.0 | DB queries | Already used in pricing-config.ts |
| zod | ^4.3.6 | Schema validation | Already used in admin route |
| vitest | ^4.1.1 | Unit tests | Use `nvm use 22` before running |

---

## Architecture Patterns

### Current Data Flow (broken)

```
Admin UI → PUT /api/admin/pricing
  ├── upserts pricing_config (rates)      ✓ consumed by calculate-price
  └── upserts pricing_globals (globals)   ✗ NEVER consumed by calculate-price

/api/calculate-price
  ├── getPricingConfig() → only pricing_config
  └── buildPriceMap() → only per-km/hourly/daily base prices
      extras: computeExtrasTotal() uses hardcoded EXTRAS_PRICES constant
      airport_fee: 0 (hardcoded by omission)
      night/holiday coefficient: 1.0 (hardcoded by omission)
```

### Target Data Flow (after Phase 17)

```
Admin UI → PUT /api/admin/pricing
  ├── upserts pricing_config (rates)      ✓ consumed by calculate-price
  └── upserts pricing_globals (globals)   ✓ consumed by calculate-price

/api/calculate-price
  ├── getPricingConfig() → pricing_config + pricing_globals (same cache)
  ├── buildPriceMap() → per-km/hourly/daily base prices
  └── apply globals:
      isAirport → add airport_fee to each vehicle class price
      isNight   → multiply base by night_coefficient
      isHoliday → multiply base by holiday_coefficient
      extras    → use DB extra_child_seat / extra_meet_greet / extra_luggage
```

### Recommended Project Structure (no new files needed)

```
prestigo/lib/
├── pricing-config.ts    # MODIFY: extend PricingRates + getPricingConfig
├── pricing.ts           # MODIFY: calculatePrice signature + globals application
├── extras.ts            # MODIFY: computeExtrasTotal accepts DB prices
└── supabase.ts          # unchanged

prestigo/app/api/
├── admin/pricing/route.ts      # MODIFY: fix revalidateTag call
├── calculate-price/route.ts    # MODIFY: pass isAirport, isNight, isHoliday + extras from DB
└── create-payment-intent/route.ts  # MODIFY: use DB extras prices

prestigo/tests/
├── pricing.test.ts         # MODIFY: extend with globals test cases
└── admin-pricing.test.ts   # already passes — no changes needed
```

---

## Critical Finding 1: revalidateTag() Signature Change in Next.js 16

**Verified by:** Direct inspection of `node_modules/next/dist/server/web/spec-extension/revalidate.d.ts`

### Current (broken) call in `app/api/admin/pricing/route.ts:80`

```typescript
revalidateTag('pricing-config')
```

### Next.js 16.1.7 actual type signature

```typescript
// Source: prestigo/node_modules/next/dist/server/web/spec-extension/revalidate.d.ts
export declare function revalidateTag(tag: string, profile: string | CacheLifeConfig): undefined;
// where CacheLifeConfig = { expire?: number }
```

The `profile` parameter is **not optional** in the TypeScript type — calling with one argument causes a TS compile error (`npm run build` fails). The runtime JS does emit a `console.warn` when called without `profile`, but TypeScript rejects it.

### Fix — two valid options

**Option A (recommended):** Pass the `'max'` profile — appropriate for admin-triggered manual invalidation:

```typescript
// Source: verified against next/cache.d.ts (Next.js 16.1.7)
revalidateTag('pricing-config', 'max')
```

**Option B:** Pass `{ expire: 0 }` for immediate forced expiry:

```typescript
revalidateTag('pricing-config', { expire: 0 })
```

Option A is preferred. The `'max'` profile (`expire: never`) combined with the revalidateTag trigger means the cache is manually busted on demand (the only revalidation path for this data). Using `'max'` as the profile string is type-safe per `next/cache.d.ts` which declares `cacheLife(profile: 'max'): void`.

**IMPORTANT:** The existing test mock in `tests/admin-pricing.test.ts` uses `vi.mock('next/cache', ...)` which mocks `revalidateTag` as `vi.fn()` — the mock signature is unconstrained, so it will continue working after the fix without modification.

---

## Critical Finding 2: pricing_globals Schema (Exact Columns)

**Verified by:** `tests/admin-pricing.test.ts` GET test fixture (line 113-121) and `app/api/admin/pricing/route.ts` Zod schema (lines 24-31).

The `pricing_globals` table has exactly these columns:

| Column | DB Type | Returns From Supabase | Default |
|--------|---------|----------------------|---------|
| id | integer | number | 1 (singleton) |
| airport_fee | NUMERIC | string (need Number() cast) | 0 |
| night_coefficient | NUMERIC | string (need Number() cast) | 1.0 |
| holiday_coefficient | NUMERIC | string (need Number() cast) | 1.0 |
| extra_child_seat | NUMERIC | string (need Number() cast) | 15 |
| extra_meet_greet | NUMERIC | string (need Number() cast) | 25 |
| extra_luggage | NUMERIC | string (need Number() cast) | 20 |

The singleton row is enforced by `CHECK (id = 1)` constraint (from Phase 11 decision). Query is always `.eq('id', 1).single()`.

CRITICAL: Same as `pricing_config` — Supabase returns NUMERIC columns as strings. All values need `Number()` cast in `getPricingConfig()`.

---

## Critical Finding 3: Current State of calculatePrice() and extras

**Verified by:** Direct file reads of `lib/pricing.ts`, `lib/extras.ts`, `app/api/calculate-price/route.ts`, `app/api/create-payment-intent/route.ts`.

### lib/pricing.ts — calculatePrice()

Returns `{ base, extras: 0, total: base, currency: 'EUR' }`. The `extras` field is **always 0**. No coefficient or surcharge logic exists.

### lib/extras.ts — computeExtrasTotal()

Uses hardcoded `EXTRAS_PRICES` constant:
```typescript
export const EXTRAS_PRICES: Record<keyof Extras, number> = {
  childSeat: 15,      // same as DB default extra_child_seat
  meetAndGreet: 25,   // same as DB default extra_meet_greet
  extraLuggage: 20,   // same as DB default extra_luggage
}
```

These defaults match the DB defaults, so current behavior is correct at defaults. But if operator updates extras via admin UI, the DB changes but `lib/extras.ts` stays hardcoded.

### /api/create-payment-intent/route.ts

Calls `computeExtrasTotal()` directly with hardcoded prices — does NOT pass DB values. Must be fixed alongside calculate-price to keep prices consistent (avoiding price mismatch between price display and payment intent).

---

## Critical Finding 4: isAirport / isNight / isHoliday — Not in calculate-price Request Body

**Verified by:** `components/booking/steps/Step3Vehicle.tsx` (the caller of `/api/calculate-price`).

The current calculate-price POST body contains:

```typescript
{
  origin: { lat, lng } | null,
  destination: { lat, lng } | null,
  tripType: TripType,
  hours: number,
  pickupDate: string | null,
  returnDate: string | null
}
```

**No `isAirport`, `isNight`, `isHoliday` flags are sent.** The route must derive these server-side from the request data.

### Airport Detection

The booking store has `PRG_CONFIG` (Prague airport placeId), and `Step5Passenger.tsx` / `BookingWizard.tsx` detect airport via:
```typescript
origin?.placeId === PRG_CONFIG.placeId || destination?.placeId === PRG_CONFIG.placeId
```

BUT `placeId` is not sent to `/api/calculate-price` — only `lat`/`lng` are sent. The route cannot replicate placeId matching server-side.

**Two options for airport detection:**

**Option A (recommended):** Add `isAirport: boolean` flag to the calculate-price request body. Step3Vehicle already knows `origin` and `destination` (both PlaceResult objects with placeId). Caller sends `isAirport: origin?.placeId === PRG_CONFIG.placeId || destination?.placeId === PRG_CONFIG.placeId`. Server uses this flag directly.

**Option B:** Compare lat/lng against PRG_CONFIG coordinates with small tolerance. Fragile — lat/lng precision varies by Google Maps response.

Option A is correct. The `origin`/`destination` sent to calculate-price are `{ lat, lng }` only — need to either add `isAirport` boolean to the body or add `placeId` to the lat/lng object.

### Night Detection

`pickupTime` is in the request body as a field in the booking store but **not currently sent** to calculate-price. `pickupDate` is sent. Night rate typically applies between 22:00 and 06:00.

The booking store sends `pickupDate` but not `pickupTime` to calculate-price. Must add `pickupTime: string | null` to the calculate-price request body, then server-side detect: hour >= 22 || hour < 6.

### Holiday Detection

No holiday list exists in the current codebase. The `pricing_globals` table stores `holiday_coefficient` but there is no table of holiday dates, and no mechanism to detect whether `pickupDate` is a holiday.

**Decision required:** How is "holiday" detected? Options:
1. Add `isHoliday: boolean` flag to the request body — client sends true when user has manually toggled a holiday flag (but no such UI toggle exists)
2. Add a `holidays` table and check server-side
3. Leave `isHoliday` always false for now (coefficient stored but not applied) — practical for Phase 17 scope

Option C (always false for Phase 17) is pragmatic. The coefficient is stored and editable in admin UI, but detection logic is deferred. Document as explicit scope decision.

---

## Critical Finding 5: Extending getPricingConfig() — Cache Tag Impact

**Verified by:** `lib/pricing-config.ts`, `app/api/admin/pricing/route.ts`.

Current `getPricingConfig()` is wrapped in `unstable_cache` with key `['pricing-config']` and tag `'pricing-config'`. The admin PUT route already calls `revalidateTag('pricing-config')` after both `pricing_config` and `pricing_globals` upserts.

**Extending `getPricingConfig()` to also query `pricing_globals` under the same `unstable_cache` wrapper means:**
- Single cache entry covers both tables
- `revalidateTag('pricing-config')` already invalidates everything correctly (no changes to admin route beyond the revalidateTag fix)
- No new cache tags needed

This is the correct architecture — one cache, one invalidation.

### Extended PricingRates Type

```typescript
// Source: analysis of pricing_globals schema
export type PricingGlobals = {
  airportFee: number
  nightCoefficient: number
  holidayCoefficient: number
  extraChildSeat: number
  extraMeetGreet: number
  extraLuggage: number
}

export type PricingRates = {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
  globals: PricingGlobals
}
```

### Extended getPricingConfig() Query

```typescript
// Both queries inside the same unstable_cache wrapper, using Promise.all
const [configResult, globalsResult] = await Promise.all([
  supabase.from('pricing_config').select('vehicle_class, rate_per_km, hourly_rate, daily_rate'),
  supabase.from('pricing_globals').select('airport_fee, night_coefficient, holiday_coefficient, extra_child_seat, extra_meet_greet, extra_luggage').eq('id', 1).single(),
])
// CRITICAL: Number() cast for all NUMERIC columns
```

---

## Critical Finding 6: create-payment-intent Must Also Be Updated

**Verified by:** `app/api/create-payment-intent/route.ts` which calls `computeExtrasTotal()` with hardcoded prices.

Phase 12 decision (KEY DECISION): "create-payment-intent also wired to DB rates (deviation fix) — prevents price mismatch between price calc and payment intent."

The same principle applies here: if extras prices in DB differ from hardcoded `EXTRAS_PRICES`, the displayed price (from calculate-price) and the charged amount (from create-payment-intent) will diverge. Both must use DB values.

Fix: `computeExtrasTotal()` should accept an optional extras price map, or `create-payment-intent` should pass DB extras prices when calling it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache invalidation | Custom invalidation mechanism | `revalidateTag('pricing-config', 'max')` — already in place | One call busts both tables' data |
| Night detection | Complex time zone math | Simple hour check on `pickupTime` string (HH:MM) | Time is local, no TZ conversion needed for this use case |
| DB connection pooling | New Supabase client | `createSupabaseServiceClient()` from `lib/supabase` | Already established pattern |

**Key insight:** All infrastructure already exists. Phase 17 is pure wiring — no new abstractions needed.

---

## Common Pitfalls

### Pitfall 1: NUMERIC columns returned as strings
**What goes wrong:** `airport_fee` from Supabase returns `"0.00"` not `0`. Arithmetic on strings gives `NaN` or string concatenation.
**Why it happens:** PostgreSQL NUMERIC type maps to string in Supabase JS client.
**How to avoid:** `Number()` cast on every field from `pricing_globals`, exactly as done for `pricing_config` rates.
**Warning signs:** `NaN` in price calculations, or total showing `"2800.00"` instead of `2800`.

### Pitfall 2: revalidateTag called with one argument
**What goes wrong:** TypeScript compile error. `npm run build` fails.
**Why it happens:** Next.js 16 changed the signature to require `profile` as second argument.
**How to avoid:** `revalidateTag('pricing-config', 'max')` — second argument is mandatory.
**Warning signs:** TS error: `Expected 2 arguments, but got 1`.

### Pitfall 3: isAirport not sent by Step3Vehicle
**What goes wrong:** Airport fee never applied because route has no way to detect airport without placeId.
**Why it happens:** Step3Vehicle sends `{ lat, lng }` only for origin/destination.
**How to avoid:** Add `isAirport: boolean` to the calculate-price request body in Step3Vehicle. Client computes: `origin?.placeId === PRG_CONFIG.placeId || destination?.placeId === PRG_CONFIG.placeId`.
**Warning signs:** Airport fee is in DB, route receives the flag as `undefined` — `undefined + fee = NaN`.

### Pitfall 4: Pricing mismatch between calculate-price and create-payment-intent
**What goes wrong:** Booking wizard shows DB extras prices, Stripe charges hardcoded prices.
**Why it happens:** `create-payment-intent` calls `computeExtrasTotal()` which uses hardcoded `EXTRAS_PRICES`.
**How to avoid:** Update `create-payment-intent` to also call `getPricingConfig()` and use `globals.extraChildSeat` etc.
**Warning signs:** Displayed total != charged amount (caught by Stripe dashboard comparison).

### Pitfall 5: Coefficient applied on top of coefficient (double-multiplication)
**What goes wrong:** If both isNight and isHoliday are true, and both coefficients are applied as multiplications, the combined coefficient is `night * holiday`. This may or may not be the business intent.
**Why it happens:** Separate multiplications chain.
**How to avoid:** Clarify intent: use `Math.max(nightCoefficient, holidayCoefficient)` (highest coefficient wins) or multiply them. Document the decision. Recommended: apply maximum coefficient only — more predictable for customers.

### Pitfall 6: pricing.test.ts test cases break
**What goes wrong:** Existing `pricing.test.ts` tests use `testRates: Rates` that does not include `globals`. If `Rates` type is renamed or extended, tests fail.
**Why it happens:** Type extension breaks existing test fixtures.
**How to avoid:** Keep the existing `Rates` interface backward-compatible. Add `globals` as a separate parameter or extend `PricingRates` with defaults for `globals`. Tests in `pricing.test.ts` test pure base calculation — they can remain unchanged if globals handling is separate from `calculatePrice()`.

---

## Code Examples

### Fix 1: revalidateTag in admin pricing route

```typescript
// Source: verified against next/cache.d.ts and node_modules/next/dist/server/web/spec-extension/revalidate.d.ts
// BEFORE (broken — TS error in Next.js 16.1.7):
revalidateTag('pricing-config')

// AFTER (correct):
revalidateTag('pricing-config', 'max')
```

### Fix 2: Extended PricingRates type and getPricingConfig

```typescript
// lib/pricing-config.ts
export type PricingGlobals = {
  airportFee: number
  nightCoefficient: number
  holidayCoefficient: number
  extraChildSeat: number
  extraMeetGreet: number
  extraLuggage: number
}

export type PricingRates = {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
  globals: PricingGlobals
}

export const getPricingConfig = unstable_cache(
  async (): Promise<PricingRates> => {
    const supabase = createSupabaseServiceClient()
    const [{ data: config, error: configError }, { data: globals, error: globalsError }] =
      await Promise.all([
        supabase.from('pricing_config').select('vehicle_class, rate_per_km, hourly_rate, daily_rate'),
        supabase.from('pricing_globals')
          .select('airport_fee, night_coefficient, holiday_coefficient, extra_child_seat, extra_meet_greet, extra_luggage')
          .eq('id', 1)
          .single(),
      ])

    if (configError || !config?.length) {
      throw new Error(`Failed to load pricing config: ${configError?.message ?? 'no rows returned'}`)
    }
    if (globalsError || !globals) {
      throw new Error(`Failed to load pricing globals: ${globalsError?.message ?? 'no row returned'}`)
    }

    return {
      ratePerKm: Object.fromEntries(config.map(r => [r.vehicle_class, Number(r.rate_per_km)])),
      hourlyRate: Object.fromEntries(config.map(r => [r.vehicle_class, Number(r.hourly_rate)])),
      dailyRate:  Object.fromEntries(config.map(r => [r.vehicle_class, Number(r.daily_rate)])),
      globals: {
        airportFee:          Number(globals.airport_fee),
        nightCoefficient:    Number(globals.night_coefficient),
        holidayCoefficient:  Number(globals.holiday_coefficient),
        extraChildSeat:      Number(globals.extra_child_seat),
        extraMeetGreet:      Number(globals.extra_meet_greet),
        extraLuggage:        Number(globals.extra_luggage),
      },
    }
  },
  ['pricing-config'],
  { tags: ['pricing-config'] }
)
```

### Fix 3: Globals application in calculate-price route

```typescript
// app/api/calculate-price/route.ts — extended request body type
const { origin, destination, tripType, hours, pickupDate, returnDate, pickupTime, isAirport } = body as {
  // ... existing fields ...
  pickupTime: string | null    // 'HH:MM' format — for night detection
  isAirport: boolean | null    // client sends origin?.placeId === PRG_CONFIG.placeId || dest?.placeId
}

// Night detection (after loading rates)
function isNightTime(time: string | null): boolean {
  if (!time) return false
  const hour = parseInt(time.split(':')[0], 10)
  return hour >= 22 || hour < 6
}

// Apply globals to base price
function applyGlobals(
  base: number,
  globals: PricingGlobals,
  isAirport: boolean,
  isNight: boolean
): number {
  let price = base
  // Apply coefficient (use max if both apply — business decision: highest wins)
  const coefficient = isNight ? globals.nightCoefficient : 1.0
  // isHoliday: deferred — no detection mechanism in Phase 17
  price = Math.round(price * coefficient)
  if (isAirport) price += globals.airportFee
  return price
}
```

### Fix 4: Step3Vehicle.tsx — add isAirport + pickupTime to request body

```typescript
// components/booking/steps/Step3Vehicle.tsx
import { PRG_CONFIG } from '@/types/booking'

// Inside the component, add:
const pickupTime = useBookingStore((s) => s.pickupTime)

// In fetchPrice():
body: JSON.stringify({
  origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
  destination: destination ? { lat: destination.lat, lng: destination.lng } : null,
  tripType,
  hours,
  pickupDate,
  returnDate,
  pickupTime,   // new field
  isAirport: (origin?.placeId === PRG_CONFIG.placeId || destination?.placeId === PRG_CONFIG.placeId) ?? false,  // new field
})
```

### Fix 5: computeExtrasTotal with DB prices

```typescript
// lib/extras.ts — updated signature (backward-compatible)
export function computeExtrasTotal(
  extras: Extras,
  prices?: { childSeat: number; meetAndGreet: number; extraLuggage: number }
): number {
  const p = prices ?? EXTRAS_PRICES
  return (extras.childSeat ? p.childSeat : 0)
       + (extras.meetAndGreet ? p.meetAndGreet : 0)
       + (extras.extraLuggage ? p.extraLuggage : 0)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `revalidateTag(tag)` — 1 arg | `revalidateTag(tag, profile)` — 2 args required | Next.js 16.x (in installed 16.1.7) | Build fails without fix |
| Hardcoded extras prices in lib/extras.ts | DB-driven extras prices from pricing_globals | Phase 17 | Operator changes take effect immediately |
| No airport/night surcharges | DB-driven surcharges with isAirport + isNight flags | Phase 17 | PRICING-03, PRICING-04 satisfied |

---

## Open Questions

1. **Holiday detection mechanism**
   - What we know: `holiday_coefficient` stored in DB, operator can edit it
   - What's unclear: How does the system know a given pickup date is a holiday? No holidays table, no UI flag for holiday booking
   - Recommendation: For Phase 17, document `isHoliday = false` always. Holiday detection is deferred post-v1.2. The coefficient is stored and can be read, but Phase 17 does not implement detection logic.

2. **Coefficient combination rule**
   - What we know: Both `night_coefficient` and `holiday_coefficient` exist
   - What's unclear: If a booking is both night AND holiday, should coefficients multiply or should the higher one win?
   - Recommendation: Phase 17 applies only night coefficient (holiday deferred). Single coefficient, no combination edge case.

3. **Airport fee application scope**
   - What we know: airport_fee is a flat surcharge
   - What's unclear: Is it per-vehicle-class or a flat amount applied once to the selected vehicle's total?
   - Recommendation: Flat surcharge added to the total price after per-km/hourly calculation (same for all vehicle classes). Consistent with the field being in `pricing_globals` (not `pricing_config`).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run tests/pricing.test.ts tests/admin-pricing.test.ts` |
| Full suite command | `cd prestigo && npx vitest run` (use `nvm use 22` first) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICING-03 | airport_fee from DB applied to isAirport price | unit | `npx vitest run tests/pricing.test.ts` | ✅ (extend existing) |
| PRICING-03 | revalidateTag called with 2 args (no TS error) | build | `cd prestigo && npx tsc --noEmit` | ✅ |
| PRICING-04 | night_coefficient from DB applied when isNight=true | unit | `npx vitest run tests/pricing.test.ts` | ✅ (extend existing) |
| PRICING-04 | globals fetched alongside config in getPricingConfig | unit | `npx vitest run tests/pricing.test.ts` | ✅ (new test case) |
| Both | extras prices use DB values from getPricingConfig | unit | `npx vitest run tests/pricing.test.ts` | ✅ (extend existing) |
| Both | existing pricing tests still pass (no regression) | unit | `npx vitest run tests/pricing.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `cd prestigo && npx vitest run tests/pricing.test.ts tests/admin-pricing.test.ts`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green + `npx tsc --noEmit` passes before `/gsd:verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. `tests/pricing.test.ts` and `tests/admin-pricing.test.ts` already exist. New test cases for globals are additive within existing files.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection: `prestigo/node_modules/next/dist/server/web/spec-extension/revalidate.d.ts` — confirmed `revalidateTag(tag, profile)` 2-arg signature in Next.js 16.1.7
- Direct inspection: `prestigo/node_modules/next/cache.d.ts` — confirmed profile strings: `'max'`, `'days'`, `'hours'`, etc.
- Direct inspection: `prestigo/lib/pricing-config.ts` — confirmed current query scope (pricing_config only)
- Direct inspection: `prestigo/app/api/admin/pricing/route.ts` — confirmed Zod schema for pricing_globals fields and column names
- Direct inspection: `prestigo/app/api/calculate-price/route.ts` — confirmed no globals consumption
- Direct inspection: `prestigo/lib/pricing.ts` — confirmed `extras: 0` hardcoded in calculatePrice return
- Direct inspection: `prestigo/lib/extras.ts` — confirmed hardcoded EXTRAS_PRICES
- Direct inspection: `prestigo/components/booking/steps/Step3Vehicle.tsx` — confirmed calculate-price request body (no isAirport, no pickupTime)
- Direct inspection: `prestigo/tests/admin-pricing.test.ts` — confirmed pricing_globals column names via test fixture

### Secondary (MEDIUM confidence)
- `prestigo/.planning/STATE.md` — Key Decisions sections for Phase 11 (DB defaults), Phase 12 (Number() cast requirement), Phase 14 (revalidateTag tag string)
- `prestigo/.planning/v1.2-MILESTONE-AUDIT.md` — root cause analysis confirming gap details

---

## Metadata

**Confidence breakdown:**
- revalidateTag fix: HIGH — inspected actual .d.ts in installed package
- pricing_globals schema: HIGH — cross-verified between route.ts Zod schema and test fixtures
- isAirport/isNight detection approach: HIGH — verified Step3Vehicle request body directly
- extras price wiring: HIGH — lib/extras.ts hardcodes confirmed
- holiday detection deferral: HIGH — no holiday table or detection mechanism exists in codebase

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable — Next.js 16.1.7 pinned, no pending upgrades)
