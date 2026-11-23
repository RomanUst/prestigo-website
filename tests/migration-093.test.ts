// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestCheckValues, loadMigration } from './helpers/latest-migration'

// Text-level contract of migration 093 (Phase 93 plan 93-29: custom-tour inquiries). Comments are stripped by
// loadMigration, so a rule mentioned only in a comment does not count. Nothing here touches a database: the
// orchestrator applies 093 live.

const m093 = loadMigration('093_custom_tour_inquiries.sql')
const flat = m093.replace(/\s+/g, ' ')

describe('093 custom tour inquiries (TRIP-06, D-18)', () => {
  it('widens the inquiries kind CHECK to accept custom_tour', () => {
    expect(latestCheckValues('inquiries_kind_check', 'kind')).toEqual([
      'contact',
      'corporate',
      'multiday_quote',
      'custom_tour',
    ])
    expect(flat).toContain('ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_kind_check')
  })

  it('allows one quote per request (unique partial index on source_inquiry_id)', () => {
    expect(flat).toContain('CREATE UNIQUE INDEX IF NOT EXISTS quotes_source_inquiry_id_key')
    expect(flat).toContain('ON public.quotes (source_inquiry_id) WHERE source_inquiry_id IS NOT NULL')
  })
})
