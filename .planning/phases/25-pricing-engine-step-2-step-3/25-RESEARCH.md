# Phase 25: Pricing Engine + Step 2 & Step 3 — Research

**Researched:** 2026-04-04
**Domain:** React/Next.js booking wizard UI — return datetime collection, pricing calculation, quoteMode guard
**Confidence:** HIGH

---

## Summary

Phase 24 delivered more than originally planned: the `calculate-price` API already returns `roundTripPrices` and `returnDiscountPercent`, VehicleCard already renders "One Way" and "Round Trip" price buttons simultaneously, and the Zustand store already holds `roundTripPriceBreakdown`, `returnDiscountPercent`, and `returnTime`. The foundation is solid.

Phase 25 scope is narrow and surgical: (1) add return time picker in Step 2 for round_trip sessions with datetime-ordering validation, (2) evolve VehicleCard and PriceSummary to show the three-line breakdown (outbound / discounted return / combined total) when tripType is round_trip, (3) make the API compute the return leg's night/holiday coefficient from returnDate+returnTime rather than pickupDate+pickupTime, (4) strip extras from the return leg price, and (5) disable the Round Trip option in Step 1 TripTypeTabs when quoteMode is true with an explanatory message.

The key architectural constraint is that the API must not make a second Google Routes call for the return leg — it reuses distanceKm from the outbound call. The current API already does this correctly. What it does NOT yet do is accept returnTime and apply night/holiday coefficients for the return leg independently — that is the primary server-side change in this phase.

**Primary recommendation:** Extend the API to accept `returnTime` and compute return-leg coefficients from `returnDate + returnTime`; update the response shape to expose per-leg breakdown; update Step 2 UI to collect `returnTime`; update VehicleCard and PriceSummary to render the three-line display; add quoteMode guard to TripTypeTabs.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RTFR-02 | When Round Trip is selected, Step 2 collects return date and time; return datetime must be after outbound pickup datetime (inline error, blocks progression) | Step 2 already renders return date for `daily` mode using the same DayPicker+TimeSlot pattern; returnTime already exists in store via setReturnTime. Pattern is copy/extend of existing pickup date+time pickers with cross-field validation. |
| RTFR-03 | When Round Trip is selected and route is in quoteMode, Round Trip option in Step 1 is disabled and a message directs client to request a quote | TripTypeTabs renders from TRIP_TYPES array; adding a `disabled` prop per entry plus a conditional message below the tabs is low-risk. quoteMode is already in the store. |
| RTFR-04 | Step 3 shows outbound price, discounted return price with discount % badge, and combined total per vehicle class; vehicle selection updates all three live | VehicleCard already renders two price buttons. The Round Trip button currently shows `roundTripPrice.total` which is already the combined (outbound × 2 × discount). The card needs restructuring: when tripType is round_trip, replace the two-button layout with a single selected-state card showing the three-line breakdown. |
| RTPR-01 | Return leg uses same route distance as outbound; night/holiday coefficients computed independently from return date and time | API currently computes roundTripPrices using `b.total * 2 * (1 - discountPct/100)` — no separate coefficient. Must extend to: (a) accept returnTime in request body, (b) call isNightTime(returnTime) and isHolidayDate(returnDate) separately, (c) compute return-leg adjusted price from `distanceKm * ratePerKm` with return-leg coefficient, then apply discount. |
| RTPR-02 | Return leg price reduced by operator-configured return_discount_pct before display and charge; displayed discount % matches charged amount | Already implemented: `return_discount_percent` in Supabase, fetched via `getPricingConfig()`, returned in API response as `returnDiscountPercent`. Display in VehicleCard badge already shows the value. No new plumbing needed. |
| RTPR-03 | Extras (child seat, meet & greet, extra luggage) apply to outbound leg only — return leg does not duplicate extras | Current roundTripPrices computation uses `b.total * 2` where `b` is the adjusted one-way price (no extras in base price; extras are added client-side in PriceSummary). The API return leg price must be computed purely from base (no extras), which is already the case. Client display of combined total in PriceSummary needs to add extras to outbound only, not to return. |
</phase_requirements>

---

## What Phase 24 Already Delivered (Do Not Re-implement)

This section is critical. Reading the code confirms these are ALREADY in production:

| Already Built | Location | State |
|--------------|----------|-------|
| `roundTripPrices` in API response | `calculate-price/route.ts` line 175-180 | Returns `{ base, extras:0, total, currency }` per vehicle class — combined total |
| `returnDiscountPercent` in API response | `calculate-price/route.ts` line 181 | Reads from `rates.globals.returnDiscountPercent` |
| `roundTripPriceBreakdown` in Zustand store | `booking-store.ts` line 23 | Field exists, set via `setRoundTripPriceBreakdown` |
| `returnDiscountPercent` in Zustand store | `booking-store.ts` line 24 | Default 10, updated from API |
| `returnTime` in Zustand store | `booking-store.ts` line 19 | Field + `setReturnTime` action, persisted via partialize |
| VehicleCard two-button layout | `VehicleCard.tsx` lines 120-169 | "One Way" + "Round Trip" buttons rendered side by side |
| quoteMode → "Request a quote" in VehicleCard | `VehicleCard.tsx` line 108-117 | Single quote button shown |
| `setTripType('round_trip')` wired to VehicleCard | `Step3Vehicle.tsx` line 127-128 | `onSelectRoundTrip` fires correctly |
| returnDate guard in canProceed case 3 | `BookingWizard.tsx` line 59 | Already: `vehicleClass !== null && (tripType !== 'round_trip' \|\| returnDate !== null)` |
| Return date picker in Step 3 | `Step3Vehicle.tsx` lines 156-180 | DayPicker shown below grid when round_trip selected |

---

## What Phase 25 Needs to Build

### 1. API: Return-leg independent coefficient (RTPR-01)

**Current behavior:** `roundTripPrices` is computed as `b.total * 2 * (1 - discountPct/100)` where `b.total` is the outbound adjusted price (which already includes night/holiday coefficient from pickupDate+pickupTime). This means the return leg implicitly inherits the outbound coefficient.

**Required behavior:** Return leg must apply its own night/holiday coefficient from `returnDate` + `returnTime`.

**Required API change:**
- Accept `returnTime: string | null` in request body (alongside existing `returnDate`)
- Compute `isReturnNight = isNightTime(returnTime)` and `isReturnHoliday = isHolidayDate(returnDate, rates.globals.holidayDates)`
- Compute `returnLegBase` per vehicle class = `distanceKm * ratePerKm[vc]` (raw, no extras)
- Apply return-leg coefficient via `applyGlobals` with `isReturnNight` and `isReturnHoliday`
- Apply discount: `returnLegTotal = Math.round(returnLegBase * (1 - discountPct/100))`
- Response shape change: instead of a flat `roundTripPrices` (which was combined outbound+return), expose:
  - `outboundPrices` — same as current `prices` (one-way with outbound coefficients)
  - `returnLegPrices` — per-vehicle return leg price after coefficient + discount (before extras)
  - `returnDiscountPercent` — unchanged
  - Keep `prices` for one-way display

**New response shape (per vehicle class within `returnLegPrices`):**
```typescript
{ base: number, extras: 0, total: number, currency: 'EUR' }
// total = returnLegBase after coefficient, after discount, before extras
```

**Important:** The current `roundTripPrices` (combined total = outbound + discounted return) is no longer the right shape — Step 3 now needs to show three separate numbers. The combined total can be computed client-side: `outbound.total + returnLeg.total` (extras added to outbound only in PriceSummary).

### 2. Store: Add `returnLegPriceBreakdown` (or repurpose `roundTripPriceBreakdown`)

**Options:**
- Option A: Rename/repurpose `roundTripPriceBreakdown` to hold `returnLegPrices` (per-vehicle return leg price after coefficient and discount). This is cleaner — fewer store fields.
- Option B: Add `returnLegPriceBreakdown` alongside existing `roundTripPriceBreakdown`.

**Recommendation:** Option A — repurpose `roundTripPriceBreakdown` to be the per-vehicle **return leg price** (coefficient + discount applied, no extras). The combined total is computed at display time. This avoids adding a new store field for what is essentially a rename. Update the API to populate this field from `returnLegPrices` instead of the old combined-total format.

**Step3Vehicle.tsx** currently sets: `setRoundTripPriceBreakdown(data.roundTripPrices ?? null)` — will change to `setRoundTripPriceBreakdown(data.returnLegPrices ?? null)`.

### 3. Step 2: Return time picker for round_trip (RTFR-02)

**Current Step2DateTime.tsx** renders:
- Pickup date picker (always)
- Return date picker (only when `tripType === 'daily'`)
- Pickup time list (right column)

**Required:** When `tripType === 'round_trip'`, also show:
- Return date picker (already there for daily, extend to `tripType === 'round_trip'`)
- Return time picker (new — same TimeSlotItem list pattern as pickup time)
- Inline validation: if `returnDate + returnTime <= pickupDate + pickupTime`, show error and prevent canProceed

**Layout considerations:**
- The current two-column layout (60% calendar / 40% time) works for one pair. For round_trip, two date pickers + two time pickers need to fit.
- Recommended layout: stack vertically — pickup section (date + time as existing), then a divider, then return section (date + time same pattern). This is consistent with mobile-first and avoids a complex 4-column grid.

**canProceed gate update in BookingWizard.tsx:**
- Current case 2: `pickupDate !== null && pickupTime !== null && (tripType !== 'daily' || returnDate !== null)`
- New case 2: add `(tripType !== 'round_trip' || (returnDate !== null && returnTime !== null && !isReturnBeforePickup))`
- `isReturnBeforePickup` logic: compare `${returnDate}T${returnTime}` vs `${pickupDate}T${pickupTime}` as ISO strings

**Inline error pattern:** The existing codebase does not have an established inline validation error component. Use a `<p>` with `color: var(--warmgrey)` or a dedicated error style (e.g., copper/red text). Check STYLEGUIDE.md for error color; if absent, use inline style with a warning color consistent with the design system.

### 4. Step 3: Combined price display in VehicleCard (RTFR-04)

**Current VehicleCard layout (non-quoteMode):**
- "One Way" button showing `price.total`
- "Round Trip" button showing `roundTripPrice.total` (currently the combined total)

**Required for RTFR-04:** When tripType is `round_trip` (i.e., user has already selected round trip from Step 1), the card should shift to a "combined breakdown" display rather than two competing buttons. The three-line breakdown is:
```
Outbound:        €X
Return (−N%):    €Y
Combined total:  €Z
```

**Design decision:** The card currently shows two independent price buttons so the user can pick One Way or Round Trip. After the user has committed to round_trip in Step 1, Step 3 is just vehicle selection — not trip type selection. The card should reflect this by showing a single "combined price" section with the breakdown, rather than prompting a choice.

**Implementation approach:** In VehicleCard, add a `isRoundTripMode` prop (derived from `tripType === 'round_trip'` in Step3Vehicle). When true:
- Hide the two-button layout
- Show a single card body section with the three-line breakdown
- The "One Way" and "Round Trip" buttons remain only when tripType is NOT round_trip (backward compatible for the switcher behavior from Phase 24)

**Math for combined total display:**
```
outboundTotal = priceBreakdown[vc].total  // from API, includes outbound coefficient
returnLegTotal = roundTripPriceBreakdown[vc].total  // return leg: coefficient + discount
combinedTotal = outboundTotal + returnLegTotal
```
Extras are NOT included in these prices (they're added separately in PriceSummary/Step6).

### 5. Step 1: quoteMode disables Round Trip tab (RTFR-03)

**Current TripTypeTabs.tsx:** Renders from a `TRIP_TYPES` array. All tabs are always clickable.

**Required:** When `quoteMode === true` (set by API on Step 3 mount), the ROUND TRIP tab should be disabled and visually muted. A message below the tabs explains why.

**Implementation:** TripTypeTabs needs to accept a `disabledTypes?: TripType[]` prop (or read quoteMode from store directly). Step1TripType reads quoteMode from store and passes it. When a tab is disabled, apply `cursor: not-allowed`, reduced opacity, prevent `setTripType` on click, and show the inline message.

**Message:** "Round trip is not available for this route. Please request a quote for both legs separately."

**Timing concern:** quoteMode is set when Step 3 fetches prices. If a user goes back to Step 1 after Step 3, quoteMode is already in the store. This is the correct behavior — the round trip restriction persists as long as the route is in quoteMode.

### 6. PriceSummary: Update for round_trip (RTFR-04 support)

**Current PriceSummary** reads `priceBreakdown[vehicleClass].total + extrasTotal` and shows a single price. For round_trip, it should show:
```
Outbound:     €X + extras
Return:       €Y (−N%)
Total:        €Z
```

**Scope:** PriceSummary is shown in Step 3 (desktop sticky panel + mobile bottom bar). Both variants need updating for round_trip. The mobile bar is constrained to 56px height — may need to only show combined total and a "details" implied by the format.

---

## Architecture Patterns

### Pricing Computation Flow (After Phase 25)

```
Client (Step3Vehicle fetchPrice)
  → POST /api/calculate-price {origin, destination, tripType:'transfer',
                               pickupDate, pickupTime,
                               returnDate, returnTime}   ← NEW: returnTime added
  ← { prices: outboundPrices,        ← one-way per-vehicle
      returnLegPrices: {...},         ← NEW: return leg per-vehicle (coeff+discount)
      returnDiscountPercent: N,
      distanceKm: K,
      quoteMode: false }

Client store:
  priceBreakdown       = outboundPrices
  roundTripPriceBreakdown = returnLegPrices   ← repurposed meaning
  returnDiscountPercent = N
```

### Return Leg Price Calculation (API server-side)

```typescript
// Reuse distanceKm from outbound Google API call (no second API call)
const returnLegBase = buildPriceMap('transfer', distanceKm, 0, 0, rates)
const isReturnNight = isNightTime(returnTime)   // returnTime from request body
const isReturnHoliday = isHolidayDate(returnDate, rates.globals.holidayDates)
const returnLegAdjusted = applyGlobals(returnLegBase, rates.globals, airportFlag,
                                       isReturnNight, isReturnHoliday, rates.minFare)
const returnLegPrices = Object.fromEntries(
  Object.entries(returnLegAdjusted).map(([vc, b]) => {
    const total = Math.round(b.base * (1 - discountPct / 100))
    return [vc, { base: total, extras: 0, total, currency: b.currency }]
  })
)
// Note: extras NOT added — extras apply outbound only (RTPR-03)
```

### Datetime Ordering Validation (Step 2, client-side)

```typescript
// ISO string comparison works correctly for YYYY-MM-DDTHH:MM
function isReturnBeforePickup(
  returnDate: string | null,
  returnTime: string | null,
  pickupDate: string | null,
  pickupTime: string | null
): boolean {
  if (!returnDate || !returnTime || !pickupDate || !pickupTime) return false
  return `${returnDate}T${returnTime}` <= `${pickupDate}T${pickupTime}`
}
```

### canProceed Case 2 Update (BookingWizard)

```typescript
case 2:
  const returnBeforePickup = tripType === 'round_trip'
    ? isReturnBeforePickup(returnDate, returnTime, pickupDate, pickupTime)
    : false
  return (
    pickupDate !== null &&
    pickupTime !== null &&
    (tripType !== 'daily' || returnDate !== null) &&
    (tripType !== 'round_trip' || (
      returnDate !== null &&
      returnTime !== null &&
      !returnBeforePickup
    ))
  )
```

### Step 2 Layout for Round Trip

```
[PICKUP DATE label]
[DayPicker — pickup]

[PICKUP TIME label]
[TimeSlotItem list — pickup]

--- separator (when tripType === 'round_trip') ---

[RETURN DATE label]
[DayPicker — return, disabled before pickupDate]

[RETURN TIME label]
[TimeSlotItem list — return]

[inline error if return <= pickup]
```

The existing two-column (60/40) layout works for pickup. The return section stacks below as a full-width section, or reuses the two-column layout. Either approach is acceptable — full-width stacking is simpler and avoids layout complexity on mobile.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Time slot rendering | Custom time input | Existing `TimeSlotItem` + `TIME_SLOTS` from Step2DateTime.tsx — copy the pattern |
| Date picker | Custom calendar | Existing `DayPicker` from `react-day-picker` with existing `calendarStyles` and `modifiersStyles` — copy from Step2DateTime.tsx |
| Night/holiday detection | New utility | Existing `isNightTime()` and `isHolidayDate()` and `applyGlobals()` in `calculate-price/route.ts` — reuse for return leg |
| ISO string comparison | Custom date lib | `${date}T${time}` string comparison — works correctly for YYYY-MM-DD + HH:MM format |
| Store state | New state shape | Repurpose `roundTripPriceBreakdown` — already exists with correct type |

---

## Common Pitfalls

### Pitfall 1: API Returns Combined Total, Not Per-Leg
**What goes wrong:** The current `roundTripPrices` in the API is a combined total (`outbound × 2 × discount`). VehicleCard currently shows this as the "Round Trip" price. Phase 25 requires showing three separate numbers: outbound, return leg, combined. Using the old combined value as "return leg price" would produce incorrect math.
**How to avoid:** Change API to return `returnLegPrices` (return leg only, after coefficient + discount) and rename accordingly. Combined total is computed client-side as `outbound.total + returnLeg.total`.

### Pitfall 2: quoteMode Arrives AFTER Step 3 Mount
**What goes wrong:** quoteMode is set by the calculate-price API response. If the user selects Round Trip in Step 1 and navigates directly to Step 3, quoteMode is null/false until the fetch completes. The ROUND TRIP tab disable in Step 1 is only useful after the user has visited Step 3 and returned. This is expected behavior — document it explicitly.
**How to avoid:** No special handling needed; the existing store persistence covers this. Do NOT try to pre-fetch quoteMode in Step 1.

### Pitfall 3: Return Time Picker Blocks canProceed Before User Engages
**What goes wrong:** If canProceed requires `returnTime !== null` immediately when round_trip is selected, users who just switched to round_trip will see "Continue" greyed out with no visible indication of the return time field (if the user hasn't scrolled down yet on mobile).
**How to avoid:** Show a clear visual section for return date + time in Step 2 before checking canProceed. The required fields are: returnDate (already guarded in canProceed case 2 from Phase 24) plus returnTime (new). Both must be non-null and ordered correctly.

### Pitfall 4: Step 2 returnDate Picker Currently Allows Same Day as Pickup
**What goes wrong:** Current `returnDateMin` for round_trip is set to `pickupDate` (not `pickupDate + 1 day`). For round trips, the return can legitimately be same-day (a same-day return is valid for a round trip). The validation should be time-based (return datetime > pickup datetime), not date-based.
**How to avoid:** Keep `disabled={{ before: pickupDateObj }}` for the return DayPicker (same-day is allowed), but validate the combined datetime ordering: `${returnDate}T${returnTime} > ${pickupDate}T${pickupTime}`.

### Pitfall 5: Extras Not Added in Return Leg — But PriceSummary Currently Adds Them to `priceBreakdown[vc].total`
**What goes wrong:** `PriceSummary.tsx` computes `totalEur = selectedPrice.base + extrasTotal`. `selectedPrice` comes from `priceBreakdown[vehicleClass]` (one-way price). For round_trip, the summary must show: outbound (with extras) + return leg (no extras) = combined total.
**How to avoid:** For round_trip, PriceSummary computes: `outboundWithExtras = priceBreakdown[vc].total + extrasTotal`, `returnLeg = roundTripPriceBreakdown[vc].total`, `combinedTotal = outboundWithExtras + returnLeg`. The existing `totalEur = selectedPrice.base + extrasTotal` is wrong for round_trip.

### Pitfall 6: `applyGlobals` Also Adds Airport Fee to Return Leg
**What goes wrong:** `applyGlobals` adds `globals.airportFee` when `isAirport === true`. For the return leg of an airport transfer, the return journey also starts/ends at the airport, so the fee is correctly applied. This is the right behavior — do not suppress airportFee for return leg.
**How to avoid:** No change needed; `airportFlag` applies to both legs symmetrically. Document this decision.

### Pitfall 7: Stale canProceed if returnTime is Added to Store but Not Checked
**What goes wrong:** Phase 24 explicitly deferred the `returnTime` guard in canProceed. If Phase 25 adds returnTime to canProceed but the Step 2 UI doesn't show a return time picker for round_trip, users are permanently blocked.
**How to avoid:** Add returnTime guard to canProceed ONLY after the return time picker UI is implemented in Step 2. Both must ship in the same plan.

---

## Code Examples

### Existing TimeSlotItem Pattern (copy for return time)
```typescript
// Source: prestigo/components/booking/steps/Step2DateTime.tsx
// TIME_SLOTS generates 288 slots at 5-minute increments
const TIME_SLOTS: string[] = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i / 12).toString().padStart(2, '0')
  const m = ((i % 12) * 5).toString().padStart(2, '0')
  return `${h}:${m}`
})
// TimeSlotItem component uses useRef + scrollIntoView for auto-scroll to selected slot
// Pattern: role="listbox" on <ul>, role="option" aria-selected on each <li>
```

### Existing Return Leg Discount Computation (API, current)
```typescript
// Source: prestigo/app/api/calculate-price/route.ts lines 174-181
const discountPct = rates.globals.returnDiscountPercent
const roundTripPrices = Object.fromEntries(
  Object.entries(adjusted).map(([vc, b]) => {
    const total = Math.round(b.total * 2 * (1 - discountPct / 100))
    return [vc, { base: total, extras: 0, total, currency: b.currency }]
  })
)
// PHASE 25 CHANGES: remove the × 2 (that was combined total logic)
// and apply return-leg coefficient before discounting
```

### Existing applyGlobals Signature (reuse for return leg)
```typescript
// Source: prestigo/app/api/calculate-price/route.ts
export function applyGlobals(
  prices: Record<string, { base: number; extras: number; total: number; currency: string }>,
  globals: PricingGlobals,
  isAirport: boolean,
  isNight: boolean,      // ← pass isNightTime(returnTime) for return leg
  isHoliday: boolean,    // ← pass isHolidayDate(returnDate, ...) for return leg
  minFare: Record<string, number>,
): Record<string, { base: number; extras: number; total: number; currency: string }>
```

### Existing canProceed Pattern (BookingWizard)
```typescript
// Source: prestigo/components/booking/BookingWizard.tsx
// Current case 2:
case 2:
  return (
    pickupDate !== null &&
    pickupTime !== null &&
    (tripType !== 'daily' || returnDate !== null)
  )
// canProceed is re-evaluated reactively via useBookingStore selectors at top of component
```

### TripTypeTabs Disable Pattern (to implement)
```typescript
// Source: prestigo/components/booking/TripTypeTabs.tsx
// Current: all tabs always clickable via onClick={() => setTripType(t.value)}
// Pattern to add: disable specific entries
const isDisabled = (value: TripType) => disabledTypes?.includes(value) ?? false
// In render: onClick should no-op if disabled; add opacity:0.4 + cursor:'not-allowed'
```

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 25 |
|--------------|------------------|---------------------|
| `roundTripPrices` = combined (outbound + discounted return) | Must change to `returnLegPrices` = return leg only (after coefficient + discount) | API response shape needs renaming + return-leg coefficient logic |
| Return date shown in Step 3 for round_trip | Migrate return date collection to Step 2; Step 3 return date picker becomes redundant | Step 3 DayPicker for round_trip return date (lines 156-180 of Step3Vehicle.tsx) should be removed in Phase 25 |
| VehicleCard two buttons (One Way / Round Trip) | When tripType=round_trip, show three-line combined breakdown instead | Card layout needs conditional rendering |

---

## Key Files to Modify (Phase 25)

| File | Change |
|------|--------|
| `prestigo/app/api/calculate-price/route.ts` | Accept `returnTime` in body; compute return-leg coefficient independently; rename `roundTripPrices` to `returnLegPrices` |
| `prestigo/components/booking/steps/Step2DateTime.tsx` | Add return date + time pickers for `tripType === 'round_trip'`; datetime ordering validation |
| `prestigo/components/booking/BookingWizard.tsx` | Update canProceed case 2 to require returnTime + ordering check for round_trip |
| `prestigo/components/booking/steps/Step3Vehicle.tsx` | Update to send `returnTime` in API call; update field name from `roundTripPrices` to `returnLegPrices`; remove redundant return date picker |
| `prestigo/components/booking/VehicleCard.tsx` | Add three-line combined breakdown display for round_trip mode |
| `prestigo/components/booking/PriceSummary.tsx` | Update price display for round_trip (outbound+extras, return, combined) |
| `prestigo/components/booking/TripTypeTabs.tsx` | Accept disabled types; disable ROUND TRIP when quoteMode |
| `prestigo/components/booking/steps/Step1TripType.tsx` | Pass quoteMode to TripTypeTabs; show message when round_trip disabled |
| `prestigo/tests/calculate-price.test.ts` | Add tests for return-leg coefficient logic |
| `prestigo/tests/Step2DateTime.test.tsx` | Replace todos with real tests for round_trip return time UI |
| `prestigo/tests/Step3Vehicle.test.tsx` | Add tests for three-line price display |
| `prestigo/tests/TripTypeTabs.test.tsx` | Add test for disabled round_trip in quoteMode |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run --reporter=verbose 2>&1 \| tail -30` |
| Full suite command | `cd prestigo && npx vitest run 2>&1 \| tail -50` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RTFR-02 | Step 2 shows return date+time pickers for round_trip | unit (component) | `cd prestigo && npx vitest run tests/Step2DateTime.test.tsx` | ✅ (todos only) |
| RTFR-02 | Return datetime before outbound shows inline error + blocks canProceed | unit (store logic) | `cd prestigo && npx vitest run tests/booking-store.test.ts` | ✅ |
| RTFR-03 | ROUND TRIP tab disabled when quoteMode=true | unit (component) | `cd prestigo && npx vitest run tests/TripTypeTabs.test.tsx` | ✅ |
| RTFR-04 | VehicleCard shows 3-line breakdown in round_trip mode | unit (component) | `cd prestigo && npx vitest run tests/Step3Vehicle.test.tsx` | ✅ (todos only) |
| RTPR-01 | Return leg coefficient uses returnDate+returnTime, not pickupDate+pickupTime | unit (pricing logic) | `cd prestigo && npx vitest run tests/pricing.test.ts` | ✅ |
| RTPR-02 | Return leg price uses returnDiscountPercent from API | unit (pricing logic) | `cd prestigo && npx vitest run tests/pricing.test.ts` | ✅ |
| RTPR-03 | Return leg price does not include extras | unit (pricing logic) | `cd prestigo && npx vitest run tests/pricing.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `cd prestigo && npx vitest run --reporter=verbose 2>&1 | tail -30`
- **Per wave merge:** `cd prestigo && npx vitest run 2>&1 | tail -50`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
All test files exist. The following test files have `it.todo` stubs that need real implementations:
- [ ] `prestigo/tests/Step2DateTime.test.tsx` — round_trip return time pickers (all current tests are todos)
- [ ] `prestigo/tests/Step3Vehicle.test.tsx` — three-line breakdown display (all current tests are todos)

No framework install needed — Vitest already configured.

---

## Open Questions

1. **Remove Step 3 return date picker?**
   - What we know: Step3Vehicle.tsx has a DayPicker below the vehicle grid for round_trip return date (lines 156-180). Phase 25 moves return date collection to Step 2.
   - What's unclear: Should the Step 3 return date picker be removed entirely, or kept as a secondary fallback?
   - Recommendation: Remove it. Having date collection in two steps is confusing UX. BookingWizard canProceed case 2 now enforces returnDate before the user reaches Step 3.

2. **VehicleCard two-button layout — remove when tripType is round_trip?**
   - What we know: When tripType is round_trip, the user has already committed to round_trip. The two-button (one-way vs round-trip) choice is irrelevant.
   - Recommendation: When `tripType === 'round_trip'`, show only the three-line combined breakdown. When `tripType !== 'round_trip'`, show two buttons as before (backward compatible). Use a `isRoundTripMode` prop derived from tripType in Step3Vehicle.

3. **PriceSummary mobile bar height constraint**
   - What we know: Mobile bar is fixed at 56px. Three-line breakdown doesn't fit.
   - Recommendation: Show only combined total in mobile bar (`€X combined`). Full breakdown is in the desktop sticky panel only.

---

## Sources

### Primary (HIGH confidence)
- Direct code reading of all relevant files (paths listed below) — current as of Phase 24 completion 2026-04-04
  - `prestigo/app/api/calculate-price/route.ts`
  - `prestigo/lib/pricing.ts`, `prestigo/lib/pricing-config.ts`
  - `prestigo/lib/booking-store.ts`, `prestigo/types/booking.ts`
  - `prestigo/components/booking/steps/Step2DateTime.tsx`
  - `prestigo/components/booking/steps/Step3Vehicle.tsx`
  - `prestigo/components/booking/VehicleCard.tsx`
  - `prestigo/components/booking/PriceSummary.tsx`
  - `prestigo/components/booking/BookingWizard.tsx`
  - `prestigo/lib/extras.ts`
  - `prestigo/tests/pricing.test.ts`
  - Phase 24 SUMMARY files (24-01, 24-02)

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — phase requirement definitions
- `.planning/STATE.md` — accumulated decisions and research flags
- `.planning/ROADMAP.md` — phase goal and success criteria

---

## Metadata

**Confidence breakdown:**
- What's already built vs what needs building: HIGH — confirmed by direct code reading
- API change shape (returnLegPrices): HIGH — follows existing applyGlobals + buildPriceMap patterns
- Step 2 return time UI: HIGH — exact same TimeSlotItem + DayPicker pattern already exists
- VehicleCard three-line breakdown: HIGH — existing card structure is extensible
- quoteMode guard in TripTypeTabs: HIGH — TRIP_TYPES array pattern is clear
- PriceSummary round_trip update: HIGH — math is straightforward, existing structure visible

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase, no external dependency changes needed)
