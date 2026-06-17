# Phase 59: Booking Flow Redesign (Blacklane) — Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 9 new/modified files
**Analogs found:** 8 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `components/booking/EntryBar.tsx` | component | request-response | `components/booking/steps/Step1TripType.tsx` | exact |
| `components/booking/RouteMap.tsx` | component | event-driven | `components/booking/AddressInput.tsx` | role-match (same SDK loader) |
| `components/booking/VehicleSlideshow.tsx` | component | event-driven | `components/booking/VehicleCard.tsx` | role-match |
| `components/booking/StickyBookingPanel.tsx` | component | request-response | `components/booking/steps/Step3Vehicle.tsx` (PriceSummary block) | role-match |
| `components/booking/steps/Step3Vehicle.tsx` | component | CRUD | `components/booking/steps/Step3Vehicle.tsx` (self — modify layout) | exact |
| `components/booking/VehicleCard.tsx` | component | request-response | `components/booking/VehicleCard.tsx` (self — modify shell) | exact |
| `components/booking/TripTypeTabs.tsx` | component | event-driven | `components/booking/TripTypeTabs.tsx` (self — minor modify) | exact |
| `components/booking/BookingWizard.tsx` | component | event-driven | `components/booking/BookingWizard.tsx` (self — modify step map) | exact |
| `components/booking/ProgressBar.tsx` | component | request-response | `components/booking/ProgressBar.tsx` (self — prop change only) | exact |

---

## Pattern Assignments

### `components/booking/EntryBar.tsx` (NEW — replaces Step1TripType + Step2DateTime)

**Primary analog:** `components/booking/steps/Step1TripType.tsx`
**Secondary analog:** `components/booking/steps/Step2DateTime.tsx`

**Imports pattern** (Step1TripType.tsx lines 1–10):
```typescript
'use client'

import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import TripTypeTabs from '@/components/booking/TripTypeTabs'
import AddressInput from '@/components/booking/AddressInput'
import DurationSelector from '@/components/booking/DurationSelector'
import { useBookingStore } from '@/lib/booking-store'
```

**Store reads / writes pattern** (Step1TripType.tsx lines 13–29):
```typescript
const tripType = useBookingStore((s) => s.tripType)
const origin = useBookingStore((s) => s.origin)
const destination = useBookingStore((s) => s.destination)
const setOrigin = useBookingStore((s) => s.setOrigin)
const setDestination = useBookingStore((s) => s.setDestination)
const nextStep = useBookingStore((s) => s.nextStep)
```

**Stale-closure prevention for handleSubmit** (Step2DateTime.tsx lines 222–228):
```typescript
function handleHourSelect(hour: string) {
  // Read fresh state from the store to avoid stale closures
  const current = useBookingStore.getState().pickupTime
  const currentMinute = current ? current.split(':')[1] : null
  setPickupTime(`${hour}:${currentMinute ?? '00'}`)
}
```
Apply the same `useBookingStore.getState()` pattern in EntryBar's `handleSubmit()` to read all field values before calling `nextStep()`.

**Validation + inline error pattern** (Step1TripType.tsx lines 38–60):
```typescript
const [errors, setErrors] = useState<Record<string, string>>({})

function validateStep1(): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!origin) errs.origin = 'Pickup location is required to continue.'
  if (tripType !== 'hourly' && !destination) errs.destination = 'Destination is required to continue.'
  return errs
}

const handleNext = () => {
  const validationErrors = validateStep1()
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors)
    return
  }
  setErrors({})
  nextStep()
}
```

**15-minute AM/PM time slot generation** (Step2DateTime.tsx lines 8–13 + RESEARCH.md Pattern 2):
```typescript
// Step2DateTime.tsx pattern (5-min slots):
const HOURS: string[] = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
const MINUTES: string[] = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))

// Adapt to 15-min AM/PM slots for EntryBar (96 total):
const TIME_SLOTS_AMPM: Array<{ display: string; value24h: string }> =
  Array.from({ length: 96 }, (_, i) => {
    const totalMinutes = i * 15
    const h24 = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const isPM = h24 >= 12
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
    const display = `${h12}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
    const value24h = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    return { display, value24h }
  })
// Store write: setPickupTime(slot.value24h) — preserves 24h store contract (D-08)
```

**12-hour lead-time slot blocking** (Step2DateTime.tsx lines 15–18, 199–210):
```typescript
const MIN_LEAD_HOURS = 12

function isSlotDisabled(slot24h: string, pickupDateStr: string | null): boolean {
  if (!pickupDateStr) return false
  const slotDT = new Date(`${pickupDateStr}T${slot24h}:00`)
  const minDT = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000)
  return slotDT < minDT
}
```

**Conditional flight number field** (uses `isAirportPlace` from types/booking.ts):
```typescript
import { isAirportPlace } from '@/types/booking'
// In component body, after origin state is set:
const showFlightNumber = isAirportPlace(origin)
// Render: {showFlightNumber && <input type="text" ... />}
```

**Return date expander animation** (RESEARCH.md Code Examples):
```tsx
const [showReturn, setShowReturn] = useState(false)

<div style={{
  maxHeight: showReturn ? '400px' : 0,
  overflow: 'hidden',
  transition: 'max-height 300ms ease',
}}>
  {/* Return date + time fields */}
</div>
```

**Light theme wrapper** (D-20):
```tsx
return (
  <div className="theme-light">
    <TripTypeTabs />
    {/* All child components inherit inverted tokens */}
  </div>
)
```

**CTA button pattern** (Step1TripType.tsx lines 94–107):
```tsx
<button
  type="button"
  className="btn-primary"
  onClick={handleNext}
  aria-disabled={!isValid ? 'true' : 'false'}
  style={{ opacity: isValid ? 1 : 0.4, cursor: isValid ? 'pointer' : 'not-allowed' }}
>
  Посмотреть варианты
</button>
```

**analytics — form_start on mount** (BookingWizard.tsx lines 168–172):
```typescript
// In EntryBar useEffect (once on mount):
if (typeof window !== 'undefined') {
  const w = window as typeof window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] }
  if (typeof w.gtag === 'function') {
    w.gtag('event', 'form_start', { form_id: 'booking_wizard', form_name: 'Booking Wizard' })
  }
}
```

---

### `components/booking/RouteMap.tsx` (NEW)

**Primary analog:** `components/booking/AddressInput.tsx` (Google Maps JS SDK loader singleton)

**Imports + loader singleton** (AddressInput.tsx lines 1–22):
```typescript
'use client'

import { useEffect, useRef } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

// Extend the singleton to include 'maps' alongside 'places'
let mapsLoaderPromise: Promise<void> | null = null

function ensureMapsLibraryLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.Map) {
    return Promise.resolve()
  }
  if (mapsLoaderPromise) return mapsLoaderPromise
  // setOptions is idempotent — same key as AddressInput; add 'maps' to libraries
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: ['maps', 'places'],  // NOTE: must include 'places' to not break AddressInput
    v: 'weekly',
  })
  mapsLoaderPromise = importLibrary('maps').then(() => undefined)
  return mapsLoaderPromise
}
```

**useEffect with cleanup pattern** (AddressInput.tsx pattern adapted):
```typescript
useEffect(() => {
  if (!mapRef.current || !origin || !destination) return
  let cancelled = false

  ensureMapsLibraryLoaded().then(() => {
    if (cancelled || !mapRef.current) return
    const map = new google.maps.Map(mapRef.current, {
      disableDefaultUI: true,
      styles: GREYSCALE_STYLES,
    })
    // DirectionsService + animated dot...
    const cancelAnimation = animateDotAlongPath(map, path, 3000, 'var(--copper)')
    return () => { cancelAnimation() }
  })

  return () => { cancelled = true }
}, [origin, destination])
```

**RAF animation cleanup** (RESEARCH.md Pitfall 6 + Code Examples):
```typescript
function animateDotAlongPath(map, path, durationMs, color): () => void {
  // ...setup marker...
  let rafId: number
  function step(now: number) {
    // interpolate position...
    if (t < 1) rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
  return () => cancelAnimationFrame(rafId)  // cleanup returned to caller
}
```

**Return JSX** (no google.* in render — all inside useEffect):
```tsx
return (
  <div
    ref={mapRef}
    style={{ height: 220, background: 'var(--anthracite-mid)' }}
    aria-label="Route map"
  />
)
```

---

### `components/booking/VehicleSlideshow.tsx` (NEW)

**Primary analog:** `components/booking/VehicleCard.tsx` (image + state pattern)

**Imports pattern** (VehicleCard.tsx lines 1–6):
```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
```

**Auto-play setInterval with cleanup** (established project pattern):
```typescript
const [activeIndex, setActiveIndex] = useState(0)
const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

useEffect(() => {
  intervalRef.current = setInterval(() => {
    setActiveIndex((prev) => (prev + 1) % slides.length)
  }, 4000)
  return () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
  }
}, [slides.length])
```

**Image rendering pattern** (VehicleCard.tsx lines 69–78):
```tsx
<div style={{ position: 'relative', width: '100%', aspectRatio: '3/2', overflow: 'hidden' }}>
  <Image
    src={slide.src}
    alt={slide.alt}
    fill
    style={{ objectFit: 'cover' }}
    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
  />
</div>
```

---

### `components/booking/StickyBookingPanel.tsx` (NEW)

**Primary analog:** `components/booking/steps/Step3Vehicle.tsx` (PriceSummary integration + analytics push)

**Imports + store reads**:
```typescript
'use client'

import { useBookingStore } from '@/lib/booking-store'
import { trackMetaEvent } from '@/components/MetaPixel'
import RouteMap from '@/components/booking/RouteMap'
```

**begin_checkout + InitiateCheckout on CTA click** (BookingWizard.tsx lines 197–199, moved to this component):
```typescript
const handleSelectClass = () => {
  const s = useBookingStore.getState()  // fresh read
  const totalEur = /* compute from priceBreakdown[vehicleClass] */
  // GA4
  if (typeof window !== 'undefined') {
    const w = window as typeof window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] }
    if (typeof w.gtag === 'function') {
      w.gtag('event', 'begin_checkout', { currency, value: totalEur, items })
    }
  }
  // Meta Pixel
  trackMetaEvent('InitiateCheckout', { value: totalEur, currency, num_items: 1 })
  // Advance wizard
  useBookingStore.getState().nextStep()
}
```

**GA4 push helper** (copy from BookingWizard.tsx lines 110–121 pattern):
```typescript
const w = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
if (typeof w.gtag === 'function') {
  w.gtag('event', eventName, params)
} else {
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push(['event', eventName, params])
  w.dataLayer.push({ event: eventName, ...params })
}
```

**Sticky panel layout** (D-09 + UI-SPEC):
```tsx
// Desktop only — hidden on mobile (D-10)
<div
  className="hidden md:block sticky top-4"
  style={{ width: 320 }}
>
  <RouteMap origin={origin} destination={destination} pickupTime={pickupTime} />
  {/* booking summary */}
  <button type="button" className="btn-primary" onClick={handleSelectClass}>
    Select {VEHICLE_LABELS[vehicleClass]}
  </button>
</div>
```

---

### `components/booking/steps/Step3Vehicle.tsx` (MODIFY — new 2-col layout)

**Self-analog** — keep all existing logic (fetchPrice, useEffect, setVehicleClass auto-select) and replace layout only.

**Existing layout to replace** (Step3Vehicle.tsx lines 224–245):
```tsx
// CURRENT (replace this):
<div className="hidden md:grid" style={{ gridTemplateColumns: '1fr 320px', gap: 32 }}>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
    {cards}
  </div>
  <PriceSummary desktopOnly />
</div>

// NEW (replace PriceSummary with StickyBookingPanel, add VehicleSlideshow below):
<div className="hidden md:grid theme-light" style={{ gridTemplateColumns: '1fr 320px', gap: 32 }}>
  <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
      {cards}
    </div>
    <VehicleSlideshow />
  </div>
  <StickyBookingPanel />
</div>
```

**fetchPrice pattern to preserve** (Step3Vehicle.tsx lines 99–141):
```typescript
const fetchPrice = useCallback(async () => {
  const s = useBookingStore.getState()  // stale-closure-safe read
  setLoading(true)
  try {
    const res = await fetch('/api/calculate-price', { ... })
    const data = await res.json()
    setPriceBreakdown(data.prices)
    // ...
  } catch {
    setQuoteMode(true)
    setPriceBreakdown(null)
    setFetchError(true)
  } finally {
    setLoading(false)
  }
}, [setPriceBreakdown, ...])
```

**select_item analytics push to preserve** (Step3Vehicle.tsx lines 17–49):
```typescript
function pushVehicleSelect(vehicleKey, price, currency, tripCategory): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
  const params = { item_list_name: 'Vehicle Selection', currency, items: [...] }
  if (typeof w.gtag === 'function') {
    w.gtag('event', 'select_item', params)
  } else {
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push(['event', 'select_item', params])
    w.dataLayer.push({ event: 'select_item', ...params })
  }
}
```

---

### `components/booking/VehicleCard.tsx` (MODIFY — new visual shell)

**Self-analog** — keep props interface, price logic, CZK conversion; replace visual shell.

**Props interface to keep** (VehicleCard.tsx lines 8–20):
```typescript
interface VehicleCardProps {
  config: VehicleConfig
  price: PriceBreakdown | null
  roundTripPrice: PriceBreakdown | null
  returnDiscountPercent: number
  showRoundTripOption: boolean
  isSelectedOneWay: boolean
  isSelectedRoundTrip: boolean
  isLoading: boolean
  quoteMode: boolean
  onSelectOneWay: () => void
  onSelectRoundTrip: () => void
}
```

**Selection state / border pattern to keep** (VehicleCard.tsx lines 54–68):
```typescript
const isSelected = isSelectedOneWay || isSelectedRoundTrip
const bgColor = isSelected || hovered ? 'var(--anthracite-light)' : 'var(--anthracite-mid)'
// border: isSelected ? '2px solid var(--copper)' : '1px solid var(--anthracite-light)'
```

**Image aspect ratio change** (VehicleCard.tsx line 70 — change 16/9 → 3/2 per D-14):
```tsx
// CURRENT:
<div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', ... }}>

// NEW:
<div style={{ position: 'relative', width: '100%', aspectRatio: '3/2', ... }}>
```

**"What's included" list to add** (D-16 — 6 items, same on every card):
```tsx
// Place after capacity row, before price buttons:
const INCLUDED_ITEMS = [
  'Фиксированная цена',
  'Зарядка для телефонов',
  '60 минут бесплатного ожидания',
  'Wi-Fi',
  'Вода на борту',
  'Meet & greet',
]
<ul style={{ listStyle: 'none', margin: '16px 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
  {INCLUDED_ITEMS.map((item) => (
    <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)' }}>
      <Check size={12} style={{ color: 'var(--copper)', flexShrink: 0 }} aria-hidden="true" />
      {item}
    </li>
  ))}
</ul>
```

**Capacity row icons to keep** (VehicleCard.tsx lines 97–112) — copy unchanged.

**Price buttons logic to keep** (VehicleCard.tsx lines 114–198) — copy unchanged.

---

### `components/booking/TripTypeTabs.tsx` (MODIFY — hide Multi-Day tab in entry bar context)

**Self-analog** (TripTypeTabs.tsx lines 1–91).

**Current TRIP_TYPES** (lines 11–15):
```typescript
const TRIP_TYPES: TripTabEntry[] = [
  { kind: 'store', value: 'transfer', label: 'TRANSFER' },
  { kind: 'store', value: 'hourly', label: 'HOURLY' },
  { kind: 'navigate', href: '/book/multi-day', label: 'MULTI-DAY' },
]
```

**Pattern to follow — add optional prop:**
```typescript
interface TripTypeTabsProps {
  hideMultiDay?: boolean  // set to true from EntryBar (D-02)
}
export default function TripTypeTabs({ hideMultiDay = false }: TripTypeTabsProps) {
  const tabs = hideMultiDay ? TRIP_TYPES.filter((t) => t.kind === 'store') : TRIP_TYPES
  // ...render tabs
}
```

---

### `components/booking/BookingWizard.tsx` (MODIFY — step numbering + EntryBar integration)

**Self-analog** (BookingWizard.tsx lines 1–386).

**renderStepContent — change case 1 and 2** (lines 237–253):
```typescript
// CURRENT:
case 1: return <Step1TripType />
case 2: return <Step2DateTime />
case 3: return <Step3Vehicle />

// NEW:
case 1: return <EntryBar />   // replaces both Step1 and Step2
case 2: return <Step3Vehicle />
case 3: return <Step4Extras />
case 4: return <Step5Passenger />
case 5: return <Step6Payment />
```

**STEP_NAMES update** (BookingWizard.tsx lines 149–156):
```typescript
// CURRENT:
const STEP_NAMES: Record<number, string> = {
  1: 'trip_type', 2: 'date_time', 3: 'vehicle', 4: 'extras', 5: 'passenger', 6: 'payment',
}

// NEW (5 steps):
const STEP_NAMES: Record<number, string> = {
  1: 'entry_bar', 2: 'vehicle', 3: 'extras', 4: 'passenger', 5: 'payment',
}
```

**ProgressBar prop update** (BookingWizard.tsx line 315):
```tsx
// CURRENT:
<ProgressBar currentStep={currentStep} completedSteps={completedSteps} totalSteps={6} />

// NEW:
<ProgressBar currentStep={currentStep} completedSteps={completedSteps} totalSteps={5} />
```

**Step heading copy update** (BookingWizard.tsx lines 337–348):
```tsx
// Update heading strings and "STEP X OF 6" → "STEP X OF 5"
// Step 1 = 'Plan your journey'
// Step 2 = 'Choose your vehicle'
// Step 3 = 'Add extras'
// Step 4 = 'Passenger details'
// Step 5 = 'Payment'
```

**begin_checkout removal** (BookingWizard.tsx lines 197–199):
```typescript
// REMOVE this block (moved to StickyBookingPanel.tsx):
} else if (currentStep === 5 && vehicleClass) {
  push('begin_checkout', { currency, value: totalEur, items })
  trackMetaEvent('InitiateCheckout', { value: totalEur, currency, num_items: 1 })
}
// ADJUST: currentStep 6 → 5 for add_payment_info:
} else if (currentStep === 5 && vehicleClass) {
  push('add_payment_info', { ... })
  trackMetaEvent('AddPaymentInfo', { ... })
}
```

**canProceed switch update** (BookingWizard.tsx lines 208–235):
```typescript
// CURRENT: case 2 → date/time validation; case 3 → vehicleClass
// NEW: case 1 → EntryBar handles its own validation internally (returns true for wizard)
//      case 2 → vehicleClass !== null check (was case 3)
switch (currentStep) {
  case 1: return true  // EntryBar validates and calls nextStep() itself
  case 2: return vehicleClass !== null && (tripType !== 'round_trip' || (returnDate !== null && returnTime !== null))
  case 3: return true  // extras optional
  case 4: return !!passengerDetails?.firstName && !!passengerDetails?.lastName && !!passengerDetails?.email && !!passengerDetails?.phone
  default: return true
}
```

**Generic Back/Next button bar condition update** (BookingWizard.tsx line 360):
```tsx
// CURRENT: {currentStep > 1 && currentStep < 6 && ...}
// NEW:     {currentStep > 1 && currentStep < 5 && ...}
// Also: mobile bar still hidden at step 2 (vehicle) because StickyBookingPanel handles CTA
{currentStep > 1 && currentStep < 5 && currentStep !== 2 && ...}
```

---

### `components/booking/ProgressBar.tsx` (MODIFY — aria-label update only)

**Self-analog** (ProgressBar.tsx lines 1–82).

**Only change: hardcoded aria-label string** (line 13):
```tsx
// CURRENT:
aria-label={`Booking progress: Step ${currentStep} of 6`}
// NEW:
aria-label={`Booking progress: Step ${currentStep} of 5`}
```
No other changes — the component is generic and driven by `totalSteps` prop.

---

## Shared Patterns

### `'use client'` directive
**Source:** All booking components
**Apply to:** EntryBar.tsx, RouteMap.tsx, VehicleSlideshow.tsx, StickyBookingPanel.tsx
```typescript
'use client'
// Must be first line — these are all browser-only components
```

### CSS variable usage (no hex literals in themed elements)
**Source:** VehicleCard.tsx, Step2DateTime.tsx, BookingWizard.tsx
**Apply to:** All new components
```typescript
// All color values via CSS vars so .theme-light inversion works:
color: 'var(--offwhite)'      // primary text
color: 'var(--warmgrey)'      // secondary text
background: 'var(--anthracite-mid)'  // input/card backgrounds
border: '1px solid var(--anthracite-light)'
color: 'var(--copper)'        // accent / CTA
```

### Zustand stale-closure prevention
**Source:** Step3Vehicle.tsx line 100, Step2DateTime.tsx lines 224–226
**Apply to:** EntryBar.tsx (handleSubmit), StickyBookingPanel.tsx (handleSelectClass)
```typescript
// In event handlers, read fresh state:
const s = useBookingStore.getState()
// NOT: rely on hook-subscribed values inside closures
```

### GA4 push helper pattern
**Source:** BookingWizard.tsx lines 110–121
**Apply to:** EntryBar.tsx (form_start), StickyBookingPanel.tsx (begin_checkout)
```typescript
const w = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
if (typeof w.gtag === 'function') {
  w.gtag('event', eventName, params)
} else {
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push(['event', eventName, params])
  w.dataLayer.push({ event: eventName, ...params })
}
```

### Dedup ref for one-shot analytics events
**Source:** BookingWizard.tsx lines 103–104, 111–113
**Apply to:** EntryBar.tsx (form_start — fire only once)
```typescript
const funnelFiredRef = useRef<Set<string>>(new Set())
// Before push:
if (funnelFiredRef.current.has(key)) return
funnelFiredRef.current.add(key)
```

### `next/image` fill pattern
**Source:** VehicleCard.tsx lines 69–78
**Apply to:** VehicleCard.tsx (updated), VehicleSlideshow.tsx
```tsx
<div style={{ position: 'relative', width: '100%', aspectRatio: '3/2', overflow: 'hidden' }}>
  <Image src={src} alt={alt} fill style={{ objectFit: 'cover' }}
    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
</div>
```

### Vitest Wave 0 test scaffold + Google Maps mock
**Source:** BookingWizard.test.tsx lines 1–14 (vi.mock pattern)
**Apply to:** All new test files
```typescript
// tests/RouteMap.test.tsx — Wave 0 mock pattern
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue(undefined),
}))
Object.defineProperty(window, 'google', {
  value: { maps: { Map: vi.fn(), DirectionsService: vi.fn(), Marker: vi.fn() } },
  writable: true,
})
// Prevent BookingWizard deeplink reset from interfering:
sessionStorage.setItem('booking_deeplink', '1')
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `/public/vehicles/*.jpg` (12 images) | static asset | file-I/O | No existing Higgsfield vehicle photos in `/public/vehicles/`; must be generated. Planner must include image generation tasks as the critical-path blocker before component tasks. |

---

## Metadata

**Analog search scope:** `components/booking/`, `components/booking/steps/`, `tests/`
**Files read:** BookingWizard.tsx, Step1TripType.tsx, Step2DateTime.tsx, Step3Vehicle.tsx, VehicleCard.tsx, AddressInput.tsx, TripTypeTabs.tsx, ProgressBar.tsx, BookingWizard.test.tsx
**Pattern extraction date:** 2026-06-17
