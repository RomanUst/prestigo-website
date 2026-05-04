---
phase: 47-db-migration-vehicle-map
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - supabase/migrations/039_gnet_bookings.sql
  - lib/gnet-vehicle-map.ts
  - tests/gnet-vehicle-map.test.ts
  - tests/gnet-farmin.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 47: Code Review Report

**Reviewed:** 2026-05-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 47 delivers: (1) a SQL migration extending `booking_source` CHECK and creating `gnet_bookings` with RLS lockdown; (2) a pure mapping module `lib/gnet-vehicle-map.ts`; (3) unit tests for both the mapping module and the GNet farmin API route.

The code is well-structured and the security posture is solid — RLS deny-all policies, Object.freeze on routing decisions, null-not-throw on unknown vehicle codes, and timing-safe auth checks are all present. One warning covers a fragile assumption about the auto-generated PostgreSQL constraint name that could cause a silent migration failure. Two info items flag a misleading test comment and an unguarded `last_push_status` column.

## Warnings

### WR-01: Constraint name assumption may silently leave old CHECK in place

**File:** `supabase/migrations/039_gnet_bookings.sql:13`

**Issue:** The migration drops `bookings_booking_source_check` by its assumed auto-generated name (documented via inspection). `DROP CONSTRAINT IF EXISTS` will succeed silently even if the real constraint has a different name (e.g. due to schema history). In that case the original constraint `CHECK (booking_source IN ('online', 'manual'))` remains, and every subsequent GNet booking insert will fail with a CHECK violation at runtime — the migration itself will have appeared to succeed.

**Fix:** Add a cross-check assertion before the DROP, or verify the actual constraint name at migration runtime. As a minimal safeguard, add a comment with the Supabase `\d+ bookings` output confirming the name. Alternatively, use `pg_constraint` to perform a data-driven drop:

```sql
-- Safer: drop by scanning pg_constraint, not by assumed name
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.bookings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%booking_source%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', cname);
  END IF;
END$$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_source_check
  CHECK (booking_source IN ('online', 'manual', 'gnet'));
```

## Info

### IN-01: Misleading arithmetic comment in minFare clamp test

**File:** `tests/gnet-farmin.test.ts:263`

**Issue:** The inline comment reads `5 km × 1.55 = 7.75 → 8 base + 40 airport = 48; min business = 65 → clamped`. This implies the airport fee is added before clamping (8 + 40 = 48 < 65, so result = 65), which is consistent with the assertion `expect(body.totalAmount).toBe('65.00')`. However the comment format is confusing — it shows `48` as the pre-clamp total but then jumps to `65` without explicitly stating that `max(48, 65) = 65` is the clamp operation. A future reader could think the airport fee is applied post-clamp.

**Fix:** Clarify the comment to make the clamp application order explicit:

```ts
// 5 km × 1.55 = 7.75 → round to 8 base; 8 + 40 airport = 48 pre-clamp
// minFare = 65 > 48 → clamped to 65 (airport fee included in clamp comparison)
stubGoogleDistance(5)
```

### IN-02: `last_push_status` column has no CHECK constraint

**File:** `supabase/migrations/039_gnet_bookings.sql:27`

**Issue:** `last_push_status TEXT` accepts arbitrary values. Push status represents a finite set of outcomes (e.g. `'ok'`, `'error'`, `'pending'`). Without a constraint, inconsistent status strings can accumulate over time making queries and reporting fragile.

**Fix:** Add an explicit CHECK constraint once the set of valid statuses is confirmed, or use a domain/enum type. At minimum, document the intended values in a comment:

```sql
last_push_status  TEXT  CHECK (last_push_status IN ('ok', 'error', 'pending')),
```

If the set is not yet finalized, add a TODO comment so it is not forgotten.

---

_Reviewed: 2026-05-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
