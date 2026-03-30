# Phase 2: Pricing & Vehicle Selection - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Google Routes API pricing engine + Step 2 (date/time picker) + Step 3 (vehicle selection with live price display).
After completing Step 1 (route + trip type), a user can pick a pickup date/time, see three vehicle options with calculated prices, and choose one before proceeding to Step 4.

No extras, no passenger details, no payment — those are Phases 3–4.

</domain>

<decisions>
## Implementation Decisions

### Date picker
- Custom calendar grid using react-day-picker (~5KB) — no native `<input type="date">`
- Calendar is inline and always visible (not a popover) — part of the step layout, no tap required
- Past dates greyed out and not selectable
- For Daily Hire: return date appears in the same Step 2 view as a second calendar row below the outbound date (revealed when trip type is `daily`)

### Time picker
- Scrollable list of time slots at 15-minute increments (e.g. 08:00, 08:15, 08:30…)
- Touch-friendly on mobile; no free-text entry

### Vehicle card layout
- 3 cards side-by-side on desktop, stacked vertically (full-width) on mobile — no horizontal carousel
- Each card shows: vehicle photo, class name, max passengers (icon + count), luggage capacity (icon + count), calculated price
- No amenities list on the card — clean, not cluttered
- Selected card state: copper border ring + subtle anthracite-mid background lift (consistent with copper accent theme)

### Price loading state
- While `/api/calculate-price` is in flight: animated skeleton shimmer bar where the price number will appear
- No spinner, no dash placeholder — skeleton prevents layout shift

### PriceSummary panel
- Desktop: 2-column layout — vehicle cards on left, PriceSummary sticky on right
- Mobile: fixed bottom bar showing total + Next button
- Content at Step 3: origin → destination (truncated), selected vehicle class name, base price
- Extras not yet included (added in Phase 3, Step 4)

### Quote fallback (unmappable routes)
- All 3 vehicle cards remain visible; price area shows "Request a quote" on each card
- User can still select a vehicle preference and proceed through the wizard
- No Stripe payment for quote requests — wizard routes to a "We'll be in touch" confirmation page instead of Stripe
- Manager is notified it's a quote request (not a confirmed booking)

### Claude's Discretion
- Exact spacing and typography within vehicle cards (follow globals.css rhythm)
- Calendar styling: day cell size, selected day copper fill vs copper ring
- Shimmer animation implementation (CSS keyframes vs Tailwind animate-pulse)
- Exact truncation logic for route display in PriceSummary
- Quote vs paid booking flag storage in Zustand (implementation detail)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Core value, constraints, tech stack, key decisions
- `.planning/REQUIREMENTS.md` — STEP2-01–03, STEP3-01–05, PRICE-01–06 (Phase 2 requirements)
- `.planning/research/STACK.md` — Library choices already made; check before adding new deps
- `.planning/research/ARCHITECTURE.md` — Component structure, file location conventions
- `.planning/research/PITFALLS.md` — Google API key exposure warning (PRICE-06 critical)

### Phase 1 Context
- `.planning/phases/01-foundation-trip-entry/01-CONTEXT.md` — Established patterns: CSS tokens, component conventions, store shape, button styles

### Existing Codebase
- `prestigo/app/globals.css` — ALL CSS utilities and brand tokens (must use, not ad-hoc Tailwind)
- `prestigo/types/booking.ts` — VehicleClass, PriceBreakdown types (already defined; extend don't redefine)
- `prestigo/lib/booking-store.ts` — Zustand store (add Step 2/3 fields here)
- `prestigo/components/booking/BookingWizard.tsx` — Wizard shell to integrate Step 2 and Step 3

No external ADRs — all decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Stepper.tsx` — +/− stepper component; may not apply directly but the copper +/− pattern is the style reference for interactive controls
- `DurationSelector.tsx` — segmented button pattern for selecting values; reuse visual pattern for time slots
- `.btn-primary` / `.btn-ghost` — Next/Back buttons (already in use)
- `.label` CSS class — field labels (9px, copper, letter-spacing 0.4em, uppercase)
- `.animate-on-load` + `.delay-N` — step entry animations
- `VehicleClass` type in `booking.ts` — `'business' | 'first_class' | 'business_van'` (already defined)
- `PriceBreakdown` type in `booking.ts` — `{ base, extras, total, currency }` (already defined)

### Established Patterns
- CSS custom properties for brand colors: `var(--copper)`, `var(--anthracite)`, `var(--anthracite-mid)`, `var(--offwhite)`, `var(--warmgrey)`
- `max-w-7xl mx-auto px-6 md:px-12` as the content container width
- `'use client'` on all interactive components
- Step transitions: `stepFadeUp` keyframe at 0.3s (already in globals.css — do not create a duplicate)
- Active/selected state: copper underline or copper border, never filled background (established in TripTypeTabs)

### Integration Points
- New files in `prestigo/components/booking/` (existing directory)
- Step 2 component: `prestigo/components/booking/steps/Step2DateTime.tsx`
- Step 3 component: `prestigo/components/booking/steps/Step3Vehicle.tsx`
- New API route: `prestigo/app/api/calculate-price/route.ts`
- Zustand store needs new fields: `pickupDate`, `pickupTime`, `returnDate` (daily only), `vehicleClass`, `priceBreakdown`
- BookingWizard stub-to-real swap: replace `StepStub` with real step components for steps 2 and 3

</code_context>

<specifics>
## Specific Ideas

- Vehicle card selection state mirrors the copper border pattern from TripTypeTabs — visual consistency across the wizard
- PriceSummary sticky column on desktop echoes booking summary sidebars on Blacklane.com and almasyf.cz
- Quote fallback keeps vehicle cards visible so the user still expresses a preference — helpful for the manager receiving the quote request

</specifics>

<deferred>
## Deferred Ideas

- Route preview map embedded in Step 2/3 — originally deferred from Phase 1 context; still out of scope for Phase 2
- Amenities list on vehicle cards — could be added in Phase 6 polish if needed
- Multi-stop routing — v2

</deferred>

---

*Phase: 02-pricing-vehicle-selection*
*Context gathered: 2026-03-25*
