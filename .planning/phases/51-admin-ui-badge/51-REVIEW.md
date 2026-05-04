---
phase: 51-admin-ui-badge
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - components/admin/BookingsTable.tsx
  - tests/BookingsTable.test.tsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 51: Code Review Report

**Reviewed:** 2026-05-04
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Phase 51 adds a GNet booking source badge (desktop + mobile) and adjusts the cancel
confirmation modal to suppress Stripe-refund copy for GNet bookings. The core logic is
correct: `booking_source !== 'gnet'` guards both Variant A (full refund) and Variant C
(partial round-trip refund) paths, so a GNet booking always falls through to the else
branch regardless of its `payment_intent_id` value. The badge rendering is symmetric
between desktop and mobile, both carrying correct `data-testid` attributes. No security
issues found.

Two test-quality warnings and two informational gaps are identified below. Nothing blocks
the release; the warnings are actionable improvements to test reliability.

## Warnings

### WR-01: Weak modal confirm-button assertion in GNet cancel test

**File:** `tests/BookingsTable.test.tsx:417`
**Issue:** The test `'cancel modal confirm button for GNet row reads "Cancel Booking" not
"Confirm Cancel + Refund"'` ends with:
```ts
expect(allCancelButtons.length).toBeGreaterThan(0)
```
This is trivially satisfied by the row-level "Cancel Booking" button that already exists in
the DOM before the modal opens — it does not verify the *modal* confirm button's label. The
negative guard on line 413 (`queryByRole(...) === null`) catches a refund-label regression,
but the positive assertion on 417 provides no additional protection and could mask a
situation where the modal confirm button is absent entirely.

**Fix:**
```ts
// Replace the length check with an explicit text assertion scoped to the modal:
const modalHeading = screen.getByRole('heading', { name: /cancel booking/i })
const modalEl = modalHeading.closest('div[style]')
const confirmBtn = Array.from(modalEl?.querySelectorAll('button') ?? [])
  .find(b => !b.textContent?.includes('Keep') && !b.textContent?.includes('Close'))
expect(confirmBtn?.textContent?.trim()).toBe('Cancel Booking')
```

### WR-02: `PartialBooking` test type missing Phase 32 flight-status fields

**File:** `tests/BookingsTable.test.tsx:10-48`
**Issue:** `PartialBooking` and `makeBooking` do not declare the seven flight-status columns
added in Phase 32 (`flight_iata`, `flight_status`, `flight_estimated_arrival`,
`flight_delay_minutes`, `flight_departure_airport`, `flight_arrival_airport`,
`flight_terminal`). The component accesses `row.original.flight_iata` (lines 812, 1079).
Mock data supplies `undefined` for these fields; guards like `{booking.flight_iata && ...}`
treat `undefined` as falsy, so no runtime crash occurs. However, TypeScript in strict mode
will report missing required properties when a `PartialBooking` object is passed where
`Booking` is expected, and any future test that asserts flight-status rendering will fail
silently if the factory omits these fields.

**Fix:** Extend `PartialBooking` and `makeBooking` defaults:
```ts
// Add to PartialBooking interface:
flight_iata: string | null
flight_status: string | null
flight_estimated_arrival: string | null
flight_delay_minutes: number | null
flight_departure_airport: string | null
flight_arrival_airport: string | null
flight_terminal: string | null

// Add to makeBooking defaults:
flight_iata: null,
flight_status: null,
flight_estimated_arrival: null,
flight_delay_minutes: null,
flight_departure_airport: null,
flight_arrival_airport: null,
flight_terminal: null,
```

## Info

### IN-01: Shared `gnetBooking` const in describe scope

**File:** `tests/BookingsTable.test.tsx:263-301`
**Issue:** `gnetBooking` is declared as a single `const` shared across all five GNet tests.
No test mutates it so there is no actual cross-test pollution, but this is inconsistent with
the rest of the suite which uses `makeBooking()` with overrides. A future test that spreads
or mutates `gnetBooking` would corrupt the object for subsequent tests in the same run.

**Fix:** Inline the booking via `makeBooking` with `booking_source: 'gnet'` overrides, or
move the const inside a `beforeEach` callback so each test receives a fresh copy.

### IN-02: Desktop GNet badge test does not scope to the desktop container

**File:** `tests/BookingsTable.test.tsx:303-311`
**Issue:** In jsdom there are no CSS media queries, so both `mobile-cards` and
`desktop-table` containers are present in the DOM simultaneously. `getByTestId('gnet-badge-gnet-test-1')` finds the desktop badge first because TanStack table renders before mobile
cards, but the test does not assert which container the badge belongs to. If the render
order changes, the test would still pass while silently asserting the wrong badge.

**Fix:**
```ts
import { within } from '@testing-library/react'
// ...
const desktopTable = screen.getByTestId('desktop-table')
const badge = within(desktopTable).getByTestId('gnet-badge-gnet-test-1')
expect(badge.textContent).toBe('GNET')
```

---

_Reviewed: 2026-05-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
