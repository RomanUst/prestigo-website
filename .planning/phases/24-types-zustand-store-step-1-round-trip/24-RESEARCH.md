# Phase 24: Types, Zustand Store & Step 1 Round Trip - Research

**Researched:** 2026-04-04
**Domain:** TypeScript types, Zustand 5 store extension, React component UI (TripTypeTabs)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RTFR-01 | Client can select "Round Trip" as a 6th trip type in Step 1 of the booking wizard | Adding `'round_trip'` to `TripType` union + 6th tab in `TripTypeTabs`; `setTripType` clears `returnTime` when switching away; `partialize` already persists `returnDate`; `resetBooking` must include `returnTime: null` |
</phase_requirements>

---

## Summary

Phase 24 is a pure front-end data-layer and UI phase. No API routes, no pricing, no Stripe. The work is entirely confined to three files in the existing codebase (`types/booking.ts`, `lib/booking-store.ts`, `components/booking/TripTypeTabs.tsx`) plus a minor guard in `Step1TripType.tsx` and minor navigation guard in `BookingWizard.tsx`, with corresponding test coverage in `tests/booking-store.test.ts` and `tests/TripTypeTabs.test.tsx`.

The Zustand store is already well-structured. `returnDate` already exists in state and in `partialize` (it was added for the Daily Hire trip type). Phase 24 introduces a new `returnTime` field, extends `TripType` with `'round_trip'`, and ensures that switching away from `round_trip` clears `returnTime` but NOT `returnDate` — because `returnDate` is still used by Daily Hire. The key behavioral contract is: `setTripType` must clear `returnTime` whenever the new type is not `'round_trip'`.

`BookingWizard.tsx` has a `canProceed` guard for Step 2 that currently reads `tripType !== 'daily' || returnDate !== null`. With `round_trip` added, this guard requires a second returnDate check branch for `round_trip`. However, return TIME for a round trip is collected in Step 2 (Phase 25 scope), so Phase 24 does not wire Step 2 for return time — the `canProceed` guard change is noted as a safe forward-compatibility tweak, not a full Step 2 change.

**Primary recommendation:** Extend `TripType`, add `returnTime` to the store, add the 6th tab in `TripTypeTabs`, and make `setTripType` clear `returnTime` when leaving `round_trip`. Everything else needed to make the wizard navigate correctly on `round_trip` selection follows from these four targeted changes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.12 | Client state management | Already in use; this phase extends existing store |
| TypeScript | ^5 | Type safety | Already in use; extending union type and interface |
| React | 19.2.3 | UI components | Already in use; TripTypeTabs is a client component |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.1 | Unit tests | Store behavior and tab rendering tests |
| @testing-library/react | ^16.3.2 | React component tests | TripTypeTabs tab rendering assertions |

No new packages are required for this phase.

**Installation:** None required. All dependencies are already installed.

---

## Architecture Patterns

### Current File Map (relevant to this phase)
```
prestigo/
├── types/
│   └── booking.ts          # TripType union, BookingStore interface — extend here
├── lib/
│   └── booking-store.ts    # Zustand store implementation — extend here
├── components/booking/
│   ├── TripTypeTabs.tsx     # Tab row — add 6th tab here
│   └── steps/
│       ├── Step1TripType.tsx   # Minor: showSwapIcon guard update
│       └── BookingWizard.tsx   # Minor: canProceed Step 2 guard update
└── tests/
    ├── booking-store.test.ts   # Add round_trip store tests
    └── TripTypeTabs.test.tsx   # Update tab count assertion (5→6)
```

### Pattern 1: Extending TripType Union

**What:** Add `'round_trip'` as the 6th literal to the union type
**When to use:** Any time a new trip mode is introduced
```typescript
// File: types/booking.ts
// CURRENT:
export type TripType = 'transfer' | 'hourly' | 'daily'

// AFTER Phase 24:
export type TripType = 'transfer' | 'hourly' | 'daily' | 'round_trip'
```

TypeScript exhaustiveness checking will surface any switch/if-else blocks in the codebase that need updating. Run `tsc --noEmit` after adding the union member to discover every touch point.

### Pattern 2: Adding returnTime to BookingStore Interface

**What:** Add `returnTime: string | null` to the state interface and `setReturnTime` action
**Constraint from success criteria:** `returnTime` must be persisted via `partialize` (SC-3) but must NOT include price breakdowns
**Constraint from success criteria:** `resetBooking` must clear `returnTime` (SC-4)

```typescript
// In BookingStore interface (types/booking.ts):
// Step 2 — add alongside existing returnDate
returnTime: string | null   // '14:30' format — round_trip only; null for other types
setReturnTime: (time: string | null) => void
```

Note: `returnDate` already exists in the store and is already persisted via `partialize`. The new `returnTime` follows the exact same pattern as the existing `pickupTime: string | null`.

### Pattern 3: setTripType Must Clear returnTime

**What:** When `setTripType` is called with any type other than `'round_trip'`, clear `returnTime` from state
**Why:** Success criterion SC-2: "Switching away from Round Trip clears `returnTime` from the store — no stale return state"

```typescript
// In booking-store.ts:
setTripType: (type) => {
  const clearReturn = type !== 'round_trip'
  set({
    tripType: type,
    priceBreakdown: null,
    distanceKm: null,
    quoteMode: false,
    ...(clearReturn ? { returnTime: null } : {}),
  })
},
```

Important: `returnDate` is NOT cleared when switching away from `round_trip` because it is also used by `daily` hire. Only `returnTime` is round_trip-exclusive.

### Pattern 4: Adding 6th Tab to TripTypeTabs

**What:** Add `{ value: 'round_trip', label: 'ROUND TRIP' }` to the `TRIP_TYPES` array
**When to use:** Adding any new trip type tab

```typescript
// File: components/booking/TripTypeTabs.tsx
const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'transfer', label: 'TRANSFER' },
  { value: 'hourly', label: 'HOURLY' },
  { value: 'daily', label: 'DAILY' },
  { value: 'round_trip', label: 'ROUND TRIP' },
]
```

The tab renders identically to others (copper underline when active, warmgrey default). No special styling needed for this phase.

### Pattern 5: partialize — What to Add

The `partialize` function in `booking-store.ts` controls what gets saved to `sessionStorage`. According to SC-3, `returnTime` MUST be persisted. Add it to `partialize` alongside `returnDate`:

```typescript
// In partialize():
returnDate: state.returnDate,
returnTime: state.returnTime,   // ADD THIS
// distanceKm, priceBreakdown, quoteMode intentionally NOT persisted
```

### Pattern 6: BookingWizard canProceed Guard (Step 2)

The existing Step 2 guard is:
```typescript
case 2:
  return (
    pickupDate !== null &&
    pickupTime !== null &&
    (tripType !== 'daily' || returnDate !== null)
  )
```

Phase 24 does not wire Step 2 return time UI (that is Phase 25). However, the guard should be updated to also require `returnDate` for `round_trip`, matching the same pattern as `daily`. This prevents a `round_trip` user advancing from Step 2 without a return date (which will be required once Phase 25 adds the UI):

```typescript
case 2:
  return (
    pickupDate !== null &&
    pickupTime !== null &&
    (tripType !== 'daily' || returnDate !== null) &&
    (tripType !== 'round_trip' || returnDate !== null)
  )
```

Note: `returnTime` is left out of this guard in Phase 24 because the return time UI does not exist yet. Phase 25 will add the UI and extend this guard.

### Pattern 7: Step1TripType showSwapIcon Guard

Currently:
```typescript
const showSwapIcon = tripType === 'transfer' || tripType === 'daily'
```

Round trip is an A-to-B journey so the swap icon should be shown:
```typescript
const showSwapIcon = tripType === 'transfer' || tripType === 'daily' || tripType === 'round_trip'
```

### Pattern 8: resetBooking Must Include returnTime

The `resetBooking` function in `booking-store.ts` already sets `returnDate: null`. Add `returnTime: null` alongside it to satisfy SC-4:

```typescript
resetBooking: () => set({
  // ...existing fields...
  returnDate: null,
  returnTime: null,   // ADD THIS
  // ...
}),
```

### Anti-Patterns to Avoid

- **Clearing returnDate in setTripType when switching from round_trip:** `returnDate` is used by `daily` too. Clearing it when switching away from `round_trip` to `daily` would erase the user's date. Only clear `returnTime`.
- **Adding returnTime to priceBreakdown or any typed pricing field:** `returnTime` is a raw `string | null`, same pattern as `pickupTime`. Do not conflate it with pricing state.
- **Forgetting to add returnTime to the initial state object:** Zustand requires every field declared in the interface to have an initial value in the `create` call. Set it to `null`.
- **Adding round_trip to airport-specific logic in Step1TripType:** Round trip does not auto-fill airport addresses. Leave airport detection logic (`tripType === 'airport_pickup'` etc.) untouched.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State persistence on refresh | Custom localStorage serialization | Zustand `partialize` + `createJSONStorage(() => sessionStorage)` — already in place | Already handles Set rehydration edge case; custom code would regress existing behavior |
| Tab navigation | Custom tab component | Extend existing `TripTypeTabs` `TRIP_TYPES` array | One line addition; component already handles active state, hover, aria-selected |

---

## Common Pitfalls

### Pitfall 1: TripTypeTabs test says "renders 5 tabs"
**What goes wrong:** `TripTypeTabs.test.tsx` line 6 has a todo asserting 5 tabs: `TRANSFER, AIRPORT PICKUP, AIRPORT DROPOFF, HOURLY, DAILY`. The comment says 5 tabs but the CURRENT code only renders 3 tabs (`TRANSFER`, `HOURLY`, `DAILY`). There are no `AIRPORT PICKUP` / `AIRPORT DROPOFF` tabs in `TripTypeTabs.tsx` — those are handled as `TripType` values but the tabs were simplified. The todo test is stale. When implementing the test, verify against the actual rendered output (3 tabs becoming 4) — not the stale todo comment.
**How to avoid:** Read the component, not just the test stub, to determine the actual current tab count.

### Pitfall 2: returnDate is already in the store but is "Daily Hire only" per comment
**What goes wrong:** The `BookingStore` interface comment says `returnDate: string | null // Daily Hire only`. Phase 24 repurposes `returnDate` for round trip as well. The comment must be updated to say `// Daily Hire and Round Trip`.
**Why it matters:** Phase 25 will conditionally show `returnDate` UI for both `tripType === 'daily'` and `tripType === 'round_trip'`. Stale comments mislead.

### Pitfall 3: Set rehydration for completedSteps
**What goes wrong:** `completedSteps` is a `Set<number>` but JSON serializes to an array. The store already handles this via `onRehydrateStorage`. No change needed here but do not touch the rehydration handler.
**How to avoid:** Leave `onRehydrateStorage` exactly as-is when editing `partialize`.

### Pitfall 4: Forgetting initial state values
**What goes wrong:** Adding `returnTime` to the `BookingStore` interface without adding `returnTime: null` to both the initial state object AND the `resetBooking` call will cause TypeScript to error and runtime behavior to be undefined.
**How to avoid:** Three places must be touched when adding a state field: (1) interface in `types/booking.ts`, (2) initial state in the `create` call in `booking-store.ts`, (3) `resetBooking` reset object in `booking-store.ts`.

### Pitfall 5: canProceed for round_trip doesn't require returnTime yet
**What goes wrong:** Over-engineering Step 2 guard in Phase 24. Return time input UI doesn't exist until Phase 25. If you add `returnTime !== null` to `canProceed case 2` now, users can never advance past Step 2 on round_trip because there is nowhere to input `returnTime`.
**How to avoid:** Phase 24 only guards `returnDate !== null` for `round_trip` in `canProceed`. Return time guard belongs to Phase 25.

---

## Code Examples

### Adding a new state field to Zustand 5 (pattern from existing store)
```typescript
// Source: lib/booking-store.ts (existing pattern for pickupTime)
// 1. In interface (types/booking.ts):
returnTime: string | null   // '14:30' format — round_trip only

// 2. Initial value in create():
returnTime: null,

// 3. Action in create():
setReturnTime: (time) => set({ returnTime: time }),

// 4. In resetBooking():
returnTime: null,

// 5. In partialize():
returnTime: state.returnTime,
```

### Zustand 5 — no breaking changes from 4 for this pattern
Zustand 5 retains the same `create`, `persist`, `partialize`, and `set` API used here. The upgrade from 4 to 5 occurred in this project already (v5.0.12 is installed). No migration actions are needed.

### Test pattern for store — reading directly from store state
```typescript
// Source: vitest + jsdom — existing project setup
import { useBookingStore } from '@/lib/booking-store'

beforeEach(() => {
  useBookingStore.setState({
    tripType: 'transfer',
    returnTime: null,
    // ...other fields
  })
})

it('setTripType to round_trip stores tripType correctly', () => {
  useBookingStore.getState().setTripType('round_trip')
  expect(useBookingStore.getState().tripType).toBe('round_trip')
})

it('setTripType away from round_trip clears returnTime', () => {
  useBookingStore.setState({ tripType: 'round_trip', returnTime: '14:30' })
  useBookingStore.getState().setTripType('transfer')
  expect(useBookingStore.getState().returnTime).toBeNull()
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `TripType = 'transfer' \| 'hourly' \| 'daily'` | Add `\| 'round_trip'` | Phase 24 | TypeScript exhaustiveness helps find all required touch points |
| No returnTime field | `returnTime: string \| null` | Phase 24 | Enables Step 2 return time picker (Phase 25) and store persistence |

---

## Open Questions

1. **Should `setTripType` also clear `returnDate` when switching FROM `round_trip` to a non-daily type?**
   - What we know: `returnDate` is used by both `daily` and (after Phase 24) `round_trip`. Switching `round_trip` → `transfer` leaves `returnDate` set in the store.
   - What's unclear: Is a stale `returnDate` in state harmful for transfer/hourly/airport flows? These flows never read `returnDate`, so it is invisible.
   - Recommendation: Do NOT clear `returnDate` in `setTripType`. Keep the existing behavior: `returnDate` is cleared only by `resetBooking`. This avoids a surprising UX edge case where switching `round_trip` → `daily` loses the already-selected return date.

2. **Does the `airport_pickup` / `airport_dropoff` auto-fill logic in `BookingWizard` affect round_trip?**
   - What we know: The `isAirportRide` check in `BookingWizard` looks at `origin.placeId` and `destination.placeId`. Round trip does not add an airport constraint.
   - Recommendation: No change needed to airport logic. Leave as-is.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 + @testing-library/react ^16.3.2 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts tests/TripTypeTabs.test.tsx` |
| Full suite command | `cd prestigo && node_modules/.bin/vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RTFR-01 (SC-1) | Selecting "Round Trip" stores `tripType: 'round_trip'` | unit | `vitest run tests/booking-store.test.ts` | ✅ (stubs only) |
| RTFR-01 (SC-2) | Switching away from round_trip clears `returnTime` | unit | `vitest run tests/booking-store.test.ts` | ✅ (stubs only) |
| RTFR-01 (SC-3) | Page refresh preserves `returnTime`, not priceBreakdown | unit | `vitest run tests/booking-store.test.ts` | ✅ (stubs only) |
| RTFR-01 (SC-4) | `resetBooking` clears all return-leg fields | unit | `vitest run tests/booking-store.test.ts` | ✅ (stubs only) |
| RTFR-01 (UI) | "ROUND TRIP" tab renders and is selectable | unit | `vitest run tests/TripTypeTabs.test.tsx` | ✅ (stubs only) |

### Sampling Rate
- **Per task commit:** `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts tests/TripTypeTabs.test.tsx`
- **Per wave merge:** `cd prestigo && node_modules/.bin/vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. `booking-store.test.ts` and `TripTypeTabs.test.tsx` both exist with `it.todo` stubs. The plan will implement these stubs as real tests.

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `prestigo/lib/booking-store.ts` — current store shape, partialize config, setTripType implementation
- Direct file reads: `prestigo/types/booking.ts` — current TripType union, BookingStore interface
- Direct file reads: `prestigo/components/booking/TripTypeTabs.tsx` — current tab array and rendering
- Direct file reads: `prestigo/components/booking/steps/Step1TripType.tsx` — showSwapIcon logic, validation, nextStep call
- Direct file reads: `prestigo/components/booking/BookingWizard.tsx` — canProceed guards per step
- Direct file reads: `prestigo/tests/booking-store.test.ts`, `tests/TripTypeTabs.test.tsx` — existing test stubs
- Direct file reads: `prestigo/vitest.config.ts`, `prestigo/package.json` — test framework and dependency versions

### Secondary (MEDIUM confidence)
- Zustand v5 release notes (inferred from installed version ^5.0.12) — no API breaking changes to `persist`, `partialize`, or `createJSONStorage` patterns used here

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — direct source code inspection of every file touched
- Pitfalls: HIGH — discovered from reading existing code patterns (stale todo comments, returnDate dual-use, Set rehydration)

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable domain — TypeScript, Zustand, React patterns change slowly)
