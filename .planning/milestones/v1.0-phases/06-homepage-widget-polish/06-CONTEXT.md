# Phase 6: Homepage Widget & Polish - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the LimoAnywhere iframe in `BookingSection.tsx` with a mini booking widget that pre-fills the Zustand store and deep-links into the /book wizard at Step 3 (vehicle selection). Run a mobile + accessibility polish pass across all 6 wizard steps covering UX-01–05.

No new wizard steps, no new pricing logic, no new API routes — frontend-only phase.

</domain>

<decisions>
## Implementation Decisions

### Widget Fields
- Widget collects: trip type selector + origin address + destination address (or duration selector for Hourly) + pickup date + pickup time
- After filling these fields, "Book Now" CTA pre-fills the Zustand store and routes to `/book` at Step 3 (vehicle selection) — user sees live prices immediately
- Passengers and luggage are NOT in the widget (default values used: 1 passenger, 0 luggage) — reduces homepage friction
- For Hourly trip type: destination field hidden, replaced by the duration selector (reuse `DurationSelector.tsx`)
- For Airport Pickup/Dropoff: origin or destination auto-fills to PRG (same as Step 1 behavior)

### CTA Button
- Label: **"Book Now"** — single label regardless of trip type
- Carries widget data into wizard: calls all relevant Zustand setters then `router.push('/book')`
- On landing at `/book`, `currentStep` is set to 3 (bypasses Steps 1-2 since data is already filled)
- Steps 1 and 2 are marked as completed in `completedSteps` so the progress bar shows them as done

### Widget Visual Layout
- Replaces the iframe area only — `lg:col-span-3` right column in `BookingSection.tsx`
- Left column (text + copper-line + trust signals) stays unchanged
- Widget panel styling: `border border-anthracite-light bg-anthracite p-6 md:p-8`  — matches the existing iframe container style
- On mobile: single column, widget stacks below the text/trust signals (existing responsive behavior)
- Trip type selector at the top of the widget — reuse `TripTypeTabs.tsx` (already handles all 5 types)
- Address inputs use `AddressInput.tsx` — same component as Step 1
- Date/time inputs: simple HTML `<input type="date">` and `<input type="time">` — NOT the full react-day-picker (that belongs in Step 2, not the lightweight homepage widget)
- All label styling: `.label` CSS class (9px, copper, uppercase, letter-spacing 0.4em)
- "Book Now" button: `.btn-primary` style

### Mobile & Accessibility Polish Scope
- **UX-01**: Test at 375px and 390px — fix any layout overflow or clipped elements across all 6 steps
- **UX-02**: Verify PriceSummary sticky on desktop (right column Steps 2-3) and fixed bottom bar on mobile — fix if broken
- **UX-03**: Ensure CTA buttons (Next, Continue, Pay) remain visible above the keyboard on mobile — this is the primary concern; use `scroll-into-view` on active fields if needed
- **UX-04**: Add `aria-label` to all icon-only buttons (swap origin/destination, stepper ±, close/clear ×) and custom inputs that lack visible labels
- **UX-05**: Verify tab order is logical through all 6 steps — fix any elements that are only reachable via click

### Claude's Discretion
- Exact date/time input styling in the widget (style to match globals.css field appearance)
- Whether the widget date and time have min constraints (no past dates — Claude decides implementation)
- Step offset logic implementation (how currentStep is set to 3 on widget CTA click)
- Specific aria-label text for each icon button
- Whether to scroll the wizard to top on step change (already exists or add if missing)
- Tab order fix approach (DOM order vs tabIndex)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Core value, constraints, tech stack
- `.planning/REQUIREMENTS.md` — HOME-01–03, UX-01–05 (Phase 6 requirements)

### Prior Phase Context
- `.planning/phases/01-foundation-trip-entry/01-CONTEXT.md` — CSS tokens, component conventions, TripTypeTabs/AddressInput/DurationSelector behavior
- `.planning/phases/02-pricing-vehicle-selection/02-CONTEXT.md` — PriceSummary panel (sticky desktop / fixed mobile bar) — UX-02 context

### Existing Codebase (must read before planning)
- `prestigo/app/globals.css` — ALL CSS utilities and brand tokens
- `prestigo/components/BookingSection.tsx` — Component to be modified (iframe replaced with widget)
- `prestigo/components/booking/TripTypeTabs.tsx` — Reuse in widget
- `prestigo/components/booking/AddressInput.tsx` — Reuse in widget
- `prestigo/components/booking/DurationSelector.tsx` — Reuse in widget (Hourly trip type)
- `prestigo/components/booking/BookingWizard.tsx` — Deep-link target; currentStep and completedSteps manipulation
- `prestigo/lib/booking-store.ts` — All Zustand setters needed for widget pre-fill
- `prestigo/types/booking.ts` — TripType and other types

No external ADRs — all decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TripTypeTabs.tsx` — handles all 5 trip types; use at top of widget
- `AddressInput.tsx` — Google Places Autocomplete; reuse for widget origin/destination fields
- `DurationSelector.tsx` — segmented duration buttons for Hourly; show in widget when trip type is hourly
- `Stepper.tsx` — ±stepper; NOT needed in widget (passengers/luggage excluded from widget)
- `.btn-primary` — "Book Now" button
- `.label` CSS class — all field labels in widget
- `var(--copper)`, `var(--anthracite)`, `var(--anthracite-light)` — use for widget panel border/background

### Established Patterns
- `'use client'` required (widget sets Zustand state and calls router)
- Address fields follow 300ms debounce + 2-char minimum (already in AddressInput)
- Airport auto-fill: set origin/destination to `PRG_CONFIG` object when airport trip type selected
- CSS custom properties for all brand colors — no ad-hoc Tailwind color utilities
- `max-w-7xl mx-auto px-6 md:px-12` container (already in BookingSection — keep it)

### Integration Points
- `BookingSection.tsx` — replace iframe `div` with `<BookingWidget />` component
- New component: `prestigo/components/booking/BookingWidget.tsx`
- Widget calls: `setTripType`, `setOrigin`, `setDestination`, `setHours`, `setPickupDate`, `setPickupTime`, then sets `currentStep: 3` and adds 1, 2 to `completedSteps`, then `router.push('/book')`
- Mobile UX-03 fix: may require adjusting sticky/fixed positioning on `.mobile-nav-bar` patterns in BookingWizard and Step components

</code_context>

<specifics>
## Specific Ideas

- Widget is the "quick start" path — user fills only what's essential (route + when), lands at vehicle selection seeing prices immediately. This is the "under 2 minutes" promise made tangible from the homepage.
- Left column trust signals ("Flight tracking included", "Fixed price — no surprises") stay as social proof alongside the widget

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-homepage-widget-polish*
*Context gathered: 2026-03-30*
