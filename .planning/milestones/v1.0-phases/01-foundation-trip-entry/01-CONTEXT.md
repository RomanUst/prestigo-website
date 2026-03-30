# Phase 1: Foundation & Trip Entry - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the wizard shell (BookingWizard + ProgressBar + step routing) and Step 1 (trip type selector + origin/destination with Google Places Autocomplete + passengers/luggage). Steps 2-6 are rendered as empty stubs with a "Next" button. The /book page placeholder ("coming soon") is replaced entirely.

No pricing, no vehicle selection, no payment — those are Phase 2+.

</domain>

<decisions>
## Implementation Decisions

### Trip Type Selector
- Horizontal tab/pill row at the top of Step 1: ONE-WAY | AIRPORT PICKUP | AIRPORT DROPOFF | HOURLY | DAILY
- Tabs use Montserrat 9px, letter-spacing 0.35em, uppercase — consistent with `.label` style
- Active tab: copper underline or copper text, not filled background (premium feel, not boxy)
- Tab row is sticky within the form header so users can switch type without scrolling

### Wizard Chrome
- Full-bleed layout: anthracite background, no card borders around the wizard itself
- Progress bar: numbered circles (1–6) connected by a line. Active = copper circle. Completed = copper tick. Pending = anthracite-light circle
- Progress bar sits below the page header (`<Nav />` remains visible)
- Wizard fills the viewport height on desktop; scrollable on mobile
- Step transitions: fade + slight slide-up (reuse existing `fadeUp` keyframe, 0.3s)

### Step 1 Layout
- Stacked single-column layout (not side-by-side) for simplicity on mobile
- Order: Trip type tabs → Origin address → Destination address (hidden for Hourly — replaced by Hours selector) → Date (basic, more detail in Step 2) → Passengers → Luggage
- Wait — date/time is Step 2 per roadmap. Step 1 = type + route + passengers only
- Final order: Trip type tabs → Origin → Destination (or Hours for Hourly) → Passengers → Luggage → Next button
- "Swap" icon between Origin/Destination for one-way trips

### Airport Auto-fill
- When user selects "Airport Pickup": Destination field auto-fills to "Václav Havel Airport Prague (PRG)" and becomes read-only (disabled styling, not actually disabled input)
- When user selects "Airport Dropoff": Origin field auto-fills to PRG, becomes read-only
- PRG coordinates hardcoded in config: `{ lat: 50.1008, lng: 14.26 }`, display name fixed
- Read-only airport field shows a small plane icon and copper text to signal it's auto-set

### Address Autocomplete UX
- Autocomplete dropdown: dark anthracite-mid background, copper text for matched substring, warmgrey for the rest
- Each suggestion shows formatted address on one line + place type (e.g., "Airport") as a small label
- Debounce 300ms before calling Places API
- Minimum 2 characters before suggestions appear
- Clear (×) button on each address field when filled

### Passengers & Luggage
- Passengers: stepper (− / number / +), range 1–8. Default: 1
- Luggage: stepper (− / number / +), range 0–8. Default: 0
- Steppers use copper `+`/`−` with warmgrey number display
- Both inline on one row on desktop, stacked on mobile

### Hourly Hire
- When "Hourly" selected: Destination field hidden, replaced by "Duration" selector
- Duration: segmented buttons 1h | 2h | 3h | 4h | 6h | 8h | 12h (not a freeform input)
- Duration stored as integer hours in Zustand

### Next Button State
- Next button (`btn-primary` style) fixed at bottom of step on mobile, inline below fields on desktop
- Disabled state: `opacity-40`, `cursor-not-allowed`, no hover effect
- Required fields for Step 1: trip type (always set), origin address, destination/hours, passengers

### Zustand Store Shape
```typescript
interface BookingStore {
  tripType: 'transfer' | 'airport_pickup' | 'airport_dropoff' | 'hourly' | 'daily'
  origin: { address: string; placeId: string; lat: number; lng: number } | null
  destination: { address: string; placeId: string; lat: number; lng: number } | null
  hours: number  // for hourly only, default 2
  passengers: number  // default 1
  luggage: number     // default 0
  currentStep: number  // 1-6
  completedSteps: Set<number>
  // Steps 2-6 fields added in later phases
}
```

### Claude's Discretion
- Exact spacing between form elements (follow existing globals.css rhythm)
- Whether to use `framer-motion` or CSS transitions for step fade (prefer CSS to avoid adding dep in Phase 1)
- Error state styling for empty required fields on Next attempt
- Exact border/background treatment of the read-only airport field
- Whether to show a "Route preview" map thumbnail in Step 1 (probably skip — Phase 2 concern)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Core value, constraints, tech stack decisions
- `.planning/REQUIREMENTS.md` — ARCH-01–03, WIZD-01–06, STEP1-01–07 (Phase 1 requirements)
- `.planning/research/STACK.md` — Library choices: react-hook-form, Zod, Zustand, use-places-autocomplete
- `.planning/research/ARCHITECTURE.md` — Component structure, suggested file locations, Zustand store shape
- `.planning/research/PITFALLS.md` — Google API key exposure warning, sessionStorage persistence

### Existing Codebase
- `prestigo/app/globals.css` — ALL CSS utilities and brand tokens (must use these, not ad-hoc Tailwind)
- `prestigo/app/book/page.tsx` — Current /book page to be replaced
- `prestigo/components/Nav.tsx` — Navigation component to keep in the /book layout
- `prestigo/components/Footer.tsx` — Footer component

### Reference UX
- almasyf.cz/cz/rezervace — 3-step wizard with horizontal trip type tabs (reference for tab style)
- blacklane.com — Minimal widget with "One way / By the hour" (reference for type selector simplicity)

No external ADRs — all decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.label` CSS class — use for field labels (9px, copper, letter-spacing 0.4em, uppercase)
- `.display` / `.display-italic` — use for step headings if needed
- `.body-text` — use for helper text / descriptions
- `.btn-primary` — use for the Next button (copper border, offwhite text, fills copper on hover)
- `.btn-ghost` — use for the Back button
- `.copper-line` — decorative accent line for step headers
- `.animate-on-load` + `.delay-N` — use for step entry animations
- `:focus-visible` already set to copper outline — keyboard nav styled automatically

### Established Patterns
- All sections use `max-w-7xl mx-auto px-6 md:px-12` as the content container
- Section backgrounds alternate between `anthracite` and `anthracite-mid`
- CSS custom properties (not Tailwind color utilities) used for brand colors: `var(--copper)`, `var(--anthracite)`, etc.
- Components are `'use client'` where they need interactivity

### Integration Points
- `/book` page imports `Nav` and `Footer` — keep these
- `BookingSection.tsx` on homepage imports the LimoAnywhere iframe — will be replaced in Phase 6 with the BookingWidget
- New files go in `prestigo/components/booking/` (create this directory)
- Zustand store at `prestigo/lib/booking-store.ts`
- Types at `prestigo/types/booking.ts`

</code_context>

<specifics>
## Specific Ideas

- Trip type tabs: reference Blacklane.com's minimal "One way / By the hour" horizontal toggle for inspiration on simplicity
- Airport field: small plane emoji or SVG icon in the read-only airport address field to make it clear it's auto-set, not a typo
- The existing `/book` page already has correct `<Metadata>` (title, description, noindex) — keep these, don't change SEO attributes

</specifics>

<deferred>
## Deferred Ideas

- Route preview map in Step 1 — Phase 2 concern (pricing engine handles map)
- "Save for later" / bookmark this booking — requires auth, v2
- Multi-stop route support — v2
- Google Maps visual map component embedded in wizard — Phase 2+

</deferred>

---

*Phase: 01-foundation-trip-entry*
*Context gathered: 2026-03-24*
