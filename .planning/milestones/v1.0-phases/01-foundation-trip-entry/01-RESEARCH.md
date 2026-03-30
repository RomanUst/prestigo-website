# Phase 1: Foundation & Trip Entry — Research

**Researched:** 2026-03-24
**Domain:** Next.js 16 App Router · Zustand · react-hook-form · Google Places Autocomplete · Custom CSS design system
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wizard Chrome**
- Full-bleed layout: anthracite background, no card borders around the wizard itself
- Progress bar: numbered circles (1–6) connected by a line. Active = copper circle. Completed = copper tick. Pending = anthracite-light circle
- Progress bar sits below the page header (`<Nav />` remains visible)
- Wizard fills the viewport height on desktop; scrollable on mobile
- Step transitions: fade + slight slide-up (reuse existing `fadeUp` keyframe, 0.3s) — NO framer-motion in Phase 1

**Trip Type Selector**
- Horizontal tab/pill row at the top of Step 1: ONE-WAY | AIRPORT PICKUP | AIRPORT DROPOFF | HOURLY | DAILY
- Tabs use Montserrat 9px, letter-spacing 0.35em, uppercase — consistent with `.label` style
- Active tab: copper underline or copper text, not filled background
- Tab row is sticky within the form header

**Step 1 Layout (final order)**
- Trip type tabs → Origin → Destination (or Hours for Hourly) → Passengers → Luggage → Next button
- Stacked single-column layout, NOT side-by-side
- "Swap" icon (Lucide `ArrowUpDown`, 16px) between Origin/Destination for non-airport trip types
- Date/time is Step 2 — NOT in Phase 1

**Airport Auto-fill**
- Airport Pickup: Destination auto-fills to "Václav Havel Airport Prague (PRG)", becomes read-only
- Airport Dropoff: Origin auto-fills to PRG, becomes read-only
- PRG hardcoded: `{ lat: 50.1008, lng: 14.26 }`, display name fixed
- Read-only field uses plane icon + copper text (not actually `disabled` attribute)

**Address Autocomplete UX**
- Dark anthracite-mid dropdown, copper matched substring, warmgrey non-matched
- Place type label (e.g., "Airport") shown right-aligned in suggestion row
- Debounce 300ms, minimum 2 characters before suggestions appear
- Clear (×) button on filled editable address fields

**Passengers & Luggage**
- Passengers stepper: 1–8, default 1
- Luggage stepper: 0–8, default 0
- Steppers: copper `+`/`−`, warmgrey count display

**Hourly Hire**
- Destination hidden, replaced by Duration segmented buttons: 1h | 2h | 3h | 4h | 6h | 8h | 12h
- Duration stored as integer hours in Zustand

**Next Button**
- Uses `.btn-primary` class, label "Continue"
- Disabled: `opacity-40`, `cursor-not-allowed`
- Required for Step 1: origin placed, destination placed (or hourly hours set), passengers ≥ 1
- Mobile: fixed at bottom; desktop: inline below fields

**Zustand Store Shape**
```typescript
interface BookingStore {
  tripType: 'transfer' | 'airport_pickup' | 'airport_dropoff' | 'hourly' | 'daily'
  origin: { address: string; placeId: string; lat: number; lng: number } | null
  destination: { address: string; placeId: string; lat: number; lng: number } | null
  hours: number        // for hourly only, default 2
  passengers: number   // default 1
  luggage: number      // default 0
  currentStep: number  // 1-6
  completedSteps: Set<number>
}
```

### Claude's Discretion
- Exact spacing between form elements (follow existing globals.css rhythm)
- Whether to use framer-motion or CSS transitions for step fade (prefer CSS to avoid adding dep in Phase 1)
- Error state styling for empty required fields on Next attempt
- Exact border/background treatment of the read-only airport field
- Whether to show a "Route preview" map thumbnail in Step 1 (probably skip — Phase 2 concern)

### Deferred Ideas (OUT OF SCOPE)
- Route preview map in Step 1 — Phase 2 concern (pricing engine handles map)
- "Save for later" / bookmark this booking — requires auth, v2
- Multi-stop route support — v2
- Google Maps visual map component embedded in wizard — Phase 2+
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-01 | Zustand store holds all wizard state with TypeScript types (BookingData, TripType, VehicleClass) | Zustand 5.x + TypeScript patterns documented below |
| ARCH-02 | Wizard state persists to sessionStorage — survives page refresh at any step | Zustand `persist` middleware with `sessionStorage` documented below |
| ARCH-03 | Booking data types defined: TripType, VehicleClass, PassengerDetails, PriceBreakdown, Extras | Types file at `prestigo/types/booking.ts` — full shape in Architecture Patterns |
| WIZD-01 | BookingWizard component orchestrates 6-step flow with step routing | Component pattern documented in Architecture Patterns |
| WIZD-02 | ProgressBar shows current step number and completed steps | Visual spec from UI-SPEC, implementation pattern documented |
| WIZD-03 | "Next" button disabled until all required fields in current step are valid | Validation guard pattern documented in Code Examples |
| WIZD-04 | "Back" button navigates to previous step without losing data | Zustand store persists data — back just decrements currentStep |
| WIZD-05 | Step transitions animated (framer-motion fade/slide) | Per CONTEXT.md: use CSS `fadeUp` in Phase 1, not framer-motion |
| WIZD-06 | Full wizard lives at /book page | Replace existing placeholder in `prestigo/app/book/page.tsx` |
| STEP1-01 | User can select trip type: One-way Transfer, Airport Pickup, Airport Dropoff, Hourly Hire, Daily Hire | TripTypeTabRow component pattern documented |
| STEP1-02 | User can enter origin address with Google Places Autocomplete | use-places-autocomplete 4.0.1 pattern documented |
| STEP1-03 | User can enter destination address with Google Places Autocomplete | Same as STEP1-02 |
| STEP1-04 | For Airport Pickup/Dropoff, origin/destination auto-set to PRG airport coordinates | Hardcoded PRG config pattern, read-only field styling from UI-SPEC |
| STEP1-05 | User can select passenger count (1–8) | Stepper component pattern documented |
| STEP1-06 | User can select luggage count (0–8) | Stepper component pattern documented |
| STEP1-07 | For Hourly Hire, user selects duration in hours (1–12) instead of destination | DurationSelector segmented button pattern documented |
</phase_requirements>

---

## Summary

Phase 1 builds the complete wizard shell (6-step navigation + progress bar) and fully implements Step 1 (trip type selection, address autocomplete, passengers/luggage). Steps 2–6 are rendered as empty stubs. The `/book` page placeholder is entirely replaced.

The tech stack is already decided and partially installed: the project uses Next.js 16 App Router with React 19, Tailwind 4, and a hand-built CSS design system via `globals.css`. The core Phase 1 libraries (Zustand, react-hook-form, use-places-autocomplete, Lucide React) are NOT yet installed — they must be added. The project currently has zero test infrastructure; Vitest + React Testing Library must be set up as Wave 0 work.

The key implementation challenge is `use-places-autocomplete` v4.x (the registry version is 4.0.1, not the 3.x documented in older STACK.md). Version 4 has a breaking change: it requires the Google Maps script to be loaded externally before the hook is called. The `@googlemaps/js-api-loader` (v2.0.2) handles this via `useEffect` in a wrapper component. All address state flows into Zustand (not react-hook-form) so the wizard can access it across steps.

**Primary recommendation:** Build in this order — (1) types + Zustand store, (2) BookingWizard shell + ProgressBar, (3) AddressInput with Places API, (4) Step1TripType assembling all sub-components, (5) wire validation guard on Next button.

---

## Standard Stack

### Core (Phase 1 scope)

| Library | Registry Version | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| next | 16.2.1 (installed) | App Router framework | Already in project |
| react | 19.2.3 (installed) | UI | Already in project |
| zustand | 5.0.12 (not installed) | Wizard state across steps + sessionStorage persist | Lightweight, no boilerplate, works natively with sessionStorage middleware |
| react-hook-form | 7.72.0 (not installed) | Step-level form validation | Minimal re-renders, native TypeScript, `mode: 'onBlur'` for inline validation UX |
| zod | 4.3.6 (not installed) | Schema validation + TypeScript types | Works via `@hookform/resolvers`, type-safe schemas double as TS types |
| @hookform/resolvers | 5.2.2 (not installed) | Bridge react-hook-form + Zod | Standard integration layer |
| use-places-autocomplete | 4.0.1 (not installed) | Google Places Autocomplete React hook | Handles debouncing + caching; v4 requires external script load |
| @googlemaps/js-api-loader | 2.0.2 (not installed) | Load Google Maps JS API | Official Google loader, required for use-places-autocomplete v4 |
| lucide-react | 1.6.0 (not installed) | Icons (swap, plane, clear ×, stepper ±) | UI-SPEC mandates Lucide; already in codebase patterns |

**Version verification:** All versions confirmed via `npm view [package] version` against npm registry on 2026-03-24.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | 4.x (installed) | Utility classes | Layout/spacing only — NOT for brand colors (use CSS custom properties) |

### Not Needed in Phase 1

| Instead of | Could Use | Why Deferred |
|------------|-----------|--------------|
| framer-motion | CSS `fadeUp` keyframe | CONTEXT.md: avoid adding dep in Phase 1 — CSS sufficient for 0.3s step transition |
| @types/google.maps | Included in @googlemaps/js-api-loader | Loader package provides types |

**Installation:**
```bash
cd prestigo && npm install zustand react-hook-form zod @hookform/resolvers use-places-autocomplete @googlemaps/js-api-loader lucide-react
```

---

## Architecture Patterns

### File Structure (Phase 1 creates)

```
prestigo/
├── app/
│   └── book/
│       └── page.tsx              ← REPLACE placeholder with BookingWizard
├── components/
│   └── booking/                  ← CREATE this directory
│       ├── BookingWizard.tsx      ← Orchestrator: step routing, step rendering
│       ├── ProgressBar.tsx        ← 6 circles + connecting line
│       ├── AddressInput.tsx       ← Google Places Autocomplete wrapper
│       ├── TripTypeTabs.tsx       ← 5-tab horizontal selector
│       ├── Stepper.tsx            ← Reusable +/- stepper for pax & luggage
│       ├── DurationSelector.tsx   ← Segmented 1h–12h buttons (Hourly only)
│       └── steps/
│           ├── Step1TripType.tsx  ← Full Step 1 assembly
│           └── StepStub.tsx       ← Placeholder for Steps 2–6
├── lib/
│   └── booking-store.ts          ← CREATE: Zustand store with sessionStorage persist
└── types/
    └── booking.ts                ← CREATE: TripType, BookingStore, PlaceResult types
```

### Pattern 1: Zustand Store with sessionStorage Persistence

Zustand 5.x changed the import path. The `persist` middleware is at `zustand/middleware`, not a sub-path.

```typescript
// prestigo/lib/booking-store.ts
// Source: Zustand 5.x official docs (https://zustand.docs.pmnd.rs/integrations/persisting-store-data)
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BookingStore } from '@/types/booking'

const PRG_PLACE = {
  address: 'Václav Havel Airport Prague (PRG)',
  placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec',
  lat: 50.1008,
  lng: 14.26,
}

export const useBookingStore = create<BookingStore>()(
  persist(
    (set, get) => ({
      tripType: 'transfer',
      origin: null,
      destination: null,
      hours: 2,
      passengers: 1,
      luggage: 0,
      currentStep: 1,
      completedSteps: new Set<number>(),

      setTripType: (type) => {
        const updates: Partial<BookingStore> = { tripType: type }
        if (type === 'airport_pickup') {
          updates.destination = PRG_PLACE
        } else if (type === 'airport_dropoff') {
          updates.origin = PRG_PLACE
        } else {
          // Clear PRG auto-fill when switching away from airport types
          if (get().destination?.placeId === PRG_PLACE.placeId) updates.destination = null
          if (get().origin?.placeId === PRG_PLACE.placeId) updates.origin = null
        }
        set(updates)
      },
      setOrigin: (place) => set({ origin: place }),
      setDestination: (place) => set({ destination: place }),
      setHours: (h) => set({ hours: h }),
      setPassengers: (n) => set({ passengers: n }),
      setLuggage: (n) => set({ luggage: n }),
      nextStep: () => set((s) => ({
        completedSteps: new Set([...s.completedSteps, s.currentStep]),
        currentStep: s.currentStep + 1,
      })),
      prevStep: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
    }),
    {
      name: 'prestigo-booking',
      storage: createJSONStorage(() => sessionStorage),
      // Set serializes as Array in JSON — restore to Set on hydration
      partialize: (state) => ({
        ...state,
        completedSteps: Array.from(state.completedSteps),
      }),
    }
  )
)
```

**CRITICAL — Set serialization:** `Set<number>` does not serialize to JSON natively. Use `partialize` to convert to Array before storage and restore on hydration.

### Pattern 2: Google Places Autocomplete with use-places-autocomplete v4

`use-places-autocomplete` v4 requires the Google Maps script to be loaded BEFORE the hook runs. Load via `@googlemaps/js-api-loader` in a top-level `useEffect`.

```typescript
// prestigo/components/booking/AddressInput.tsx
// Source: use-places-autocomplete v4 README (https://github.com/wellyshen/use-places-autocomplete)
'use client'

import { useEffect, useRef } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete'

// Load the script ONCE at module level — idempotent
let loaderPromise: Promise<void> | null = null

function ensureMapsLoaded() {
  if (loaderPromise) return loaderPromise
  const loader = new Loader({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: ['places'],
    version: 'weekly',
  })
  loaderPromise = loader.load().then(() => undefined)
  return loaderPromise
}

interface AddressInputProps {
  label: string
  placeholder: string
  value: string
  onSelect: (place: { address: string; placeId: string; lat: number; lng: number }) => void
  onClear: () => void
  readOnly?: boolean
  readOnlyValue?: string
  hasError?: boolean
  errorMessage?: string
  'aria-label': string
}

export default function AddressInput({ label, placeholder, value, onSelect, onClear, readOnly, readOnlyValue, hasError, errorMessage, 'aria-label': ariaLabel }: AddressInputProps) {
  const {
    ready,
    value: inputValue,
    setValue,
    suggestions: { status, data },
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    initOnMount: false,      // v4: do not auto-init — we init after script loads
    debounce: 300,
    requestOptions: { componentRestrictions: { country: [] } },
  })

  useEffect(() => {
    ensureMapsLoaded().then(() => init())
  }, [init])

  // ... render
}
```

**Key v4 change:** `initOnMount: false` + manual `init()` call after loader resolves. Without this, the hook throws because `window.google` is not yet defined.

### Pattern 3: BookingWizard Step Routing

```typescript
// prestigo/components/booking/BookingWizard.tsx
'use client'

import { useBookingStore } from '@/lib/booking-store'
import ProgressBar from './ProgressBar'
import TripTypeTabs from './TripTypeTabs'
import Step1TripType from './steps/Step1TripType'
import StepStub from './steps/StepStub'

const STEP_LABELS = ['Trip & Route', 'Date & Time', 'Vehicle', 'Extras', 'Details', 'Payment']

export default function BookingWizard() {
  const { currentStep } = useBookingStore()

  const stepContent: Record<number, React.ReactNode> = {
    1: <Step1TripType />,
    2: <StepStub step={2} />,
    3: <StepStub step={3} />,
    4: <StepStub step={4} />,
    5: <StepStub step={5} />,
    6: <StepStub step={6} />,
  }

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-12">
      <ProgressBar currentStep={currentStep} totalSteps={6} labels={STEP_LABELS} />
      {/* Trip type tabs only shown on Step 1 */}
      {currentStep === 1 && <TripTypeTabs />}
      <div
        key={currentStep}                         // remounts on step change → triggers CSS fadeUp
        className="animate-step-enter max-w-xl"   // see globals.css addition below
        style={{ animation: 'fadeUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        {stepContent[currentStep]}
      </div>
    </div>
  )
}
```

**Step transition:** `key={currentStep}` on the step container causes React to remount on step change. The `fadeUp` keyframe from `globals.css` fires automatically. 0.3s duration (shorter than the global 0.9s used for page sections).

### Pattern 4: Next Button Validation Guard

```typescript
// Inside Step1TripType.tsx
import { useBookingStore } from '@/lib/booking-store'

function useStep1Valid() {
  const { tripType, origin, destination, hours } = useBookingStore()
  if (!origin) return false
  if (tripType === 'hourly') return hours >= 1
  return destination !== null
}

// In render:
const isValid = useStep1Valid()

<button
  type="button"
  onClick={handleNext}
  disabled={!isValid}
  aria-disabled={!isValid}
  className={`btn-primary ${!isValid ? 'opacity-40 cursor-not-allowed' : ''}`}
  style={!isValid ? { pointerEvents: 'none' } : undefined}
>
  Continue
</button>
```

**Note:** Use both `disabled` and `aria-disabled` per UI-SPEC accessibility requirements. Add `pointerEvents: 'none'` on disabled to prevent `.btn-primary:hover` fill from showing.

### Pattern 5: PRG Airport Config

```typescript
// prestigo/types/booking.ts
export const PRG_CONFIG = {
  placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec',
  address: 'Václav Havel Airport Prague (PRG)',
  lat: 50.1008,
  lng: 14.26,
} as const
```

Keep this in `types/booking.ts` (not in the store) so both the store and future API routes can import it without circular dependencies.

### Anti-Patterns to Avoid

- **Storing raw text in origin/destination:** Store only resolved Places results (`{ address, placeId, lat, lng }`). Typed-but-unselected text must NOT be treated as a valid address — Next button must remain disabled.
- **Using `disabled` attribute alone on Next button:** CSS `:hover` still fires on `disabled` buttons in some browsers. Use both `disabled` + `aria-disabled` + `pointer-events: none` for the disabled state.
- **Calling Places API on every keystroke:** Always debounce 300ms and require ≥ 2 characters (enforced by `use-places-autocomplete` config).
- **Auto-init in use-places-autocomplete v4:** Setting `initOnMount: true` (the v3 default) causes an error in Next.js App Router because `window.google` is not defined on mount. Always use `initOnMount: false`.
- **Tailwind color utilities for brand colors:** All brand colors use CSS custom properties (`var(--copper)`, etc.) — Tailwind color utilities for brand colors do not exist in this project (the theme only registers them for Tailwind's own system). Use inline styles or CSS classes from `globals.css`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Address autocomplete with debounce + caching | Custom Places API hook | `use-places-autocomplete` | Handles session tokens, caching, debounce, race conditions |
| Places API script loading | Custom `<Script>` tag management | `@googlemaps/js-api-loader` | Idempotent load, handles multiple components requesting same API, official Google library |
| Zustand Set serialization | Custom JSON replacer | `partialize` in persist config | Convert Set→Array before storage, Array→Set on restore — one pattern, no hand-rolled serializer |
| Wizard step validation | Custom validation state | react-hook-form per-step with `trigger()` | Handles field-level errors, dirty state, re-render optimization |

**Key insight:** The address autocomplete problem has significant hidden complexity (Google session tokens for billing, race conditions on fast typing, Places API initialization timing). `use-places-autocomplete` solves all of these.

---

## Common Pitfalls

### Pitfall 1: use-places-autocomplete v4 Init Timing (CRITICAL)
**What goes wrong:** Component mounts before `window.google` exists → hook throws `google is not defined`
**Why it happens:** v4 removed auto-initialization from `window.onload`. Script must be loaded manually.
**How to avoid:** `initOnMount: false` in hook config. Call `init()` inside `useEffect` after `@googlemaps/js-api-loader` resolves.
**Warning signs:** `ReferenceError: google is not defined` in the console on first load.

### Pitfall 2: Google Maps API Key Exposure
**What goes wrong:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` used for Places API (client-side) gets scraped, racking up charges.
**Why it happens:** Environment variable prefix `NEXT_PUBLIC_` is intentionally exposed to the browser.
**How to avoid:** Restrict the key in Google Cloud Console: HTTP Referrer restriction to your domain + enable only the Places API. Do NOT enable Routes API on this key — Routes API key stays server-only.
**Warning signs:** Unexpected charges on Google Cloud billing dashboard.

### Pitfall 3: Set<number> Not Serializable to JSON
**What goes wrong:** `completedSteps: new Set([1])` → stored as `{}` in sessionStorage → restored as empty object → wizard thinks no steps completed.
**Why it happens:** `JSON.stringify(new Set([1]))` → `"{}"`. Zustand's persist middleware uses JSON.
**How to avoid:** Use `partialize` in persist config to convert `Set → Array` before storage. On store init, construct Set from the array.
**Warning signs:** After page refresh, progress bar shows no completed steps despite having advanced.

### Pitfall 4: Wizard State Lost on /book Navigation
**What goes wrong:** User fills Step 1, navigates to another page, returns to /book → form is blank.
**Why it happens:** Without `persist` middleware, Zustand store is in-memory only.
**How to avoid:** `persist` middleware with `sessionStorage` (not `localStorage` — clears on tab close, which is correct for a booking wizard). Ship this in Wave 1 (store setup), not as an afterthought.
**Warning signs:** Form resets when navigating away and back.

### Pitfall 5: Airport Field Visually Disabled vs Functionally Disabled
**What goes wrong:** Using `disabled` attribute on the read-only airport field causes it to be excluded from tab order and form submission, and browser applies native grey styling.
**Why it happens:** HTML `disabled` has semantic + visual side effects.
**How to avoid:** Use `readOnly` attribute (or no attribute + `pointer-events: none`) with explicit styling per UI-SPEC: `var(--anthracite)` background, `var(--copper)` text, plane icon. The field remains in tab order (screen reader accessible).
**Warning signs:** Airport field appears in native browser grey / cannot be read by screen reader.

### Pitfall 6: Mobile Next Button Hidden by Keyboard
**What goes wrong:** On iOS/Android, address input opens software keyboard → viewport shrinks → fixed Next button trapped under keyboard.
**Why it happens:** Fixed-position elements don't account for visual viewport changes on mobile.
**How to avoid:** Use `position: sticky; bottom: 0` on the button bar (not `position: fixed`) on mobile. Sticky respects the scrollable container. Alternatively detect viewport resize and scroll step content.
**Warning signs:** Next button invisible when address field is focused on iPhone.

### Pitfall 7: Unresolved Typed Text Treated as Valid Address
**What goes wrong:** User types "Wenceslas" in origin but doesn't select from dropdown → `origin` stays null → Next button should remain disabled but code checks `inputValue !== ''` instead of `origin !== null`.
**Why it happens:** `use-places-autocomplete` separates `value` (input text) from the resolved place result. The hook only returns text; you must call `getGeocode` + `getLatLng` on selection.
**How to avoid:** Validation checks Zustand `origin` / `destination` (the resolved object), never the input field text string.
**Warning signs:** Next button enabled after typing but not selecting an address.

---

## Code Examples

Verified patterns from official sources and registry-confirmed versions:

### Zustand 5.x — Store Creation
```typescript
// Source: https://zustand.docs.pmnd.rs/ (verified against v5.0.12)
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// v5 change: createStore API is separate from create()
// For React components, always use create() (not createStore)
const useStore = create<MyState>()(
  persist(
    (set) => ({ /* initial state + actions */ }),
    {
      name: 'my-store-key',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
```

### use-places-autocomplete v4 — Full Selection Handler
```typescript
// Source: https://github.com/wellyshen/use-places-autocomplete v4 README
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete'

const handleSelect = async (description: string, placeId: string) => {
  setValue(description, false)   // false = don't fetch suggestions
  clearSuggestions()

  const results = await getGeocode({ address: description })
  const { lat, lng } = await getLatLng(results[0])

  onSelect({ address: description, placeId, lat, lng })
}
```

### Lucide React — Icon Usage
```tsx
// Source: https://lucide.dev/guide/packages/lucide-react (v1.6.0)
import { ArrowUpDown, Plane, X, Plus, Minus } from 'lucide-react'

// Swap button
<button aria-label="Swap origin and destination" onClick={handleSwap}>
  <ArrowUpDown size={16} color="var(--warmgrey)" />
</button>

// Plane icon in read-only airport field
<Plane size={16} color="var(--copper)" />
```

### react-hook-form v7 — Per-Step Form
```typescript
// Source: react-hook-form v7 docs (https://react-hook-form.com)
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// Note: For wizard, react-hook-form manages field validation only.
// Zustand manages the canonical data across steps.
// On valid submit, copy react-hook-form values into Zustand store.

const step1Schema = z.object({
  // Address fields are managed outside react-hook-form (Places Autocomplete)
  // react-hook-form handles only fields with standard inputs
  passengers: z.number().min(1).max(8),
  luggage: z.number().min(0).max(8),
})
```

### CSS Step Transition (No framer-motion)
```tsx
// Use key prop to remount — triggers CSS animation on step change
// Source: React docs (key prop) + existing globals.css fadeUp keyframe

<div
  key={currentStep}
  style={{ animation: 'fadeUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
>
  {stepContent[currentStep]}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Relevant Change | Impact |
|--------------|------------------|-----------------|--------|
| `zustand` v4 `persist` at `zustand/middleware/persist` | `zustand` v5 `persist` at `zustand/middleware` | v5 consolidated sub-path imports | Import path changed — use `zustand/middleware`, not deeper paths |
| `use-places-autocomplete` v3 `initOnMount: true` default | v4 `initOnMount: false` required | v4 removed auto window.onload | Must manually init after script loads |
| Zustand `createStore` for React | Zustand `create` for React | v5 separation of concerns | `createStore` = vanilla; `create` = React hooks — always use `create` for components |
| Zod v3 imports | Zod v4 imports | v4 is a major release with new API | Some v3 patterns (`.parse`, `.safeParse`) remain; new v4 features available |

**Deprecated/outdated:**
- `use-places-autocomplete` v3 auto-init pattern: No longer works in v4. Remove any examples showing `initOnMount: true`.
- Zustand v4 `immer` middleware path `zustand/middleware/immer`: Moved in v5 — not needed for this phase.

---

## Open Questions

1. **Google Maps API Key Environment Variable**
   - What we know: Key must be in `.env.local` as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - What's unclear: Whether the key exists — the project has no `.env.local` yet
   - Recommendation: Wave 0 task — create `.env.local` with a placeholder key. Document that a real key is required from Google Cloud Console with Places API enabled and HTTP Referrer restricted.

2. **`Set<number>` Restoration from sessionStorage**
   - What we know: JSON.stringify destroys Set; partialize converts to Array
   - What's unclear: Zustand 5's persist `partialize` output is stored, but the `onRehydrateStorage` callback is needed to reconvert Array → Set on load
   - Recommendation: Test sessionStorage round-trip in Wave 1 immediately after store creation. Use `onRehydrateStorage` in persist config if needed.

3. **Tailwind 4 + CSS Custom Properties**
   - What we know: The project uses Tailwind 4 with `@theme` block for color tokens. CSS custom properties are also declared in `:root`. Both exist.
   - What's unclear: Whether Tailwind 4 color utilities (e.g., `text-copper`) work alongside `var(--copper)` or only one system should be used.
   - Recommendation: Follow existing components — use `var(--copper)` via inline styles or arbitrary Tailwind values `text-[var(--copper)]`. Do NOT add new Tailwind color utilities.

---

## Validation Architecture

### Test Framework

No test framework is currently installed in the project. Wave 0 must establish it.

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + @testing-library/react 16.x |
| Config file | `prestigo/vitest.config.ts` — Wave 0 creates this |
| Quick run command | `cd prestigo && npx vitest run --reporter=verbose` |
| Full suite command | `cd prestigo && npx vitest run` |

**Why Vitest over Jest:** Next.js 16 App Router uses ESM. Vitest has native ESM support with zero config, matches Jest's API, and integrates with Vite's transform pipeline. Jest requires `babel-jest` or `ts-jest` for ESM handling, adding friction.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ARCH-01 | Zustand store has correct initial state and action types | unit | `npx vitest run tests/booking-store.test.ts` | ❌ Wave 0 |
| ARCH-02 | State persists to sessionStorage and restores on mount | unit | `npx vitest run tests/booking-store.test.ts` | ❌ Wave 0 |
| ARCH-03 | Types compile — TripType, BookingStore, PlaceResult assignable | type-check | `cd prestigo && npx tsc --noEmit` | ❌ Wave 0 |
| WIZD-01 | BookingWizard renders Step 1 by default | unit | `npx vitest run tests/BookingWizard.test.tsx` | ❌ Wave 0 |
| WIZD-02 | ProgressBar renders correct active/completed/pending states | unit | `npx vitest run tests/ProgressBar.test.tsx` | ❌ Wave 0 |
| WIZD-03 | Next button disabled when origin is null | unit | `npx vitest run tests/Step1TripType.test.tsx` | ❌ Wave 0 |
| WIZD-04 | Back button decrements currentStep, data intact | unit | `npx vitest run tests/BookingWizard.test.tsx` | ❌ Wave 0 |
| WIZD-05 | Step container has fadeUp animation class on step change | unit | `npx vitest run tests/BookingWizard.test.tsx` | ❌ Wave 0 |
| WIZD-06 | /book page renders BookingWizard (smoke) | smoke | manual browser check | manual only |
| STEP1-01 | Selecting trip type updates Zustand tripType | unit | `npx vitest run tests/TripTypeTabs.test.tsx` | ❌ Wave 0 |
| STEP1-02/03 | AddressInput renders suggestion dropdown on 2+ char input | unit | `npx vitest run tests/AddressInput.test.tsx` | ❌ Wave 0 |
| STEP1-04 | Airport Pickup sets destination to PRG, field read-only | unit | `npx vitest run tests/Step1TripType.test.tsx` | ❌ Wave 0 |
| STEP1-05/06 | Stepper increments/decrements within bounds | unit | `npx vitest run tests/Stepper.test.tsx` | ❌ Wave 0 |
| STEP1-07 | Hourly: destination hidden, duration selector visible | unit | `npx vitest run tests/Step1TripType.test.tsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd prestigo && npx vitest run --reporter=verbose` (full suite — fast, no browser needed)
- **Per wave merge:** `cd prestigo && npx vitest run && npx tsc --noEmit`
- **Phase gate:** Full suite green + `tsc --noEmit` clean before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `prestigo/vitest.config.ts` — Vitest config with jsdom environment, path aliases
- [ ] `prestigo/tests/setup.ts` — Testing Library setup file
- [ ] `prestigo/tests/booking-store.test.ts` — covers ARCH-01, ARCH-02
- [ ] `prestigo/tests/BookingWizard.test.tsx` — covers WIZD-01, WIZD-04, WIZD-05
- [ ] `prestigo/tests/ProgressBar.test.tsx` — covers WIZD-02
- [ ] `prestigo/tests/TripTypeTabs.test.tsx` — covers STEP1-01
- [ ] `prestigo/tests/AddressInput.test.tsx` — covers STEP1-02, STEP1-03 (Places API mocked)
- [ ] `prestigo/tests/Step1TripType.test.tsx` — covers WIZD-03, STEP1-04, STEP1-07
- [ ] `prestigo/tests/Stepper.test.tsx` — covers STEP1-05, STEP1-06
- [ ] Framework install: `cd prestigo && npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom`
- [ ] `.env.local` with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=placeholder` — required for dev build

---

## Sources

### Primary (HIGH confidence)
- `prestigo/package.json` — Confirmed installed versions (Next 16.2.1, React 19.2.3, Tailwind 4)
- `prestigo/app/globals.css` — All CSS custom properties, keyframes, utility classes confirmed
- `prestigo/app/book/page.tsx` — Current placeholder structure confirmed
- `npm view [package] version` (2026-03-24) — Confirmed registry versions for all 9 packages to install
- `.planning/phases/01-foundation-trip-entry/01-UI-SPEC.md` — Visual contract (all component specs)
- `.planning/phases/01-foundation-trip-entry/01-CONTEXT.md` — All locked decisions

### Secondary (MEDIUM confidence)
- Zustand 5.x docs pattern (https://zustand.docs.pmnd.rs) — verified `persist` + `createJSONStorage` API
- use-places-autocomplete v4 README (https://github.com/wellyshen/use-places-autocomplete) — `initOnMount: false` requirement confirmed
- `.planning/research/STACK.md` — Prior stack research (note: versions listed there are from March 2025, superseded by npm registry verification above)

### Tertiary (LOW confidence — flag for validation)
- PRG airport `placeId` value (`ChIJA_IVS6-UC0cRTZBQLvHG-ec`) — sourced from common reference; verify in Places API before using, or omit placeId since PRG uses hardcoded coordinates only
- Vitest recommendation for Next.js 16 App Router — based on ESM compatibility reasoning; should be validated against Next.js 16 official testing docs before setting up Wave 0

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed against npm registry on 2026-03-24
- Architecture: HIGH — derived from locked CONTEXT.md decisions + existing codebase structure
- Pitfalls: HIGH — critical ones (v4 init timing, Set serialization, API key exposure) verified against library changelogs; mobile keyboard pitfall is MEDIUM (general mobile web knowledge)
- Test framework recommendation: MEDIUM — Vitest is well-established for ESM/Next.js but not verified against official Next.js 16 docs

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable ecosystem — Zustand 5, react-hook-form 7, use-places-autocomplete 4 are mature releases; re-verify if > 30 days elapsed)
