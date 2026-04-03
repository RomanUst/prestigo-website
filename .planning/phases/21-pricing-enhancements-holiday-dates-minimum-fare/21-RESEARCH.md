# Phase 21: Pricing Enhancements — Holiday Dates + Minimum Fare — Research

**Researched:** 2026-04-03
**Domain:** Pricing logic extension, admin UI extension, date-matching, per-class fare floors
**Confidence:** HIGH

## Summary

Phase 21 adds two pricing enhancements to an already-functioning pricing system. Both features have DB columns already provisioned (Phase 18). The work is purely logic + UI: wire the `holiday_dates` JSONB column into `applyGlobals` in the calculate-price route, add `min_fare` columns to `pricing_config`, wire minimum fare enforcement after price calculation, and extend `PricingForm` and the admin API to let the operator manage both.

The existing pricing pipeline is well-understood: `calculatePrice` in `lib/pricing.ts` produces raw `base`, then `applyGlobals` in the route applies coefficients. Holiday detection and minimum fare enforcement both slot naturally into `applyGlobals` (or just after it). No new tables are needed for holidays — `pricing_globals.holiday_dates` (`JSONB NOT NULL DEFAULT '[]'`) is already live. Minimum fare needs a migration to add `min_fare` columns to `pricing_config`.

**Primary recommendation:** Keep all enforcement server-side in `applyGlobals`. Accept `pickupDate` from the request body to enable holiday detection. Apply minimum fare as a final `Math.max(adjusted, minFare)` step per vehicle class. Extend the admin pricing PUT payload to include both `holiday_dates` and `min_fare` per vehicle class.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRICING-07 | Operator can configure a list of holiday dates in the admin pricing editor; trips with pickup on a configured date automatically apply `holiday_coefficient` at price calculation time | `holiday_dates` JSONB column already exists on `pricing_globals`; `holidayCoefficient` already in `PricingGlobals` type and fetched by `getPricingConfig`; `applyGlobals` has deferred comment "isHoliday deferred"; date comparison is a simple ISO string includes/Set lookup |
| PRICING-08 | Operator can set a minimum fare per vehicle class in the admin pricing editor; calculated prices below this floor are raised to the minimum | `pricing_config` table has one row per vehicle class; needs `min_fare` column via SQL migration; `applyGlobals` can apply `Math.max(adjusted, minFare)` after coefficient step |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | already installed | Unit tests for pricing logic and API | Existing test framework — `tests/pricing.test.ts`, `tests/admin-pricing.test.ts` |
| Zod | already installed | Schema validation in API routes | Used in every admin route already |
| react-hook-form + zodResolver | already installed | Form state in `PricingForm` | Used in `PricingForm.tsx` today |
| Supabase JS client | already installed | DB reads/writes | All data access goes through `createSupabaseServiceClient()` |

No new dependencies needed for this phase.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | already in node_modules (transitive) | Date formatting/parsing if needed | Only if ISO string comparison proves insufficient; prefer plain string comparison first |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes touch:

```
prestigo/
├── lib/
│   └── pricing-config.ts        # Add holiday_dates + min_fare to types and fetch
├── app/api/
│   ├── calculate-price/route.ts # Wire isHoliday detection + minimum fare
│   └── admin/pricing/route.ts   # Extend GET/PUT schemas for holiday_dates + min_fare
├── components/admin/
│   └── PricingForm.tsx           # Holiday dates UI section + min_fare column in rates table
└── tests/
    ├── pricing.test.ts           # New: isHoliday helper + minimum fare logic tests
    └── admin-pricing.test.ts     # New: holiday_dates and min_fare in PUT payload
supabase/migrations/
└── 021_pricing_enhancements.sql  # ADD COLUMN min_fare to pricing_config
```

### Pattern 1: Holiday Date Detection via ISO String Set Lookup

**What:** Store holiday dates as `string[]` of ISO dates (`"YYYY-MM-DD"`). At calculation time, extract the date portion of `pickupDate` and check if it is in the set.

**When to use:** The `holiday_dates` column is already `JSONB NOT NULL DEFAULT '[]'` — store as JSON array of ISO date strings. No per-date metadata needed (STATE.md decision: "no per-date metadata needed for v1.3").

**Example:**
```typescript
// In applyGlobals or just before it in route.ts
function isHolidayDate(pickupDate: string | null, holidayDates: string[]): boolean {
  if (!pickupDate || holidayDates.length === 0) return false
  // pickupDate arrives as 'YYYY-MM-DD' — direct Set lookup
  const dateSet = new Set(holidayDates)
  return dateSet.has(pickupDate)
}
```

Key point: `pickupDate` already arrives in the `POST /api/calculate-price` body (it is destructured at line 65 of the route today). The route just never used it for holiday detection. No schema change on the API body is needed.

### Pattern 2: Minimum Fare as Math.max After Coefficient Application

**What:** After `applyGlobals` produces `adjustedBase`, apply `Math.max(adjustedBase, minFare[vehicleClass])`.

**When to use:** Always, per vehicle class. `minFare` defaults to `0` (no floor) if not set — this means existing behavior is preserved for classes where operator has not set a minimum.

**Example:**
```typescript
// Inside applyGlobals (or as a second pass in the route handler):
const afterFloor = Math.max(adjustedBase, minFare[vc] ?? 0)
return [vc, { ...breakdown, base: afterFloor, total: afterFloor }]
```

### Pattern 3: Extending `getPricingConfig` to Include New Fields

`getPricingConfig` in `lib/pricing-config.ts` fetches both `pricing_config` (per-class rates) and `pricing_globals` (singleton). Both type definitions need updating:

```typescript
// lib/pricing-config.ts additions:
export type PricingGlobals = {
  // ... existing fields ...
  holidayDates: string[]      // new — from JSONB column
}

// PricingRates additions:
export type PricingRates = {
  // ... existing fields ...
  minFare: Record<string, number>   // new — per vehicle class
}
```

The `SELECT` for `pricing_globals` must add `holiday_dates`.
The `SELECT` for `pricing_config` must add `min_fare` (after migration adds the column).

### Pattern 4: Holiday Dates Admin UI — Add/Remove List

**What:** The operator sees a list of ISO dates with "Add" (date input + button) and "Remove" (× button per entry). This is a controlled list managed with `useState` outside of react-hook-form (since it is a dynamic list, not a simple scalar field). On form submit, the holiday dates array is included in the PUT payload alongside the existing `globals` and `config` data.

**When to use:** This is the standard pattern for admin dynamic list UIs in this codebase — no fancy library needed; just `useState<string[]>`.

**Important:** The "changes are saved immediately" wording in success criteria means the whole form saves together (the existing SAVE PRICING button submits all data). It does NOT mean individual-date autosave. The add/remove operations are in-memory until the form is saved.

### Anti-Patterns to Avoid

- **Do not store holiday dates as individual DB rows** — the JSONB column on `pricing_globals` is the decided storage (STATE.md). No new table.
- **Do not apply holiday detection client-side** — the client has no trusted access to `holiday_dates`. Enforcement is server-side in the calculate-price route.
- **Do not skip the minimum fare floor for hourly/daily trips** — success criteria says "any trip whose calculated price falls below minimum fare". The floor applies to all trip types, not just transfers.
- **Do not trust client-provided `isHoliday` flag** — always derive from server-side `holiday_dates` set + request `pickupDate`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date format normalization | Custom parser | ISO string direct comparison (`Set.has(pickupDate)`) | `pickupDate` is already `YYYY-MM-DD` throughout the codebase; Set lookup is O(1) and correct |
| DB schema migration | Inline ALTER via Supabase JS | SQL migration file in `supabase/migrations/` | All prior migrations follow numbered SQL file convention |
| Form validation for holiday dates | Custom validation | Zod `z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))` | Matches existing zod schema pattern in the pricing PUT endpoint |

**Key insight:** Both new features are 1-2 field additions to well-understood existing systems. No new system architecture is needed.

---

## Common Pitfalls

### Pitfall 1: Supabase NUMERIC Returns as String

**What goes wrong:** `min_fare` column is `NUMERIC` — Supabase JS returns it as a string. Passing it to `Math.max` produces `NaN`.

**Why it happens:** Supabase serialises NUMERIC to avoid JS floating point precision loss. The existing `getPricingConfig` already documents this: `// CRITICAL: Supabase returns NUMERIC columns as strings — must cast with Number()`.

**How to avoid:** Wrap with `Number()` in `getPricingConfig` exactly as done for all other NUMERIC columns.

**Warning signs:** `Math.max(28, "25")` returns `28` (correct in JS due to implicit coercion), BUT `Math.max(28, undefined)` returns `NaN` — always default to `0` if column is NULL.

### Pitfall 2: JSONB Returns as Already-Parsed Object

**What goes wrong:** `holiday_dates` is JSONB — Supabase JS returns it already parsed as a JS array (not a JSON string). Calling `JSON.parse()` on it throws.

**Why it happens:** Supabase JS automatically deserialises JSONB columns. The existing `zones` handling uses the same pattern.

**How to avoid:** Treat `globals.holiday_dates` as `string[]` directly. No `JSON.parse` needed.

### Pitfall 3: Missing pickupDate in Some Trip Types

**What goes wrong:** `pickupDate` is `null` for some trip types or when client omits it. `Set.has(null)` returns `false` (correct) but type safety needs guarding.

**Why it happens:** `pickupDate` is optional in the booking wizard for some early state transitions.

**How to avoid:** `isHolidayDate(pickupDate, holidayDates)` returns `false` when `pickupDate` is null — this is correct behavior (no date = no holiday detection). Already shown in Pattern 1 above.

### Pitfall 4: migration021 Column Default Must Be Nullable or 0

**What goes wrong:** Adding `min_fare NUMERIC(10,2) NOT NULL DEFAULT 0` to `pricing_config` while existing rows exist. If DEFAULT is omitted, the migration fails because existing rows have no value.

**How to avoid:** Use `NOT NULL DEFAULT 0` — a zero minimum fare means "no floor" and is backward-compatible. All existing trips continue to be priced exactly as before.

### Pitfall 5: Holiday Coefficient Applied Multiplicatively, Not Additively

**What goes wrong:** Applying holiday coefficient as `base + holidayCoefficient` instead of `base * holidayCoefficient`.

**Why it happens:** Confusion between flat fees (airport fee is additive) and coefficients (night/holiday are multiplicative).

**How to avoid:** The night coefficient pattern already exists in `applyGlobals`: `Math.round(breakdown.base * coefficient)`. Holiday uses the same multiplicative pattern. The holiday coefficient and night coefficient should not stack (or if they do, that should be an explicit product, not sequential multiplication of the already-modified value).

---

## Code Examples

### Current applyGlobals (from route.ts, line 30-45)

```typescript
// Source: prestigo/app/api/calculate-price/route.ts (current state)
function applyGlobals(
  prices: Record<string, { base: number; extras: number; total: number; currency: string }>,
  globals: PricingGlobals,
  isAirport: boolean,
  isNight: boolean,
): Record<string, { base: number; extras: number; total: number; currency: string }> {
  const coefficient = isNight ? globals.nightCoefficient : 1.0
  // isHoliday deferred — no detection mechanism exists yet
  return Object.fromEntries(
    Object.entries(prices).map(([vc, breakdown]) => {
      let adjustedBase = Math.round(breakdown.base * coefficient)
      if (isAirport) adjustedBase += globals.airportFee
      return [vc, { ...breakdown, base: adjustedBase, total: adjustedBase }]
    })
  )
}
```

**After Phase 21**, `applyGlobals` signature gains `isHoliday: boolean` and `minFare: Record<string, number>`:

```typescript
// Target state for applyGlobals
function applyGlobals(
  prices: Record<string, { base: number; extras: number; total: number; currency: string }>,
  globals: PricingGlobals,
  isAirport: boolean,
  isNight: boolean,
  isHoliday: boolean,
  minFare: Record<string, number>,
): Record<string, { base: number; extras: number; total: number; currency: string }> {
  const coefficient = isNight ? globals.nightCoefficient : isHoliday ? globals.holidayCoefficient : 1.0
  return Object.fromEntries(
    Object.entries(prices).map(([vc, breakdown]) => {
      let adjustedBase = Math.round(breakdown.base * coefficient)
      if (isAirport) adjustedBase += globals.airportFee
      adjustedBase = Math.max(adjustedBase, minFare[vc] ?? 0)
      return [vc, { ...breakdown, base: adjustedBase, total: adjustedBase }]
    })
  )
}
```

Note: night and holiday are mutually exclusive (else-if). If both conditions are true simultaneously, night takes precedence. This decision should be explicit in the plan.

### SQL Migration Pattern (matching project conventions)

```sql
-- 021_pricing_enhancements.sql
-- Phase 21: add min_fare column to pricing_config
-- Apply: Supabase Dashboard > SQL Editor > paste and run
-- Date: 2026-04-03

ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS min_fare NUMERIC(10,2) NOT NULL DEFAULT 0;
```

No migration needed for `holiday_dates` — already added in `018_v13_schema_foundation.sql`.

### Admin API PUT Schema Extension

```typescript
// Extended pricingConfigSchema in admin/pricing/route.ts
const pricingConfigSchema = z.object({
  vehicle_class: z.string(),
  rate_per_km: z.number().positive(),
  hourly_rate: z.number().positive(),
  daily_rate: z.number().positive(),
  min_fare: z.number().min(0),   // new
})

// Extended globals schema
const globalsSchema = z.object({
  // ... existing fields ...
  holiday_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),   // new
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `isHoliday` detection deferred with comment | `isHolidayDate()` helper + Set lookup | Phase 21 | Holiday coefficient actually applied |
| No minimum fare enforcement | `Math.max(adjusted, minFare[vc])` in `applyGlobals` | Phase 21 | Short trips can no longer be priced below operator floor |

**Deprecated/outdated:**
- The comment `// isHoliday deferred — no detection mechanism exists yet` in `route.ts` line 37 is removed in this phase.

---

## Open Questions

1. **Night + Holiday coefficient stacking**
   - What we know: Night uses `nightCoefficient`, holiday uses `holidayCoefficient`, both are multipliers. Current code applies only one coefficient.
   - What's unclear: If a trip is both at night AND on a holiday, should they stack (`base * night * holiday`), or should the higher one win?
   - Recommendation: Use the higher coefficient (else-if, night takes precedence as it is already implemented that way). Document this as a business rule decision for the planner to confirm or override.

2. **Minimum fare applies to all trip types vs transfer-only**
   - What we know: Success criteria says "a short trip whose calculated distance price falls below minimum fare" which implies transfer trips. But the floor is per vehicle class, and hourly/daily trips can also be short.
   - What's unclear: Should minimum fare apply to hourly and daily trip types too?
   - Recommendation: Apply to all trip types for simplicity — the operator sets a minimum fare "per vehicle class" without trip type qualification. The planner should confirm.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/pricing.test.ts` |
| Full suite command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICING-07 | `isHolidayDate('2026-12-25', ['2026-12-25'])` returns true | unit | `npx vitest run tests/pricing.test.ts` | ❌ Wave 0 — new tests needed |
| PRICING-07 | `isHolidayDate('2026-12-26', ['2026-12-25'])` returns false | unit | `npx vitest run tests/pricing.test.ts` | ❌ Wave 0 |
| PRICING-07 | `isHolidayDate(null, ['2026-12-25'])` returns false | unit | `npx vitest run tests/pricing.test.ts` | ❌ Wave 0 |
| PRICING-07 | Holiday coefficient applied in applyGlobals when isHoliday=true | unit | `npx vitest run tests/pricing.test.ts` | ❌ Wave 0 |
| PRICING-07 | Admin PUT accepts and persists holiday_dates array | unit | `npx vitest run tests/admin-pricing.test.ts` | ❌ Wave 0 |
| PRICING-08 | Price raised to minFare when calculated price < minFare | unit | `npx vitest run tests/pricing.test.ts` | ❌ Wave 0 |
| PRICING-08 | Price unchanged when calculated price >= minFare | unit | `npx vitest run tests/pricing.test.ts` | ❌ Wave 0 |
| PRICING-08 | Admin PUT accepts and persists min_fare per vehicle class | unit | `npx vitest run tests/admin-pricing.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/pricing.test.ts tests/admin-pricing.test.ts`
- **Per wave merge:** `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] New `describe('PRICING-07: Holiday date detection', ...)` block in `tests/pricing.test.ts`
- [ ] New `describe('PRICING-08: Minimum fare enforcement', ...)` block in `tests/pricing.test.ts`
- [ ] Updated `validPutBody` fixture in `tests/admin-pricing.test.ts` to include `holiday_dates` and `min_fare`

*(Existing test files are present; new test cases must be added as new describe blocks within them.)*

---

## Sources

### Primary (HIGH confidence)

- Direct code read: `prestigo/lib/pricing.ts` — full `calculatePrice`, `buildPriceMap`, `applyGlobals` logic
- Direct code read: `prestigo/lib/pricing-config.ts` — `getPricingConfig`, `PricingGlobals` type, NUMERIC cast pattern
- Direct code read: `prestigo/app/api/calculate-price/route.ts` — `applyGlobals` call site, `pickupDate` already in request body
- Direct code read: `prestigo/app/api/admin/pricing/route.ts` — PUT schema, upsert patterns
- Direct code read: `prestigo/components/admin/PricingForm.tsx` — existing UI structure
- Direct code read: `supabase/migrations/018_v13_schema_foundation.sql` — confirms `holiday_dates JSONB NOT NULL DEFAULT '[]'` is already live
- Direct code read: `supabase/migrations/0002_create_pricing_config.sql` — confirms `pricing_config` table structure
- Direct code read: `.planning/STATE.md` — confirms "Holiday dates stored as JSONB key in `pricing_config`" decision (note: STATE.md says `pricing_config` but the actual column is on `pricing_globals` — the implementation matches `pricing_globals`)
- Direct code read: `.planning/REQUIREMENTS.md` — PRICING-07 and PRICING-08 exact wording

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` decision: "Holiday dates stored as JSONB key in `pricing_config` — no per-date metadata needed for v1.3" — confirms no table-per-date approach

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — all touch points identified by direct code inspection; no unknowns
- Pitfalls: HIGH — derived from existing code patterns and SQL column types confirmed by migration files
- SQL migration: HIGH — pattern established by `018_v13_schema_foundation.sql`

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain — pricing logic is well-isolated)
