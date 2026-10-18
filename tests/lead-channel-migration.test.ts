import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/066_bookings_lead_channel.sql'),
  'utf8',
)
// Strip comment lines so assertions look at executable SQL only.
const code = sql
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')

describe('migration 066 — bookings.lead_channel (D-08)', () => {
  it('adds a nullable text column idempotently', () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS lead_channel text/i)
    expect(code).not.toMatch(/lead_channel text\s+NOT NULL/i)
  })

  it('adds the named CHECK with NULL plus the five channel values', () => {
    expect(code).toMatch(/DROP CONSTRAINT IF EXISTS bookings_lead_channel_check/i)
    expect(code).toMatch(/ADD CONSTRAINT bookings_lead_channel_check/i)
    expect(code).toMatch(/lead_channel IS NULL OR lead_channel IN \('whatsapp', 'phone', 'email', 'partner', 'other'\)/)
  })

  it('does not backfill: no UPDATE statement, existing rows stay NULL', () => {
    expect(code).not.toMatch(/\bupdate\s/i)
  })
})
