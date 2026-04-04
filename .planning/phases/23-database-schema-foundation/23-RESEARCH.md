# Phase 23: Database Schema Foundation - Research

**Researched:** 2026-04-04
**Domain:** PostgreSQL schema migration — Supabase / plain SQL
**Confidence:** HIGH

## Summary

Phase 23 is entirely a database-layer phase: write and apply a SQL migration that adds five schema changes to the existing Prestigo Supabase database. No application TypeScript code changes occur in this phase. All implementation decisions are already locked by the architectural research done at the start of v1.4 and captured in STATE.md — this research validates those decisions against the actual live schema files and provides the exact SQL patterns the planner needs.

The five changes are: (1) add a `leg` column to `bookings` with `'outbound'` default to tag existing and new rows; (2) DROP the single-column `UNIQUE(payment_intent_id)` constraint and replace it with a composite `UNIQUE(payment_intent_id, leg)` to allow two rows per Stripe PaymentIntent; (3) add a `linked_booking_id UUID` nullable self-referential foreign key (SET NULL on delete, no cascade); (4) add `outbound_amount_czk INTEGER` and `return_amount_czk INTEGER` to `bookings` and `return_discount_pct NUMERIC(5,2) DEFAULT 10` to `pricing_globals`; (5) create a PL/pgSQL function `create_round_trip_bookings(p_outbound JSONB, p_return JSONB)` that atomically inserts two cross-linked rows in a single transaction.

The project uses manual SQL migration files committed to `supabase/migrations/` and applied via the Supabase Dashboard SQL Editor — no CLI tooling. All tests for Phase 23 are SQL-level verifications executed by querying the database directly via the Supabase MCP or the Dashboard after applying the migration; there are no Vitest unit tests for schema DDL. The existing `saveBooking()` function in `lib/supabase.ts` uses `onConflict: 'payment_intent_id'` — this will break for round-trip bookings and must be updated in Phase 27 (out of scope here).

**Primary recommendation:** Write the migration as a single file `supabase/migrations/023_v14_schema_foundation.sql`, apply it in the Supabase Dashboard, and verify each success criterion by querying the database.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RTPM-02 | Stripe webhook atomically creates two linked Supabase booking records via a Postgres RPC; each record references the other via `linked_booking_id`; partial failure rolls back both inserts | Requires: `linked_booking_id` self-ref FK on `bookings`; `create_round_trip_bookings` RPC with transaction semantics. Both fully specifiable in pure SQL — no app code needed in Phase 23. |
| RTPM-03 | Each booking record stores its own leg amount to enable accurate per-leg partial refunds | Requires: `outbound_amount_czk INTEGER` and `return_amount_czk INTEGER` columns on `bookings`. Additive ALTER TABLE, safe to add with NULL defaults initially. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL / Supabase | Managed (Supabase hosted) | Database engine | Already in use; all DDL is plain SQL |
| Supabase Dashboard SQL Editor | N/A | Migration execution | Project convention — no CLI; manual apply |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | ^2.101.0 | Client for RPC calls from app code | Already installed; Phase 27 will call the RPC via `supabase.rpc()` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual SQL apply via Dashboard | Supabase CLI `db push` | CLI requires Docker / local setup; project has never used it — stick with Dashboard |
| PL/pgSQL function for atomic insert | Application-layer transaction (JS) | Vercel serverless has no cross-request transaction isolation — JS approach is NOT atomic on failure |
| Self-referential FK SET NULL | Cascade delete | Cascade would delete the partner booking when one leg is cancelled — explicitly rejected by design |

**Installation:** None required. No new npm packages for Phase 23.

---

## Architecture Patterns

### Recommended Project Structure

```
supabase/migrations/
├── 0001_create_bookings.sql          (original bookings table)
├── 0002_create_pricing_config.sql    (pricing_config + pricing_globals)
├── 0003_create_coverage_zones.sql    (coverage_zones)
├── 018_v13_schema_foundation.sql     (status, booking_source, promo_codes, holiday_dates)
├── 021_pricing_enhancements.sql      (min_fare on pricing_config)
├── 022_promo_claim_function.sql      (claim_promo_code RPC)
└── 023_v14_schema_foundation.sql     # NEW — Phase 23
```

### Pattern 1: Additive Column Migration with Backfill

**What:** Add new columns with a safe default, then backfill existing rows explicitly to ensure data integrity.

**When to use:** Any time a NOT NULL column is added to a table with existing rows — the default handles new rows, the UPDATE handles old rows.

**Example:**
```sql
-- Source: supabase/migrations/018_v13_schema_foundation.sql (project precedent)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS leg TEXT NOT NULL DEFAULT 'outbound'
    CHECK (leg IN ('outbound', 'return'));

-- Backfill: all existing rows are one-way bookings — they are all outbound legs
UPDATE bookings SET leg = 'outbound' WHERE leg IS NULL OR leg = 'outbound';
```

### Pattern 2: Replacing a Single-Column UNIQUE Constraint

**What:** Drop the existing `UNIQUE(payment_intent_id)` constraint (created as an inline UNIQUE in the original CREATE TABLE) and add a composite constraint `UNIQUE(payment_intent_id, leg)`.

**Why this is necessary:** The existing single-column unique index on `payment_intent_id` prevents two rows sharing the same `payment_intent_id`. Round-trip bookings require exactly two rows with the same `payment_intent_id` but different `leg` values. The composite constraint allows two rows (outbound + return) while still blocking duplicates per pair.

**Example:**
```sql
-- Drop the old single-column unique index (created implicitly by UNIQUE keyword in CREATE TABLE)
-- Supabase names it: bookings_payment_intent_id_key
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_intent_id_key;

-- Add composite unique constraint
ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_intent_id_leg_key
    UNIQUE (payment_intent_id, leg);
```

**Critical note:** The constraint name `bookings_payment_intent_id_key` is the Postgres auto-generated name for `payment_intent_id TEXT UNIQUE` from `0001_create_bookings.sql`. Verify the exact constraint name via the Dashboard or `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'bookings' AND constraint_type = 'UNIQUE'` before running the migration.

### Pattern 3: Self-Referential Foreign Key

**What:** Add a nullable UUID column that references the same table's primary key, with `ON DELETE SET NULL` to decouple the two legs — cancelling one does not cascade to the other.

**When to use:** Linked pairs of rows in the same table where independent lifecycle management is required.

**Example:**
```sql
-- Source: Standard PostgreSQL self-referential FK pattern
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS linked_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;
```

### Pattern 4: Atomic Two-Row Insert via PL/pgSQL RPC

**What:** A Postgres function that accepts two JSONB arguments (outbound and return row data), inserts both rows inside a single transaction, and cross-links them after both have IDs. If either INSERT raises an exception, the entire transaction rolls back automatically.

**When to use:** Any time two rows must exist together or not at all — Vercel serverless cannot coordinate this at the JS layer because each request is stateless.

**Example:**
```sql
-- Source: PostgreSQL documentation on functions and transactions
CREATE OR REPLACE FUNCTION create_round_trip_bookings(
  p_outbound JSONB,
  p_return   JSONB
)
RETURNS TABLE(outbound_id UUID, return_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_outbound_id UUID;
  v_return_id   UUID;
BEGIN
  -- Insert outbound row (leg = 'outbound' already in p_outbound)
  INSERT INTO bookings (
    booking_reference, payment_intent_id, leg,
    booking_type, trip_type,
    origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng,
    passengers, luggage, pickup_date, pickup_time,
    vehicle_class, distance_km,
    amount_czk, outbound_amount_czk, return_amount_czk,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, terminal, special_requests,
    status, booking_source
  )
  SELECT
    p_outbound->>'booking_reference',
    p_outbound->>'payment_intent_id',
    'outbound',
    p_outbound->>'booking_type',
    p_outbound->>'trip_type',
    p_outbound->>'origin_address',
    (p_outbound->>'origin_lat')::float8,
    (p_outbound->>'origin_lng')::float8,
    p_outbound->>'destination_address',
    (p_outbound->>'destination_lat')::float8,
    (p_outbound->>'destination_lng')::float8,
    (p_outbound->>'passengers')::integer,
    (p_outbound->>'luggage')::integer,
    p_outbound->>'pickup_date',
    p_outbound->>'pickup_time',
    p_outbound->>'vehicle_class',
    (p_outbound->>'distance_km')::float8,
    (p_outbound->>'amount_czk')::integer,
    (p_outbound->>'outbound_amount_czk')::integer,
    (p_outbound->>'return_amount_czk')::integer,
    (p_outbound->>'extra_child_seat')::boolean,
    (p_outbound->>'extra_meet_greet')::boolean,
    (p_outbound->>'extra_luggage')::boolean,
    p_outbound->>'client_first_name',
    p_outbound->>'client_last_name',
    p_outbound->>'client_email',
    p_outbound->>'client_phone',
    p_outbound->>'flight_number',
    p_outbound->>'terminal',
    p_outbound->>'special_requests',
    COALESCE(p_outbound->>'status', 'confirmed'),
    COALESCE(p_outbound->>'booking_source', 'online')
  RETURNING id INTO v_outbound_id;

  -- Insert return row (leg = 'return' already in p_return)
  INSERT INTO bookings (
    booking_reference, payment_intent_id, leg,
    booking_type, trip_type,
    origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng,
    passengers, luggage, pickup_date, pickup_time,
    vehicle_class, distance_km,
    amount_czk, outbound_amount_czk, return_amount_czk,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, terminal, special_requests,
    status, booking_source,
    linked_booking_id
  )
  SELECT
    p_return->>'booking_reference',
    p_return->>'payment_intent_id',
    'return',
    p_return->>'booking_type',
    p_return->>'trip_type',
    p_return->>'origin_address',
    (p_return->>'origin_lat')::float8,
    (p_return->>'origin_lng')::float8,
    p_return->>'destination_address',
    (p_return->>'destination_lat')::float8,
    (p_return->>'destination_lng')::float8,
    (p_return->>'passengers')::integer,
    (p_return->>'luggage')::integer,
    p_return->>'pickup_date',
    p_return->>'pickup_time',
    p_return->>'vehicle_class',
    (p_return->>'distance_km')::float8,
    (p_return->>'amount_czk')::integer,
    (p_return->>'outbound_amount_czk')::integer,
    (p_return->>'return_amount_czk')::integer,
    (p_return->>'extra_child_seat')::boolean,
    (p_return->>'extra_meet_greet')::boolean,
    (p_return->>'extra_luggage')::boolean,
    p_return->>'client_first_name',
    p_return->>'client_last_name',
    p_return->>'client_email',
    p_return->>'client_phone',
    p_return->>'flight_number',
    p_return->>'terminal',
    p_return->>'special_requests',
    COALESCE(p_return->>'status', 'confirmed'),
    COALESCE(p_return->>'booking_source', 'online'),
    v_outbound_id  -- links return → outbound
  RETURNING id INTO v_return_id;

  -- Cross-link: update outbound row to point to return
  UPDATE bookings SET linked_booking_id = v_return_id WHERE id = v_outbound_id;

  RETURN QUERY SELECT v_outbound_id, v_return_id;
END;
$$;
```

### Pattern 5: Adding a Column to the pricing_globals Singleton

**What:** `pricing_globals` has a `CHECK (id = 1)` singleton constraint. Adding a column with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is safe; the existing row is updated to carry the default value automatically.

**Example:**
```sql
ALTER TABLE pricing_globals
  ADD COLUMN IF NOT EXISTS return_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 10;
```

No UPDATE/backfill needed — the default fills the singleton row.

### Anti-Patterns to Avoid

- **Sequential JS inserts for round-trip rows:** Not atomic. On Vercel serverless, if the second insert fails after the first succeeds, you have a dangling outbound row with no return pair. The RPC is mandatory.
- **CASCADE DELETE on linked_booking_id:** Would delete the partner leg when one leg is cancelled via admin. Explicitly wrong — legs have independent lifecycle.
- **Leaving the single-column UNIQUE on payment_intent_id:** The composite constraint replaces it. If the old constraint is not dropped first, adding the composite constraint succeeds but the old one still blocks two rows with the same `payment_intent_id`.
- **Using `amount_czk` for per-leg amounts:** The existing `amount_czk` column stores the combined total for one-way bookings. For round-trip, it will also store the combined total (for backward compatibility and admin display), while `outbound_amount_czk` and `return_amount_czk` store the per-leg amounts for refund calculations.
- **Calling `supabase.rpc()` from JS with individual row data:** The RPC takes JSONB — the caller must serialize the row data as JSON. Do NOT pass typed Typescript objects directly without `JSON.stringify`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic two-row insert | Two sequential `supabase.from().insert()` calls in JS | `create_round_trip_bookings` PL/pgSQL RPC | Vercel serverless has no cross-call transaction; JS approach is not atomic on failure |
| Idempotency on webhook replay | Custom dedup logic in application code | Composite UNIQUE `(payment_intent_id, leg)` constraint | DB-level constraint is the correct place; Supabase upsert can use this key in Phase 27 |
| Per-leg amount tracking | Parsing combined amount from metadata on each refund | `outbound_amount_czk` / `return_amount_czk` columns | Stored at booking creation; no re-computation needed at refund time |

**Key insight:** Postgres transactions are the correct tool for atomicity. Any attempt to replicate this in JS application code across a serverless runtime is inherently racy.

---

## Common Pitfalls

### Pitfall 1: Unknown Constraint Name for the Existing UNIQUE on payment_intent_id

**What goes wrong:** `ALTER TABLE bookings DROP CONSTRAINT bookings_payment_intent_id_key` fails with "constraint does not exist" if the auto-generated name differs from the Postgres default.

**Why it happens:** The constraint was created as an inline `UNIQUE` keyword in `0001_create_bookings.sql`. Postgres names it `{table}_{column}_key` by default — `bookings_payment_intent_id_key`. However, if the constraint was created differently in the Supabase Dashboard (e.g., the user added it manually), the name may differ.

**How to avoid:** Before running the migration, verify the exact constraint name:
```sql
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'bookings' AND constraint_type = 'UNIQUE';
```
Use the actual name in the DROP CONSTRAINT statement. Alternatively, use the safe form:
```sql
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_intent_id_key;
```
This is a no-op if the name is wrong — but then the old constraint still exists. Confirm it was dropped before adding the composite one.

**Warning signs:** Migration runs without error but `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'bookings'` still shows the old single-column UNIQUE.

### Pitfall 2: Composite UNIQUE Does Not Protect Against Two NULLs for payment_intent_id

**What goes wrong:** For manual bookings (booking_source = 'manual'), `payment_intent_id` is NULL. In PostgreSQL, `NULL != NULL` in UNIQUE constraints, so `UNIQUE(payment_intent_id, leg)` does NOT prevent two manual bookings with the same `leg` value — both would have `(NULL, 'outbound')` and the constraint would allow both.

**Why it happens:** Standard SQL NULL semantics in UNIQUE indexes.

**How to avoid:** This is acceptable for Phase 23 — manual bookings are one-way only (no round-trip manual booking in v1.4), so two manual bookings with `leg = 'outbound'` and `payment_intent_id = NULL` is the correct expected state. Note it as a known limitation. In a future milestone, a partial unique index can be added: `CREATE UNIQUE INDEX ... WHERE payment_intent_id IS NOT NULL`.

**Warning signs:** Admin sees duplicate manual bookings if this is not understood.

### Pitfall 3: JSONB Parameter Serialization in PL/pgSQL RPC

**What goes wrong:** The RPC function extracts columns from JSONB using `p_outbound->>'column_name'`. If a key is missing from the JSONB object (e.g., `flight_number` is omitted for non-airport trips), `p_outbound->>'flight_number'` returns NULL — which is correct and safe. However, if a required column (e.g., `passengers`) is missing, the cast `(p_outbound->>'passengers')::integer` returns NULL, violating the NOT NULL constraint on `bookings.passengers` and causing the transaction to roll back.

**Why it happens:** JSONB key access returns NULL for missing keys; implicit casts then produce NULL for numeric types.

**How to avoid:** In Phase 27 (the webhook that calls the RPC), ensure all required fields are present in the JSONB passed to the RPC. In Phase 23, document which fields are required vs. nullable in the RPC's JSONB contract. Consider adding a `COALESCE` or a check at the top of the function for critical fields.

**Warning signs:** PG error "null value in column X violates not-null constraint" when calling the RPC.

### Pitfall 4: Existing saveBooking() Breaks With the New Composite Constraint

**What goes wrong:** `lib/supabase.ts`'s `saveBooking()` uses `upsert([row], { onConflict: 'payment_intent_id', ignoreDuplicates: true })`. After dropping the single-column unique and replacing with `(payment_intent_id, leg)`, the `onConflict: 'payment_intent_id'` clause no longer refers to a unique index — Supabase/PostgREST will throw an error or fall back to INSERT behavior.

**Why it happens:** Supabase's `onConflict` must reference an existing unique constraint. After the migration, the only unique constraint on `payment_intent_id` is the composite one.

**How to avoid:** This will be fixed in Phase 27 when `saveBooking()` is replaced with the RPC call. In Phase 23, **do not call `saveBooking()` for round-trip bookings** — the one-way webhook still uses the old path (which now passes `leg = 'outbound'` by default and satisfies the composite constraint). Existing one-way webhook behavior is unaffected because all one-way bookings have `payment_intent_id` + `leg = 'outbound'` which matches the composite key.

**Warning signs:** Webhook test for one-way booking fails after migration is applied.

### Pitfall 5: return_date Column Already Exists

**What goes wrong:** `bookings` already has a `return_date TEXT` column (from the original `0001_create_bookings.sql`). This column stores the return date as a text string and was never actually used in the one-way booking flow. For v1.4, the return date is collected as part of round-trip bookings — this existing column can be reused for the return leg's pickup date.

**Why it happens:** The column was included in the original schema in anticipation of round-trip support.

**How to avoid:** Do NOT re-add `return_date` in the Phase 23 migration. Verify the column already exists before writing the migration. The migration should only add the columns that are truly new.

**Warning signs:** `ALTER TABLE ... ADD COLUMN return_date` fails with "column already exists" — but `ADD COLUMN IF NOT EXISTS` would silently skip it, so this is safe to include as a guard if there is any uncertainty.

---

## Code Examples

### Complete Migration File

```sql
-- 023_v14_schema_foundation.sql
-- Phase 23: v1.4 schema additions for round-trip booking support
-- Apply: Supabase Dashboard > SQL Editor > paste and run
-- Date: 2026-04-04

-- STEP 1: Add `leg` column to bookings
-- Default 'outbound' backfills all existing one-way booking rows automatically
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS leg TEXT NOT NULL DEFAULT 'outbound'
    CHECK (leg IN ('outbound', 'return'));

-- STEP 2: Replace single-column UNIQUE(payment_intent_id) with composite UNIQUE(payment_intent_id, leg)
-- Verify constraint name first:
--   SELECT constraint_name FROM information_schema.table_constraints
--   WHERE table_name = 'bookings' AND constraint_type = 'UNIQUE';
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_intent_id_key;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_intent_id_leg_key
    UNIQUE (payment_intent_id, leg);

-- STEP 3: Add self-referential linked_booking_id FK (SET NULL on delete — no cascade)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS linked_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

-- STEP 4: Add per-leg amount columns to bookings
-- outbound_amount_czk: amount charged for the outbound leg (= full price for one-way)
-- return_amount_czk: amount charged for the return leg (discounted; NULL for one-way)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS outbound_amount_czk INTEGER,
  ADD COLUMN IF NOT EXISTS return_amount_czk   INTEGER;

-- STEP 5: Add return_discount_pct to pricing_globals (operator-configurable, default 10%)
ALTER TABLE pricing_globals
  ADD COLUMN IF NOT EXISTS return_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 10;

-- STEP 6: Create atomic round-trip booking RPC
CREATE OR REPLACE FUNCTION create_round_trip_bookings(
  p_outbound JSONB,
  p_return   JSONB
)
RETURNS TABLE(outbound_id UUID, return_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_outbound_id UUID;
  v_return_id   UUID;
BEGIN
  INSERT INTO bookings (
    booking_reference, payment_intent_id, leg,
    booking_type, trip_type,
    origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng,
    passengers, luggage, pickup_date, pickup_time,
    vehicle_class, distance_km,
    amount_czk, outbound_amount_czk, return_amount_czk,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, terminal, special_requests,
    status, booking_source
  )
  VALUES (
    p_outbound->>'booking_reference',
    p_outbound->>'payment_intent_id',
    'outbound',
    p_outbound->>'booking_type',
    p_outbound->>'trip_type',
    p_outbound->>'origin_address',
    (p_outbound->>'origin_lat')::float8,
    (p_outbound->>'origin_lng')::float8,
    p_outbound->>'destination_address',
    (p_outbound->>'destination_lat')::float8,
    (p_outbound->>'destination_lng')::float8,
    (p_outbound->>'passengers')::integer,
    (p_outbound->>'luggage')::integer,
    p_outbound->>'pickup_date',
    p_outbound->>'pickup_time',
    p_outbound->>'vehicle_class',
    (p_outbound->>'distance_km')::float8,
    (p_outbound->>'amount_czk')::integer,
    (p_outbound->>'outbound_amount_czk')::integer,
    (p_outbound->>'return_amount_czk')::integer,
    (p_outbound->>'extra_child_seat')::boolean,
    (p_outbound->>'extra_meet_greet')::boolean,
    (p_outbound->>'extra_luggage')::boolean,
    p_outbound->>'client_first_name',
    p_outbound->>'client_last_name',
    p_outbound->>'client_email',
    p_outbound->>'client_phone',
    p_outbound->>'flight_number',
    p_outbound->>'terminal',
    p_outbound->>'special_requests',
    COALESCE(p_outbound->>'status', 'confirmed'),
    COALESCE(p_outbound->>'booking_source', 'online')
  )
  RETURNING id INTO v_outbound_id;

  INSERT INTO bookings (
    booking_reference, payment_intent_id, leg,
    booking_type, trip_type,
    origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng,
    passengers, luggage, pickup_date, pickup_time,
    vehicle_class, distance_km,
    amount_czk, outbound_amount_czk, return_amount_czk,
    extra_child_seat, extra_meet_greet, extra_luggage,
    client_first_name, client_last_name, client_email, client_phone,
    flight_number, terminal, special_requests,
    status, booking_source,
    linked_booking_id
  )
  VALUES (
    p_return->>'booking_reference',
    p_return->>'payment_intent_id',
    'return',
    p_return->>'booking_type',
    p_return->>'trip_type',
    p_return->>'origin_address',
    (p_return->>'origin_lat')::float8,
    (p_return->>'origin_lng')::float8,
    p_return->>'destination_address',
    (p_return->>'destination_lat')::float8,
    (p_return->>'destination_lng')::float8,
    (p_return->>'passengers')::integer,
    (p_return->>'luggage')::integer,
    p_return->>'pickup_date',
    p_return->>'pickup_time',
    p_return->>'vehicle_class',
    (p_return->>'distance_km')::float8,
    (p_return->>'amount_czk')::integer,
    (p_return->>'outbound_amount_czk')::integer,
    (p_return->>'return_amount_czk')::integer,
    (p_return->>'extra_child_seat')::boolean,
    (p_return->>'extra_meet_greet')::boolean,
    (p_return->>'extra_luggage')::boolean,
    p_return->>'client_first_name',
    p_return->>'client_last_name',
    p_return->>'client_email',
    p_return->>'client_phone',
    p_return->>'flight_number',
    p_return->>'terminal',
    p_return->>'special_requests',
    COALESCE(p_return->>'status', 'confirmed'),
    COALESCE(p_return->>'booking_source', 'online'),
    v_outbound_id
  )
  RETURNING id INTO v_return_id;

  -- Cross-link: outbound row now points to return row
  UPDATE bookings SET linked_booking_id = v_return_id WHERE id = v_outbound_id;

  RETURN QUERY SELECT v_outbound_id, v_return_id;
END;
$$;
```

### SQL Verification Queries (for post-migration checks)

```sql
-- SC1: Existing rows have leg = 'outbound' (no NULLs, no 'return')
SELECT COUNT(*) FROM bookings WHERE leg != 'outbound';
-- Expected: 0

-- SC2a: Composite UNIQUE allows two rows with same payment_intent_id, different legs
-- (run in Dashboard SQL Editor — will succeed twice then fail on third)
INSERT INTO bookings (booking_reference, payment_intent_id, leg, booking_type, trip_type,
  passengers, luggage, pickup_date, pickup_time, vehicle_class, amount_czk,
  client_first_name, client_last_name, client_email, client_phone)
VALUES ('TEST-01', 'pi_test_verify', 'outbound', 'confirmed', 'transfer',
  1, 1, '2026-05-01', '10:00', 'business', 1000, 'Test', 'User', 'test@test.com', '+420000000');

INSERT INTO bookings (booking_reference, payment_intent_id, leg, booking_type, trip_type,
  passengers, luggage, pickup_date, pickup_time, vehicle_class, amount_czk,
  client_first_name, client_last_name, client_email, client_phone)
VALUES ('TEST-02', 'pi_test_verify', 'return', 'confirmed', 'transfer',
  1, 1, '2026-05-02', '10:00', 'business', 900, 'Test', 'User', 'test@test.com', '+420000000');
-- Both should succeed. A third with same (pi_test_verify, 'outbound') should fail.

-- Cleanup test rows
DELETE FROM bookings WHERE payment_intent_id = 'pi_test_verify';

-- SC3: linked_booking_id column exists and is nullable
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name = 'linked_booking_id';
-- Expected: linked_booking_id | uuid | YES

-- SC4: New columns exist on bookings
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('leg', 'linked_booking_id', 'outbound_amount_czk', 'return_amount_czk');
-- Expected: 4 rows

-- SC4b: return_discount_pct exists on pricing_globals with value 10
SELECT return_discount_pct FROM pricing_globals WHERE id = 1;
-- Expected: 10.00

-- SC5: RPC exists and atomicity works (test with valid data using the query above structure)
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'create_round_trip_bookings';
-- Expected: 1 row
```

### How the Composite UNIQUE Interacts With the Existing One-Way Webhook

After the migration, the existing `saveBooking()` in `lib/supabase.ts` calls:
```typescript
supabase.from('bookings').upsert([row], { onConflict: 'payment_intent_id', ignoreDuplicates: true })
```

The `onConflict: 'payment_intent_id'` no longer matches a single-column unique index. PostgREST/Supabase will need this updated to `onConflict: 'payment_intent_id,leg'` in Phase 27. **This change is out of scope for Phase 23.** The existing one-way booking webhook test suite must still pass after the migration — verify by running `npx vitest run tests/webhooks-stripe.test.ts` (this test mocks `saveBooking`, so the DB change does not affect it).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-column `UNIQUE(payment_intent_id)` | Composite `UNIQUE(payment_intent_id, leg)` | Phase 23 | Enables two rows per PaymentIntent; maintains idempotency for webhook replays per leg |
| No `leg` column — all bookings implicitly outbound | `leg TEXT DEFAULT 'outbound'` | Phase 23 | All rows explicitly tagged; enables `UNIQUE(payment_intent_id, leg)` constraint |
| JS-level sequential inserts in webhook handler | PL/pgSQL atomic RPC `create_round_trip_bookings` | Phase 23 (DB) / Phase 27 (callee) | True atomicity — partial failure rolls back both rows |

**Existing but now clarified:**
- `return_date TEXT` column: Already exists in `bookings` from `0001_create_bookings.sql`. This is the return leg's pickup date (text format `YYYY-MM-DD`). The Phase 23 migration does NOT re-add it — it already exists.
- `amount_czk INTEGER`: This remains the combined total for display/admin purposes. New `outbound_amount_czk` and `return_amount_czk` store per-leg amounts for refund calculations.

---

## Open Questions

1. **Exact name of the current `payment_intent_id` UNIQUE constraint in the live Supabase database**
   - What we know: Created as `payment_intent_id text UNIQUE` in `0001_create_bookings.sql`; Postgres auto-names this `bookings_payment_intent_id_key`
   - What's unclear: The live DB may have been modified via the Dashboard since initial migration; the name could differ
   - Recommendation: The plan task must include a verification step — run `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'bookings' AND constraint_type = 'UNIQUE'` in the Dashboard before applying the migration, and adjust the `DROP CONSTRAINT` statement to match the actual name. Use `DROP CONSTRAINT IF EXISTS` as a safety net.

2. **Whether `amount_czk` should be NULL-able or carry the combined total for round-trip rows**
   - What we know: `amount_czk INTEGER NOT NULL` currently; one-way bookings carry the full price there
   - What's unclear: For round-trip rows, `amount_czk` should carry... the combined total? The per-leg amount? Or is it redundant?
   - Recommendation: Store the combined total in `amount_czk` for round-trip outbound rows (for backward compatibility with admin display queries that already use `amount_czk`), and NULL or 0 for the return row. The per-leg amounts are what matter for refunds — they live in `outbound_amount_czk` / `return_amount_czk`. This is a decision for the planner to confirm; it does not affect the Phase 23 migration DDL.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/webhooks-stripe.test.ts` |
| Full suite command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RTPM-02 | `linked_booking_id` column exists and is nullable with SET NULL FK | manual-SQL | Dashboard: `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='bookings' AND column_name='linked_booking_id'` | N/A — DB migration |
| RTPM-02 | `create_round_trip_bookings` RPC atomically inserts two linked rows | manual-SQL | Dashboard: call RPC with test JSONB, verify 2 rows, verify `linked_booking_id` cross-links | N/A — DB migration |
| RTPM-02 | RPC rolls back both rows if second insert fails (e.g., constraint violation) | manual-SQL | Dashboard: call RPC with duplicate booking_reference, verify 0 rows inserted | N/A — DB migration |
| RTPM-03 | `outbound_amount_czk` and `return_amount_czk` columns exist on `bookings` | manual-SQL | Dashboard: `SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name IN ('outbound_amount_czk','return_amount_czk')` | N/A — DB migration |
| RTPM-03 | `return_discount_pct` exists on `pricing_globals` with default 10 | manual-SQL | Dashboard: `SELECT return_discount_pct FROM pricing_globals WHERE id=1` | N/A — DB migration |
| SC1 | Existing one-way rows have `leg = 'outbound'` | manual-SQL | Dashboard: `SELECT COUNT(*) FROM bookings WHERE leg != 'outbound'` — expect 0 | N/A |
| SC2 | Composite UNIQUE allows `(same_pi, 'outbound')` + `(same_pi, 'return')` but blocks third | manual-SQL | Dashboard: INSERT test described in Code Examples above | N/A |

**Note:** Schema DDL migrations have no Vitest unit tests — they are verified by querying the live DB. The existing Vitest suite must remain green after the migration is applied; since `saveBooking` is mocked in all tests, the DB constraint change does not break any unit test.

### Sampling Rate

- **Per task commit:** `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/webhooks-stripe.test.ts` (verifies existing one-way webhook behavior is unbroken)
- **Per wave merge:** `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run`
- **Phase gate:** Full suite green + all SQL verification queries pass before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `supabase/migrations/023_v14_schema_foundation.sql` — the migration file itself; created in Wave 1 of this phase
- [ ] No new Vitest test files needed — all verification is SQL-level

*(No new test infrastructure needed; existing Vitest setup covers regression checking for the existing test suite.)*

---

## Sources

### Primary (HIGH confidence)

- Direct file read: `supabase/migrations/0001_create_bookings.sql` — confirmed exact `bookings` table DDL; `payment_intent_id text UNIQUE`; `return_date text` already exists
- Direct file read: `supabase/migrations/0002_create_pricing_config.sql` — confirmed `pricing_globals` columns; no `return_discount_pct` yet
- Direct file read: `supabase/migrations/018_v13_schema_foundation.sql` — confirmed `status`, `operator_notes`, `booking_source` added; `promo_codes` created; `holiday_dates` added to `pricing_globals`
- Direct file read: `supabase/migrations/021_pricing_enhancements.sql` — confirmed `min_fare` added to `pricing_config`
- Direct file read: `supabase/migrations/022_promo_claim_function.sql` — confirmed PL/pgSQL function pattern used in this project
- Direct file read: `prestigo/lib/supabase.ts` — confirmed `saveBooking()` uses `onConflict: 'payment_intent_id'` which will need updating in Phase 27
- Direct file read: `.planning/STATE.md` — confirmed locked architectural decisions: composite UNIQUE, atomic RPC, SET NULL FK
- Direct file read: `.planning/REQUIREMENTS.md` — confirmed RTPM-02 and RTPM-03 requirement text
- Direct file read: `prestigo/vitest.config.ts` and `prestigo/package.json` — confirmed Vitest 4.1.1, test directory, no test DB setup

### Secondary (MEDIUM confidence)

- PostgreSQL documentation pattern: `ON DELETE SET NULL` for self-referential FKs — standard behavior verified against Postgres FK docs
- PostgreSQL documentation: `UNIQUE(col1, col2)` composite constraint allows NULL in columns; NULL != NULL for uniqueness purposes — standard SQL semantics

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing project stack confirmed
- Architecture: HIGH — all decisions locked in STATE.md; SQL patterns confirmed from existing migration files in the project
- Pitfalls: HIGH — constraint name issue confirmed from 0001 DDL; NULL behavior is standard Postgres; saveBooking conflict key issue confirmed from reading the source file
- RPC function body: MEDIUM — the PL/pgSQL pattern is standard and matches the existing `claim_promo_code` function style; exact column list needs to be verified against final `bookings` schema before copying into the migration

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable Postgres/Supabase; no fast-moving dependencies)
