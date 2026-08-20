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

Reviewed the Phase 51 GNet badge and cancel modal changes in `BookingsTable.tsx` and
the accompanying Vitest suite in `tests/BookingsTable.test.tsx`.

The core implementation is correct: the GNet badge renders on both desktop (line 347)
and mobile (line 707) behind a clean `booking_source === 'gnet'` conditional; the cancel
modal variant routing (Variants A/C) correctly excludes GNet via `booking_source !== 'gnet'`
guards; Variant B correctly splits on `booking_source === 'gnet'` for the GNet-specific
copy; and the confirm button label at line 1592 correctly suppresses "Confirm Cancel + Refund"
for GNet rows.

Two warnings are raised: a weak assertion in the confirm-button label test that can pass
even when the label is wrong, and a type mismatch between the test's `PartialBooking`
fixture type and the production `Booking` interface. Two info items cover the shared
mutable fixture pattern and a missing `expect(rowCancelBtn).toBeDefined()` guard.

---

## Warnings

### WR-01: Confirm-button label test assertion is too weak — can produce a false negative

**File:** `tests/BookingsTable.test.tsx:415`
**Issue:** The test `'cancel modal confirm button for GNet row reads "Cancel Booking" not "Confirm Cancel + Refund"'`
verifies the negative (`queryByRole` returns null for "Confirm Cancel + Refund") and then
runs a weak positive:

```ts
const allCancelButtons = screen.getAllByRole('button', { name: /cancel booking/i })
expect(allCancelButtons.length).toBeGreaterThan(0)
```

`getAllByRole` with `/cancel booking/i` matches **any** button whose accessible name contains
those words — including the row-level "Cancel Booking" button that opened the modal, which
remains in the DOM behind the modal overlay. So if the modal confirm button were accidentally
labelled "Confirm Cancel + Refund", the query would still find the row-level button, `length`
would be `> 0`, and the test would pass falsely.

**Fix:** Assert specifically on the modal confirm button by role within the modal container,
mirroring the approach used in the other modal tests (locate via heading, then `closest`):

```ts
await waitFor(() => {
  expect(screen.getByRole('button', { name: /keep booking/i })).toBeDefined()
})
const heading = screen.getByRole('heading', { name: /cancel booking/i })
const modalContainer = heading.closest('div[style]')
// The confirm button inside the modal must read "Cancel Booking", not "Confirm Cancel + Refund"
expect(modalContainer?.querySelector('button[style*="copper"]')?.textContent).toBe('Cancel Booking')
// Or use getByRole scoped to the modal:
expect(screen.queryByRole('button', { name: /Confirm Cancel \+ Refund/i })).toBeNull()
// Positive: modal confirm button text must be exactly "Cancel Booking"
const modalButtons = screen.getAllByRole('button', { name: /cancel booking/i })
// Filter to the one inside the modal (has copper border styling, not the row-level button)
// Simplest reliable approach: assert the count is exactly 2 (row button + modal button)
expect(modalButtons.length).toBe(2)
```

Or, add a `data-testid="modal-confirm-btn"` to the confirm button in the source for
unambiguous querying.

---

### WR-02: `PartialBooking` fixture type is missing flight-related fields present in production `Booking`

**File:** `tests/BookingsTable.test.tsx:10`
**Issue:** The test-local `PartialBooking` type (lines 10–48) and the `makeBooking` factory
(lines 50–91) both omit seven fields that exist on the production `Booking` interface:

- `flight_iata: string | null`
- `flight_status: string | null`
- `flight_estimated_arrival: string | null`
- `flight_delay_minutes: number | null`
- `flight_departure_airport: string | null`
- `flight_arrival_airport: string | null`
- `flight_terminal: string | null`

The component reads `booking.flight_iata` at lines 803 and 1070 behind a truthy guard;
since `undefined` is falsy the component does not crash. However, the type contract is
broken: TypeScript will not flag a fixture object passed to a function expecting `Booking`
because `PartialBooking` is used locally and cast implicitly. If a future code path adds
a non-guarded read of any of these fields (e.g., `booking.flight_delay_minutes.toFixed()`),
the test suite will not catch it because the fixture supplies `undefined` rather than `null`.

**Fix:** Add the missing fields to `PartialBooking` and to the `makeBooking` defaults:

```ts
// In PartialBooking type (after flight_number):
flight_iata: string | null
flight_status: string | null
flight_estimated_arrival: string | null
flight_delay_minutes: number | null
flight_departure_airport: string | null
flight_arrival_airport: string | null
flight_terminal: string | null

// In makeBooking defaults:
flight_iata: null,
flight_status: null,
flight_estimated_arrival: null,
flight_delay_minutes: null,
flight_departure_airport: null,
flight_arrival_airport: null,
flight_terminal: null,
```

Also add these fields to the inline `gnetBooking` const in the Phase 51 describe block
(line 263–301).

---

## Info

### IN-01: `gnetBooking` fixture is a shared `const` object — use factory pattern for safety

**File:** `tests/BookingsTable.test.tsx:263`
**Issue:** `gnetBooking` is declared as a module-scoped `const` object shared across all
five tests in the `Phase 51 — GNet UI` suite. If any test were to mutate it
(e.g., `gnetBooking.status = 'cancelled'`) all subsequent tests in the suite would be
silently broken. The rest of the file correctly uses `makeBooking({...})` per test call.

**Fix:** Replace the shared const with a factory call at each use site, or at minimum
`Object.freeze` it:

```ts
// Option A: freeze
const gnetBooking = Object.freeze({
  id: 'gnet-test-1',
  // ...
} as const)

// Option B: define a factory (preferred, consistent with rest of file)
const makeGnetBooking = (overrides: Partial<PartialBooking> = {}) =>
  makeBooking({ id: 'gnet-test-1', booking_reference: 'PRE-GNET-1', booking_source: 'gnet', ... , ...overrides })
```

---

### IN-02: Missing `expect(rowCancelBtn).toBeDefined()` guard before `fireEvent.click` in GNet tests

**File:** `tests/BookingsTable.test.tsx:382–383, 406–407`
**Issue:** The tests `'cancel modal for GNet row contains "GNet partner" copy'` and
`'cancel modal confirm button for GNet row reads…'` perform:

```ts
const rowCancelBtn = cancelButtons.find(b => !b.textContent?.includes('Keep'))
if (rowCancelBtn) fireEvent.click(rowCancelBtn)
```

The `if (rowCancelBtn)` guard silently swallows a missing button — if the button is not
found, the modal never opens, the subsequent `waitFor` on "Keep Booking" would time out
with a confusing error. The RTAD-04 test at line 243 correctly asserts
`expect(rowCancelBtn).toBeDefined()` before the click.

**Fix:** Add the assertion in both GNet tests:

```ts
const rowCancelBtn = cancelButtons.find(b => !b.textContent?.includes('Keep'))
expect(rowCancelBtn).toBeDefined()
if (rowCancelBtn) fireEvent.click(rowCancelBtn)
```

---

_Reviewed: 2026-05-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
