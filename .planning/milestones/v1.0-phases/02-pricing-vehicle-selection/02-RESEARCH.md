# Phase 2: Pricing & Vehicle Selection - Research

**Researched:** 2026-03-25
**Domain:** React date/time pickers, Next.js API routes as pricing engine, Zustand store extension, vehicle card UI with live price updates
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Custom calendar grid using react-day-picker (~5KB) — no native `<input type="date">`
- Calendar is inline and always visible (not a popover) — part of the step layout, no tap required
- Past dates greyed out and not selectable
- For Daily Hire: return date appears in the same Step 2 view as a second calendar row below the outbound date (revealed when trip type is `daily`)
- Scrollable list of time slots at 15-minute increments (e.g. 08:00, 08:15, 08:30…)
- Touch-friendly on mobile; no free-text entry for time
- 3 cards side-by-side on desktop, stacked vertically (full-width) on mobile — no horizontal carousel
- Each card shows: vehicle photo, class name, max passengers (icon + count), luggage capacity (icon + count), calculated price
- No amenities list on the card — clean, not cluttered
- Selected card state: copper border ring + subtle anthracite-mid background lift
- While `/api/calculate-price` is in flight: animated skeleton shimmer bar where the price number will appear — no spinner, no dash placeholder
- Desktop: 2-column layout — vehicle cards on left, PriceSummary sticky on right
- Mobile: fixed bottom bar showing total + Next button
- Content at Step 3: origin → destination (truncated), selected vehicle class name, base price
- All 3 vehicle cards remain visible when route is unmappable; price area shows "Request a quote" on each card
- User can still select a vehicle preference and proceed through the wizard on unmappable routes
- No Stripe payment for quote requests — wizard routes to a "We'll be in touch" confirmation page
- Manager is notified it's a quote request (not a confirmed booking)

### Claude's Discretion
- Exact spacing and typography within vehicle cards (follow globals.css rhythm)
- Calendar styling: day cell size, selected day copper fill vs copper ring
- Shimmer animation implementation (CSS keyframes vs Tailwind animate-pulse)
- Exact truncation logic for route display in PriceSummary
- Quote vs paid booking flag storage in Zustand (implementation detail)

### Deferred Ideas (OUT OF SCOPE)
- Route preview map embedded in Step 2/3 — originally deferred from Phase 1 context; still out of scope for Phase 2
- Amenities list on vehicle cards — could be added in Phase 6 polish if needed
- Multi-stop routing — v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STEP2-01 | User can select pickup date (calendar picker, no past dates) | react-day-picker v9 `disabled` prop with `{ before: today }` |
| STEP2-02 | User can select pickup time (15-min increments) | Custom scrollable list; generate slots with `Array.from` at 15-min intervals |
| STEP2-03 | For Daily Hire, user selects return date | react-day-picker second instance; `disabled` includes before pickupDate |
| STEP3-01 | User sees 3 vehicle classes: Business, First Class, Business Van | Three static VehicleCard components driven by `VEHICLE_CONFIG` config object |
| STEP3-02 | Each class shows: photo, max passengers, luggage capacity, amenities, price | VehicleCard props typed from `VehicleClass`; photo from `/public/vehicles/` |
| STEP3-03 | Price is calculated and displayed live based on route + trip type | `usePriceCalculation` hook calls `/api/calculate-price`; result drives all 3 cards |
| STEP3-04 | PriceSummary panel updates in real-time when user changes vehicle class | `vehicleClass` in Zustand → derived price from already-fetched `priceBreakdown` map |
| STEP3-05 | If route cannot be calculated, "Request a quote" fallback shown | API returns `{ quoteModeOnly: true }` → UI shows fallback copy |
| PRICE-01 | Next.js API route `/api/calculate-price` proxies Google Routes API server-side | Next.js App Router route handler; `GOOGLE_MAPS_API_KEY` env var server-only |
| PRICE-02 | Transfer price = distance_km × rate_per_km[vehicleClass] | Rate table in `lib/pricing.ts`; formula applied per class |
| PRICE-03 | Hourly price = hours × hourly_rate[vehicleClass] | Branch on `tripType === 'hourly'` in pricing function |
| PRICE-04 | Daily price = days × daily_rate[vehicleClass] | Branch on `tripType === 'daily'`; days = returnDate − pickupDate |
| PRICE-05 | Rate tables defined in server-side config (not hardcoded in UI) | `lib/pricing.ts` exported only from API route; never imported by client components |
| PRICE-06 | Google Maps API key never exposed to client | API route only; key in `.env.local` as `GOOGLE_MAPS_API_KEY` (no `NEXT_PUBLIC_` prefix) |
</phase_requirements>

---

## Summary

Phase 2 builds on the solid Phase 1 foundation. The main new dependencies are react-day-picker (for the inline calendar) and the server-side Google Routes API call for distance-based pricing. Everything else — Zustand, Tailwind v4, globals.css token system, `'use client'` component conventions — is already in place.

The pricing engine is the architecturally interesting piece: `/api/calculate-price` is called once when the user arrives at Step 3, returns price-per-km distance data from Google Routes API, and the client derives all three vehicle prices locally from the returned distance. When the user switches vehicle classes, no new API call is needed — the price is recalculated from the already-stored `distanceKm` value in the Zustand store. This keeps latency low and avoids redundant Google API calls.

The quote-mode fallback is a state branch in Zustand (`quoteMode: boolean`). When the API returns an error or unmappable route, the store sets `quoteMode: true`, all vehicle cards show "Request a quote", and the downstream wizard routing diverges from the Stripe payment path.

**Primary recommendation:** Build in this order — (1) extend BookingStore with Phase 2 fields, (2) write `lib/pricing.ts` with rate tables, (3) write the API route, (4) Step2DateTime with react-day-picker + time slot list, (5) Step3Vehicle with VehicleCard grid + PriceSummary, (6) wire BookingWizard to replace StepStub for steps 2 and 3.

---

## Standard Stack

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| react-day-picker | 9.14.0 (latest) | Inline calendar grid with disabled dates | Small (~5KB), composable, headless styling — matches custom CSS token system perfectly |
| zustand | 5.0.12 (already installed) | Extended booking store with Phase 2 fields | Already in use; just add new fields/actions |
| next (App Router API route) | 16.1.7 (already installed) | `/api/calculate-price` server-side proxy | Keeps Google Maps key server-only; native to stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @googlemaps/js-api-loader | 2.0.2 (already installed) | Google Routes API call from server route | Server-side fetch via native `fetch()` — no browser SDK needed server-side |

**Note on Google Routes API from server:** The API route uses native `fetch()` directly against the Routes API REST endpoint (`https://routes.googleapis.com/directions/v2:computeRoutes`), not the JS loader. The loader is browser-only; the server route uses the REST API with the key in an HTTP header (`X-Goog-Api-Key`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-day-picker | Custom calendar | react-day-picker saves ~300 lines of day-grid logic; locked decision anyway |
| CSS keyframe shimmer | Tailwind `animate-pulse` | CSS keyframe is consistent with existing globals.css pattern (stepFadeUp) — UI-SPEC mandates CSS keyframes |

### Installation
```bash
npm install react-day-picker
```

No other new dependencies needed. Everything else is already installed.

**Version verification:** `npm view react-day-picker dist-tags` returns `{ latest: '9.14.0' }` as of 2026-03-25.

---

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
prestigo/
├── app/api/calculate-price/
│   └── route.ts               # NEW — Google Routes API proxy
├── components/booking/
│   ├── steps/
│   │   ├── Step2DateTime.tsx   # NEW — inline calendar + time slot list
│   │   └── Step3Vehicle.tsx    # NEW — vehicle card grid + price fetch trigger
│   ├── VehicleCard.tsx         # NEW — single vehicle card component
│   └── PriceSummary.tsx        # NEW — sticky panel (desktop) / fixed bar (mobile)
├── lib/
│   └── pricing.ts              # NEW — rate tables + calculation functions
└── types/
    └── booking.ts              # EXTEND — add Phase 2 fields to BookingStore
```

### Pattern 1: Zustand Store Extension

Add Phase 2 fields to the existing `BookingStore` interface in `types/booking.ts` and implement them in `lib/booking-store.ts`. Do NOT redefine `BookingStore` — extend it.

```typescript
// In types/booking.ts — add to BookingStore interface:
pickupDate: string | null          // ISO date string 'YYYY-MM-DD'
pickupTime: string | null          // '08:15'
returnDate: string | null          // Daily Hire only
vehicleClass: VehicleClass | null
distanceKm: number | null          // cached from API response
priceBreakdown: Record<VehicleClass, PriceBreakdown> | null
quoteMode: boolean                 // true when route cannot be priced

// Actions:
setPickupDate: (date: string | null) => void
setPickupTime: (time: string | null) => void
setReturnDate: (date: string | null) => void
setVehicleClass: (v: VehicleClass | null) => void
setDistanceKm: (km: number | null) => void
setPriceBreakdown: (p: Record<VehicleClass, PriceBreakdown> | null) => void
setQuoteMode: (q: boolean) => void
```

Persist the new fields by adding them to the `partialize` list. `priceBreakdown` should also be persisted (large object but required to survive refresh at Step 3).

### Pattern 2: Pricing Module (server-side only)

```typescript
// lib/pricing.ts — server-side only, NEVER import in 'use client' components
export const RATE_PER_KM: Record<VehicleClass, number> = {
  business:     2.80,
  first_class:  4.20,
  business_van: 3.50,
}

export const HOURLY_RATE: Record<VehicleClass, number> = {
  business:     55,
  first_class:  85,
  business_van: 70,
}

export const DAILY_RATE: Record<VehicleClass, number> = {
  business:     320,
  first_class:  480,
  business_van: 400,
}

export function calculatePrice(
  tripType: TripType,
  vehicleClass: VehicleClass,
  distanceKm: number | null,
  hours: number,
  days: number
): PriceBreakdown {
  let base = 0
  if (tripType === 'transfer' || tripType === 'airport_pickup' || tripType === 'airport_dropoff') {
    if (distanceKm === null) throw new Error('distance required for transfer')
    base = Math.round(distanceKm * RATE_PER_KM[vehicleClass])
  } else if (tripType === 'hourly') {
    base = Math.round(hours * HOURLY_RATE[vehicleClass])
  } else if (tripType === 'daily') {
    base = Math.round(days * DAILY_RATE[vehicleClass])
  }
  return { base, extras: 0, total: base, currency: 'EUR' }
}
```

### Pattern 3: API Route — Google Routes API Proxy

```typescript
// app/api/calculate-price/route.ts
// Source: Google Routes API REST docs (v2:computeRoutes)
export async function POST(req: Request) {
  const { origin, destination, tripType, hours, pickupDate, returnDate } = await req.json()

  // For hourly/daily: no distance needed — calculate from hours/days directly
  if (tripType === 'hourly' || tripType === 'daily') {
    const days = tripType === 'daily'
      ? dateDiffDays(pickupDate, returnDate)
      : 0
    const prices = buildPriceMap(tripType, null, hours, days)
    return Response.json({ prices, distanceKm: null, quoteMode: false })
  }

  // Transfer types: call Google Routes API
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY!,
      'X-Goog-FieldMask': 'routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: 'DRIVE',
    }),
  })

  if (!res.ok || !res.body) {
    return Response.json({ prices: null, distanceKm: null, quoteMode: true })
  }

  const data = await res.json()
  const distanceMeters = data?.routes?.[0]?.distanceMeters
  if (!distanceMeters) {
    return Response.json({ prices: null, distanceKm: null, quoteMode: true })
  }

  const distanceKm = distanceMeters / 1000
  const prices = buildPriceMap(tripType, distanceKm, 0, 0)
  return Response.json({ prices, distanceKm, quoteMode: false })
}
```

Key details:
- `X-Goog-Api-Key` header (not query string) is the recommended auth method for Routes API v2.
- `X-Goog-FieldMask: 'routes.distanceMeters'` limits the response payload and reduces billing cost.
- `GOOGLE_MAPS_API_KEY` — no `NEXT_PUBLIC_` prefix. Never exposed to client bundle.

### Pattern 4: react-day-picker Integration

react-day-picker v9 uses a headless model — it renders its own DOM but accepts custom `classNames` and `styles` props to override every element. The custom CSS token system is applied via inline styles or a `classNames` map.

```typescript
// Source: react-day-picker v9 official docs
import { DayPicker } from 'react-day-picker'

<DayPicker
  mode="single"
  selected={selectedDate}
  onSelect={handleSelect}
  disabled={{ before: new Date() }}  // no past dates
  // Style overrides via classNames or modifiersStyles:
  modifiersStyles={{
    selected: { background: 'var(--copper)', color: 'var(--anthracite)' },
    disabled: { color: 'var(--warmgrey)', cursor: 'not-allowed' },
    today: { outline: '1px solid var(--anthracite-light)' },
  }}
/>
```

For the Daily Hire return date, render a second `<DayPicker>` with `disabled={{ before: pickupDate ?? new Date() }}`.

### Pattern 5: Time Slot List

Generate all 96 slots (00:00–23:45 at 15-min intervals) once as a static array:

```typescript
const TIME_SLOTS: string[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, '0')
  const m = ((i % 4) * 15).toString().padStart(2, '0')
  return `${h}:${m}`
})
```

Render as a scrollable `<ul>` with `role="listbox"`. Each `<li>` has `role="option"`, `aria-selected`, min-height 44px (touch target). The selected item scrolls into view on mount/selection change via `scrollIntoView({ block: 'center' })`.

### Pattern 6: Price Fetch + Live Update Flow

```
Step 3 mounts
  → useEffect reads origin, destination, tripType, hours, pickupDate, returnDate from store
  → if pickupDate && (destination || tripType === 'hourly'): call /api/calculate-price
  → set loading state → show skeleton in all 3 price slots
  → on response: setPriceBreakdown(prices), setDistanceKm(km), setQuoteMode(quoteMode)
  → loading false → render prices (or quote fallback)

User clicks different vehicle card
  → setVehicleClass(newClass)
  → PriceSummary reads priceBreakdown[vehicleClass] from store — no new fetch
  → price updates instantly (opacity cross-fade 150ms)
```

### Anti-Patterns to Avoid

- **Calling `/api/calculate-price` on every vehicle card click.** One call on Step 3 mount returns prices for all 3 classes. Switching cards should NEVER trigger a new API call.
- **Importing `lib/pricing.ts` from a `'use client'` component.** This would bundle rate tables client-side and potentially leak business logic. Rate table logic stays server-only.
- **Using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for the Routes API key.** Even if only used server-side in code, the `NEXT_PUBLIC_` prefix causes Next.js to embed the value in the client bundle at build time.
- **Storing `returnDate` in the store for non-daily trip types.** Always null out `returnDate` when `tripType` changes away from `'daily'` to prevent stale data influencing price calculation.
- **react-day-picker v8 API.** The current major version is v9 with a different API. `@react-day-picker/react` import path was v8. v9 imports from `react-day-picker` directly. Do not mix.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Month calendar grid with keyboard nav | Custom calendar component | react-day-picker | Day grid with month navigation, keyboard focus management, disabled states, aria-attributes is 300+ lines of bug-prone logic |
| Past-date disabling | Manual `Date` comparison per cell | `react-day-picker disabled={{ before: new Date() }}` | Built-in, handles timezone edge cases, handles end-of-day boundary |
| 96-slot time list | Custom clock widget | Static array + `<ul role="listbox">` | Time picker wheels are complex to build and poorly supported cross-browser |
| Google Routes API auth headers | Custom fetch wrapper | Direct `fetch()` with `X-Goog-Api-Key` header | One header, no SDK needed server-side |

**Key insight:** react-day-picker's headless model is exactly right for this project — it renders the structure, and the custom CSS token system controls every visual detail.

---

## Common Pitfalls

### Pitfall 1: NEXT_PUBLIC_ prefix on Google Maps key
**What goes wrong:** Developer adds `NEXT_PUBLIC_` prefix so the key is "easier to access" — it then appears verbatim in the client JS bundle regardless of whether it's ever called client-side.
**Why it happens:** Muscle memory from working with other env vars; Next.js docs are not prominently warning about this.
**How to avoid:** Key is `GOOGLE_MAPS_API_KEY` (no prefix). Only accessible in API routes and server components. Client components never import from `lib/pricing.ts`.
**Warning signs:** `grep -r 'NEXT_PUBLIC_GOOGLE' prestigo/` returns any result.

### Pitfall 2: BookingWizard generic button bar conflict with Step 2/3
**What goes wrong:** BookingWizard already renders a generic Back/Continue button bar for steps 2–6. If Step 2 or Step 3 also renders their own buttons, there will be duplicate buttons.
**Why it happens:** Step 1 owns its own button (it's an established exception). Steps 2+ use the wizard shell's bar.
**How to avoid:** Step2DateTime and Step3Vehicle do NOT render their own Back/Continue buttons. Validation to enable/disable Continue is done by exposing a `canProceed` value — the wizard shell passes `disabled` to the button based on this. A clean pattern: store validation state in Zustand (`step2Valid`, `step3Valid`) or use a callback prop from the wizard.
**Warning signs:** Seeing two "Continue" buttons rendered in the DOM.

### Pitfall 3: react-day-picker v8 vs v9 API mismatch
**What goes wrong:** Training data or tutorials reference v8 patterns (e.g., `selected` as prop with `ClassNames` object); v9 changed the API surface.
**Why it happens:** v9 (released 2024) is the current major; older tutorials dominate search results.
**How to avoid:** Use v9 docs exclusively. `mode="single"`, `disabled` as object/function prop, `modifiersStyles` for per-state styling. Verified version: 9.14.0.
**Warning signs:** TypeScript error on `classNames` prop expecting strings not found in v9 types.

### Pitfall 4: Daily Hire `returnDate` before `pickupDate`
**What goes wrong:** User picks return date first (calendar renders above fold), sets it before pickup date — results in negative days count, negative price.
**Why it happens:** Calendar layout puts return date below outbound but both are visible.
**How to avoid:** Return date calendar uses `disabled={{ before: pickupDate ?? new Date() }}`. Zustand `setReturnDate` action guards: if `returnDate <= pickupDate`, set to `null`. UI blocks Continue in Step 2 if `returnDate` is null when `tripType === 'daily'`.
**Warning signs:** `days` variable in pricing is 0 or negative; price shows as €0 or negative.

### Pitfall 5: PriceSummary fixed bottom bar overlapping Step content on mobile
**What goes wrong:** The `position: fixed; bottom: 0` bar at 56px covers the last vehicle card or the Continue button from the wizard shell.
**Why it happens:** Fixed elements are removed from document flow.
**How to avoid:** Add `pb-20` (80px) bottom padding to the Step 3 content container on mobile. The wizard shell's mobile sticky button bar is already at 72px height — PriceSummary replaces or coordinates with it at Step 3.
**Warning signs:** Last vehicle card text is clipped on mobile viewport.

### Pitfall 6: Timezone mismatch in date calculation
**What goes wrong:** `new Date()` called on a server in UTC returns a different date than the user's local "today" in Prague (UTC+1/+2). Past date blocking fails at midnight.
**Why it happens:** Server-side date validation uses UTC; user is in Europe/Prague.
**How to avoid:** Past-date disabling is done purely client-side in react-day-picker (no server validation for past dates). The `pickupDate` stored in Zustand is an ISO date string `'YYYY-MM-DD'` without timezone — the UI generates it from the user's local date using `format(date, 'yyyy-MM-dd')` (or manual string construction). The API route does NOT re-validate that the date is in the future.
**Warning signs:** Users in Prague CET can't book midnight–01:00 slots on the current day.

### Pitfall 7: Price shimmer causing layout shift
**What goes wrong:** Skeleton bar is a different size than the final price text, causing the card height to change when the price loads.
**Why it happens:** Skeleton is sized incorrectly; price text wraps differently.
**How to avoid:** Skeleton bar dimensions must match the price slot exactly: `width: 80px`, `height: 20px` (matching the 20px/Montserrat 500 price text slot). The "Request a quote" fallback is 13px and shorter — the card must not shrink when switching to quote mode. Use `min-height` on the price slot container.
**Warning signs:** Vehicle cards jump in height when price loads.

---

## Code Examples

### Skeleton Shimmer Keyframe (add to globals.css)
```css
/* Source: 02-UI-SPEC.md animation contract */
@keyframes shimmer {
  0%   { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

.skeleton-shimmer {
  width: 80px;
  height: 20px;
  background: linear-gradient(
    90deg,
    var(--anthracite-mid) 0px,
    var(--copper-pale) 40px,
    var(--anthracite-mid) 80px
  );
  background-size: 200px 100%;
  animation: shimmer 1.2s infinite linear;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer {
    animation: none;
    background: var(--anthracite-mid);
  }
}
```

### Vehicle Card Selection State (inline style pattern)
```typescript
// Consistent with TripTypeTabs copper-border selected pattern
const cardStyle = {
  border: isSelected
    ? '2px solid var(--copper)'
    : '1px solid var(--anthracite-light)',
  background: isSelected ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
  transition: 'border-color 0.2s ease, background-color 0.2s ease',
  borderRadius: 4,
  padding: 24,
  cursor: 'pointer',
}
```

### PriceSummary Price Cross-Fade
```typescript
// 150ms opacity transition when vehicleClass changes
// Achieved by key-ing the price span on vehicleClass
<span
  key={vehicleClass}
  style={{
    animation: 'fadeIn 0.15s ease forwards',
    // fadeIn keyframe already in globals.css
  }}
>
  {price ? `€${price.total}` : '—'}
</span>
```

### API Route Response Shape
```typescript
// Return type from /api/calculate-price
interface PriceResponse {
  prices: Record<VehicleClass, PriceBreakdown> | null
  distanceKm: number | null
  quoteMode: boolean
}
```

### Step 2 Validation (Continue button gate)
```typescript
// Step 2 is valid when:
const step2Valid =
  pickupDate !== null &&
  pickupTime !== null &&
  (tripType !== 'daily' || returnDate !== null)
```

### Step 3 Validation (Continue button gate)
```typescript
// Step 3 is valid when a vehicle class is selected
// (quoteMode does not block proceeding)
const step3Valid = vehicleClass !== null
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-day-picker v8 (`ClassNames` string map) | v9 (`modifiersStyles` + `modifiersClassNames`) | 2024 (v9.0) | Different prop API; v8 tutorials are wrong for v9 |
| Google Maps JS SDK server-side | Direct `fetch()` to Routes API v2 REST endpoint | Routes API v2 GA (2023) | Cleaner server code; no browser SDK overhead; `X-Goog-Api-Key` header auth |
| `google.maps.DistanceMatrixService` | Routes API v2 `computeRoutes` | Routes API v2 (2023) | Distance Matrix API is legacy; Routes API preferred for new projects |

**Deprecated/outdated:**
- `google.maps.DistanceMatrixService` (Distance Matrix API): deprecated in favour of Routes API. Do not use.
- react-day-picker v8 `ClassNames` string-based API: replaced by v9's modifier-based API.

---

## Open Questions

1. **Exact vehicle photos path and format**
   - What we know: cards need `aspect-ratio: 16/9` vehicle photos
   - What's unclear: where the 3 vehicle images live (not yet in codebase — `public/` is empty)
   - Recommendation: Create `prestigo/public/vehicles/business.jpg`, `first-class.jpg`, `business-van.jpg` as a Wave 0 task. Placeholder grey boxes acceptable until images are provided.

2. **BookingWizard Continue button disabled state wiring**
   - What we know: wizard shell owns the generic button bar for steps 2–6; steps own their validation logic
   - What's unclear: exact mechanism — prop callback vs Zustand flag — for steps to gate the Continue button
   - Recommendation: Add `step2Valid` and `step3Valid` boolean actions to Zustand store. BookingWizard reads these to set `disabled` on the Continue button. Simpler than prop drilling; consistent with existing store-driven patterns.

3. **Rate table values (actual pricing)**
   - What we know: formula is defined (distance × rate_per_km per class); rate values are placeholder in research
   - What's unclear: actual business rates for the Prestigo service
   - Recommendation: Define placeholder rates in `lib/pricing.ts` with a prominent `// TODO: set production rates` comment. Wave 0 task or handled by product owner.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run --reporter=verbose` |
| Full suite command | `cd prestigo && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEP2-01 | Calendar disables past dates | unit | `npx vitest run tests/Step2DateTime.test.tsx -t "past dates"` | ❌ Wave 0 |
| STEP2-02 | 96 time slots generated at 15-min intervals | unit | `npx vitest run tests/Step2DateTime.test.tsx -t "time slots"` | ❌ Wave 0 |
| STEP2-03 | Return date shown for Daily Hire only | unit | `npx vitest run tests/Step2DateTime.test.tsx -t "return date"` | ❌ Wave 0 |
| STEP3-01 | Three vehicle cards rendered | unit | `npx vitest run tests/Step3Vehicle.test.tsx -t "three cards"` | ❌ Wave 0 |
| STEP3-03 | Price fetched and displayed on Step 3 mount | unit (mocked fetch) | `npx vitest run tests/Step3Vehicle.test.tsx -t "price fetch"` | ❌ Wave 0 |
| STEP3-04 | PriceSummary updates on vehicle class change | unit | `npx vitest run tests/PriceSummary.test.tsx` | ❌ Wave 0 |
| STEP3-05 | Quote mode shows fallback on all cards | unit (mocked fetch) | `npx vitest run tests/Step3Vehicle.test.tsx -t "quote mode"` | ❌ Wave 0 |
| PRICE-01 | API route returns prices for all 3 classes | unit (route handler) | `npx vitest run tests/calculate-price.test.ts` | ❌ Wave 0 |
| PRICE-02 | Transfer price = distanceKm × ratePerKm | unit | `npx vitest run tests/pricing.test.ts -t "transfer"` | ❌ Wave 0 |
| PRICE-03 | Hourly price = hours × hourlyRate | unit | `npx vitest run tests/pricing.test.ts -t "hourly"` | ❌ Wave 0 |
| PRICE-04 | Daily price = days × dailyRate | unit | `npx vitest run tests/pricing.test.ts -t "daily"` | ❌ Wave 0 |
| PRICE-06 | API key not in client bundle | manual/build | `grep -r "NEXT_PUBLIC_GOOGLE" prestigo/app prestigo/components` | manual |

### Sampling Rate
- **Per task commit:** `cd prestigo && npx vitest run`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `prestigo/tests/Step2DateTime.test.tsx` — covers STEP2-01, STEP2-02, STEP2-03
- [ ] `prestigo/tests/Step3Vehicle.test.tsx` — covers STEP3-01, STEP3-03, STEP3-05
- [ ] `prestigo/tests/PriceSummary.test.tsx` — covers STEP3-04
- [ ] `prestigo/tests/pricing.test.ts` — covers PRICE-02, PRICE-03, PRICE-04
- [ ] `prestigo/tests/calculate-price.test.ts` — covers PRICE-01 (route handler unit test)
- [ ] `prestigo/public/vehicles/` directory with 3 placeholder vehicle images — needed by Step3 before render tests pass

---

## Sources

### Primary (HIGH confidence)
- react-day-picker npm registry — verified version 9.14.0, confirmed `{ latest: '9.14.0' }`
- `prestigo/package.json` — confirmed installed versions: zustand 5.0.12, next 16.1.7, vitest 4.1.1
- `prestigo/app/globals.css` — CSS tokens, existing keyframes, button classes, scrollbar styles
- `prestigo/types/booking.ts` — VehicleClass, PriceBreakdown, BookingStore shape confirmed
- `prestigo/lib/booking-store.ts` — partialize pattern, sessionStorage persist, completedSteps Set serialization confirmed
- `prestigo/components/booking/BookingWizard.tsx` — StepStub pattern, generic button bar for steps 2–6 confirmed
- `.planning/phases/02-pricing-vehicle-selection/02-CONTEXT.md` — locked decisions
- `.planning/phases/02-pricing-vehicle-selection/02-UI-SPEC.md` — visual contract (typography, colors, spacing, animation)
- `.planning/research/PITFALLS.md` — PRICE-06 API key exposure pattern
- `.planning/research/ARCHITECTURE.md` — API route shape, data flow, component file locations
- Google Routes API v2 REST endpoint: `https://routes.googleapis.com/directions/v2:computeRoutes`

### Secondary (MEDIUM confidence)
- Google Routes API `X-Goog-Api-Key` header auth pattern — documented in official Google Cloud REST auth docs
- react-day-picker v9 `modifiersStyles` and `disabled` prop API — confirmed against npm package version

### Tertiary (LOW confidence)
- Placeholder rate-per-km values in pricing examples — fictional; actual business rates to be confirmed by product owner

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against npm registry and package.json
- Architecture: HIGH — all patterns derived from existing codebase + official API docs
- Pitfalls: HIGH — most derived from existing PITFALLS.md + direct code inspection
- Rate table values: LOW — placeholder values only; actual rates not in any project file

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable stack; react-day-picker minor updates unlikely to break API)
