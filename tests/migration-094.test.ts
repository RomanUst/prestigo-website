// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { loadMigration, latestFunctionBody } from './helpers/latest-migration'
import { QUOTE_STATUSES } from '@/lib/quotes/vocabulary'

// Text-level contract of migration 094 (Phase 93 PR 2 review fixes WR-01 and WR-02). Comments are stripped by
// loadMigration, so a rule mentioned only in a comment does not count. Nothing here touches a database: the
// orchestrator applies 094 live (smoke: .planning/phases/93-day-trips-custom-tours/93-PR2-094-smoke.sql).

const m094 = loadMigration('094_custom_tour_quote_index.sql')
const flat = m094.replace(/\s+/g, ' ')

describe('094 one live quote per request (WR-01)', () => {
  it("'voided' is a real quote status the index can exclude", () => {
    expect(QUOTE_STATUSES).toContain('voided')
  })

  it('drops the 093 index and re-creates it unique over non-voided quotes only, under the same name', () => {
    expect(flat).toContain('DROP INDEX IF EXISTS public.quotes_source_inquiry_id_key;')
    expect(flat).toContain('CREATE UNIQUE INDEX quotes_source_inquiry_id_key ON public.quotes (source_inquiry_id)')
    expect(flat).toContain("WHERE source_inquiry_id IS NOT NULL AND status <> 'voided'")
    // the store tells an already-quoted request from a reference collision by this exact index name
    expect(flat.indexOf('DROP INDEX')).toBeLessThan(flat.indexOf('CREATE UNIQUE INDEX'))
  })

  it('does not edit 093 (it is already live): 093 still creates the original index', () => {
    const m093 = loadMigration('093_custom_tour_inquiries.sql').replace(/\s+/g, ' ')
    expect(m093).toContain('ON public.quotes (source_inquiry_id) WHERE source_inquiry_id IS NOT NULL;')
  })
})

describe('094 list_custom_tour_requests (WR-02)', () => {
  const fn = latestFunctionBody('list_custom_tour_requests').replace(/\s+/g, ' ')

  it('is SECURITY DEFINER with an empty search_path', () => {
    expect(fn).toContain('SECURITY DEFINER')
    expect(fn).toContain("SET search_path = ''")
  })

  it('is service_role only: revoked from PUBLIC, anon and authenticated, granted to service_role', () => {
    const sig = 'public.list_custom_tour_requests(text, timestamptz, uuid, integer)'
    expect(flat).toContain(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`)
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`)
    expect(flat).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.list_custom_tour_requests[^;]*TO (PUBLIC|anon|authenticated)/)
  })

  it('reads custom_tour inquiries and LEFT JOINs only the non-voided quote of each', () => {
    expect(fn).toContain("WHERE i.kind = 'custom_tour'")
    expect(fn).toContain('LEFT JOIN public.quotes q ON q.source_inquiry_id = i.id AND q.status <> \'voided\'')
  })

  it('filters on the derived status all / open / quoted and refuses anything else', () => {
    expect(fn).toContain("p_status = 'all'")
    expect(fn).toContain("p_status = 'quoted' AND q.id IS NOT NULL")
    expect(fn).toContain("p_status = 'open' AND q.id IS NULL")
    expect(fn).toContain("p_status NOT IN ('all', 'open', 'quoted')")
    expect(fn).toContain('RAISE EXCEPTION')
  })

  it('pages by keyset on (created_at, id) newest first and clamps the page size', () => {
    expect(fn).toContain('(i.created_at, i.id) < (p_cursor_created_at, p_cursor_id)')
    expect(fn).toContain('ORDER BY i.created_at DESC, i.id DESC')
    expect(fn).toContain('LEAST(GREATEST(COALESCE(p_limit, 51), 1), 101)')
    expect(fn).toContain('LIMIT v_limit')
  })

  it('returns the linked quote id, reference and created_at beside the inquiry columns', () => {
    for (const col of ['id uuid', 'name text', 'email text', 'payload jsonb', 'created_at timestamptz', 'quote_id uuid', 'quote_reference text', 'quote_created_at timestamptz']) {
      expect(fn).toContain(col)
    }
  })
})
