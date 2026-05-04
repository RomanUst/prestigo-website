---
phase: 47-db-migration-vehicle-map
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - supabase/migrations/039_gnet_bookings.sql
  - types/booking.ts
  - lib/gnet-vehicle-map.ts
  - tests/gnet-vehicle-map.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 47: Code Review Report

**Reviewed:** 2026-05-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 47 introduces the `gnet_bookings` DB table, extends `BookingSource`, and delivers the `mapGnetVehicle` helper. The SQL migration is structurally sound: RLS lockdown covers all four DML operations, the foreign key uses `RESTRICT` correctly, and UNIQUE constraints implicitly create the needed indexes. The TypeScript files are clean and follow project patterns. Two warnings were found — one logic gap around passenger capacity and one test coverage gap — plus two informational items.

## Warnings

### WR-01: VAN_8 / VAN_12 mapped to business_van but exceed its maxPassengers

**File:** `lib/gnet-vehicle-map.ts:34-35`
**Issue:** `VAN_8` and `VAN_12` are mapped to `business_van`, yet `VEHICLE_CONFIG` for `business_van` declares `maxPassengers: 6`. If GNet sends a booking for a VAN_8 or VAN_12 (carrying 7–12 passengers), Phase 49 code that validates against `maxPassengers` will silently cap or reject the booking. `VAN_MINI_6` (6 pax) maps correctly, `VAN_MINI_7` (7 pax) has the same problem as VAN_8/VAN_12.

**Fix:** Either exclude `VAN_8`, `VAN_12`, and `VAN_MINI_7` from the map (return null → reject as unsupported), or add a larger-van VehicleClass to the type system before Phase 49. Rejecting is the safer short-term fix:

```ts
// Remove or comment out until a matching VehicleClass exists:
// VAN_8:           'business_van',
// VAN_12:          'business_van',
// VAN_MINI_7:      'business_van',
```

---

### WR-02: Van test suite covers only 4 of 8 van codes

**File:** `tests/gnet-vehicle-map.test.ts:19-23`
**Issue:** The `'maps van codes to business_van'` test covers `VAN_CORP`, `SPRINTER`, `VAN_MINI`, and `VAN_MINI_LUXURY` but omits `VAN_MINI_6`, `VAN_MINI_7`, `VAN_8`, and `VAN_12`. If any of these four are renamed or removed from the map, no test will fail.

**Fix:** Add the missing assertions to the existing test case:

```ts
it('maps van codes to business_van', () => {
  expect(mapGnetVehicle('VAN_CORP')).toBe('business_van')
  expect(mapGnetVehicle('SPRINTER')).toBe('business_van')
  expect(mapGnetVehicle('VAN_MINI')).toBe('business_van')
  expect(mapGnetVehicle('VAN_MINI_LUXURY')).toBe('business_van')
  expect(mapGnetVehicle('VAN_MINI_6')).toBe('business_van')
  expect(mapGnetVehicle('VAN_MINI_7')).toBe('business_van')
  expect(mapGnetVehicle('VAN_8')).toBe('business_van')
  expect(mapGnetVehicle('VAN_12')).toBe('business_van')
})
```

---

## Info

### IN-01: Constraint name assumed — silent no-op if name differs in production

**File:** `supabase/migrations/039_gnet_bookings.sql:8`
**Issue:** `DROP CONSTRAINT IF EXISTS bookings_booking_source_check` silently does nothing if the constraint exists under a different name (e.g., if it was created with a non-default name in an earlier migration). In that case, the old constraint stays on the column alongside the new one, creating a duplicate constraint. The comment on line 4 confirms the name was verified by inspection, so this is low risk, but it is not enforced by the migration itself.

**Fix:** No code change needed if the name has been verified. Document the verified name in the comment or add an assertion query. As a belt-and-suspenders option, query `pg_constraint` to confirm removal before adding:

```sql
-- Verified name via: SELECT conname FROM pg_constraint
-- WHERE conrelid = 'public.bookings'::regclass AND contype = 'c';
-- Result: bookings_booking_source_check  ✓
```

---

### IN-02: Placeholder GNet vehicle codes — risk of zero-match in production

**File:** `lib/gnet-vehicle-map.ts:1-14` (comment block)
**Issue:** The comment explicitly states these are placeholder codes pending confirmation from `support@grdd.net`. If the real GRDD codes differ from the map keys (e.g., GNet actually sends `E_CLASS` instead of `SEDAN`), every incoming booking will map to null and be rejected in Phase 49. This is a business-continuity risk, not a code defect.

**Fix:** Ensure the real codes are confirmed and the map is updated before Phase 49 is deployed. Track this in STATE.md as a hard prerequisite (it already appears to be listed there per the comment).

---

_Reviewed: 2026-05-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
