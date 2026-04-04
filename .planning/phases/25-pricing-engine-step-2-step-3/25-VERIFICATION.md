---
phase: 25-pricing-engine-step-2-step-3
verified: 2026-04-04T23:16:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 25: Pricing Engine + Step 2 + Step 3 Verification Report

**Phase Goal:** Clients can enter a return date and time in Step 2 and see outbound price, discounted return price, and combined total per vehicle class in Step 3; quoteMode prevents round-trip selection outside coverage zones
**Verified:** 2026-04-04T23:16:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When tripType is round_trip, Step 2 shows a return date picker and return time picker | VERIFIED | `(tripType === 'daily' \|\| tripType === 'round_trip')` gates the DayPicker in Step2DateTime.tsx line 228; `tripType === 'round_trip' && returnDate` gates the return time listbox at line 290 |
| 2 | When returnDate + returnTime is <= pickupDate + pickupTime, Step 2 shows an inline error and Continue is disabled | VERIFIED | `isReturnBeforeOrEqualPickup` helper + `role="alert"` paragraph at lines 319–334 of Step2DateTime.tsx; canProceed case 2 blocks at BookingWizard.tsx line 64 |
| 3 | API accepts returnTime, computes return-leg coefficients independently, returns returnLegPrices | VERIFIED | route.ts lines 74–84 destructure `returnTime`; lines 179–192 compute `returnLegPrices` using `isNightTime(returnTime)` and `isHolidayDate(returnDate, ...)` independently from outbound |
| 4 | Return leg price does not include extras; extras === 0 | VERIFIED | route.ts line 189: `return [vc, { base: discountedTotal, extras: 0, total: discountedTotal, currency: b.currency }]` |
| 5 | Step 3 sends returnTime in the API request body | VERIFIED | Step3Vehicle.tsx line 45: `returnTime: s.returnTime` in fetch body |
| 6 | VehicleCard shows three-line breakdown (Outbound / Return discount / Combined) when tripType === 'round_trip' | VERIFIED | VehicleCard.tsx lines 122–170: `isRoundTripMode && price && roundTripPrice && combinedTotal !== null` gates three-line layout; "Outbound", "Return", "Combined" labels present |
| 7 | PriceSummary shows three-line breakdown on desktop and combined total on mobile when round_trip | VERIFIED | PriceSummary.tsx lines 137–191: `isRoundTripMode && combinedTotal !== null && !quoteMode` gates desktop three-line; `priceDisplay()` returns `€${combinedTotal}` for mobile bar |
| 8 | When quoteMode === true, the ROUND TRIP tab in TripTypeTabs is disabled (inert, cursor:not-allowed, opacity:0.4) and an inline message appears | VERIFIED | TripTypeTabs.tsx lines 37, 46, 61–64, 84–98: `isRoundTripDisabled` blocks click, applies `cursor: 'not-allowed'` and `opacity: 0.4`; inline message rendered when `quoteMode && tripType === 'round_trip'` |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prestigo/components/booking/steps/Step2DateTime.tsx` | Return date + time pickers for round_trip; inline datetime ordering error | VERIFIED | Contains `tripType === 'round_trip'` (3 occurrences), `setReturnTime` (3 occurrences), `isReturnBeforeOrEqualPickup`, `role="alert"`, `aria-label="Return time"` |
| `prestigo/components/booking/BookingWizard.tsx` | canProceed case 2 enforces returnDate, returnTime, and returnDatetime > pickupDatetime for round_trip | VERIFIED | Lines 53–67: `basePass` check + round_trip guard with `returnDT <= pickupDT` comparison |
| `prestigo/tests/Step2DateTime.test.tsx` | 6 real tests for round_trip return time UI (STEP2-04 describe block) | VERIFIED | 6 passing tests in describe('STEP2-04'); 0 it.todo within that describe block |
| `prestigo/app/api/calculate-price/route.ts` | Extended POST handler: accepts returnTime, computes return-leg independently via applyGlobals, returns returnLegPrices | VERIFIED | Contains `returnTime` in destructure, `returnLegPrices` (11 occurrences), `roundTripPrices` (0 occurrences), `isNightTime(returnTime)`, `isHolidayDate(returnDate`, `extras: 0` |
| `prestigo/tests/calculate-price.test.ts` | 7 tests for return-leg independent coefficient logic | VERIFIED | 7 passing tests in `describe('round-trip return leg pricing (RTPR-01, RTPR-02, RTPR-03)')` |
| `prestigo/components/booking/steps/Step3Vehicle.tsx` | Sends returnTime to API; reads returnLegPrices from response; no return date picker | VERIFIED | Line 45 `returnTime: s.returnTime`; line 51 `setRoundTripPriceBreakdown(data.returnLegPrices ?? null)`; no DayPicker import or usage |
| `prestigo/components/booking/VehicleCard.tsx` | Three-line combined breakdown when isRoundTripMode | VERIFIED | Lines 122–170: isRoundTripMode gates three-line layout with "Outbound", "Return", "Combined" labels and `combinedTotal` computation |
| `prestigo/components/booking/TripTypeTabs.tsx` | quoteMode-aware disabled Round Trip tab + inline message | VERIFIED | Lines 37, 46, 61–64, 84–98: `isRoundTripDisabled` pattern; inline `<p>` when quoteMode && tripType === 'round_trip' |
| `prestigo/components/booking/PriceSummary.tsx` | Three-line breakdown desktop; combined total mobile | VERIFIED | Lines 137–191: three-line desktop block; `priceDisplay()` returns combined for mobile bar |
| `prestigo/components/booking/steps/Step1TripType.tsx` | Renders TripTypeTabs (no prop changes) | VERIFIED | Line 5: `import TripTypeTabs` present; TripTypeTabs used in JSX |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Step2DateTime.tsx | booking-store.ts | `setReturnTime`, `returnTime` selectors | WIRED | Lines 156, 160: `const returnTime = useBookingStore((s) => s.returnTime)` + `const setReturnTime = useBookingStore((s) => s.setReturnTime)` |
| BookingWizard.tsx | booking-store.ts | `returnTime` in canProceed case 2 | WIRED | Line 39: `const returnTime = useBookingStore((s) => s.returnTime)`; used in canProceed case 2 |
| calculate-price/route.ts | applyGlobals (same file) | `applyGlobals(returnBase, rates.globals, airportFlag, isNightTime(returnTime), isReturnHoliday, ...)` | WIRED | Line 184: exact pattern used for return leg |
| calculate-price/route.ts | buildPriceMap from @/lib/pricing | Second call `buildPriceMap('transfer', distanceKm, 0, 0, rates)` for return leg | WIRED | Line 183: reuses `distanceKm` — no second Google Routes call |
| Step3Vehicle.tsx | /api/calculate-price | POST body includes `returnTime: s.returnTime` | WIRED | Line 45 in fetch body |
| Step3Vehicle.tsx | booking-store.ts | `setRoundTripPriceBreakdown(data.returnLegPrices ?? null)` | WIRED | Line 51 |
| VehicleCard.tsx | tripType prop | `isRoundTripMode` prop gates three-line layout | WIRED | Line 14, 122: `isRoundTripMode` prop used to conditionally render three-line block |
| TripTypeTabs.tsx | booking-store.ts | `useBookingStore` selector for `quoteMode` | WIRED | Line 16: `const quoteMode = useBookingStore((s) => s.quoteMode)` |
| PriceSummary.tsx | booking-store.ts | `roundTripPriceBreakdown` read for combined total | WIRED | Lines 19, 50: selector + usage in `combinedTotal` computation |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RTFR-02 | 25-01 | Step 2 collects return date and time; return datetime must be after outbound pickup (inline error) | SATISFIED | Step2DateTime.tsx: return pickers conditional on `tripType === 'round_trip'`; `isReturnBeforeOrEqualPickup` + `role="alert"` + canProceed guard in BookingWizard.tsx |
| RTFR-03 | 25-03 | When quoteMode and outside coverage zones, Round Trip option disabled with message | SATISFIED | TripTypeTabs.tsx: `isRoundTripDisabled` = `tab.value === 'round_trip' && quoteMode`; blocks click, sets opacity/cursor; inline message rendered; quoteMode set by API when zone check fails (route.ts line 134) |
| RTFR-04 | 25-03 | Step 3 displays outbound price and discounted return price separately with %, plus combined total | SATISFIED | VehicleCard.tsx lines 122–170: three-line layout with `Outbound`, `Return` + `-{returnDiscountPercent}%` badge, `Combined` + `combinedTotal`; vehicle selection updates all three lines from store |
| RTPR-01 | 25-02 | Return leg uses same route distance; night/holiday coefficients computed independently from return date/time | SATISFIED | route.ts line 183: `buildPriceMap('transfer', distanceKm, 0, 0, rates)` reuses `distanceKm`; lines 180–181: `isReturnNight = isNightTime(returnTime)`, `isReturnHoliday = isHolidayDate(returnDate, ...)` — independent of pickup |
| RTPR-02 | 25-02 | Return leg price reduced by `return_discount_pct`; displayed % matches charged amount | SATISFIED | route.ts line 187: `Math.round(b.base * (1 - discountPct / 100))`; `returnDiscountPercent` returned in response and displayed in VehicleCard line 148 |
| RTPR-03 | 25-02 | Extras apply to outbound only; return leg extras === 0 | SATISFIED | route.ts line 189: `extras: 0` hardcoded in return leg entry |

All 6 requirement IDs from plan frontmatter are accounted for. No orphaned requirements for Phase 25 in REQUIREMENTS.md (traceability table maps RTPR-01–03, RTFR-03–04 to Phase 25 only).

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `prestigo/app/api/calculate-price/route.ts` | 95 | Error response missing `returnLegPrices` field: `{ prices: null, distanceKm: null, quoteMode: true }` | Warning | Only hit when `getPricingConfig()` throws (DB unreachable). Client code does `data.returnLegPrices ?? null` so no crash; functionally harmless |
| `prestigo/app/api/calculate-price/route.ts` | 197 | Catch-all error response missing `returnLegPrices` field: `{ prices: null, distanceKm: null, quoteMode: true }` | Warning | Only hit on unhandled exception in the POST handler. Same safe `?? null` fallback applies |

No blockers found. Two warnings in error-only paths only.

---

### Test Suite Results

All 6 test files pass:

| Test File | New Tests | Status |
|-----------|-----------|--------|
| `tests/Step2DateTime.test.tsx` | 6 (STEP2-04 describe) | 6/6 pass |
| `tests/BookingWizard.test.tsx` | 5 (WIZD-06 describe) | 5/5 pass |
| `tests/calculate-price.test.ts` | 7 (round-trip return leg pricing describe) | 7/7 pass |
| `tests/Step3Vehicle.test.tsx` | 6 (STEP3-RT describe) | 6/6 pass |
| `tests/TripTypeTabs.test.tsx` | 6 (TTABS-RT describe) | 6/6 pass |
| `tests/PriceSummary.test.tsx` | 4 (PSRT describe) | 4/4 pass |

**Total new tests: 34 pass. Overall suite: 42 pass, 10 skip, 47 todo (pre-existing stubs). 0 regressions.**

TypeScript errors: 0 in production source files. 18 pre-existing errors in test files only (`vi` globals, `currency` field in Step3Vehicle test fixtures — not introduced by this phase).

---

### Human Verification Required

The following behaviors are correct in code but require human confirmation in-browser:

**1. Step 2 return time listbox scroll-to-selected behavior**
- **Test:** Set a round_trip booking with a known return time (e.g., 22:00), navigate to Step 2, confirm the listbox auto-scrolls to 22:00 when the step renders
- **Expected:** The selected return time slot scrolls into view automatically
- **Why human:** `scrollIntoView` is called via `useEffect`; jsdom does not implement it

**2. TripTypeTabs quoteMode visual feedback**
- **Test:** Use a route outside the coverage zone (e.g., Vienna), verify the ROUND TRIP tab appears visually greyed out (opacity 0.4) and cursor changes to not-allowed on hover
- **Expected:** Tab appears faded and cursor is `not-allowed`; clicking does nothing; inline message appears below
- **Why human:** CSS style application and cursor behavior not verifiable by automated tests

**3. VehicleCard three-line layout at actual viewport widths**
- **Test:** Select a round_trip with return date/time set, advance to Step 3, verify three-line layout renders correctly on both desktop (3-column grid) and mobile (single column)
- **Expected:** All three lines (Outbound / Return with -N% badge / Combined) visible and aligned; combined total updates when switching vehicle classes
- **Why human:** Responsive layout and visual alignment require browser rendering

---

### Gaps Summary

No gaps. All 8 observable truths are verified, all 10 required artifacts pass all three levels (exists, substantive, wired), all 6 requirements are satisfied, and the full test suite passes with zero regressions.

The two warning-level anti-patterns (missing `returnLegPrices` in error-path responses at lines 95 and 197 of `route.ts`) are non-blocking: the client safely handles `undefined` via `?? null`, and both paths only trigger on infrastructure failures (DB unreachable, unhandled exception), not on normal user flows.

---

_Verified: 2026-04-04T23:16:00Z_
_Verifier: Claude (gsd-verifier)_
