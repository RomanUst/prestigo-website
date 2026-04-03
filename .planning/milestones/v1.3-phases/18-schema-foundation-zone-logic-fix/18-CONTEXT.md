# Phase 18: Schema Foundation + Zone Logic Fix - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the zone coverage logic so that a trip shows a calculated price when pickup **or** dropoff is within an active zone (currently bugged: both must be inside). Also lay the DB schema foundations required by all v1.3 phases: new columns on `bookings`, a `promo_codes` table (empty), and `holiday_dates` JSONB on `pricing_globals`.

No admin UI, no pricing logic changes, no promo code CRUD — those belong to Phases 19–22.

</domain>

<decisions>
## Implementation Decisions

### Zone logic fix
- Fix the bug in `app/api/calculate-price/route.ts`: `if (originOutside || destOutside)` → `if (originOutside && destOutside)`
- Rename `isOutsideAllZones` → `isInAnyZone` (invert return value: `true` = point is inside at least one zone)
- Extract the helper to `lib/zones.ts` (new file) so both the route and test file import from one source — no duplication
- Update `tests/calculate-price.test.ts` to import from `lib/zones.ts` and rename the describe block accordingly

### Test coverage (write before touching production code)
- 4 unit tests on `isInAnyZone` helper covering the ZONES-06 4-case matrix:
  1. Both pickup and dropoff in zone → `isInAnyZone` returns `true` for both → no quoteMode
  2. Only pickup in zone → `isInAnyZone(pickup)` = `true` → no quoteMode (the bug case)
  3. Only dropoff in zone → `isInAnyZone(dropoff)` = `true` → no quoteMode (the bug case)
  4. Neither in any zone → both return `false` → quoteMode: true
- Test style: helper unit tests (no route mocking needed), consistent with existing calculate-price.test.ts pattern

### Schema migration delivery
- Create `supabase/migrations/018_v13_schema_foundation.sql` (committed to git)
- Applied manually by running SQL in Supabase Dashboard → SQL Editor
- No Supabase CLI setup required for v1.3

### bookings table changes
- Add `status TEXT NOT NULL DEFAULT 'pending'` — valid values: `'pending'`, `'confirmed'`, `'completed'`, `'cancelled'`
- Add `operator_notes TEXT` (nullable)
- Add `booking_source TEXT NOT NULL DEFAULT 'online'` — valid values: `'online'`, `'manual'`
- Make `payment_intent_id` nullable (it is NOT NULL currently; manual bookings in Phase 20 have no Stripe reference)
- **Backfill existing rows:** `UPDATE bookings SET status = 'confirmed', booking_source = 'online'` (existing paid bookings are effectively confirmed; wizard bookings are online)
- New wizard bookings: status defaults to `'pending'`, booking_source defaults to `'online'`

### promo_codes table
- Create empty table (no admin UI yet — that's Phase 22)
- Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `code TEXT NOT NULL UNIQUE`, `discount_type TEXT NOT NULL DEFAULT 'percentage'`, `discount_value NUMERIC(5,2) NOT NULL`, `expiry_date DATE`, `max_uses INTEGER`, `current_uses INTEGER NOT NULL DEFAULT 0`, `is_active BOOLEAN NOT NULL DEFAULT true`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- No rows inserted in Phase 18

### holiday_dates storage
- Add `holiday_dates JSONB NOT NULL DEFAULT '[]'` column to `pricing_globals` table
- Format: array of date strings `["2026-12-25", "2026-01-01"]`
- Phase 21 builds the admin UI to populate this; Phase 18 just adds the column
- `getPricingConfig()` in `lib/pricing-config.ts` does NOT need updating in Phase 18 (Phase 21 extends it)

### Claude's Discretion
- Column ordering within the migration file
- Whether to add a `CHECK` constraint on `bookings.status` for valid values
- Index strategy for `promo_codes.code` (UNIQUE already implies an index)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Zone logic
- `app/api/calculate-price/route.ts` — Current buggy implementation; the `isOutsideAllZones` function and the `if (originOutside || destOutside)` condition to fix
- `tests/calculate-price.test.ts` — Existing zone helper tests to replace/extend

### Schema baseline
- `lib/supabase.ts` — `buildBookingRow()` shows current bookings columns; `saveBooking()` uses `payment_intent_id` as upsert conflict key (must remain after making nullable)
- `lib/pricing-config.ts` — `getPricingConfig()` and `PricingGlobals` type; do NOT extend in Phase 18

### Requirements
- `.planning/REQUIREMENTS.md` — ZONES-06 (zone OR-logic), plus BOOKINGS-06/07/08/09 and PROMO-01–04 for schema context (those are built in later phases)

No external ADRs — all decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase.ts` `buildBookingRow()`: Insert function that will need `status` and `booking_source` added after Phase 18 schema is live (Phase 19/20 work)
- `tests/calculate-price.test.ts`: Existing Vitest test file with Prague zone fixture — reuse the polygon for the 4 new zone tests

### Established Patterns
- Vitest v4.1.1 in `tests/` directory — all new tests go here
- Supabase queries via `createSupabaseServiceClient()` — no ORM, raw `.from().select()` calls
- No Supabase CLI migrations — SQL files applied manually via Dashboard

### Integration Points
- `app/api/calculate-price/route.ts` imports the helper inline today; after Phase 18 it will import from `lib/zones.ts`
- `pricing_globals` table row `id = 1` is the single-row config store — `holiday_dates` column added here

</code_context>

<specifics>
## Specific Ideas

- STATE.md note: "write 4-case unit test before touching production" — tests must pass before the route is modified
- `payment_intent_id` is currently the upsert conflict key in `saveBooking()` — making it nullable is fine because the conflict key can be nullable in Postgres (NULL != NULL, so upsert on NULL won't de-duplicate; this is acceptable for Phase 18 and will be revisited when manual bookings land in Phase 20)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-schema-foundation-zone-logic-fix*
*Context gathered: 2026-04-03*
