# Phase 59: Booking Flow Redesign (Blacklane) — Research

**Researched:** 2026-06-17
**Domain:** React/Next.js UI redesign — booking wizard, Google Maps JS SDK, image assets, analytics preservation
**Confidence:** HIGH (all findings verified against live codebase; no guesses about store shape or analytics wiring)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The unified entry bar is a single screen showing From / To / Date / Time simultaneously (one consolidated form, not two separate steps). It replaces the current Step1TripType + Step2DateTime.
- **D-02:** Trip type (Transfer vs Hourly) is selected via tabs above the bar ("Transfer" active by default). When Hourly is selected, the "To" field is hidden and a duration/hours selector appears instead.
- **D-03:** Round trip is handled via a checkbox "Add return" below the bar. When checked, a return date/time field expands.
- **D-04:** The CTA label on the entry bar is "Посмотреть варианты". On submit it transitions to Step3.
- **D-05:** No pax selector in the entry bar. Passenger capacity is communicated on the vehicle cards.
- **D-06:** When the From address is detected as an airport (using the existing `isAirportPlace` helper in `types/booking.ts`), an additional flight number text field appears inline. The time-slot stays required.
- **D-07:** Time-slot granularity is 15 minutes with AM/PM format (96 options per day).
- **D-08:** The existing store field `pickupTime` (HH:MM, 24h) is preserved. The dropdown renders AM/PM labels but stores in 24h.
- **D-09:** Vehicle class cards on the left. A sticky right panel (320px) contains: animated route map + booking summary + CTA.
- **D-10:** Mobile: right sticky panel hidden. Cards full-width. Map hidden on mobile.
- **D-11:** The map uses Google Maps JS SDK (not Static API). Animates a moving point along the polyline once on Step3 load.
- **D-12:** Map markers show pickup time and drop-off time in small labels directly on the map.
- **D-13:** Existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` reused for Maps JS SDK.
- **D-14:** Each vehicle card shows: exterior photo (aspect 3/2), class name, price, pax capacity icon, luggage capacity icon.
- **D-15:** Below the three cards, a separate expandable block shows an animated slideshow of interior + luggage photos.
- **D-16:** "What's included" list (6 items) appears on each card. Items: Fixed price, Phone charging, 60 min free waiting, Wi-Fi, Water on board, Meet & greet.
- **D-17:** Higgsfield AI image generation is a planned sub-task of Phase 59. 3 exterior + 9 interior images committed to `/public/vehicles/` before component tasks.
- **D-18:** Zustand booking store, pricing APIs, URL deeplink logic, and all six analytics systems are not refactored — only UI components for Steps 1–3 change.
- **D-19:** Analytics events must fire at equivalent logical moments in the rebuilt flow.
- **D-20:** The booking flow uses the light theme (`theme-light` CSS class) — white/offwhite backgrounds, dark text — consistent with existing BookingWidget.

### Claude's Discretion

- Whether the map animation loops or plays once when Step3 loads.
- Exact pixel dimensions and aspect ratio of the sticky right panel and the map section within it.
- Whether "What's included" is an expandable accordion or always visible on each card.
- Whether the exterior car photo is full-bleed card background or a contained image area.
- Form validation details in the Entry bar (required field highlighting, error states).
- Whether the animated slideshow (interior/luggage block) auto-plays or requires user interaction.
- Exact copy for button labels, "All fees included" note, and empty state for map if route cannot be computed.

### Deferred Ideas (OUT OF SCOPE)

- "Book for myself / Book for a guest" auth branching → Phase 60 (BOOK-06).
- Auth screen between Step3 and Step5 → Phase 60.
- Pre-filling passenger fields from customer profile → Phase 60 (BOOK-07).
- Consolidated Passenger + Payment step → Phase 60.
- GA4 `login` / `sign_up` events (TRACK-04) → Phase 60.
- Steps 4–6 visual redesign → out of Phase 59 scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOOK-01 | Unified route + date + time entry bar (one consolidated surface) | EntryBar.tsx replaces Step1TripType + Step2DateTime. Store unchanged. |
| BOOK-02 | Pickup-time selection via a time-slot dropdown | 96 slots × 15 min, AM/PM display, stored as 24h HH:MM. Existing pattern from Step2DateTime adapted. |
| BOOK-03 | Inline flight number field for airport transfers | `isAirportPlace()` already works; add optional text field to EntryBar when triggered. Note: flightNumber in Step5 must NOT be removed — the early entry bar field is for convenience only (see §Flight Number Placement). |
| BOOK-04 | Route map with pickup + drop-off time shown at vehicle selection | RouteMap.tsx (new), Google Maps JS SDK, DirectionsService, animated dot, InfoWindow time labels. |
| BOOK-05 | Vehicle class cards show "What's included" and capacity indicators | VehicleCard.tsx visual shell replaced. New images, 6-item list. VehicleSlideshow.tsx (new). |
| TRACK-01 | All GA4 funnel events fire in the rebuilt flow | Analytics stay in BookingWizard.tsx + EntryBar.tsx + Step3Vehicle.tsx. See §Analytics Preservation. |
| TRACK-02 | Meta Pixel + CAPI events preserved with eventId dedup | `trackMetaEvent` call sites preserved. InitiateCheckout trigger point moves to StickyBookingPanel. |
| TRACK-03 | Price snapshot + server-side GA4 purchase preserved | `writePurchaseSnapshot` call site in Step6Payment is untouched. |
| TRACK-05 | CSP nonce + Consent Mode v2 gating not broken | No new inline scripts. RouteMap uses `importLibrary` (same loader as AddressInput). |
</phase_requirements>

---

## Summary

Phase 59 rebuilds the visual and interaction layer of the first three steps of the booking wizard without changing any underlying data or API contracts. The Zustand store (`lib/booking-store.ts`), the pricing API (`/api/calculate-price`), all six analytics systems, and the URL deeplink mechanism are frozen assets — the task is purely a UI overhaul.

The core challenge is merging two existing steps (Step1TripType + Step2DateTime) into a single unified Entry Bar component while keeping all store writes, validation rules, and deeplink pre-filling intact. The second challenge is building Step3 into a two-column layout (vehicle cards left, sticky map+summary panel right) with a Google Maps JS SDK route animation — which requires careful async loading to avoid blocking CSP nonce propagation or triggering dynamic rendering on the `/book` route.

A critical path dependency exists: all 12 Higgsfield AI vehicle images (3 exterior + 9 interior) must be generated and committed to `/public/vehicles/` before the component work begins, because `VehicleCard.tsx` and `VehicleSlideshow.tsx` reference those paths statically.

**Primary recommendation:** Execute in this order: (1) generate images → (2) build EntryBar as a self-contained client component that replaces Step1+Step2 within BookingWizard → (3) rebuild Step3Vehicle layout with RouteMap and VehicleSlideshow → (4) modify VehicleCard visual shell only → (5) update ProgressBar step numbering → (6) run analytics regression check.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entry bar form (From/To/Date/Time/Flight#) | Browser / Client | — | Pure client state writes to Zustand; no server needed |
| Trip type tabs | Browser / Client | — | Already implemented in TripTypeTabs.tsx; store setTripType() |
| 15-min time-slot dropdown | Browser / Client | — | AM/PM display → 24h store write; same pattern as existing TimeCell |
| Airport detection for flight number field | Browser / Client | — | `isAirportPlace()` is a pure function in `types/booking.ts` |
| Price fetch (Step3) | API / Backend | Browser | `/api/calculate-price` called from Step3Vehicle useEffect on mount |
| Route map polyline + animation | Browser / Client | — | Google Maps JS SDK runs entirely in browser |
| Vehicle card selection + analytics | Browser / Client | — | GA4 push via `window.gtag` / `dataLayer`; Meta via `trackMetaEvent` |
| sessionStorage price snapshot | Browser / Client | — | `writePurchaseSnapshot` in Step6Payment — no change in this phase |
| Image delivery (vehicle photos) | CDN / Static | Browser | `next/image` serves from `/public/vehicles/`; Next.js handles optimization |

---

## Standard Stack

### Core (all already installed — no new dependencies required)
[VERIFIED: live codebase package.json]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 19.2.3 | UI components | Project baseline |
| `next` | ^16.2.3 | App Router, `next/image` | Project baseline |
| `zustand` | ^5.0.12 | Booking state management | Existing `lib/booking-store.ts` |
| `@googlemaps/js-api-loader` | ^2.0.2 | Google Maps JS SDK dynamic load | Already used in `AddressInput.tsx` via `setOptions`/`importLibrary` |
| `lucide-react` | ^1.6.0 | Icon set | Already used: Check, ArrowUpDown, Plane, X |
| `tailwindcss` | ^4 | Utility CSS | Project baseline |

### No New Dependencies
[VERIFIED: codebase]

This phase installs zero new packages. All required capabilities are already present:
- Google Maps JS SDK: `@googlemaps/js-api-loader` already pulls `google.maps.*` — add `maps` library alongside `places` via the same `importLibrary` singleton pattern.
- Slideshow: Implemented with native CSS/JS `setInterval`; no carousel library needed.
- Animation: `motion` (^12.40.0) is already installed; use only if reduced-motion compliance requires more than CSS transitions.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native CSS slideshow | Swiper / Embla | Adds a dependency for 3–5 slides; overkill |
| `@googlemaps/js-api-loader` singleton | `@vis.gl/react-google-maps` APIProvider | `vis.gl` is already used in admin but wraps the API in a React context that requires `APIProvider` at a high level; the existing `importLibrary` singleton is already available and maps-loader-compatible |
| Custom map marker HTML overlay | `google.maps.InfoWindow` | InfoWindow is simpler but harder to style; custom overlay div gives full CSS control. Either is acceptable. |

**Installation:** No `npm install` step required.

---

## Package Legitimacy Audit

No new packages are installed in this phase. All dependencies are already present in `package.json` and in production use.

| Package | Status | Notes |
|---------|--------|-------|
| `@googlemaps/js-api-loader` | Already installed, in production use | Reused — not newly installed |
| `lucide-react` | Already installed, in production use | Reused |
| `motion` | Already installed | Available if needed for reduced-motion; not the primary animation mechanism |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
User opens /book
      |
      v
app/book/page.tsx  (Server Component — no change)
      |
      v
BookingWizard.tsx  (Client Component — MODIFY)
  |
  +-- currentStep === 1 --> EntryBar.tsx (NEW — replaces Step1+Step2)
  |     |
  |     +-- TripTypeTabs.tsx (MODIFY — remove Multi-Day tab from entry bar context)
  |     +-- AddressInput.tsx (REUSE unchanged)
  |     +-- DurationSelector.tsx (REUSE unchanged — Hourly mode)
  |     +-- [conditional] FlightNumberField (inline input, NEW — no separate component)
  |     +-- [conditional] ReturnDateTimeExpander (NEW inline)
  |     |
  |     +-- handleSubmit() --> store writes --> nextStep() --> Step3
  |
  +-- currentStep === 3 --> Step3Vehicle.tsx (MODIFY layout)
        |
        +-- Left panel: VehicleCard.tsx × 3 (MODIFY visual shell)
        |       +-- exterior photo (next/image)
        |       +-- "What's included" list (6 items)
        |       +-- price + CZK (existing logic)
        |
        +-- Below cards: VehicleSlideshow.tsx (NEW)
        |       +-- interior/luggage images (auto-play, 4s)
        |
        +-- Right panel (desktop): StickyBookingPanel.tsx (NEW)
              |
              +-- RouteMap.tsx (NEW)
              |     +-- importLibrary('maps') singleton
              |     +-- DirectionsService polyline
              |     +-- animated circle dot (3s one-shot)
              |     +-- pickup/dropoff time labels
              |
              +-- selected class summary
              +-- CTA "SELECT [CLASS]" --> begin_checkout + InitiateCheckout
```

Data flows: Zustand store is the single source of truth. EntryBar reads/writes via `useBookingStore`. RouteMap reads `origin`, `destination`, `pickupTime` from store. StickyBookingPanel reads `vehicleClass`, `priceBreakdown`. All GA4 events use `window.gtag` / `dataLayer`.

### Recommended Project Structure (additions only)

```
components/booking/
├── EntryBar.tsx              NEW — unified Step1+Step2
├── RouteMap.tsx              NEW — Google Maps JS SDK wrapper
├── VehicleSlideshow.tsx      NEW — interior/luggage slideshow
├── StickyBookingPanel.tsx    NEW — right sticky panel
├── BookingWizard.tsx         MODIFY — plug EntryBar, rename step numbering
├── TripTypeTabs.tsx          MODIFY — optional: hide Multi-Day in entry bar context
├── VehicleCard.tsx           MODIFY — new visual shell (3/2 photo, "What's included")
├── steps/
│   ├── Step3Vehicle.tsx      MODIFY — new 2-col layout
│   └── [Step1TripType.tsx    RETIRE — logic absorbed by EntryBar]
│   └── [Step2DateTime.tsx    RETIRE — logic absorbed by EntryBar]
public/vehicles/
├── business-exterior.jpg     NEW (Higgsfield, 900×600)
├── first-exterior.jpg        NEW
├── van-exterior.jpg          NEW
├── business-int-1.jpg        NEW (Higgsfield, 1200×800)
├── ...                       (9 interior images total)
```

### Pattern 1: Google Maps JS SDK in a React Client Component

**What:** Load Google Maps imperatively via `importLibrary` (same singleton pattern as `AddressInput.tsx`) and render a map with `new google.maps.Map()` inside a `useEffect`. [VERIFIED: live codebase AddressInput.tsx]

**When to use:** When you need a live rendered map (not Static Maps API) inside a React component where server-side rendering is irrelevant.

```typescript
// Source: components/booking/AddressInput.tsx pattern — adapted for maps
'use client'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { useEffect, useRef } from 'react'

let mapsLoaderPromise: Promise<void> | null = null

function ensureMapsLibraryLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.Map) {
    return Promise.resolve()
  }
  if (mapsLoaderPromise) return mapsLoaderPromise
  // setOptions is idempotent — calling it again with same key is safe
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: ['maps', 'places'],
    v: 'weekly',
  })
  mapsLoaderPromise = importLibrary('maps').then(() => undefined)
  return mapsLoaderPromise
}

export default function RouteMap({ origin, destination, pickupTime }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapRef.current || !origin || !destination) return
    let cancelled = false

    ensureMapsLibraryLoaded().then(() => {
      if (cancelled || !mapRef.current) return
      const map = new google.maps.Map(mapRef.current, {
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: GREYSCALE_STYLES,  // see §Code Examples
        disableDefaultUI: true,
      })
      // Draw route polyline, animate dot...
    })

    return () => { cancelled = true }
  }, [origin, destination, pickupTime])

  return <div ref={mapRef} style={{ height: 220 }} aria-label={`Route map`} />
}
```

**Key: the `libraries` array must include `'maps'` alongside `'places'`** — the existing AddressInput.tsx only loads `'places'`. The singleton `setOptions` can be called again safely; calling `importLibrary('maps')` will queue after `places`.

### Pattern 2: 15-Minute AM/PM Time Slot Dropdown

**What:** Generate 96 time strings in AM/PM format, convert selected value to 24h HH:MM for store write. [VERIFIED: live codebase Step2DateTime.tsx + D-07/D-08]

```typescript
// Source: adapted from Step2DateTime.tsx HOURS/MINUTES pattern
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

// Store write: setPickupTime(slot.value24h)  — preserves existing 24h store contract
```

### Pattern 3: Light Theme Wrapping

**What:** Wrap booking components in `<div className="theme-light">` to activate the inverted CSS token set. [VERIFIED: live codebase globals.css `.theme-light`]

The `.theme-light` class remaps ALL `--anthracite`, `--copper`, `--offwhite`, `--warmgrey` CSS vars to their light equivalents. No inline hex values should be used — all existing `var(--anthracite)` references invert automatically.

```tsx
// Source: globals.css .theme-light (verified)
export default function EntryBar() {
  return (
    <div className="theme-light">
      {/* All child components inherit the inverted tokens */}
      <TripTypeTabs />
      {/* ... */}
    </div>
  )
}
```

**Caution:** `TripTypeTabs.tsx` currently uses `var(--offwhite)` for active tab background. In light theme, `--offwhite` resolves to `#211F1C` (very dark). This is correct — it creates a dark pill on a light background, matching the Blacklane reference. No change needed.

### Pattern 4: Zustand Stale-Closure Prevention (VERIFIED pattern)

**What:** In `useEffect`, read fresh Zustand state via `useBookingStore.getState()` rather than hook-subscribed values. [VERIFIED: codebase — Step3Vehicle.tsx fetchPrice(), BookingWizard.tsx deeplink handler]

```typescript
// Source: Step3Vehicle.tsx fetchPrice — established pattern
const fetchPrice = useCallback(async () => {
  const s = useBookingStore.getState()  // fresh read, no stale closure
  // ...
}, [setPriceBreakdown, ...])
```

Use this pattern in `EntryBar.tsx handleSubmit()` when reading all field values before calling `nextStep()`.

### Anti-Patterns to Avoid

- **Loading `google.maps.Map` without awaiting `importLibrary`:** The library is async. Accessing `window.google.maps.Map` synchronously after import will fail silently on first load. Always await `ensureMapsLibraryLoaded()`.
- **Adding new `setOptions` calls with a different key:** There is one API key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Calling `setOptions` with conflicting keys causes the loader to throw. Reuse the existing singleton.
- **Hardcoding hex values in inline styles for themed components:** Use `var(--copper)` etc. so `.theme-light` inversion works. The `theme-light` class overrides both `--color-copper` (Tailwind utility) AND `--copper` (bare var). Both must be used via `var()`.
- **Removing the `passengers`/`luggage` step-1 store writes without migrating them:** Per D-05, the pax selector is removed from the EntryBar UI. But `passengers` is still used downstream in the analytics events and API calls. Do not zero-out the value — the store retains its default of 1 passenger; the pax selector in Step1 is simply not rendered in EntryBar.
- **Forcing `/book` into dynamic rendering:** The `app/book/page.tsx` must remain a static Server Component. RouteMap.tsx is a client component — it renders inside `<BookingWizard>` which is already `'use client'`. No `headers()`, `cookies()`, or `generateMetadata` calls should be added to `app/book/page.tsx`.
- **Step numbering not updated in `STEP_NAMES` inside BookingWizard:** The `checkout_progress` event uses `STEP_NAMES` with step number → name mapping. After merging Step1+Step2 → Step1, `STEP_NAMES[2]` no longer applies and `STEP_NAMES[3]` shifts to `STEP_NAMES[2]`. This must be updated carefully to avoid wrong `step_name` values in GA4.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Google Maps loading | Custom script tag injection | `@googlemaps/js-api-loader` `importLibrary` singleton (already in codebase) | Handles deduplication, CSP nonce propagation, library sequencing |
| AM/PM ↔ 24h conversion | Custom date library | Pure math (see Pattern 2) | Only 96 fixed values; no date math needed |
| Reduced-motion detection | Custom `window.matchMedia` polling | CSS `prefers-reduced-motion` media query OR `window.matchMedia('(prefers-reduced-motion: reduce)').matches` once on mount | Single read at component mount is sufficient |
| Slideshow | Third-party carousel | Native `setInterval` + CSS translate/opacity | 3–5 static slides; no touch swipe required |
| Map polyline from coordinates | Google Routes API (expensive) | `google.maps.DirectionsService.route()` for real route, OR straight-line polyline as fallback | DirectionsService is already authorized under the existing Maps API key |

**Key insight:** The entire phase is a UI reskin of existing infrastructure. No new backend, no new auth, no new data models. The hardest part is the Google Maps integration — and even that reuses the existing API key and loader singleton.

---

## Runtime State Inventory

**Step 2.6 skip rationale:** This is a UI redesign phase (not a rename/refactor/migration). No stored strings, collection names, or OS-registered state contain step numbers or component names that would need migration. The Zustand store field names are unchanged. No runtime data migration required.

---

## Critical Implementation Details

### Flight Number Placement (BOOK-03)

[VERIFIED: codebase Step5Passenger.tsx, types/booking.ts]

The flight number field currently lives in **Step5 (Passenger Details)** — it is part of `passengerDetails.flightNumber` in the Zustand store. The Phase 59 entry bar adds an **early convenience field** for airport transfers. Two approaches are valid:

**Option A (recommended):** The EntryBar flight number field writes to a **separate Zustand field** — e.g., `bookingStore.earlyFlightNumber` — and Step5Passenger pre-fills its `flightNumber` field from this value when non-empty. This keeps store contracts clean.

**Option B (simpler):** The EntryBar flight number field pre-fills `passengerDetails.flightNumber` directly. Risk: Step5 already reads `passengerDetails?.flightNumber` from the persisted store, so the value survives navigation.

The planner should choose Option B (simpler) unless the planner identifies a regression risk. The store already has `setPassengerDetails` which can update a partial object.

**Important:** Step5 must retain its own flight number field regardless of the Entry Bar implementation. The entry bar field is convenience-only; the authoritative field for API submission is in Step5.

### Step Numbering Impact on Analytics

[VERIFIED: codebase BookingWizard.tsx STEP_NAMES, checkout_progress event]

Current `STEP_NAMES` in BookingWizard.tsx:
```
1: 'trip_type'
2: 'date_time'
3: 'vehicle'
4: 'extras'
5: 'passenger'
6: 'payment'
```

After Phase 59, Steps 1+2 merge into 1. The store `currentStep` will be:
- 1 = Entry Bar (was trip_type + date_time)
- 2 = Vehicle (was 3)
- 3 = Extras (was 4)
- 4 = Passenger (was 5)
- 5 = Payment (was 6)

The total steps changes from 6 to 5. `STEP_NAMES` must be updated and `totalSteps` passed to ProgressBar changes from 6 to 5. The `checkout_progress` event deduplication keys use step numbers — existing keys for step 1 and 2 from a previous session in sessionStorage could conflict. This is acceptable (steps are renamed, not duplicated) but the `step_name` labels must be re-mapped.

**Analytics event trigger map after redesign:**

| Event | Trigger | Component | Step # |
|-------|---------|-----------|--------|
| `form_start` | EntryBar mounts | EntryBar.tsx useEffect (once) | Step 1 |
| `checkout_progress` (step 1) | Step 1 active (entry bar) | BookingWizard.tsx | Step 1 |
| `checkout_progress` (step 2) | Step 2 active (vehicle selection) | BookingWizard.tsx | Step 2 |
| `view_item_list` | Step 2 mounts + price loaded | Step3Vehicle.tsx | Step 2 |
| `view_item` | vehicleClass selected | Step3Vehicle.tsx | Step 2 |
| `select_item` | Card clicked | Step3Vehicle.tsx | Step 2 |
| `begin_checkout` | "SELECT [CLASS]" CTA clicked | StickyBookingPanel.tsx | Step 2 |
| `InitiateCheckout` (Meta) | Same as begin_checkout | StickyBookingPanel.tsx | Step 2 |
| `add_payment_info` | Step 5 active (payment) | BookingWizard.tsx | Step 5 |
| `AddPaymentInfo` (Meta) | Same as add_payment_info | BookingWizard.tsx | Step 5 |
| `purchase` (GA4 client) | Confirmation page | app/book/confirmation — no change |
| `Purchase` (Meta) | Stripe webhook | — no change |

**Critical difference from current code:** `begin_checkout` currently fires at `currentStep === 5` (Passenger Details). In the redesigned flow, it fires when the user clicks "SELECT [CLASS]" in the sticky panel — which is still at the vehicle selection step (new step 2). This is semantically correct per GA4 Enhanced Ecommerce spec (begin_checkout = user intends to buy) but the step number will differ. Update `if (currentStep === 5)` → `if (currentStep === 2)` in BookingWizard's analytics useEffect, OR move the `begin_checkout` push to StickyBookingPanel.tsx directly (preferred — cleaner responsibility).

### URL Deeplink Preservation

[VERIFIED: codebase BookingWizard.tsx mount useEffect]

The deeplink handler in `BookingWizard.tsx` reads URL params and writes to the store on mount. It then calls `sessionStorage.removeItem('booking_deeplink')` and `window.history.replaceState`. This logic must survive the refactor because:

1. The homepage BookingWidget sets `booking_deeplink` flag in sessionStorage.
2. The deeplink can pre-fill type, origin, destination, date, time, vehicleClass, pax.
3. When deeplinked to type=transfer with origin/destination set, the EntryBar should render with fields pre-filled and be ready for immediate submission.

The deeplink `currentStep` override can set the user directly to step 3 (vehicle selection). After the merge, if the deeplink sets `currentStep: 3`, it maps to the new `Step3Vehicle`. This is fine if the deeplink pre-fills all required EntryBar fields.

**Check:** The deeplink handler currently goes to step 2 when date is not provided (no explicit step override from deeplink params). After the merge, steps 1 and 2 become step 1 and 2 respectively (with new semantics). A deeplink with all fields pre-filled should jump directly to step 2 (vehicle) — the entry bar step is skipped. The existing logic already handles this correctly because it only sets step via the store write pattern.

### Google Maps CSP Compatibility

[VERIFIED: codebase middleware.ts, AddressInput.tsx]

The CSP middleware uses `nonce-{nonce} strict-dynamic` for script-src. The `@googlemaps/js-api-loader` `importLibrary()` loads scripts dynamically. `strict-dynamic` allows scripts loaded by a nonce-bearing script to inherit trust, so dynamically loaded Maps scripts are covered. No change to CSP required.

The `/book` route must NOT become a dynamic route. Keep it static (no `headers()` / `cookies()` call from `app/book/page.tsx`). The nonce propagation flow remains: middleware → x-nonce header → Next.js reads it → applies to script tags in layout.tsx.

### ProgressBar Update

[VERIFIED: codebase ProgressBar.tsx]

`ProgressBar` accepts `currentStep`, `completedSteps`, and `totalSteps` as props. Currently rendered with `totalSteps={6}`. After Phase 59: `totalSteps={5}`. The component is generic — no hardcoded step labels — so only the prop value changes in `BookingWizard.tsx`.

The step heading inside `BookingWizard.tsx` ("STEP X OF 6", heading text per step) must also be updated to reflect the new 5-step structure and new step names.

---

## Common Pitfalls

### Pitfall 1: Google Maps `google is not defined` on Server

**What goes wrong:** Accessing `window.google.maps` outside a `useEffect` or during SSR causes `ReferenceError`.
**Why it happens:** `RouteMap.tsx` is a client component but Next.js SSR still calls the component once on the server.
**How to avoid:** All `window.google.*` access must be inside `useEffect` (or event handlers). The `ensureMapsLibraryLoaded()` function already guards with `typeof window !== 'undefined'`.
**Warning signs:** Build-time error "google is not defined" or runtime error on first navigation.

### Pitfall 2: Multiple `setOptions` Calls with Conflicting Libraries

**What goes wrong:** `AddressInput.tsx` calls `setOptions({ libraries: ['places'] })`. `RouteMap.tsx` needs to add `maps` library. Calling `setOptions` again with `{ libraries: ['maps'] }` overrides the libraries array, potentially losing `places`.
**Why it happens:** `@googlemaps/js-api-loader` `setOptions` is a global singleton; the second call wins.
**How to avoid:** Either (a) combine into a single `setOptions` call with `libraries: ['maps', 'places']` at app startup, or (b) call `importLibrary('maps')` separately after `places` is already loaded — this is safe because `importLibrary` is additive. The safest approach is to update the shared `setOptions` call to include both libraries.
**Warning signs:** Places Autocomplete stops working in EntryBar after adding the map.

### Pitfall 3: `theme-light` Double-Nesting with Dark Background

**What goes wrong:** If `BookingWizard.tsx` is not wrapped in `theme-light` but individual child components are, the outer container (dark `--anthracite: #28282B`) bleeds through gaps between components.
**Why it happens:** `theme-light` sets `background-color: #F7F4EF` only on the element it's applied to, not the body.
**How to avoid:** Apply `theme-light` to the outermost div of `EntryBar` AND of `Step3Vehicle` (or the `BookingWizard` wrapper div that holds steps 1–3). Steps 4–6 remain on the dark theme.
**Warning signs:** Dark seam visible between the entry bar and the vehicle selection screen.

### Pitfall 4: `completedSteps` Set Serialization in Zustand Persist

**What goes wrong:** `completedSteps` is a `Set<number>` but sessionStorage stores JSON (arrays). Deserialization via `onRehydrateStorage` converts the array back to a Set. If step numbers change (6 → 5 steps), old persisted `completedSteps` may contain stale step numbers that make ProgressBar show steps 4–6 as completed even though only 3 steps exist now.
**Why it happens:** Zustand persist middleware for `completedSteps` serializes `[...set]` and rehydrates via `new Set(array)`. An old `[1,2,3,4,5,6]` becomes a Set of those numbers but only 5 steps exist in the new ProgressBar.
**How to avoid:** The `ProgressBar` only renders dots for `1..totalSteps`. A `completedSteps` Set with stale numbers beyond `totalSteps` doesn't visually appear — it's safe. But `canProceed` logic may have edge cases. Verify that no `canProceed` switch-case references the old step numbers.
**Warning signs:** ProgressBar showing wrong completed indicators after old session data.

### Pitfall 5: `begin_checkout` Trigger Point Drift

**What goes wrong:** `begin_checkout` + `InitiateCheckout` currently fires at `currentStep === 5` (Passenger). After redesign it should fire when "SELECT [CLASS]" is clicked. If the `useEffect` in BookingWizard is not updated, these events either fire at the wrong step or double-fire.
**Why it happens:** The analytics `useEffect` in `BookingWizard.tsx` is step-number-driven. Moving `begin_checkout` into `StickyBookingPanel.tsx` as an event handler (onClick) avoids this pitfall entirely.
**How to avoid:** Emit `begin_checkout` and `InitiateCheckout` directly from the CTA handler in `StickyBookingPanel.tsx` (not from BookingWizard's step-change useEffect). Remove the corresponding `currentStep === 5` condition from BookingWizard analytics.
**Warning signs:** `begin_checkout` showing in GA4 DebugView at wrong funnel position, or duplicate events.

### Pitfall 6: Animation Loops Causing Performance Regression

**What goes wrong:** Map dot animation using `requestAnimationFrame` in a loop without cleanup causes the RAF loop to continue running after Step3 unmounts (user navigates back to entry bar), draining CPU.
**Why it happens:** `requestAnimationFrame` is not automatically cancelled on component unmount.
**How to avoid:** Store the RAF handle in a `useRef`, and cancel it in the `useEffect` cleanup function: `return () => cancelAnimationFrame(rafHandle.current)`. Also cancel if `cancelled = true` in the closure.
**Warning signs:** CPU usage spike visible in DevTools Performance tab after navigating back from Step3.

---

## Code Examples

### Greyscale Map Style Array for RouteMap

```typescript
// Minimal greyscale map style matching light theme
// Source: established Google Maps styling pattern — [ASSUMED] (training knowledge)
const GREYSCALE_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ saturation: -100 }, { lightness: 20 }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ lightness: 50 }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E6962' }] },
]
// Background color matching light theme (#F7F4EF) is applied via map container background-color CSS,
// not a map style — Google Maps fills the canvas with water/land tiles.
```

### Time Slot Lead-Time Blocking (12-hour rule)

[VERIFIED: codebase Step2DateTime.tsx — `MIN_LEAD_HOURS = 12`]

The existing Step2DateTime enforces a 12-hour minimum lead time by disabling hours/minutes that fall before `now + 12h`. The new time-slot dropdown must apply the same rule. Approach: compute `minAllowedDateTime = new Date(Date.now() + 12 * 60 * 60 * 1000)`, then for each slot check if `new Date(pickupDate + 'T' + slot.value24h + ':00') < minAllowedDateTime`. Disable slots that fail this check.

```typescript
// Source: adapted from Step2DateTime.tsx MIN_LEAD_HOURS pattern
const MIN_LEAD_HOURS = 12

function isSlotDisabled(slot24h: string, pickupDateStr: string | null): boolean {
  if (!pickupDateStr) return false
  const slotDT = new Date(`${pickupDateStr}T${slot24h}:00`)
  const minDT = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000)
  return slotDT < minDT
}
```

### Animated Dot Along Polyline

[ASSUMED — common Google Maps JS SDK pattern]

```typescript
// Animate a circle marker along a polyline path
// Source: [ASSUMED] — well-known Google Maps JS SDK pattern
function animateDotAlongPath(
  map: google.maps.Map,
  path: google.maps.LatLng[],
  durationMs: number,
  color: string,
): () => void {
  const marker = new google.maps.Marker({
    position: path[0],
    map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeWeight: 0,
      scale: 6,
    },
  })

  const startTime = performance.now()
  let rafId: number

  function step(now: number) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / durationMs, 1)
    // Interpolate position along path
    const idx = Math.floor(t * (path.length - 1))
    const fraction = t * (path.length - 1) - idx
    const from = path[Math.min(idx, path.length - 1)]
    const to = path[Math.min(idx + 1, path.length - 1)]
    const lat = from.lat() + (to.lat() - from.lat()) * fraction
    const lng = from.lng() + (to.lng() - from.lng()) * fraction
    marker.setPosition(new google.maps.LatLng(lat, lng))
    if (t < 1) {
      rafId = requestAnimationFrame(step)
    }
  }

  rafId = requestAnimationFrame(step)
  return () => cancelAnimationFrame(rafId)  // cleanup
}
```

**Note:** `google.maps.Marker` is technically deprecated in favour of `google.maps.marker.AdvancedMarkerElement`. However, `AdvancedMarkerElement` requires a Map ID (`mapId` param). Since the booking flow map is purely decorative with no admin interaction, `Marker` is acceptable. If a `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` env var exists (it does, in ZoneMapInner.tsx), it can be passed — but is not required for this use case.

### Return Date/Time Expand Animation (EntryBar)

[VERIFIED: UI-SPEC animation contract]

```tsx
// 300ms ease expand for "Add return" fields — use max-height transition
// Source: UI-SPEC.md animation contract
const [showReturn, setShowReturn] = useState(false)

<div
  style={{
    maxHeight: showReturn ? '400px' : 0,
    overflow: 'hidden',
    transition: 'max-height 300ms ease',
  }}
>
  {/* Return date + time fields */}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `google.maps.Marker` | `google.maps.marker.AdvancedMarkerElement` | 2023 (GA 2024) | AdvancedMarkerElement requires `mapId`. For this phase, `Marker` is acceptable. |
| Google Maps Static API | Google Maps JS SDK (dynamic) | Per D-11 | Required for animation; Static API cannot animate |
| Hour + Minute column pickers | Single 15-min AM/PM dropdown | Phase 59 (D-07) | Simpler UX; fewer taps |
| Multi-step form (Steps 1+2 separate) | Unified entry bar (D-01) | Phase 59 | Blacklane-style consolidated entry |

**Deprecated/outdated in this codebase:**
- `Step1TripType.tsx` + `Step2DateTime.tsx`: Retired by EntryBar.tsx. Files should be deleted (or kept as dead code until Phase 60 verification).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Greyscale map style JSON array format | Code Examples | Map style may not apply correctly; fallback: use default map style (functional but not branded) |
| A2 | `google.maps.Marker` animation via RAF interpolating along decoded polyline path array works as described | Code Examples | May need to use `google.maps.geometry.encoding.decodePath` if DirectionsService returns encoded polyline; add `geometry` to `importLibrary` call |
| A3 | `setOptions` with `libraries: ['maps', 'places']` is backward-compatible with existing AddressInput singleton | Architecture | AddressInput tests should confirm Places Autocomplete still works after adding maps library |

---

## Open Questions

1. **Where does the EntryBar flight number value go?**
   - What we know: Step5 has its own `flightNumber` field in `passengerDetails`. The entry bar field (D-06) is a new early convenience field.
   - What's unclear: Does the early field write to `passengerDetails.flightNumber` directly (simple but couples early and late steps) or to a new `earlyFlightNumber` field?
   - Recommendation: Write directly to `passengerDetails.flightNumber` (via `setPassengerDetails({ ...currentDetails, flightNumber: value })`). Step5 will show it pre-filled. No new store field needed.

2. **Does DirectionsService require the `routes` library or just `maps`?**
   - What we know: `google.maps.DirectionsService` is part of the core Maps JS API.
   - What's unclear: In the new Google Maps JS SDK (weekly), some services are in separate libraries.
   - Recommendation: Call `await importLibrary('routes')` in addition to `'maps'` as a safety measure. [ASSUMED]

3. **Should Step1TripType.tsx and Step2DateTime.tsx be deleted immediately or left as dead code?**
   - Recommendation: Delete them in the same plan where EntryBar is verified working. Do not leave dead imports in BookingWizard.tsx that could confuse Phase 60 work.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | RouteMap, AddressInput | ✓ (confirmed via .env.example + codebase usage) | — | No fallback — required |
| `@googlemaps/js-api-loader` | RouteMap.tsx | ✓ (installed) | ^2.0.2 | — |
| Higgsfield AI access | D-17 image generation | User-dependent | — | Placeholder images from existing `/public/` during dev; real images before production merge |
| `lucide-react` | Icons in cards | ✓ (installed) | ^1.6.0 | — |
| `vitest` + `@testing-library/react` | Tests | ✓ (installed) | ^4.1.1 | — |

**Missing dependencies with no fallback:** None — all code dependencies are installed.
**Missing dependencies with fallback:** Higgsfield AI images — dev can proceed with placeholder images; production merge must use real images.

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 + Testing Library React 16.3.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose tests/EntryBar.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOK-01 | EntryBar renders From/To/Date/Time fields | unit | `npx vitest run tests/EntryBar.test.tsx` | ❌ Wave 0 |
| BOOK-01 | EntryBar submit calls nextStep and sets store | unit | `npx vitest run tests/EntryBar.test.tsx` | ❌ Wave 0 |
| BOOK-02 | 15-min AM/PM slots render; selected slot stores 24h value | unit | `npx vitest run tests/EntryBar.test.tsx` | ❌ Wave 0 |
| BOOK-03 | Flight number field appears when isAirportPlace(origin) = true | unit | `npx vitest run tests/EntryBar.test.tsx` | ❌ Wave 0 |
| BOOK-03 | Flight number field hidden for non-airport routes | unit | `npx vitest run tests/EntryBar.test.tsx` | ❌ Wave 0 |
| BOOK-04 | RouteMap renders map container with correct aria-label | unit | `npx vitest run tests/RouteMap.test.tsx` | ❌ Wave 0 |
| BOOK-04 | RouteMap shows error state when no origin/destination | unit | `npx vitest run tests/RouteMap.test.tsx` | ❌ Wave 0 |
| BOOK-05 | VehicleCard renders exterior photo with correct alt text | unit | `npx vitest run tests/VehicleCard.test.tsx` | ❌ Wave 0 (existing file will be updated) |
| BOOK-05 | VehicleCard shows all 6 "What's included" items | unit | `npx vitest run tests/VehicleCard.test.tsx` | ❌ Wave 0 |
| BOOK-05 | VehicleSlideshow auto-advances every 4s | unit | `npx vitest run tests/VehicleSlideshow.test.tsx` | ❌ Wave 0 |
| TRACK-01 | form_start fires on EntryBar mount | unit | `npx vitest run tests/EntryBar.test.tsx` | ❌ Wave 0 |
| TRACK-01 | checkout_progress fires when EntryBar submits | unit | `npx vitest run tests/EntryBar.test.tsx` | ❌ Wave 0 |
| TRACK-01 | view_item_list fires when Step3 loads with prices | unit | `npx vitest run tests/Step3Vehicle.test.tsx` | ✅ (existing — update for new layout) |
| TRACK-02 | InitiateCheckout fires when CTA "SELECT [CLASS]" clicked | unit | `npx vitest run tests/StickyBookingPanel.test.tsx` | ❌ Wave 0 |
| TRACK-05 | No new inline scripts that would break CSP | manual | Review network panel for CSP violations | manual |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/[affected-component].test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/EntryBar.test.tsx` — covers BOOK-01, BOOK-02, BOOK-03, TRACK-01
- [ ] `tests/RouteMap.test.tsx` — covers BOOK-04 (mock `google.maps.*`)
- [ ] `tests/VehicleSlideshow.test.tsx` — covers BOOK-05 slideshow
- [ ] `tests/StickyBookingPanel.test.tsx` — covers TRACK-02 (begin_checkout + InitiateCheckout)
- [ ] Update `tests/VehicleCard.test.tsx` — add "What's included" list assertions
- [ ] Update `tests/Step3Vehicle.test.tsx` — assert new 2-col layout, StickyBookingPanel presence
- [ ] Update `tests/BookingWizard.test.tsx` — assert 5 total steps, new STEP_NAMES, EntryBar at step 1

**Wave 0 mock pattern for Google Maps** (follows established vi.hoisted pattern in project):
```typescript
// tests/RouteMap.test.tsx — Wave 0 scaffold
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue(undefined),
}))
// Provide window.google.maps stub in setup or test
Object.defineProperty(window, 'google', {
  value: { maps: { Map: vi.fn(), DirectionsService: vi.fn(), ... } }
})
```

---

## Security Domain

`security_enforcement` key is not present in config — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 59 has no auth changes |
| V3 Session Management | no | Zustand sessionStorage is read-only in this phase |
| V4 Access Control | no | /book is a public page; no gating |
| V5 Input Validation | yes | Flight number field: validate format (optional, no XSS risk — value rendered in DOM via React, auto-escaped) |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via flight number field | Tampering | React auto-escapes JSX interpolation — no `dangerouslySetInnerHTML`; safe by default |
| Open redirect via deeplink `from` param | Elevation of Privilege | `safeReturnTo()` is for auth redirects; deeplink only writes to Zustand store fields (addresses/placeIds), no navigation redirect risk |
| Google Maps API key exposure | Information Disclosure | Key is `NEXT_PUBLIC_*` — intentionally public (restricted by domain in Google Cloud Console); no server-side key exposure |
| CSP bypass via dynamic script injection | Tampering | `importLibrary` uses `@googlemaps/js-api-loader` which is already authorized via `strict-dynamic`; no new script origins added |

---

## Sources

### Primary (HIGH confidence)
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/BookingWizard.tsx` — full analytics wiring, step rendering, deeplink handler
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/steps/Step1TripType.tsx` — store writes to retire/absorb into EntryBar
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/steps/Step2DateTime.tsx` — time picker pattern, MIN_LEAD_HOURS=12, lead-time slot disabling logic
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/steps/Step3Vehicle.tsx` — fetchPrice() pattern, layout grid, VehicleCard integration
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/VehicleCard.tsx` — props interface, price display, selection state, CZK conversion
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/TripTypeTabs.tsx` — tab structure, store setTripType, aria pattern
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/ProgressBar.tsx` — props interface, step circle rendering
- `/Users/romanustyugov/Desktop/Prestigo/components/booking/AddressInput.tsx` — `@googlemaps/js-api-loader` singleton pattern, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `/Users/romanustyugov/Desktop/Prestigo/lib/booking-store.ts` — full store shape, all field names and action signatures
- `/Users/romanustyugov/Desktop/Prestigo/types/booking.ts` — `isAirportPlace()`, `VEHICLE_CONFIG`, `VehicleClass`, `PassengerDetails`
- `/Users/romanustyugov/Desktop/Prestigo/lib/analytics-snapshot.ts` — `writePurchaseSnapshot` / `consumePurchaseSnapshot` (untouched in Phase 59)
- `/Users/romanustyugov/Desktop/Prestigo/app/globals.css` — `.theme-light` token map, `.btn-primary`, `.label` classes
- `/Users/romanustyugov/Desktop/Prestigo/package.json` — confirmed all dependencies present; no new packages needed
- `.planning/phases/59-booking-flow-redesign-blacklane/59-CONTEXT.md` — locked decisions D-01..D-20
- `.planning/phases/59-booking-flow-redesign-blacklane/59-UI-SPEC.md` — visual contract, component inventory, analytics event table

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — BOOK-01..05, TRACK-01..05 requirement text

### Tertiary (LOW confidence)
- Greyscale map style JSON array structure: [ASSUMED] — standard Google Maps styling pattern from training knowledge

---

## Metadata

**Confidence breakdown:**
- Store and analytics wiring: HIGH — read directly from source files
- Component interface contracts: HIGH — read from live TypeScript types
- Google Maps SDK API usage: MEDIUM — loader pattern verified in codebase; RouteMap specifics assumed from training
- Test scaffold patterns: HIGH — follows established vi.hoisted pattern from project tests
- Image asset paths: HIGH — confirmed /public/vehicles/ directory + file naming from UI-SPEC.md

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (Next.js/Google Maps APIs are stable at this cadence)
