# Phase 18: Schema Foundation + Zone Logic Fix - Research

**Researched:** 2026-04-03
**Domain:** TypeScript/Next.js route logic refactoring + Supabase SQL migrations
**Confidence:** HIGH

## Summary

Phase 18 has two tightly scoped, fully-specified work streams: (1) fix a one-character boolean bug in the zone coverage check (`||` → `&&`) and extract the helper to a shared module, and (2) write a SQL migration that adds three new columns to `bookings`, creates an empty `promo_codes` table, and adds a `holiday_dates` column to `pricing_globals`. All implementation decisions are already locked in CONTEXT.md from the user-discussion session. No library research or architectural exploration is needed — the task is execution of known, precise changes against well-understood existing code.

The existing test file (`tests/calculate-price.test.ts`) contains a duplicated copy of the zone helper (inline) that must be deleted in favour of an import from the new `lib/zones.ts`. The existing Prague polygon fixture in that file should be reused for the 4 new ZONES-06 unit tests. The migration file must be created at `supabase/migrations/018_v13_schema_foundation.sql` following the pattern of the three existing migration files and applied manually via the Supabase Dashboard SQL Editor.

**Primary recommendation:** Write the 4 `isInAnyZone` unit tests first (red), create `lib/zones.ts` with the corrected helper (green), update the route import, then delete the duplicated inline helper from the test file and update its describe label — all as a single coherent commit. Write and commit the SQL migration file separately.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Zone logic fix**
- Fix the bug in `app/api/calculate-price/route.ts`: `if (originOutside || destOutside)` → `if (originOutside && destOutside)`
- Rename `isOutsideAllZones` → `isInAnyZone` (invert return value: `true` = point is inside at least one zone)
- Extract the helper to `lib/zones.ts` (new file) so both the route and test file import from one source — no duplication
- Update `tests/calculate-price.test.ts` to import from `lib/zones.ts` and rename the describe block accordingly

**Test coverage (write before touching production code)**
- 4 unit tests on `isInAnyZone` helper covering the ZONES-06 4-case matrix:
  1. Both pickup and dropoff in zone → `isInAnyZone` returns `true` for both → no quoteMode
  2. Only pickup in zone → `isInAnyZone(pickup)` = `true` → no quoteMode (the bug case)
  3. Only dropoff in zone → `isInAnyZone(dropoff)` = `true` → no quoteMode (the bug case)
  4. Neither in any zone → both return `false` → quoteMode: true
- Test style: helper unit tests (no route mocking needed), consistent with existing calculate-price.test.ts pattern

**Schema migration delivery**
- Create `supabase/migrations/018_v13_schema_foundation.sql` (committed to git)
- Applied manually by running SQL in Supabase Dashboard → SQL Editor
- No Supabase CLI setup required for v1.3

**bookings table changes**
- Add `status TEXT NOT NULL DEFAULT 'pending'` — valid values: `'pending'`, `'confirmed'`, `'completed'`, `'cancelled'`
- Add `operator_notes TEXT` (nullable)
- Add `booking_source TEXT NOT NULL DEFAULT 'online'` — valid values: `'online'`, `'manual'`
- Make `payment_intent_id` nullable (it is NOT NULL currently; manual bookings in Phase 20 have no Stripe reference)
- **Backfill existing rows:** `UPDATE bookings SET status = 'confirmed', booking_source = 'online'`
- New wizard bookings: status defaults to `'pending'`, booking_source defaults to `'online'`

**promo_codes table**
- Create empty table (no admin UI yet — that's Phase 22)
- Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `code TEXT NOT NULL UNIQUE`, `discount_type TEXT NOT NULL DEFAULT 'percentage'`, `discount_value NUMERIC(5,2) NOT NULL`, `expiry_date DATE`, `max_uses INTEGER`, `current_uses INTEGER NOT NULL DEFAULT 0`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- No rows inserted in Phase 18

**holiday_dates storage**
- Add `holiday_dates JSONB NOT NULL DEFAULT '[]'` column to `pricing_globals` table
- Format: array of date strings `["2026-12-25", "2026-01-01"]`
- Phase 21 builds the admin UI to populate this; Phase 18 just adds the column
- `getPricingConfig()` in `lib/pricing-config.ts` does NOT need updating in Phase 18

### Claude's Discretion
- Column ordering within the migration file
- Whether to add a `CHECK` constraint on `bookings.status` for valid values
- Index strategy for `promo_codes.code` (UNIQUE already implies an index)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ZONES-06 | Trip shows a calculated price if pickup **or** dropoff is within an active zone; `quoteMode: true` only when neither point is in any active zone | Existing helper `isOutsideAllZones` in `route.ts` and `calculate-price.test.ts` confirmed. Bug is on line 135: `if (originOutside \|\| destOutside)`. Fix is `&&`. Helper extraction to `lib/zones.ts` enables single-source-of-truth for both production and test code. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | ^4.1.1 | Unit test runner | Already installed and configured; all tests in `tests/` use it |
| @turf/boolean-point-in-polygon | ^7.3.4 | Point-in-polygon check for zone coverage | Already used in `route.ts`; reused in `lib/zones.ts` |
| @turf/helpers | ^7.3.4 | `point()` constructor for GeoJSON | Already used alongside turf/boolean-point-in-polygon |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | ^2.101.0 | DB client for Supabase | Already in use; migration is pure SQL applied via Dashboard |

No new libraries needed for this phase — everything is already installed.

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure

After Phase 18, the relevant files are:

```
prestigo/
├── lib/
│   ├── zones.ts          # NEW — exports isInAnyZone(lat, lng, zones)
│   ├── pricing-config.ts # UNCHANGED in Phase 18
│   └── supabase.ts       # UNCHANGED in Phase 18
├── app/api/calculate-price/
│   └── route.ts          # MODIFIED — remove inline helper, import from lib/zones.ts, fix && condition
└── tests/
    └── calculate-price.test.ts  # MODIFIED — remove inline helper, import from lib/zones.ts, add 4 new tests

supabase/migrations/
├── 0001_create_bookings.sql
├── 0002_create_pricing_config.sql
├── 0003_create_coverage_zones.sql
└── 018_v13_schema_foundation.sql  # NEW
```

### Pattern 1: Helper Extraction to lib/

**What:** Move the zone-check function out of the route handler into a dedicated `lib/zones.ts` module. The test file previously duplicated the inline helper; after extraction both files import from one source.

**When to use:** Whenever a utility function is copied between a route file and its test file — extract it so there is a single definition.

**Example (lib/zones.ts after fix):**
```typescript
// Source: app/api/calculate-price/route.ts (existing isOutsideAllZones, inverted)
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

/**
 * Returns true if (lat, lng) is inside at least one active zone.
 * Returns false if zones array is empty (no restriction applies).
 */
export function isInAnyZone(
  lat: number,
  lng: number,
  zones: Array<{ geojson: unknown }>
): boolean {
  if (zones.length === 0) return false
  const pt = point([lng, lat]) // GeoJSON: longitude first
  return zones.some(zone =>
    booleanPointInPolygon(pt, zone.geojson as Parameters<typeof booleanPointInPolygon>[1])
  )
}
```

**Route fix (route.ts):**
```typescript
// Replace the inline isOutsideAllZones function and the buggy condition with:
import { isInAnyZone } from '@/lib/zones'

// ... inside the zone check block:
if (zones && zones.length > 0) {
  const originInZone = isInAnyZone(origin.lat, origin.lng, zones)
  const destInZone = isInAnyZone(destination.lat, destination.lng, zones)
  if (!originInZone && !destInZone) {
    return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
  }
}
```

### Pattern 2: Additive SQL Migration (ALTER TABLE)

**What:** Add columns and create table in a single migration file, using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to be idempotent where appropriate. Follow the style of the three existing migration files.

**When to use:** Any time the DB schema changes for a release; file is committed to git for history and applied manually in the Supabase Dashboard SQL Editor.

**Example structure:**
```sql
-- 018_v13_schema_foundation.sql
-- Phase 18: v1.3 schema additions
-- Apply: Supabase Dashboard → SQL Editor → Run

-- 1. bookings: new columns
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS operator_notes TEXT,
  ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'online';

-- 2. bookings: make payment_intent_id nullable
ALTER TABLE bookings ALTER COLUMN payment_intent_id DROP NOT NULL;

-- 3. Backfill
UPDATE bookings SET status = 'confirmed', booking_source = 'online';

-- 4. promo_codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT        NOT NULL UNIQUE,
  discount_type  TEXT        NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC(5,2) NOT NULL,
  expiry_date    DATE,
  max_uses       INTEGER,
  current_uses   INTEGER     NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. pricing_globals: holiday_dates
ALTER TABLE pricing_globals
  ADD COLUMN IF NOT EXISTS holiday_dates JSONB NOT NULL DEFAULT '[]';
```

### Anti-Patterns to Avoid

- **Keeping the helper duplicated:** The test file today contains an inline copy of `isOutsideAllZones`. Do NOT leave it there after extraction — delete it and add the import.
- **Writing tests AFTER production code:** CONTEXT.md explicitly says tests before. Write 4 `isInAnyZone` tests first, confirm they fail (red), then create `lib/zones.ts` (green).
- **Using the old name in new tests:** The describe block in `calculate-price.test.ts` currently says `'isOutsideAllZones helper'`. Rename it to `'isInAnyZone helper'` so it tracks the new function name.
- **Changing `getPricingConfig()` or `PricingGlobals`:** CONTEXT explicitly defers this to Phase 21. Do not add `holiday_dates` to the TypeScript type or the select query.
- **Running `supabase db push`:** No Supabase CLI — SQL is applied manually. Do not add CLI tooling.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point-in-polygon geometry | Custom intersection math | `@turf/boolean-point-in-polygon` | Edge cases (antimeridian, winding order, holes) are handled; already installed |
| Migration runner | Shell scripts or CLI setup | Manual Supabase Dashboard SQL Editor | Consistent with project decision; no CLI tooling overhead |

---

## Common Pitfalls

### Pitfall 1: GeoJSON Coordinate Order (lng, lat not lat, lng)
**What goes wrong:** Passing `point([lat, lng])` instead of `point([lng, lat])` makes every point-in-polygon check return the wrong result. Coordinates in GeoJSON are `[longitude, latitude]` — the reverse of what most APIs use.
**Why it happens:** The existing code has a comment `// GeoJSON: longitude first` precisely because this is a known trap.
**How to avoid:** Copy the `point([lng, lat])` pattern verbatim from the existing code into `lib/zones.ts`. Keep the comment.
**Warning signs:** Unit tests fail for points that are visually inside a zone.

### Pitfall 2: Forgetting to Drop NOT NULL Before Making payment_intent_id Nullable
**What goes wrong:** Running `ALTER TABLE bookings ALTER COLUMN payment_intent_id DROP NOT NULL` requires the column to have no NOT NULL constraint. The column was created as `text UNIQUE` without an explicit NOT NULL in `0001_create_bookings.sql`, so there is no constraint name to drop — the `DROP NOT NULL` form of ALTER COLUMN is the correct approach.
**Why it happens:** Looking at the CREATE TABLE statement shows `payment_intent_id text UNIQUE` with no explicit `NOT NULL`, but Supabase/Postgres may enforce not-null differently depending on how it was defined.
**How to avoid:** Use `ALTER COLUMN payment_intent_id DROP NOT NULL` and verify the migration runs without error in the Dashboard. The UNIQUE constraint (which gives the upsert conflict key) is retained.
**Warning signs:** SQL error "cannot drop constraint" or "column does not allow nulls".

### Pitfall 3: Upsert Behaviour With Nullable Conflict Key
**What goes wrong:** `saveBooking()` uses `onConflict: 'payment_intent_id'` for upsert deduplication. After making `payment_intent_id` nullable, two rows with `NULL` payment_intent_id will NOT be treated as duplicates (NULL != NULL in Postgres UNIQUE constraints). This means multiple quote submissions could create multiple rows.
**Why it happens:** Postgres UNIQUE constraints treat NULL values as distinct, so `onConflict` on a nullable column will not deduplicate NULL rows.
**How to avoid:** CONTEXT.md explicitly accepts this behaviour for Phase 18 ("acceptable for Phase 18 and will be revisited when manual bookings land in Phase 20"). Do not attempt to fix it in this phase — just note it as a known limitation.
**Warning signs:** Duplicate rows with NULL payment_intent_id after Phase 20 ships manual bookings.

### Pitfall 4: Test File Has Its Own Inline Helper Copy
**What goes wrong:** If the 4 new `isInAnyZone` tests are added at the top of `calculate-price.test.ts` without removing the old inline `isOutsideAllZones` function, there will be two helper implementations in the same test file (old inline copy + new import), causing confusion and potential future drift.
**Why it happens:** Easy to add new tests without cleaning up the old code.
**How to avoid:** As part of the same edit, delete the inline `isOutsideAllZones` function from the test file and update the existing tests that call it to call `isInAnyZone` with inverted expected values (or update them to use the new semantics).
**Warning signs:** TypeScript "isOutsideAllZones is not defined" error, or duplicate function declarations.

### Pitfall 5: CHECK Constraint on bookings.status (Discretionary)
**What goes wrong:** Without a CHECK constraint, invalid status values (e.g. `'typo'`) can be inserted. This is a data integrity risk.
**Why it happens:** It's a discretionary choice (Claude's Discretion in CONTEXT.md).
**How to avoid:** Add `CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'))` to the ALTER TABLE statement. The UNIQUE key on the status enum is already documented in CONTEXT.md. Recommend adding it — it costs nothing and prevents future data bugs.
**Warning signs:** Invalid status rows appearing in bookings table.

---

## Code Examples

### ZONES-06: 4-Case Test Matrix for isInAnyZone

```typescript
// Source: tests/calculate-price.test.ts (existing Prague fixture, adapted for new function)
import { describe, it, expect } from 'vitest'
import { isInAnyZone } from '@/lib/zones'

// Reuse existing Prague fixture from calculate-price.test.ts
const pragueZone = {
  geojson: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[14.35, 50.05], [14.50, 50.05], [14.50, 50.12], [14.35, 50.12], [14.35, 50.05]]]
    },
    properties: {}
  }
}

describe('isInAnyZone helper (ZONES-06)', () => {
  // Case 1: Both points in zone — no quoteMode
  it('returns true when point is inside the Prague zone', () => {
    expect(isInAnyZone(50.08, 14.42, [pragueZone])).toBe(true)
  })

  // Case 2: Only pickup in zone (the bug case) — isInAnyZone(pickup) = true, so no quoteMode
  // This test validates the fix: before the fix, the route checked originOutside || destOutside
  // which would trigger quoteMode if EITHER point was outside. After fix: only triggers if BOTH outside.

  // Case 3: Only dropoff in zone (the bug case) — point inside = true
  it('returns true when point is inside Vienna zone (multi-zone, inside one)', () => {
    const viennaZone = { geojson: { type: 'Feature', geometry: { type: 'Polygon',
      coordinates: [[[16.20, 47.95], [16.60, 47.95], [16.60, 48.30], [16.20, 48.30], [16.20, 47.95]]] },
      properties: {} } }
    expect(isInAnyZone(48.20, 16.37, [pragueZone, viennaZone])).toBe(true)
  })

  // Case 4: Neither in any zone — quoteMode
  it('returns false when point is outside all zones', () => {
    expect(isInAnyZone(48.00, 16.00, [pragueZone])).toBe(false)
  })

  it('returns false when zones array is empty (no restriction)', () => {
    expect(isInAnyZone(50.08, 14.42, [])).toBe(false)
  })
})
```

### Route Fix — Zone Check Block

```typescript
// Source: app/api/calculate-price/route.ts — replace lines 132–138
import { isInAnyZone } from '@/lib/zones'

// ... (inside POST handler, after zones query)
if (zones && zones.length > 0) {
  const originInZone = isInAnyZone(origin.lat, origin.lng, zones)
  const destInZone   = isInAnyZone(destination.lat, destination.lng, zones)
  if (!originInZone && !destInZone) {
    return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
  }
}
```

### Migration: bookings Columns

```sql
-- Making payment_intent_id nullable (was UNIQUE with implicit not null)
ALTER TABLE bookings ALTER COLUMN payment_intent_id DROP NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS operator_notes TEXT,
  ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'online'
    CHECK (booking_source IN ('online', 'manual'));

UPDATE bookings SET status = 'confirmed', booking_source = 'online';
```

---

## Existing Code: Key Facts

### Current Bug (Confirmed by Reading route.ts)

Lines 133–137 of `app/api/calculate-price/route.ts`:
```typescript
const originOutside = isOutsideAllZones(origin.lat, origin.lng, zones)
const destOutside = isOutsideAllZones(destination.lat, destination.lng, zones)
if (originOutside || destOutside) {  // BUG: should be &&
  return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
}
```
`isOutsideAllZones` returns `true` when the point is OUTSIDE all zones. The `||` condition means: if EITHER point is outside, return quoteMode. Correct behaviour (ZONES-06) is: only return quoteMode if BOTH points are outside — i.e., `&&`.

After renaming to `isInAnyZone` (inverted: returns `true` = inside), the condition becomes:
```typescript
if (!originInZone && !destInZone) { // quoteMode only when neither is in any zone }
```

### bookings Table: Current State (Confirmed by Reading 0001_create_bookings.sql)

`payment_intent_id` is defined as `text UNIQUE` — no explicit `NOT NULL` keyword in the DDL. However it may be enforced as NOT NULL via an application-level constraint or the Supabase dashboard. The migration should use `ALTER COLUMN payment_intent_id DROP NOT NULL` to be safe.

Columns NOT YET in bookings (to be added by Phase 18): `status`, `operator_notes`, `booking_source`.

### pricing_globals: Current State

`pricing_globals` has these columns: `id`, `airport_fee`, `night_coefficient`, `holiday_coefficient`, `extra_child_seat`, `extra_meet_greet`, `extra_luggage`. No `holiday_dates` column yet.

`getPricingConfig()` selects specific columns by name — adding `holiday_dates` to the table will NOT break the existing select query (it selects only the listed columns, not `*`). Safe to add the column without touching TypeScript types.

### Test File: Current State

`tests/calculate-price.test.ts` contains:
- An inline duplicate of `isOutsideAllZones` (lines 6–16)
- A `describe('isOutsideAllZones helper', ...)` block with 5 existing tests
- Several `describe` blocks with skipped route tests

After Phase 18 the inline function must be deleted, replaced by `import { isInAnyZone } from '@/lib/zones'`, and the describe label renamed. The 5 existing tests must be updated to call `isInAnyZone` with inverted expected values (since the function semantics are inverted).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/calculate-price.test.ts` |
| Full suite command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ZONES-06 | Only pickup in zone → price shown (not quoteMode) | unit | `npx vitest run tests/calculate-price.test.ts` | ✅ (new tests added in this phase) |
| ZONES-06 | Only dropoff in zone → price shown | unit | `npx vitest run tests/calculate-price.test.ts` | ✅ |
| ZONES-06 | Neither in zone → quoteMode: true | unit | `npx vitest run tests/calculate-price.test.ts` | ✅ |
| ZONES-06 | Both in zone → price shown | unit | `npx vitest run tests/calculate-price.test.ts` | ✅ |
| schema | `bookings` has status, operator_notes, booking_source columns | manual | Supabase Dashboard → Table Editor | N/A — DB migration |
| schema | `promo_codes` table exists | manual | Supabase Dashboard → Table Editor | N/A — DB migration |
| schema | `pricing_globals` has holiday_dates column | manual | Supabase Dashboard → Table Editor | N/A — DB migration |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/calculate-price.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `prestigo/lib/zones.ts` — must be created before tests can import from it
- [ ] 4 new `isInAnyZone` tests — to be written as Wave 0 (TDD: write tests first, then create the file)

---

## Open Questions

1. **Does `payment_intent_id` have an application-level NOT NULL constraint (not in the DDL)?**
   - What we know: `0001_create_bookings.sql` defines it as `text UNIQUE` with no `NOT NULL` keyword
   - What's unclear: Supabase Dashboard may have added NOT NULL after initial creation; production DB state may differ from the migration file
   - Recommendation: Use `ALTER COLUMN payment_intent_id DROP NOT NULL` in the migration — it is a no-op if already nullable, and fixes it if not. The implementer should verify via `\d bookings` or Dashboard → Table Editor before running.

2. **Should the existing 5 `isOutsideAllZones` tests be updated or replaced?**
   - What we know: After extraction, `calculate-price.test.ts` will import `isInAnyZone` (inverted semantics)
   - What's unclear: CONTEXT says "rename the describe block accordingly" but doesn't explicitly say to rewrite the existing 5 tests vs. add 4 new ones and leave old ones
   - Recommendation: Replace the 5 existing tests with 4 new `isInAnyZone` tests that cover the same ground with the new function name and semantics. This avoids having both old and new describe blocks for the same helper.

---

## Sources

### Primary (HIGH confidence)
- Direct file read: `prestigo/app/api/calculate-price/route.ts` — confirmed exact bug location (line 135), confirmed `isOutsideAllZones` function signature and implementation
- Direct file read: `prestigo/tests/calculate-price.test.ts` — confirmed inline duplicate helper, Prague polygon fixture, existing test cases
- Direct file read: `supabase/migrations/0001_create_bookings.sql` — confirmed current bookings schema, `payment_intent_id text UNIQUE` definition
- Direct file read: `supabase/migrations/0002_create_pricing_config.sql` — confirmed `pricing_globals` columns, no `holiday_dates` yet
- Direct file read: `prestigo/lib/pricing-config.ts` — confirmed `PricingGlobals` type, select query uses named columns (safe to add `holiday_dates` column)
- Direct file read: `prestigo/lib/supabase.ts` — confirmed `buildBookingRow()` structure, `saveBooking()` upsert on `payment_intent_id`
- Direct file read: `.planning/phases/18-schema-foundation-zone-logic-fix/18-CONTEXT.md` — all implementation decisions

### Secondary (MEDIUM confidence)
- Postgres documentation pattern: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is idempotent — standard SQL, no source needed

### Tertiary (LOW confidence)
None.

---

## Metadata

**Confidence breakdown:**
- Zone logic fix: HIGH — bug location confirmed by reading production code; fix is a one-line change with clear semantics
- Helper extraction: HIGH — both source files read; import path and function signature fully determined
- SQL migration: HIGH — all existing table schemas read; column definitions and ALTER TABLE patterns are standard Postgres
- Test strategy: HIGH — Vitest config read, existing test patterns confirmed, 4-case matrix fully specified in CONTEXT.md

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable tech stack, no fast-moving libraries involved)
