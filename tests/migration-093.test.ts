// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { latestCheckValues, latestFunctionBody, loadMigration } from './helpers/latest-migration'
import { FUNNEL_SOURCES } from '@/lib/admin-stats'

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

describe('093 stats_conversion (T-93-65)', () => {
  const raw = (file: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8')
  const fnText = (sql: string) => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.stats_conversion(')
    const open = sql.indexOf('AS $$', start)
    return sql.slice(start, sql.indexOf('$$;', open + 5) + 3)
  }
  const f083 = fnText(raw('083_stats_conversion_period_totals.sql'))
  const f093 = fnText(raw('093_custom_tour_inquiries.sql'))
  const ADDED_ROW = `(8, 'form_multiday_quote'),
                 (9, 'abandoned'),
                 (10, 'form_custom_tour')`

  it('is the 083 definition plus exactly one appended funnel row', () => {
    expect(f093).not.toBe(f083)
    expect(f093.replace(ADDED_ROW, `(8, 'form_multiday_quote'),\n                 (9, 'abandoned')`)).toBe(f083)
  })

  it('is the live (latest) definition and names every funnel source of lib/admin-stats in order', () => {
    const body = latestFunctionBody('stats_conversion')
    expect(body).toContain("'form_custom_tour'")
    const rows = [...body.matchAll(/\((\d+), '((?:chat|form)_[a-z_]+|abandoned)'\)/g)]
    expect(rows.map((r) => r[2])).toEqual([...FUNNEL_SOURCES])
    expect(rows.map((r) => Number(r[1]))).toEqual(FUNNEL_SOURCES.map((_, i) => i + 1))
  })

  it('stays service_role only after the CREATE OR REPLACE', () => {
    expect(m093).toContain('REVOKE EXECUTE ON FUNCTION public.stats_conversion(date, date) FROM PUBLIC, anon, authenticated;')
    expect(m093).toContain('GRANT EXECUTE ON FUNCTION public.stats_conversion(date, date) TO service_role;')
    expect(m093.indexOf('REVOKE EXECUTE ON FUNCTION public.stats_conversion')).toBeGreaterThan(
      m093.indexOf('CREATE OR REPLACE FUNCTION public.stats_conversion('),
    )
    expect(m093.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(m093).not.toMatch(/DROP FUNCTION/)
  })
})
