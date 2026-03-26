# Phase 3: Booking Details - Research

**Researched:** 2026-03-26
**Domain:** React form validation, extras toggle UI, conditional fields, Zustand state extension
**Confidence:** HIGH — all findings sourced from the actual codebase; no speculative claims

---

## Summary

Phase 3 builds two steps: Step 4 (optional extras toggle with running price total) and Step 5 (passenger details form with inline validation). All major dependencies are already installed — react-hook-form 7.72.0, Zod 4.3.6, and @hookform/resolvers 5.2.2. The types are already partially defined in `types/booking.ts`: `Extras`, `PassengerDetails`, and `PriceBreakdown` all exist. The Zustand store needs extension to hold extras state and passenger details, plus new setter actions.

The critical design question for this phase is airport detection. The current TripType in the store (`'transfer' | 'hourly' | 'daily'`) does not include `airport_pickup` / `airport_dropoff` — these were simplified out during Phase 1 implementation. Airport rides are currently identified by checking whether `origin.placeId === PRG_CONFIG.placeId` OR `destination.placeId === PRG_CONFIG.placeId`. Step 5 must use this derived boolean to conditionally render the Flight Number field (STEP5-02). No store change is needed for this — pure derivation at render time.

PriceSummary currently reads `priceBreakdown[vehicleClass].total` which hardcodes `extras: 0` (see `lib/pricing.ts` line 45). Phase 3 must add an extras cost calculation on top of the base price. The cleanest approach: store extras selection in Zustand, compute the extras cost locally in PriceSummary using a new `EXTRAS_PRICES` constant in `lib/pricing.ts`, and display `base + extrasTotal` as the updated total. No API round-trip needed — extras prices are fixed and client-safe.

**Primary recommendation:** Use react-hook-form with `mode: 'onBlur'` for Step 5 form validation, Zod 4 schema for field rules, and local Zustand state for extras toggles with direct price computation using a new `EXTRAS_PRICES` constant.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STEP4-01 | User can add extras: Child Seat, Meet & Greet (sign with name), Extra Luggage | Toggle UI pattern, Extras type already defined in booking.ts |
| STEP4-02 | Each extra shows its price increment | EXTRAS_PRICES constant to be added to lib/pricing.ts |
| STEP4-03 | PriceSummary updates to include selected extras | PriceSummary reads priceBreakdown from store; needs to also read extras and compute total |
| STEP5-01 | User fills: First Name, Last Name, Email, Phone (required) | react-hook-form + Zod schema pattern; PassengerDetails type already defined |
| STEP5-02 | For airport rides: Flight Number field (required), Terminal (optional) | Airport detection via PRG_CONFIG.placeId comparison; flightNumber/terminal already in PassengerDetails type |
| STEP5-03 | Special Requests / Notes field (optional, max 500 chars) | Textarea with character counter; specialRequests already in PassengerDetails type |
| STEP5-04 | All fields validated inline on blur (not on submit) | react-hook-form mode: 'onBlur' |
</phase_requirements>

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Used |
|---------|---------|---------|----------|
| react-hook-form | 7.72.0 | Form state, validation triggering, blur events | Already in package.json; project standard |
| zod | 4.3.6 | Schema definition for validation rules | Already in package.json; project standard |
| @hookform/resolvers | 5.2.2 | Bridges Zod schema into react-hook-form | Already in package.json; project standard |
| zustand | 5.0.12 | Wizard state (extras, passenger details) | Existing store pattern — extend don't replace |

### Nothing to install

All dependencies for Phase 3 are already present. No new `npm install` commands needed.

---

## Architecture Patterns

### Recommended Project Structure

```
components/booking/steps/
├── Step4Extras.tsx       # new — extras toggle grid
├── Step5Passenger.tsx    # new — passenger details form
lib/
└── pricing.ts            # extend — add EXTRAS_PRICES constant
types/
└── booking.ts            # extend — add extras + passenger fields to BookingStore
lib/
└── booking-store.ts      # extend — add extras + passenger state + setters
tests/
├── Step4Extras.test.tsx  # Wave 0 stubs
└── Step5Passenger.test.tsx # Wave 0 stubs
```

### Pattern 1: Extras Toggles (Step 4)

**What:** Three toggle cards/rows — Child Seat, Meet & Greet, Extra Luggage. Each shows name, description, price increment. Click toggles boolean in Zustand. PriceSummary reacts immediately.

**When to use:** Whenever selection is binary (on/off) with immediate price feedback.

**Key insight:** Do NOT use react-hook-form for extras — they are simple booleans in Zustand. react-hook-form is only for Step 5 text fields. Extras just need `onClick` handlers and Zustand setters.

**Extras toggle card structure:**
```tsx
// Source: established VehicleCard pattern (components/booking/VehicleCard.tsx)
<button
  type="button"
  aria-pressed={extras.childSeat}
  onClick={() => toggleExtra('childSeat')}
  style={{
    border: extras.childSeat ? '2px solid var(--copper)' : '1px solid var(--anthracite-light)',
    background: 'var(--anthracite-mid)',
    padding: extras.childSeat ? 23 : 24,  // compensate for 2px border
    borderRadius: 4,
    // ...
  }}
>
  <span className="label">Child Seat</span>
  <span style={{ color: 'var(--warmgrey)', fontSize: 13 }}>+€{EXTRAS_PRICES.childSeat}</span>
</button>
```

**Pricing constant to add to `lib/pricing.ts`:**
```typescript
// Source: types/booking.ts — Extras interface keys match
export const EXTRAS_PRICES: Record<keyof Extras, number> = {
  childSeat: 15,
  meetAndGreet: 25,
  extraLuggage: 20,
}
// Note: actual prices are placeholders — marked TODO like RATE_PER_KM
```

**PriceSummary extras computation:**
```typescript
// Source: lib/pricing.ts — calculatePrice already returns { base, extras: 0, total }
// PriceSummary must compute extrasTotal from the extras Zustand slice:
const extras = useBookingStore((s) => s.extras)
const extrasTotal = Object.entries(EXTRAS_PRICES).reduce((sum, [key, price]) => {
  return sum + (extras[key as keyof Extras] ? price : 0)
}, 0)
const displayTotal = selectedPrice ? selectedPrice.base + extrasTotal : null
```

**Note:** Do NOT update `priceBreakdown` in the Zustand store when extras change — extras are a separate concern. PriceSummary computes the display total locally from `base + extrasTotal`. This avoids coupling extras into the pricing API flow.

### Pattern 2: Passenger Details Form (Step 5) — react-hook-form + Zod 4

**What:** Standard validated form with blur-mode validation.

**When to use:** Any form with required fields, email/phone validation, and blur-triggered error display.

**Zod 4 schema (same API as Zod 3 for basics):**
```typescript
// Source: verified against installed zod@4.3.6 package
import { z } from 'zod'

const passengerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(7, 'Enter a valid phone number'),
  flightNumber: z.string().optional(),
  terminal: z.string().optional(),
  specialRequests: z.string().max(500, 'Max 500 characters').optional(),
})
```

**react-hook-form with Zod resolver:**
```typescript
// Source: @hookform/resolvers 5.2.2 — zodResolver API unchanged from v4
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

const { register, handleSubmit, watch, formState: { errors } } = useForm({
  resolver: zodResolver(passengerSchema),
  mode: 'onBlur',           // STEP5-04: errors appear on blur, not submit
  defaultValues: {
    firstName: store.passengerDetails?.firstName ?? '',
    // ... restore from Zustand on mount
  },
})
```

**Step 5 does NOT use handleSubmit for navigation.** The Continue button in BookingWizard calls `nextStep()`. Step 5 must keep Zustand in sync as user types (or on blur), and BookingWizard's `canProceed` gate for step 5 reads from the Zustand store (all required fields filled + no errors). Pattern options:

- **Option A (recommended):** `watch()` all fields, `useEffect` on watched values to call store setters. `canProceed` checks store fields directly.
- **Option B:** On blur of each field, if value is valid, call store setter. Simpler but requires more event handlers.

Option A is recommended because it keeps the store always in sync, which matters for sessionStorage persistence (ARCH-02) and for the Step 6 summary.

**Airport detection for Flight Number field:**
```typescript
// Source: types/booking.ts — PRG_CONFIG.placeId = 'ChIJA_IVS6-UC0cRTZBQLvHG-ec'
import { PRG_CONFIG } from '@/types/booking'

const isAirportRide =
  origin?.placeId === PRG_CONFIG.placeId ||
  destination?.placeId === PRG_CONFIG.placeId
```

**Conditional Flight Number requirement:**
```typescript
// Zod refinement for airport-conditional required field
const passengerSchema = (isAirportRide: boolean) =>
  z.object({
    // ... base fields ...
    flightNumber: isAirportRide
      ? z.string().min(1, 'Flight number is required for airport rides')
      : z.string().optional(),
  })
```

**Note:** Because `isAirportRide` is a runtime value (from Zustand), the schema must be built inside the component or via `superRefine`. The factory function pattern `(isAirportRide: boolean) => z.object(...)` is the cleanest approach. Pass `isAirportRide` to `zodResolver(passengerSchema(isAirportRide))`.

### Pattern 3: Input Field Style

All inputs follow the `AddressInput.tsx` pattern — never use Tailwind utility classes for colors:

```tsx
// Source: components/booking/AddressInput.tsx
<input
  type="text"
  {...register('firstName')}
  style={{
    width: '100%',
    background: 'var(--anthracite-mid)',
    border: `1px solid ${errors.firstName ? '#C0392B' : 'var(--anthracite-light)'}`,
    padding: '12px 16px',
    fontFamily: 'var(--font-montserrat)',
    fontSize: '14px',
    fontWeight: 300,
    color: 'var(--offwhite)',
    outline: 'none',
  }}
/>
{errors.firstName && (
  <p style={{ color: '#C0392B', fontSize: 13, marginTop: 8 }}>
    {errors.firstName.message}
  </p>
)}
```

**Label pattern (reuse `.label` CSS class):**
```tsx
// Source: components/booking/AddressInput.tsx
<p className="label" style={{ marginBottom: '8px' }}>
  FIRST NAME
</p>
```

### Pattern 4: Character Counter for Textarea

```tsx
// Standard controlled pattern — no library needed
const [charCount, setCharCount] = useState(0)

<textarea
  {...register('specialRequests', {
    onChange: (e) => setCharCount(e.target.value.length),
  })}
  maxLength={500}
  rows={4}
  style={{ /* same as input style above */ }}
/>
<p style={{ fontSize: 10, color: 'var(--warmgrey)', textAlign: 'right', marginTop: 4 }}>
  {charCount}/500
</p>
```

**Alternative using `watch`:**
```typescript
const specialRequests = watch('specialRequests') ?? ''
// then render {specialRequests.length}/500 inline — no separate state needed
```

The `watch` approach is preferred since it avoids a redundant `useState` when the form already tracks the value.

### Pattern 5: BookingWizard canProceed for Steps 4 and 5

Currently `default: return true` handles steps 4–6. Phase 3 replaces the default cases:

```typescript
// Source: components/booking/BookingWizard.tsx — canProceed switch
case 4:
  return true  // Step 4 extras are all optional — always can proceed
case 5:
  return (
    !!passengerDetails?.firstName &&
    !!passengerDetails?.lastName &&
    !!passengerDetails?.email &&
    !!passengerDetails?.phone &&
    (!isAirportRide || !!passengerDetails?.flightNumber)
  )
```

Step 5 reads `passengerDetails` from the Zustand store. As the user fills fields (via `watch` + `useEffect`), the store updates, and BookingWizard's `canProceed` reactively enables Continue.

### Anti-Patterns to Avoid

- **Using react-hook-form for extras:** Extras are Zustand booleans, not form fields. Using RHF for checkboxes here adds unnecessary complexity.
- **Calling the pricing API when extras change:** Extras computation is client-side math. No API needed.
- **Storing computed total in priceBreakdown:** The `priceBreakdown` record in the store holds per-vehicle base prices from the API. Don't mutate it for extras. PriceSummary computes the display total.
- **Using `handleSubmit` as the navigation gate:** Step 5 uses `nextStep()` from BookingWizard, not form submission. Use `watch` + `useEffect` to keep Zustand in sync, and gate Continue via `canProceed` reading from the store.
- **Inline styles with hardcoded colors:** Always use `var(--copper)`, `var(--anthracite-mid)` etc. Never hex values in components (exception: `#C0392B` for validation errors — established pattern from AddressInput).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email format validation | Custom regex | `z.string().email()` in Zod | Zod's regex covers RFC 5322 edge cases |
| Blur-triggered error display | onBlur handlers + state | react-hook-form `mode: 'onBlur'` | RHF tracks touched/dirty state correctly; manual approach misses edge cases like programmatic focus |
| Field registration / unregistration | Manual ref tracking | `register()` from react-hook-form | RHF handles conditional fields, unregister on unmount |
| Max-length enforcement | `onChange` truncate | `maxLength` attribute + Zod `z.string().max(500)` | Native maxLength prevents input; Zod validates the stored value |

---

## Common Pitfalls

### Pitfall 1: Airport Detection Depends on Stored PlaceId

**What goes wrong:** Developer checks `tripType === 'airport_pickup'` — this doesn't exist at runtime. The actual TripType only has `'transfer' | 'hourly' | 'daily'`.

**Why it happens:** Phase 1 CONTEXT.md planned `airport_pickup` / `airport_dropoff` TripType values, but the implementation simplified to three types with PRG_CONFIG auto-fill instead.

**How to avoid:** Always detect airport rides by comparing `placeId` to `PRG_CONFIG.placeId`. This is the only reliable airport signal in the current store shape.

**Warning signs:** TypeScript error `Type '"airport_pickup"' is not assignable to type 'TripType'` — if you see this, you're using the wrong detection approach.

### Pitfall 2: Zod 4 Changed Some API Surfaces

**What goes wrong:** Using Zod 3 docs with Zod 4. The basic `z.string()`, `z.object()`, `z.email()`, `.min()`, `.max()`, `.optional()` APIs are compatible. But `ZodError.flatten()` and `z.infer` still work the same way.

**Why it happens:** Training data may reference Zod 3 patterns.

**How to avoid:** The PassengerDetails schema needed here uses only the stable core API. Verified: `z.string().min(1)`, `z.string().email()`, `z.string().max(500)`, `z.string().optional()` all work identically in Zod 4.3.6.

**Warning signs:** Runtime import errors or `z.string().email` not being a function — would indicate a breaking API change.

### Pitfall 3: react-hook-form Watch in useEffect Triggers Infinite Loops

**What goes wrong:** `useEffect([watch('email')], () => setEmail(watch('email')))` — because `watch()` returns a new reference on every render, the dep array is unstable.

**Why it happens:** Misunderstanding of `watch()` vs `getValues()`.

**How to avoid:** Destructure from `watch()` at the top of the component into named constants, and pass those constants (primitives) to `useEffect` deps:
```typescript
const { firstName, lastName, email, phone } = watch()
useEffect(() => {
  setPassengerDetails({ firstName, lastName, email, phone })
}, [firstName, lastName, email, phone, setPassengerDetails])
```
Strings are primitives — safe in deps array.

### Pitfall 4: PriceSummary Extras Calculation Must Use Import-Safe Path

**What goes wrong:** Importing `EXTRAS_PRICES` from `lib/pricing.ts` into a client component. `pricing.ts` is currently server-side only (never imported by client components — established in Phase 2 decisions).

**Why it happens:** `lib/pricing.ts` contains `RATE_PER_KM` etc. which are server-safe but the rate tables were intentionally kept server-side to protect business logic.

**How to avoid:** `EXTRAS_PRICES` are public-facing (they show in the UI). It is safe to import them client-side. However, to respect the pattern intent, consider putting `EXTRAS_PRICES` in `types/booking.ts` or a new `lib/extras.ts` client-safe module rather than in `lib/pricing.ts`. The planner should make this call based on project philosophy.

**Warning signs:** Next.js "Server Component cannot import" error, or inadvertently exposing rate tables to the client bundle.

### Pitfall 5: Step 5 Continue Button Must Read Zustand, Not RHF formState

**What goes wrong:** `canProceed` reads `formState.isValid` from react-hook-form. This only works if the form is inside BookingWizard and the ref/context is shared — which it isn't (they're in different components).

**Why it happens:** react-hook-form's `formState.isValid` is local to the component that called `useForm`.

**How to avoid:** Use Zustand as the single source of truth. Step5Passenger writes to the store via `watch` + `useEffect`. BookingWizard reads from the store for its `canProceed` gate. Zero cross-component RHF context needed.

### Pitfall 6: Mobile PriceSummary Bar — Step 4 Needs Consistent Treatment

**What goes wrong:** At Step 3, the wizard's generic mobile sticky bar is hidden and PriceSummary's mobile bar takes over (established decision from Phase 2). At Step 4, the wizard's generic bar should be visible again (Back + Continue), and PriceSummary's mobile bar should be hidden OR should NOT show a Continue button.

**Why it happens:** Phase 2 added a Continue button inside PriceSummary's mobile bar specifically for Step 3. At Step 4, this button must either be hidden or PriceSummary must be aware of current step.

**How to avoid:** PriceSummary's mobile bar Continue button is currently gated by `!vehicleClass` for its disabled state. At Step 4+, the wizard's generic mobile bar should be visible (currentStep !== 3 guard is already correct — it only hides at step 3). But PriceSummary is still rendered at Steps 4 and 5. The Continue button in PriceSummary's mobile bar will be visible alongside the wizard's generic bar. Solution options:
- Option A: Pass `currentStep` (or hide prop) to PriceSummary and only render its Continue button at step 3.
- Option B: PriceSummary reads `currentStep` from store directly.
Option B is simpler and consistent with how PriceSummary already reads from the store.

---

## Code Examples

Verified patterns from existing codebase:

### Extras Store Extension
```typescript
// Extend BookingStore in types/booking.ts
// Source: types/booking.ts — Extras interface already defined
// Add to BookingStore:
extras: Extras
passengerDetails: PassengerDetails | null
setExtras: (e: Extras) => void
toggleExtra: (key: keyof Extras) => void
setPassengerDetails: (d: PassengerDetails) => void

// Add to booking-store.ts initial state:
extras: { childSeat: false, meetAndGreet: false, extraLuggage: false },
passengerDetails: null,

// Add to store actions:
setExtras: (e) => set({ extras: e }),
toggleExtra: (key) => set((s) => ({
  extras: { ...s.extras, [key]: !s.extras[key] }
})),
setPassengerDetails: (d) => set({ passengerDetails: d }),

// Add to partialize (for sessionStorage):
extras: state.extras,
passengerDetails: state.passengerDetails,
```

### BookingWizard Step Headings (Steps 4 and 5)
```typescript
// Source: components/booking/BookingWizard.tsx — existing heading block
// Current: currentStep <= 3 gets full heading treatment (copper-line + h2)
// Phase 3: extend to include steps 4 and 5 with their own h2 text

// Proposed extension:
{currentStep <= 5 ? (
  <div className="mb-8">
    <p className="label mb-6">STEP {currentStep} OF 6</p>
    <span className="copper-line mb-6 block" />
    <h2 style={{ fontFamily: 'var(--font-cormorant)', fontWeight: 300, fontSize: 26, lineHeight: 1.25, color: 'var(--offwhite)' }}>
      {currentStep === 1 ? 'Select your journey' :
       currentStep === 2 ? 'Select your date & time' :
       currentStep === 3 ? 'Choose your vehicle' :
       currentStep === 4 ? 'Add extras' :
       'Passenger details'}
    </h2>
  </div>
) : (
  <div className="mb-8">
    <p className="label mb-6">STEP {currentStep} OF 6</p>
  </div>
)}
```

### Field Layout Pattern (2-col on desktop)
```tsx
// Source: Step1TripType.tsx — md:flex-row flex-col pattern
// Step 5 fields: First Name + Last Name on one row (desktop), stacked (mobile)
<div
  className="md:flex-row flex-col"
  style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
>
  <div style={{ flex: 1 }}>
    {/* First Name field */}
  </div>
  <div style={{ flex: 1 }}>
    {/* Last Name field */}
  </div>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod 3 `z.ZodError` + `z.ZodIssue` | Zod 4 `z.core.$ZodError` internal | Zod 4.0 | Only affects advanced Zod internals; basic schema API unchanged |
| @hookform/resolvers v4 `zodResolver` from `@hookform/resolvers/zod` | v5 same import path, same API | Resolvers v5 | No change needed |

**No deprecated APIs in use for this phase.**

---

## Open Questions

1. **Extras prices — are there real business prices?**
   - What we know: `pricing.ts` has a `// TODO: set production rates — these are placeholders` comment on rate tables
   - What's unclear: Whether Child Seat, Meet & Greet, Extra Luggage have real EUR prices defined anywhere
   - Recommendation: Planner should add a `// TODO: set production extras prices` comment alongside the placeholder values. Use €15 / €25 / €20 as placeholders consistent with the existing placeholder rates.

2. **Should EXTRAS_PRICES live in `lib/pricing.ts` or elsewhere?**
   - What we know: `lib/pricing.ts` is currently never imported client-side (Phase 2 decision to protect rate tables)
   - What's unclear: Whether extras prices should be treated as sensitive business data or as public UI display data
   - Recommendation: Create a `lib/extras.ts` module for `EXTRAS_PRICES` and `EXTRAS_CONFIG` (labels, descriptions). This is public UI data, not protected rate logic. Keeps `lib/pricing.ts` server-only.

3. **Phone validation — international format or Czech only?**
   - What we know: Site serves pan-European clients (Prague, Vienna, Berlin); `PassengerDetails.phone` is a plain `string`
   - What's unclear: Whether `+420` Czech format or international `+XX` is expected
   - Recommendation: Use permissive validation: `z.string().min(7, 'Enter a valid phone number')`. Do not enforce country code format in Phase 3.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| Config file | `prestigo/vitest.config.ts` (exists) |
| Quick run command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run --reporter=verbose` |
| Full suite command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run && npx tsc --noEmit` |

**Note:** Current environment has a Node.js / rolldown ESM compatibility issue that prevents test runs. This is a pre-existing condition from Phase 2 — not Phase 3's problem. Tests are stub-only (`.todo`) and still pass.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEP4-01 | Toggle extras change Zustand state | unit | `npx vitest run tests/Step4Extras.test.tsx` | ❌ Wave 0 |
| STEP4-02 | Each extra card shows correct price | unit | `npx vitest run tests/Step4Extras.test.tsx` | ❌ Wave 0 |
| STEP4-03 | PriceSummary total includes extras | unit | `npx vitest run tests/PriceSummary.test.tsx` | ✅ (stubs only) |
| STEP5-01 | Required fields present in Step 5 form | unit | `npx vitest run tests/Step5Passenger.test.tsx` | ❌ Wave 0 |
| STEP5-02 | Flight Number visible for airport rides only | unit | `npx vitest run tests/Step5Passenger.test.tsx` | ❌ Wave 0 |
| STEP5-03 | Special requests textarea has 500-char limit | unit | `npx vitest run tests/Step5Passenger.test.tsx` | ❌ Wave 0 |
| STEP5-04 | Validation errors appear on blur, not on Continue | unit | `npx vitest run tests/Step5Passenger.test.tsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run && npx tsc --noEmit`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `prestigo/tests/Step4Extras.test.tsx` — covers STEP4-01, STEP4-02, STEP4-03
- [ ] `prestigo/tests/Step5Passenger.test.tsx` — covers STEP5-01, STEP5-02, STEP5-03, STEP5-04
- [ ] `prestigo/tests/PriceSummary.test.tsx` — exists but needs STEP4-03 stubs added (extras total display)

---

## Sources

### Primary (HIGH confidence)

- `prestigo/types/booking.ts` — Extras, PassengerDetails, PriceBreakdown, BookingStore interfaces, PRG_CONFIG
- `prestigo/lib/booking-store.ts` — Current store shape, partialize pattern for sessionStorage
- `prestigo/lib/pricing.ts` — calculatePrice returns `extras: 0`; RATE_PER_KM pattern to follow for EXTRAS_PRICES
- `prestigo/components/booking/BookingWizard.tsx` — canProceed switch, heading block, mobile bar logic
- `prestigo/components/booking/PriceSummary.tsx` — How total is currently computed and displayed
- `prestigo/components/booking/AddressInput.tsx` — Input field style pattern, error display pattern
- `prestigo/components/booking/steps/Step1TripType.tsx` — Validation pattern (errors state), field layout pattern
- `prestigo/app/globals.css` — All CSS utilities: `.label`, `.btn-primary`, `var(--copper)`, error `#C0392B`
- `prestigo/package.json` — react-hook-form 7.72.0, zod 4.3.6, @hookform/resolvers 5.2.2 confirmed installed
- `.planning/phases/01-foundation-trip-entry/01-CONTEXT.md` — Airport auto-fill design, PRG_CONFIG usage
- `.planning/STATE.md` — Key decisions including airport_* TripType simplification

### Secondary (MEDIUM confidence)

- `.planning/phases/02-pricing-vehicle-selection/02-CONTEXT.md` — PriceSummary mobile bar decision, extras deferred to Phase 3

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps verified as installed in package.json with actual versions
- Architecture: HIGH — patterns derived directly from existing codebase components
- Airport detection: HIGH — verified PRG_CONFIG.placeId is the only reliable signal (TripType lacks airport values)
- Extras pricing: MEDIUM — prices are placeholders; business values unknown
- Pitfalls: HIGH — sourced from actual implementation decisions and STATE.md

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable deps; only risk is if RHF or Zod releases breaking changes)
