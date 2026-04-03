---
phase: 18-schema-foundation-zone-logic-fix
verified: 2026-04-03T13:15:00Z
status: human_needed
score: 8/9 must-haves verified
re_verification: false
human_verification:
  - test: "Confirm Supabase live schema has all 5 schema changes applied"
    expected: "bookings table has status, operator_notes, booking_source columns and nullable payment_intent_id; promo_codes table exists; pricing_globals has holiday_dates column"
    why_human: "Migration was applied via Supabase MCP — cannot query the live DB from this verifier. No programmatic way to confirm remote schema state."
---

# Phase 18: Schema Foundation + Zone Logic Fix — Verification Report

**Phase Goal:** All v1.3 database prerequisites are in place and zone pricing returns a calculated price whenever pickup OR dropoff is within an active zone
**Verified:** 2026-04-03T13:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A booking where only the pickup is inside a coverage zone shows a calculated price (not quoteMode) | VERIFIED | `!originInZone && !destInZone` in route.ts line 121 — quoteMode fires only when BOTH are outside. If pickup is inside, `originInZone=true`, condition is false, flow continues to price calculation. |
| 2 | A booking where only the dropoff is inside a coverage zone shows a calculated price (not quoteMode) | VERIFIED | Same condition: if `destInZone=true`, `!destInZone` is false, AND short-circuits, quoteMode not triggered. |
| 3 | A booking where neither pickup nor dropoff is in any active zone falls back to quoteMode: true | VERIFIED | `!originInZone && !destInZone` evaluates true when both are outside — returns `{ quoteMode: true }`. |
| 4 | bookings table has status, operator_notes, and booking_source columns; payment_intent_id is nullable | HUMAN NEEDED | Migration file is correct and complete; SUMMARY says it was applied via Supabase MCP; live DB state cannot be confirmed programmatically from this environment. |
| 5 | promo_codes table exists (empty); pricing_globals has holiday_dates JSONB column | HUMAN NEEDED | Same as above — migration file verified correct, live application unverifiable here. |
| 6 | 4-case ZONES-06 test matrix passes (both-in, pickup-only via OR, dropoff-only via OR, neither-in) | VERIFIED | `vitest run tests/calculate-price.test.ts` exits 0 with 4 passed tests in `describe('isInAnyZone helper (ZONES-06)')`. |
| 7 | No duplicate zone helper logic in route.ts or test file | VERIFIED | `isOutsideAllZones` count = 0 in both files; turf imports absent from route.ts and test file; single source of truth is `lib/zones.ts`. |
| 8 | Existing backfill: all pre-existing bookings get status='confirmed', booking_source='online' | HUMAN NEEDED | `UPDATE bookings SET status = 'confirmed', booking_source = 'online'` is in migration; live application unverifiable. |

**Score:** 5/5 code truths verified; 3 truths require human confirmation of live DB state.
**Automated score:** 5/5 truths that can be verified programmatically — all VERIFIED.

---

### Required Artifacts

#### Plan 18-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prestigo/lib/zones.ts` | isInAnyZone helper — single source of truth for zone check | VERIFIED | 18 lines. Exports `isInAnyZone`. Uses `zones.some(...)` (not `!zones.some`). Correct GeoJSON `point([lng, lat])` longitude-first order. Empty array returns `false`. |
| `prestigo/tests/calculate-price.test.ts` | 4-case ZONES-06 test matrix plus updated legacy tests | VERIFIED | Imports `isInAnyZone` from `@/lib/zones`. Contains `describe('isInAnyZone helper (ZONES-06)')` with 4 active tests. No inline `isOutsideAllZones` function. No `import booleanPointInPolygon`. |
| `prestigo/app/api/calculate-price/route.ts` | Fixed zone check using OR-logic (quoteMode only when BOTH outside) | VERIFIED | Imports `isInAnyZone` from `@/lib/zones` (line 6). Uses `!originInZone && !destInZone` (line 121). No `isOutsideAllZones` function. No `originOutside \|\| destOutside`. Turf imports absent. |

#### Plan 18-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/018_v13_schema_foundation.sql` | v1.3 schema foundation migration — all DB prerequisites for Phases 19-22 | VERIFIED | 35 lines. Contains all 7 required SQL statements. Committed at `b180834`. Idempotent (IF NOT EXISTS guards). |

---

### Key Link Verification

#### Plan 18-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `prestigo/app/api/calculate-price/route.ts` | `prestigo/lib/zones.ts` | `import { isInAnyZone } from '@/lib/zones'` | WIRED | Line 6 of route.ts confirmed. Function called at lines 119-120. |
| `prestigo/tests/calculate-price.test.ts` | `prestigo/lib/zones.ts` | `import { isInAnyZone } from '@/lib/zones'` | WIRED | Line 2 of test file confirmed. Function called 4 times in test assertions. |
| `prestigo/app/api/calculate-price/route.ts` | zone check condition | `!originInZone && !destInZone` | WIRED | Pattern found at line 121 in route.ts. |

#### Plan 18-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `supabase/migrations/018_v13_schema_foundation.sql` | bookings table | `ALTER TABLE bookings ADD COLUMN` | WIRED | Two `ALTER TABLE bookings` statements confirmed in migration file (lines 7 and 10-15). |
| `supabase/migrations/018_v13_schema_foundation.sql` | pricing_globals table | `ALTER TABLE pricing_globals ADD COLUMN` | WIRED | `ALTER TABLE pricing_globals` confirmed at line 34 with `holiday_dates JSONB NOT NULL DEFAULT '[]'`. |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ZONES-06 | 18-01-PLAN.md, 18-02-PLAN.md | Trip shows a calculated price if pickup **or** dropoff is within an active zone; quoteMode: true only when neither point is in any active zone | SATISFIED | `!originInZone && !destInZone` in route.ts; 4 passing unit tests confirm all 4 cases; `isInAnyZone` is the single source of truth in `lib/zones.ts`. |

**Note on 18-02 requirements field:** Plan 18-02 lists `ZONES-06` in its `requirements` field, which is slightly imprecise — the schema migration contributes to the v1.3 foundation but does not directly satisfy the ZONES-06 zone logic requirement. ZONES-06 is fully satisfied by Plan 18-01 alone. No orphaned requirements exist — REQUIREMENTS.md only maps ZONES-06 to Phase 18, and it is satisfied.

**Note on ROADMAP success criterion 5 wording:** The ROADMAP says "`pricing_config` JSONB includes `holiday_dates` key." The actual schema uses a `pricing_globals` TABLE with a `holiday_dates` COLUMN (not a JSONB field inside `pricing_config`). The migration correctly targets `pricing_globals`, consistent with the existing schema in `0002_create_pricing_config.sql`. The ROADMAP wording is imprecise but the implementation is correct.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No anti-patterns found in any modified file. |

Scanned files:
- `prestigo/lib/zones.ts` — clean, no TODOs, no placeholders, no empty returns
- `prestigo/app/api/calculate-price/route.ts` — clean, no residual old-logic patterns
- `prestigo/tests/calculate-price.test.ts` — clean, 4 active tests + 10 explicitly skipped route tests (skips are intentional scaffolding, not stubs)
- `supabase/migrations/018_v13_schema_foundation.sql` — clean SQL, complete, idempotent

---

### Commit Verification

| Commit | Location | Description | Status |
|--------|----------|-------------|--------|
| `e13ab78` | prestigo submodule | feat(18-01): add isInAnyZone helper and 4-case ZONES-06 test coverage | FOUND |
| `1f69f4a` | prestigo submodule | fix(18-01): fix ZONES-06 OR-logic bug in calculate-price route | FOUND |
| `b180834` | outer repo | feat(18-02): create v1.3 schema foundation migration | FOUND |

Note: Commits `e13ab78` and `1f69f4a` exist in the `prestigo` git submodule (not the outer repo), which is why they appeared absent when querying the outer repo log. Verified via `git -C prestigo log`.

---

### Human Verification Required

#### 1. Confirm Supabase Live Schema — bookings Table

**Test:** In Supabase Dashboard, open the Table Editor and inspect the `bookings` table, or run:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('status', 'operator_notes', 'booking_source', 'payment_intent_id');
```
**Expected:** Four rows returned — `status` (text, NOT NULL, default 'pending'), `operator_notes` (text, nullable), `booking_source` (text, NOT NULL, default 'online'), `payment_intent_id` (text, nullable).
**Why human:** Cannot query the remote Supabase DB from this verifier.

#### 2. Confirm Supabase Live Schema — promo_codes Table

**Test:** In Supabase Dashboard, run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'promo_codes' ORDER BY ordinal_position;
```
**Expected:** 9 rows: id, code, discount_type, discount_value, expiry_date, max_uses, current_uses, is_active, created_at.
**Why human:** Cannot query the remote Supabase DB from this verifier.

#### 3. Confirm Supabase Live Schema — pricing_globals holiday_dates

**Test:** In Supabase Dashboard, run:
```sql
SELECT holiday_dates FROM pricing_globals LIMIT 1;
```
**Expected:** Returns a row with `holiday_dates = []` (empty JSON array).
**Why human:** Cannot query the remote Supabase DB from this verifier.

#### 4. Confirm Backfill Applied

**Test:** In Supabase Dashboard, run:
```sql
SELECT status, booking_source FROM bookings LIMIT 10;
```
**Expected:** All existing rows show `status = 'confirmed'` and `booking_source = 'online'`.
**Why human:** Cannot query live data from this verifier.

---

### Gaps Summary

No code gaps found. All automated checks pass:

- `lib/zones.ts` exists, is substantive (18 lines, correct logic), and is imported and used in both `route.ts` and `tests/calculate-price.test.ts`.
- The ZONES-06 bug fix (`!originInZone && !destInZone`) is correctly in place.
- The 4-case unit test matrix passes (`vitest run` exits 0, 4 passed).
- The migration file exists, is committed, and contains all required SQL statements.
- No old patterns (`isOutsideAllZones`, `originOutside || destOutside`, stale turf imports) remain in any file.

The only unresolved items are 4 human verifications of live Supabase schema state — the migration was reported as applied via Supabase MCP, but cannot be confirmed from this environment.

---

_Verified: 2026-04-03T13:15:00Z_
_Verifier: Claude (gsd-verifier)_
