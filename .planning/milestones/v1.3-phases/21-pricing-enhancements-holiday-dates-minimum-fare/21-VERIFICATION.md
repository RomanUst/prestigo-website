---
phase: 21-pricing-enhancements-holiday-dates-minimum-fare
verified: 2026-04-03T18:05:00Z
status: human_needed
score: 12/12 must-haves verified
human_verification:
  - test: "Holiday coefficient applied to trip on configured date"
    expected: "A booking with pickupDate set to a holiday date in the admin shows a price multiplied by holiday_coefficient (e.g. 1.5x)"
    why_human: "Cannot invoke the live calculate-price API without a running server + DB with seeded holiday dates"
  - test: "Minimum fare floor enforced for short trip"
    expected: "A very short transfer trip (e.g. 2 km) for a vehicle class with min_fare=50 shows EUR 50, not the calculated EUR 5.60"
    why_human: "Requires live API + DB with min_fare configured"
  - test: "Holiday dates persist and reload correctly"
    expected: "After saving holiday dates via the admin pricing form, reloading the page shows the same dates in the list"
    why_human: "Requires the SQL migration (021_pricing_enhancements.sql) to have been applied to the live DB"
  - test: "MIN FARE column values persist and reload"
    expected: "After setting min_fare=50 for Business and saving, reloading shows 50 in the MIN FARE cell (not '(no floor)')"
    why_human: "Requires the SQL migration to be applied"
---

# Phase 21: Pricing Enhancements — Holiday Dates + Minimum Fare Verification Report

**Phase Goal:** Holiday coefficient is automatically applied to trips on configured dates and no trip is priced below the per-vehicle-class minimum fare
**Verified:** 2026-04-03T18:05:00Z
**Status:** human_needed (all automated checks passed; 4 items require live DB/server)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

From ROADMAP.md success criteria:

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Operator can add and remove holiday dates in the admin pricing editor; changes are saved immediately | VERIFIED | `PricingForm.tsx` has `holidayDates` useState, `+ ADD DATE` button, X remove button, and `holiday_dates: holidayDates` merged in `onSubmit`. Admin PUT schema accepts `holiday_dates` array. |
| 2 | A trip with pickup on a configured holiday date has `holiday_coefficient` applied at price calculation time | VERIFIED (automated) | `isHolidayDate` exported and tested (4 cases). `applyGlobals` coefficient line: `isNight ? nightCoefficient : isHoliday ? holidayCoefficient : 1.0`. All 3 call sites pass `isHoliday`. Live behavior needs human test. |
| 3 | Operator can set a minimum fare for each vehicle class in the admin pricing editor | VERIFIED | MIN FARE column present in 5-column grid (gridTemplateColumns `'160px 1fr 1fr 1fr 1fr'`). `min_fare: z.number().min(0)` in both admin API and PricingForm Zod schemas. |
| 4 | A short trip whose calculated price falls below the minimum fare is displayed at the minimum fare | VERIFIED (automated) | `Math.max(adjustedBase, minFare[vc] ?? 0)` in `applyGlobals`. Unit test confirms: base=28, minFare={business:50} → result base=50. Live behavior needs human test. |

**Score:** 12/12 must-haves verified (automated) + 4 items requiring live environment

---

### Required Artifacts

| Artifact | Status | Evidence |
|----------|--------|---------|
| `supabase/migrations/021_pricing_enhancements.sql` | VERIFIED | File exists. Contains `ADD COLUMN IF NOT EXISTS min_fare NUMERIC(10,2) NOT NULL DEFAULT 0`. Note: manual application to live DB still required. |
| `prestigo/lib/pricing-config.ts` | VERIFIED | `holidayDates: string[]` in `PricingGlobals`. `minFare: Record<string, number>` in `PricingRates`. SELECT includes `holiday_dates` and `min_fare`. `Number(r.min_fare)` cast present. |
| `prestigo/app/api/calculate-price/route.ts` | VERIFIED | `export function isHolidayDate` at line 10. `export function applyGlobals` with `isHoliday` and `minFare` params. `isNight ? globals.nightCoefficient : isHoliday ? globals.holidayCoefficient : 1.0` at line 45. `Math.max(adjustedBase, minFare[vc] ?? 0)` at line 50. No `isHoliday deferred` comment. All 3 call sites updated (hourly line 102, daily line 113, transfer line 173). |
| `prestigo/app/api/admin/pricing/route.ts` | VERIFIED | `min_fare: z.number().min(0)` in `pricingConfigSchema`. `holiday_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))` in `pricingPutSchema`. `revalidateTag('pricing-config', 'max')` added post-upsert. |
| `prestigo/tests/pricing.test.ts` | VERIFIED | `describe('PRICING-07: Holiday date detection')` — 4 tests. `describe('PRICING-07: Holiday coefficient in applyGlobals')` — 3 tests. `describe('PRICING-08: Minimum fare enforcement')` — 3 tests. All 24 tests pass. |
| `prestigo/tests/admin-pricing.test.ts` | VERIFIED | `validPutBody` contains `min_fare: 0` per config entry and `holiday_dates: []` in globals. `describe('PRICING-07 + PRICING-08: Extended PUT payload')` — 3 tests. All 10 tests pass. |
| `prestigo/components/admin/PricingForm.tsx` | VERIFIED | `import { X } from 'lucide-react'`. `min_fare: z.number().min(0)` in schema. Grid `'160px 1fr 1fr 1fr 1fr'`. `MIN FARE` header. `EUR min` sub-label. `(no floor)` hint (reactive via `watch()`). `HOLIDAY DATES` heading. `Trips on these dates apply the holiday coefficient.` text. `No holiday dates configured.` empty state. `+ ADD DATE` button. `Remove ${date}` aria-label. `holiday_dates: holidayDates` in PUT body. `useState<string[]>` for holiday dates. |
| `prestigo/app/admin/(dashboard)/pricing/page.tsx` | VERIFIED | `holidayDates: data.globals?.holiday_dates ?? []` passed as `initialData.holidayDates` to `PricingForm`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `calculate-price/route.ts` | `pricing-config.ts` | `getPricingConfig()` returning `holidayDates` and `minFare` | WIRED | `rates = await getPricingConfig()` at line 91; `rates.globals.holidayDates` at line 97; `rates.minFare` passed to all 3 `applyGlobals` calls |
| `calculate-price/route.ts` | `isHolidayDate` helper | `isHolidayDate(pickupDate, rates.globals.holidayDates)` | WIRED | Line 97: `const isHoliday = isHolidayDate(pickupDate, rates.globals.holidayDates)` — computed once before trip-type branches |
| `admin/pricing/route.ts` | `pricing_globals.holiday_dates` | Zod schema + upsert | WIRED | Schema validates ISO date regex. `upsert({ id: 1, ...parsed.data.globals })` auto-includes `holiday_dates`. |
| `PricingForm.tsx` | `/api/admin/pricing` | PUT body includes `holiday_dates` and `min_fare` | WIRED | `body: JSON.stringify({ ...data, globals: { ...data.globals, holiday_dates: holidayDates } })` — config entries include `min_fare` via react-hook-form |
| `pricing/page.tsx` | `PricingForm.tsx` | `initialData.holidayDates` from GET response | WIRED | `holidayDates: data.globals?.holiday_dates ?? []` at line 50 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PRICING-07 | 21-01, 21-02 | Operator configures holiday dates; trips on those dates apply `holiday_coefficient` | SATISFIED | `isHolidayDate` function + `applyGlobals` holiday branch + admin UI add/remove + DB schema accepting `holiday_dates` JSONB array |
| PRICING-08 | 21-01, 21-02 | Operator sets minimum fare per vehicle class; prices below floor raised to minimum | SATISFIED | `Math.max(adjustedBase, minFare[vc] ?? 0)` in `applyGlobals` + `min_fare` DB column migration + MIN FARE column in admin UI |

Both requirements marked complete in REQUIREMENTS.md traceability table. No orphaned requirements for Phase 21.

---

### Anti-Patterns Found

No anti-patterns found in Phase 21 files. Checked:

- No `TODO/FIXME/HACK/PLACEHOLDER` comments in any modified file
- No empty return stubs (`return null`, `return {}`, `return []`)
- No handlers that only `console.log` or call `e.preventDefault()`
- No `isHoliday deferred` comment (explicitly removed per plan)
- The "(no floor)" hint uses reactive `watch()` — not a stale `initialData` read

---

### Test Suite Results

| Test file | Result | Relevance |
|-----------|--------|-----------|
| `tests/pricing.test.ts` | 24 passed / 24 | Phase 21 core — VERIFIED |
| `tests/admin-pricing.test.ts` | 10 passed / 10 | Phase 21 core — VERIFIED |
| `tests/submit-quote.test.ts` | 6 failed / 8 | Pre-existing failures, documented in `deferred-items.md`, unrelated to Phase 21 |
| `tests/BookingWidget.test.tsx` | 1 failed / 12 | Pre-existing failure (time input step mismatch), unrelated to Phase 21 |

Pre-existing failures are confirmed in `deferred-items.md` and were present before Phase 21 work began.

**Commit note:** The SUMMARY for Plan 01 documented commit hashes `77dfbb0` and `03b2fd7` but the actual repo shows `9f63a4f` as the feat commit covering both tasks. The code is correctly committed and matches the plan spec — the hash discrepancy is a documentation error in the SUMMARY only.

---

### Human Verification Required

These items cannot be verified programmatically because they require the SQL migration to be applied to the live Supabase DB and a running dev server.

#### 1. Holiday coefficient applied live

**Test:** Set holiday date to today's date in admin pricing editor. Submit a booking request via the wizard with today as pickup date.
**Expected:** The price displayed for each vehicle class is multiplied by `holiday_coefficient` (e.g. 1.5) compared to the same trip without the holiday date configured.
**Why human:** Requires live DB with `holiday_dates` populated + running Next.js server calling calculate-price.

#### 2. Minimum fare floor enforced live

**Test:** Set `min_fare = 50` for Business class in admin pricing editor. Request a very short transfer trip (~2 km).
**Expected:** Business class shows EUR 50 (not the calculated ~EUR 5.60).
**Why human:** Requires the `min_fare` column to exist in the live DB (migration applied) + running server.

#### 3. Holiday dates persist across page reload

**Test:** Add `2026-12-25` and `2026-12-31` in the HOLIDAY DATES card, click SAVE PRICING, reload the admin pricing page.
**Expected:** Both dates appear in the HOLIDAY DATES list after reload.
**Why human:** Requires migration applied so `holiday_dates` JSONB column exists in `pricing_globals`.

#### 4. MIN FARE values persist across page reload

**Test:** Set min fare = 50 for each vehicle class, click SAVE PRICING, reload the admin pricing page.
**Expected:** Each MIN FARE input shows 50 (not 0 / "(no floor)").
**Why human:** Requires `min_fare` column in `pricing_config` table (migration applied).

---

### Gaps Summary

No gaps. All Plan 01 and Plan 02 must-haves are VERIFIED at all three levels (exists, substantive, wired). The 4 human verification items are outstanding live-environment tests, not code gaps — the implementation is complete. Phase goal is achieved from a code standpoint.

The SQL migration (`021_pricing_enhancements.sql`) is ready to apply. Human verification can proceed once the migration is run against the live Supabase instance.

---

_Verified: 2026-04-03T18:05:00Z_
_Verifier: Claude (gsd-verifier)_
