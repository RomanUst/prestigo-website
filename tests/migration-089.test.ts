// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { loadMigration } from './helpers/latest-migration'

// Text-level contract of migration 089 (Phase 91 plan 91-01: stops, landing time, waiting rate, extra charges).
// Comments are stripped by loadMigration, so a rule mentioned only in a comment does not count.

const m089 = loadMigration('089_stops_landing_extra_charges.sql')
const flat = m089.replace(/\s+/g, ' ')

/** The statement (up to its closing semicolon) that starts at the first occurrence of `needle`. */
function statementFrom(needle: string): string {
  const start = flat.indexOf(needle)
  expect(start, `"${needle}" is in 089`).toBeGreaterThanOrEqual(0)
  const end = flat.indexOf(';', start)
  return flat.slice(start, end + 1)
}

describe('089 booking_stops (STOP-04)', () => {
  const stops = statementFrom('CREATE TABLE IF NOT EXISTS public.booking_stops')

  it('creates the table with every column and CHECK of the contract', () => {
    expect(stops).toContain('id uuid PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(stops).toContain('booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE')
    expect(stops).toContain('position smallint NOT NULL CHECK (position BETWEEN 1 AND 5)')
    expect(stops).toContain('address text CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 500)')
    expect(stops).toContain('lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90)')
    expect(stops).toContain('lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180)')
    expect(stops).toContain(
      'wait_minutes smallint NOT NULL DEFAULT 0 CHECK (wait_minutes BETWEEN 0 AND 120 AND wait_minutes % 15 = 0)',
    )
    expect(stops).toContain('free_minutes smallint NOT NULL CHECK (free_minutes >= 0)')
    expect(stops).toContain('blocks smallint NOT NULL DEFAULT 0 CHECK (blocks >= 0)')
    expect(stops).toContain('fee_per_block_eur numeric CHECK (fee_per_block_eur IS NULL OR fee_per_block_eur > 0)')
    expect(stops).toContain('fee_eur numeric NOT NULL DEFAULT 0 CHECK (fee_eur >= 0)')
    expect(stops).toContain('created_at timestamptz NOT NULL DEFAULT now()')
  })

  it('has one row per (booking, position)', () => {
    expect(stops).toContain('CONSTRAINT booking_stops_booking_position_key UNIQUE (booking_id, position)')
  })

  it('is deny-all: no anon / authenticated grants, RLS on, SELECT and INSERT denied', () => {
    expect(flat).toContain('REVOKE ALL ON public.booking_stops FROM anon, authenticated;')
    expect(flat).toContain('ALTER TABLE public.booking_stops ENABLE ROW LEVEL SECURITY;')
    expect(flat).toMatch(
      /CREATE POLICY booking_stops_no_public_read ON public\.booking_stops FOR SELECT USING \(false\);/,
    )
    expect(flat).toMatch(
      /CREATE POLICY booking_stops_no_public_insert ON public\.booking_stops FOR INSERT WITH CHECK \(false\);/,
    )
    expect(flat).not.toMatch(/GRANT [A-Z, ]+ ON (TABLE )?public\.booking_stops/i)
  })
})

describe('089 landing columns (STOP-05, D-18)', () => {
  it('adds landing_date, landing_time and pickup_offset_min idempotently', () => {
    expect(flat).toContain('ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS landing_date text')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS landing_time text')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS pickup_offset_min smallint')
  })

  it('checks the formats and the offset list', () => {
    expect(flat).toContain("CHECK (landing_date IS NULL OR landing_date ~ '^\\d{4}-\\d{2}-\\d{2}$')")
    expect(flat).toContain("CHECK (landing_time IS NULL OR landing_time ~ '^\\d{2}:\\d{2}$')")
    expect(flat).toContain('CHECK (pickup_offset_min IS NULL OR pickup_offset_min IN (0, 15, 30, 45, 60, 90))')
  })

  it('requires all three landing columns together or none, and drops the constraint before re-adding it', () => {
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS bookings_landing_complete_check')
    expect(flat).toContain(
      'ADD CONSTRAINT bookings_landing_complete_check CHECK ( (landing_date IS NULL) = (landing_time IS NULL) AND (landing_time IS NULL) = (pickup_offset_min IS NULL) )',
    )
  })

  it('never touches pickup_date, pickup_time or the generated pickup_utc', () => {
    expect(m089).not.toMatch(/pickup_utc/)
    expect(m089).not.toMatch(/ALTER COLUMN\s+pickup_(date|time)/i)
    expect(m089).not.toMatch(/DROP COLUMN/i)
  })
})

describe('089 waiting rate (D-04, D-05)', () => {
  it('adds pricing_config.waiting_rate_per_15min as a nullable numeric with CHECK > 0', () => {
    expect(flat).toContain('ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS waiting_rate_per_15min numeric;')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS pricing_config_waiting_rate_check')
    expect(flat).toContain(
      'ADD CONSTRAINT pricing_config_waiting_rate_check CHECK (waiting_rate_per_15min IS NULL OR waiting_rate_per_15min > 0)',
    )
  })

  it('D-05: the waiting_rate_per_15min column line carries no DEFAULT and no pricing_config row is written', () => {
    const column = statementFrom('ADD COLUMN IF NOT EXISTS waiting_rate_per_15min')
    expect(column).not.toMatch(/DEFAULT/i)
    expect(column).not.toMatch(/NOT NULL/i)
    expect(m089).not.toMatch(/UPDATE\s+public\.pricing_config/i)
    expect(m089).not.toMatch(/INSERT\s+INTO\s+public\.pricing_config/i)
    expect(m089).not.toMatch(/waiting_rate_per_15min[^;]*DEFAULT/i)
  })
})
