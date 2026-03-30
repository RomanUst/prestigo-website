# Phase 6: Homepage Widget & Polish - Research

**Researched:** 2026-03-30
**Domain:** Next.js 16 / React 19 / Zustand / HTML native date inputs / WCAG accessibility / mobile CSS
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Widget replaces the LimoAnywhere iframe in `BookingSection.tsx` (`lg:col-span-3` right column only)
- Widget fields: trip type selector + origin address + destination address (or duration for Hourly) + pickup date + pickup time
- CTA label: **"Book Now"** — single label regardless of trip type
- CTA action: calls all relevant Zustand setters, sets `currentStep: 3`, adds 1 & 2 to `completedSteps`, then `router.push('/book')`
- Passengers and luggage NOT in widget — defaults used (1 passenger, 0 luggage)
- For Hourly: destination field hidden, replaced by `DurationSelector.tsx`
- For Airport Pickup/Dropoff: origin or destination auto-fills to PRG_CONFIG
- Widget panel CSS: `border border-anthracite-light bg-anthracite p-6 md:p-8`
- Date/time inputs: `<input type="date">` and `<input type="time">` — NOT react-day-picker
- All field labels: `.label` CSS class
- "Book Now" button: `.btn-primary` style
- New component: `prestigo/components/booking/BookingWidget.tsx`
- UX-01: Test at 375px and 390px
- UX-02: Verify PriceSummary sticky desktop / fixed mobile bar
- UX-03: `scroll-into-view` on active fields; use `env(safe-area-inset-bottom)` on sticky CTAs
- UX-04: `aria-label` on all icon-only buttons per defined table
- UX-05: DOM-order tab sequence; no positive tabIndex

### Claude's Discretion

- Exact date/time input styling in the widget (style to match globals.css field appearance)
- Whether widget date/time have min constraints — resolved: `min` = today's date (client-side via `new Date().toISOString().split('T')[0]`); time min enforced only when selected date equals today
- Step offset logic implementation (how `currentStep` is set to 3)
- Specific aria-label text for each icon button — resolved in UI-SPEC
- Whether to scroll the wizard to top on step change
- Tab order fix approach (DOM order vs tabIndex)

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOME-01 | Mini booking widget embedded on homepage | Widget component pattern, BookingSection.tsx integration point identified |
| HOME-02 | Widget contains: trip type selector + origin/destination (or hours for hourly) + date/time + CTA | All sub-components exist and are reusable; conditional rendering pattern from Step1TripType confirmed |
| HOME-03 | CTA "Book Now" carries filled data to /book wizard at Step 3 | Zustand store has all required setters; `currentStep`/`completedSteps` are plain state fields that can be set directly |
| UX-01 | Fully responsive at 375px and 390px | No new libraries needed; CSS audit of existing sticky/fixed patterns required |
| UX-02 | PriceSummary sticky on desktop, fixed mobile bar | PriceSummary already implements both patterns; verify no regressions |
| UX-03 | CTA buttons always visible above keyboard on mobile | `scrollIntoView` on focus + `env(safe-area-inset-bottom)` padding on sticky bars |
| UX-04 | aria-label, role attributes on all interactive elements | aria-label table defined in UI-SPEC; icon-only buttons identified across all 6 steps |
| UX-05 | Keyboard navigation through all steps, tab order correct | DOM-order approach; `tabIndex={0}` for custom interactive divs; no positive tabIndex |

</phase_requirements>

---

## Summary

Phase 6 is a pure frontend phase with two distinct workstreams: (1) building a new `BookingWidget.tsx` component that replaces the LimoAnywhere iframe and pre-fills the Zustand store before deep-linking into the `/book` wizard at Step 3, and (2) a mobile + accessibility polish pass across all 6 existing wizard steps.

All sub-components needed for the widget already exist and are in production use: `TripTypeTabs.tsx`, `AddressInput.tsx`, `DurationSelector.tsx`. The Zustand store exposes all required setters. The deep-link mechanism requires setting `currentStep` and `completedSteps` directly on the store — both are plain state fields with no special setter guards. The only non-trivial implementation question is the conditional rendering for airport trip types: **the current `TripType` union is `'transfer' | 'hourly' | 'daily'` — there are no `airport_pickup` or `airport_dropoff` values in the type system**. The CONTEXT.md references airport auto-fill behavior but TripTypeTabs only shows 3 tabs. This means either airport sub-types are not yet supported (PRG auto-fill is only triggered when a user manually selects the PRG address), or the widget must add airport tabs not present in the wizard. The planner must decide scope — see Open Questions.

The mobile/accessibility polish workstream has clear, well-scoped tasks: audit the 6 steps at 375px, verify PriceSummary sticky/fixed positioning (already implemented in PriceSummary.tsx), add `scrollIntoView` on input focus for UX-03, add `aria-label` to icon-only buttons, and verify DOM-order tab sequence. No new libraries are required.

**Primary recommendation:** Build `BookingWidget.tsx` using the established inline-style patterns from Step1TripType.tsx, reuse existing sub-components without modification, and implement the deep-link via direct Zustand store mutation before `router.push('/book')`. Keep airport trip types scoped to the same 3 types as the current widget (transfer/hourly/daily) unless the planner explicitly adds airport tabs — the PRG auto-fill behavior in the CONTEXT refers to the wizard Step 1 behavior, not a separate airport trip type tab.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.7 | App router, `useRouter`, `'use client'` | Project standard |
| React | 19.2.3 | Component authoring | Project standard |
| Zustand | (project dep) | Booking state store | Established in Phase 1 |
| `use-places-autocomplete` | (project dep) | Google Places in AddressInput | Already in use |
| `@googlemaps/js-api-loader` | 2.0.2 | Maps loader singleton | Already in use — functional API (`setOptions`/`importLibrary`) |

### No New Dependencies Required

All widget functionality is achievable with existing project dependencies. Native `<input type="date">` and `<input type="time">` replace react-day-picker for the widget. `env(safe-area-inset-bottom)` is a CSS standard, no library needed.

**Installation:** No new `npm install` required for this phase.

---

## Architecture Patterns

### Recommended Project Structure

No new directories. One new file:

```
prestigo/
└── components/
    └── booking/
        └── BookingWidget.tsx   ← NEW: replaces iframe in BookingSection.tsx
```

### Pattern 1: Widget as Standalone Client Component

**What:** `BookingWidget.tsx` is a `'use client'` component that reads from and writes to the Zustand store, then calls `useRouter().push('/book')`.

**When to use:** Any component that sets store state and triggers navigation must be a client component.

**Key implementation:**
```tsx
// Source: booking-store.ts (confirmed setters)
// Widget CTA handler
const handleBookNow = () => {
  // Validation first — check required fields
  setTripType(localTripType)
  setOrigin(localOrigin)
  setDestination(localDestination)  // or setHours(localHours) for hourly
  setPickupDate(localDate)
  setPickupTime(localTime)
  // Deep-link to Step 3
  useBookingStore.setState({
    currentStep: 3,
    completedSteps: new Set([1, 2]),
  })
  router.push('/book')
}
```

**Important note:** `completedSteps` is a `Set<number>` in memory but serialized as `number[]` in sessionStorage (via `partialize`). The `onRehydrateStorage` callback restores it. Direct `setState` with `new Set([1, 2])` works correctly because the store persists immediately after setState.

### Pattern 2: Conditional Field Rendering (trip type switch)

**What:** Mirrors the pattern in `Step1TripType.tsx` — show/hide fields based on `tripType` local state.

**When to use:** Widget must mirror Step 1's conditional logic: hourly hides destination, shows DurationSelector; transfer/daily show destination.

**Example from Step1TripType.tsx (confirmed working pattern):**
```tsx
{tripType === 'hourly' ? (
  <DurationSelector />
) : (
  <AddressInput
    label="DESTINATION"
    placeholder="Drop-off address"
    value={destination}
    onSelect={handleDestinationSelect}
    onClear={handleDestinationClear}
    ariaLabel="Destination"
  />
)}
```

### Pattern 3: Date Input Min Constraint (Claude's Discretion — resolved)

**What:** Compute today's string on mount; apply as `min` attribute on the date input.

**Implementation:**
```tsx
const [todayStr, setTodayStr] = useState<string>('')
useEffect(() => {
  setTodayStr(new Date().toISOString().split('T')[0])
}, [])
// ...
<input type="date" min={todayStr} ... />
```

**Why `useEffect` and not direct `new Date()`:** SSR hydration safety — `new Date()` during server render produces a different value than during client render, causing hydration mismatch. `useEffect` ensures date is computed client-side only.

### Pattern 4: `scrollIntoView` on Focus (UX-03)

**What:** Every text input and AddressInput in the wizard and widget fires `scrollIntoView` on focus, ensuring the input stays visible above the virtual keyboard on mobile.

**Implementation:**
```tsx
const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
```

**Note:** AddressInput already has a `handleFocus` callback internally. To add `scrollIntoView` without modifying the shared component, the widget can pass an `onFocus` prop — but AddressInput's current interface does not expose `onFocus`. Options: (a) add `onFocus?: () => void` prop to AddressInput, or (b) apply `scrollIntoView` via a wrapper `ref` + `useEffect` on the container. The DOM-order approach (option b) is less invasive.

### Pattern 5: Sticky CTA with Safe Area Inset (UX-03)

**What:** Mobile sticky/fixed button bars already use `position: sticky; bottom: 0` (Step 1, wizard shell). Add `paddingBottom: 'env(safe-area-inset-bottom)'` to prevent keyboard overlap on iOS.

**Confirmed existing pattern in BookingWizard.tsx and Step1TripType.tsx:**
```tsx
// Mobile sticky bar — confirmed existing structure
<div
  className="flex md:hidden items-center justify-end gap-4 sticky bottom-0"
  style={{
    backgroundColor: 'var(--anthracite)',
    borderTop: '1px solid var(--anthracite-light)',
    padding: '0 16px',
    height: 72,
  }}
>
```

The `paddingBottom: 'env(safe-area-inset-bottom)'` needs to be added to all sticky mobile bars across the 6 steps as part of the UX-03 polish.

### Anti-Patterns to Avoid

- **Modifying AddressInput internals for widget-only concerns:** AddressInput is shared across wizard steps. Any modification risks regressions in Steps 1–5. Prefer prop additions or wrapper patterns.
- **Using `router.push` without setting store state first:** The wizard reads from the store on mount. If `router.push('/book')` fires before `setState` completes, Step 3 may render with stale state. Since Zustand state updates are synchronous, `router.push` immediately after `setState` is safe — but `useEffect` cleanup or async patterns must not be used.
- **Positive `tabIndex` values for tab order fixes:** DOM-order reordering is the correct approach per UI-SPEC. Using `tabIndex={3}` etc. creates maintenance nightmares and breaks screen reader flow.
- **Airport trip type tabs in widget without type system update:** `TripType` is `'transfer' | 'hourly' | 'daily'`. Adding airport tabs in the widget requires updating `types/booking.ts` and `TripTypeTabs.tsx`. This is potentially out of scope — see Open Questions.
- **Removing the `#limoanywhere-frame` CSS rule from globals.css:** It is harmless dead code after the iframe is removed, but removing it risks breaking anything that references it. Leave it unless explicitly cleaning up.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Address autocomplete in widget | New autocomplete component | `AddressInput.tsx` directly | Already handles 300ms debounce, 2-char min, keyboard nav, clear button, error state, aria |
| Trip type selector | New tab component | `TripTypeTabs.tsx` directly | Handles all 3 trip types, active indicator, hover state, aria roles |
| Duration picker for Hourly | New segmented control | `DurationSelector.tsx` directly | Handles all 7 duration options, aria-pressed, active indicator |
| Date picker | react-day-picker or custom calendar | `<input type="date">` | CONTEXT.md locked decision; native inputs are sufficient for homepage widget |
| Store deep-link | Custom navigation hook | Direct Zustand `setState` + `router.push` | Store already has `currentStep` and `completedSteps` as plain state |

**Key insight:** Every sub-component needed by the widget already exists. The widget is an assembly job, not a build job.

---

## Common Pitfalls

### Pitfall 1: TripType Union Does Not Include Airport Types

**What goes wrong:** CONTEXT.md and UI-SPEC reference "Airport Pickup" and "Airport Dropoff" behavior in the widget. But `types/booking.ts` defines `TripType = 'transfer' | 'hourly' | 'daily'`. TripTypeTabs.tsx also only renders 3 tabs. Attempting to use `'airport_pickup'` or `'airport_dropoff'` as a `tripType` value will cause TypeScript errors.

**Why it happens:** The airport auto-fill in the wizard is triggered by detecting PRG coordinates in origin/destination (`placeId === PRG_CONFIG.placeId`), not by a separate trip type value. The CONTEXT references this detection pattern. Airport "trip types" are a UX framing, not separate Zustand enum values.

**How to avoid:** Widget uses the same 3 trip types (transfer/hourly/daily). Airport auto-fill behavior (PRG pre-fill) only applies if the user selects an airport trip type that currently doesn't exist in the type system. Planner must decide: either (a) skip airport sub-type in the widget (simplest), or (b) extend TripType to include airport values (requires updating types/booking.ts, TripTypeTabs, Step1TripType, all trip type switch statements, pricing logic). See Open Questions.

**Warning signs:** TypeScript error `Type '"airport_pickup"' is not assignable to type 'TripType'`.

### Pitfall 2: `completedSteps` Set Serialization

**What goes wrong:** Setting `completedSteps: new Set([1, 2])` directly via `useBookingStore.setState()` works in memory, but the `partialize` function serializes `completedSteps` as `[...state.completedSteps]` (an array). If the page is refreshed after the widget CTA but before Step 3 loads, the restored state must correctly re-hydrate the Set.

**Why it happens:** `onRehydrateStorage` in booking-store.ts handles this: `state.completedSteps = new Set(state.completedSteps as unknown as number[])`. This is already in place and covers the widget scenario.

**How to avoid:** No action required — existing serialization handles it. Just ensure the widget sets `completedSteps: new Set([1, 2])` (not an array).

### Pitfall 3: Hydration Mismatch with `new Date()` During SSR

**What goes wrong:** Using `new Date().toISOString().split('T')[0]` directly as a default value for the `min` attribute in the widget's date input during SSR will produce a different value than the client render (server uses UTC, client uses local timezone), causing a React hydration warning.

**Why it happens:** Next.js 16 renders components server-side. `new Date()` returns different results in UTC (server) vs local timezone (client).

**How to avoid:** Initialize `min` to `''` (empty string) and set it via `useEffect` on mount:
```tsx
const [todayStr, setTodayStr] = useState('')
useEffect(() => {
  setTodayStr(new Date().toISOString().split('T')[0])
}, [])
```

### Pitfall 4: Mobile Sticky Bar Height Stacking

**What goes wrong:** On mobile, multiple sticky/fixed bars can stack: Step1TripType has a sticky Continue bar (72px), BookingWizard has a sticky Back/Continue bar (72px), PriceSummary has a fixed bottom bar (56px). At Step 3, the PriceSummary bar replaces the wizard bar (guard `currentStep !== 3` is in BookingWizard). But at other steps, if both the step-level bar and the shell bar render simultaneously, they stack.

**Why it happens:** The dual-bar pattern (hidden md:flex desktop + flex md:hidden sticky mobile) is documented in STATE.md as established. Step 1 owns its own bar; wizard shell bar guards `currentStep > 1 && currentStep < 6`. Steps 2, 4, 5 use the wizard shell bar. Step 3 uses PriceSummary bar. Step 6 has its own Pay button. This is correct — but UX-03 verification must confirm no double-stacking appears in practice.

**How to avoid:** When polishing for UX-03, audit each step on mobile at 375px, confirm exactly one sticky bar is visible at each step. Verify `env(safe-area-inset-bottom)` is applied to the active sticky bar at each step.

### Pitfall 5: TripTypeTabs `position: sticky; top: 0` Inside Widget

**What goes wrong:** `TripTypeTabs.tsx` has `position: sticky; top: 0; zIndex: 10` hardcoded in its inline style. Inside the widget panel on the homepage (which is not a scrollable container), this sticky behavior is harmless — but if the widget panel ever gets a max-height + overflow-y, the TripTypeTabs will stick to the top of the panel's scroll container rather than the viewport.

**Why it happens:** TripTypeTabs was designed for the full-page wizard context where the tab bar should stick to the page top. Inside the widget panel, the widget does not scroll.

**How to avoid:** No modification needed. The widget panel does not have overflow-y or max-height constraints. The sticky behavior is benign in this context.

### Pitfall 6: `<input type="date">` Styling on iOS Safari

**What goes wrong:** Native `<input type="date">` renders differently across browsers. On iOS Safari, it shows a custom picker with its own chrome that may not match the project's dark aesthetic. The internal calendar UI cannot be styled.

**Why it happens:** Native date inputs use the OS-level date picker on mobile, which has no CSS customization surface.

**How to avoid:** Per CONTEXT.md decision — native inputs are the locked choice. Styling scope is limited to the text appearance when a date is selected (font, color, background). Apply the same field styles as other inputs: `background: var(--anthracite-mid); border: 1px solid var(--anthracite-light); padding: 12px 16px; font-family: var(--font-montserrat); color: var(--offwhite)`. The picker chrome will appear in the OS style — this is acceptable per the locked decision.

---

## Code Examples

Verified from reading actual project source:

### Widget CTA Store Integration

```tsx
// Source: booking-store.ts — confirmed setters and state shape
const { setTripType, setOrigin, setDestination, setHours, setPickupDate, setPickupTime } =
  useBookingStore()
const router = useRouter()

const handleBookNow = () => {
  // 1. Write all collected fields to store
  setTripType(tripType)
  setOrigin(origin)
  if (tripType === 'hourly') {
    setHours(hours)
  } else {
    setDestination(destination)
  }
  setPickupDate(date)
  setPickupTime(time)
  // 2. Set navigation to Step 3 and mark Steps 1-2 complete
  useBookingStore.setState({
    currentStep: 3,
    completedSteps: new Set([1, 2]),
  })
  // 3. Navigate to wizard
  router.push('/book')
}
```

### Native Date/Time Input Matching globals.css Field Style

```tsx
// Source: globals.css field patterns + CONTEXT.md decision
// Note: color-scheme: dark enables dark OS picker on supporting browsers
<input
  type="date"
  min={todayStr}
  value={date}
  onChange={(e) => setDate(e.target.value)}
  style={{
    width: '100%',
    background: 'var(--anthracite-mid)',
    border: '1px solid var(--anthracite-light)',
    padding: '12px 16px',
    fontFamily: 'var(--font-montserrat)',
    fontSize: '14px',
    fontWeight: 300,
    color: 'var(--offwhite)',
    outline: 'none',
    colorScheme: 'dark',
  }}
/>
```

### BookingSection.tsx Integration Point

```tsx
// Source: BookingSection.tsx — confirmed structure
// Replace the entire "Right — LimoAnywhere iframe" div (lg:col-span-3)
<div className="lg:col-span-3">
  <BookingWidget />
</div>
```

The `lg:col-span-3` wrapper is kept; only the contents change. The `LIMOANYWHERE_URL` constant and iframe are removed.

### Validated aria-label Table (UX-04)

From UI-SPEC (confirmed against existing components):

| Button | aria-label | Exists In |
|--------|-----------|-----------|
| Swap origin/destination | `"Swap origin and destination"` | Step1TripType.tsx (already has it) |
| Stepper increment (+) | `"Increase {passengers/luggage}"` | Stepper.tsx (verify) |
| Stepper decrement (-) | `"Decrease {passengers/luggage}"` | Stepper.tsx (verify) |
| Clear/close address field (×) | `"Clear address"` | AddressInput.tsx (already has it) |
| Close modal or overlay | `"Close"` | (no modals in current flow) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LimoAnywhere iframe | Custom `BookingWidget.tsx` | Phase 6 | Full design control, no third-party frame |
| Full react-day-picker in widget | Native `<input type="date">` | Phase 6 design decision | Lighter widget, fewer dependencies on homepage |
| No pre-fill from homepage | Zustand store pre-fill + Step 3 deep link | Phase 6 | "Under 2 min" UX from homepage |

**Deprecated after this phase:**
- `LIMOANYWHERE_URL` constant in BookingSection.tsx — remove with iframe
- `#limoanywhere-frame` CSS rule in globals.css — dead code after iframe removal (safe to leave or remove)

---

## Open Questions

1. **Airport trip types in widget**
   - What we know: `TripType` = `'transfer' | 'hourly' | 'daily'`. CONTEXT.md mentions airport auto-fill behavior in the widget. TripTypeTabs shows only 3 tabs.
   - What's unclear: Does the widget need Airport Pickup / Airport Dropoff tabs? If yes, this requires extending `TripType`, updating TripTypeTabs, and all switch statements — significant scope expansion.
   - Recommendation: The CONTEXT.md phrases it as "For Airport Pickup/Dropoff: origin or destination auto-fills to PRG (same as Step 1 behavior)." Since Step 1 already handles this via PlaceId detection (not a separate trip type), the widget can omit airport tabs entirely and still work — the user who selects Airport Pickup in Step 1 just has a different path. The planner should scope the widget to 3 trip types (transfer/hourly/daily) unless there's a specific requirement to add airport tabs.

2. **Widget validation on CTA click**
   - What we know: The widget should not navigate if required fields are empty. UI-SPEC error message is defined: "Please fill in all required fields before continuing."
   - What's unclear: Should validation errors appear inline (per field, like Step 1) or as a single top-level message?
   - Recommendation: Mirror Step 1's pattern — per-field error state with the AddressInput `hasError`/`errorMessage` props. Date and time show a single error below the field on missing value.

3. **TripTypeTabs reuse: sticky positioning in widget context**
   - What we know: TripTypeTabs has `position: sticky; top: 0` hardcoded. Inside the widget it is harmless but semantically wrong.
   - What's unclear: Whether the planner wants to override this for the widget context.
   - Recommendation: No change needed. The widget panel does not scroll. Accept the benign sticky style.

---

## Validation Architecture

nyquist_validation is `true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run tests/BookingWidget.test.tsx` |
| Full suite command | `cd prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOME-01 | Widget renders in BookingSection replacing iframe | unit | `npx vitest run tests/BookingWidget.test.tsx -t "renders"` | ❌ Wave 0 |
| HOME-02 | Widget shows trip type selector, origin, destination/duration, date, time | unit | `npx vitest run tests/BookingWidget.test.tsx -t "fields"` | ❌ Wave 0 |
| HOME-03 | CTA sets Zustand state and navigates to /book step 3 | unit | `npx vitest run tests/BookingWidget.test.tsx -t "CTA"` | ❌ Wave 0 |
| UX-01 | No overflow at 375px (responsive layout) | manual | browser devtools viewport test | manual-only — CSS layout cannot be automated in jsdom |
| UX-02 | PriceSummary sticky/fixed positioning | manual | browser devtools + `position: sticky` visual check | manual-only — sticky positioning not testable in jsdom |
| UX-03 | CTA buttons above keyboard on mobile | manual | iOS Safari real device or Chrome mobile emulation | manual-only |
| UX-04 | aria-label on all icon-only buttons | unit | `npx vitest run tests/BookingWidget.test.tsx tests/Step1TripType.test.tsx tests/Stepper.test.tsx -t "aria"` | ❌ Wave 0 (aria tests) |
| UX-05 | Keyboard tab order | manual | Tab key navigation test in browser | manual-only — tab order not reliably testable in jsdom |

### Sampling Rate

- **Per task commit:** `cd prestigo && npx vitest run tests/BookingWidget.test.tsx`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `prestigo/tests/BookingWidget.test.tsx` — covers HOME-01, HOME-02, HOME-03, UX-04 (aria)
  - Mock `useRouter` from `next/navigation`
  - Mock `useBookingStore` or use real store in test
  - Follow `.ts` for pure logic, `.tsx` for React component tests (established in Phase 2)
  - Follow describe-by-requirement-ID pattern: `describe('HOME-01', () => { ... })`

*(Existing test files: AddressInput.test.tsx, TripTypeTabs.test.tsx, Stepper.test.tsx — check if aria-label tests already exist in these; if yes, HOME-01 aria tests may be partially covered)*

---

## Sources

### Primary (HIGH confidence)

- Direct file reads: `prestigo/components/BookingSection.tsx` — iframe structure and layout confirmed
- Direct file reads: `prestigo/lib/booking-store.ts` — all setters, state shape, `currentStep`/`completedSteps` types confirmed
- Direct file reads: `prestigo/types/booking.ts` — `TripType` union confirmed as 3 values (not 5)
- Direct file reads: `prestigo/components/booking/TripTypeTabs.tsx` — sticky positioning, 3 tabs confirmed
- Direct file reads: `prestigo/components/booking/AddressInput.tsx` — interface, debounce, ariaLabel prop confirmed
- Direct file reads: `prestigo/components/booking/DurationSelector.tsx` — direct Zustand consumption confirmed
- Direct file reads: `prestigo/components/booking/BookingWizard.tsx` — step rendering, button bar guards confirmed
- Direct file reads: `prestigo/components/booking/PriceSummary.tsx` — sticky desktop / fixed mobile implementation confirmed
- Direct file reads: `prestigo/components/booking/steps/Step1TripType.tsx` — conditional field rendering, airport detection pattern confirmed
- Direct file reads: `prestigo/app/globals.css` — all CSS tokens, `.label`, `.btn-primary`, focus-visible styles confirmed
- Direct file reads: `prestigo/vitest.config.ts` + `prestigo/tests/setup.ts` — test infrastructure confirmed

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — confirmed dual-bar mobile pattern decision, stepFadeUp separation, PRG_CONFIG pattern
- `.planning/phases/06-homepage-widget-polish/06-CONTEXT.md` — all locked decisions
- `.planning/phases/06-homepage-widget-polish/06-UI-SPEC.md` — all visual/interaction contracts

### Tertiary (LOW confidence)

- None — all findings verified from source files

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed from package.json and source files
- Architecture: HIGH — patterns confirmed from reading existing component source
- Pitfalls: HIGH — TripType union gap confirmed from types/booking.ts; hydration issue is well-known Next.js behavior
- Validation architecture: HIGH — vitest.config.ts and existing tests confirmed

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable Next.js/React/Zustand — unlikely to change in 30 days)
