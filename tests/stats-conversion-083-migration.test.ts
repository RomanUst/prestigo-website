// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract for migration 083 (Phase 85, review WR-01): stats_conversion gains
// attributed_total and period_total and is otherwise byte-identical to 081. The live behaviour is
// proven by the rolled-back smoke 85-07-smoke.sql.

function fnText(file: string): string {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8')
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.stats_conversion(')
  expect(start, `stats_conversion not found in ${file}`).toBeGreaterThan(-1)
  const open = sql.indexOf('AS $$', start)
  const close = sql.indexOf('$$;', open + 5)
  return sql.slice(start, close + 3)
}

const m083 = readFileSync(join(process.cwd(), 'supabase', 'migrations', '083_stats_conversion_period_totals.sql'), 'utf8')
const f081 = fnText('081_stats_conversion.sql')
const f083 = fnText('083_stats_conversion_period_totals.sql')

const ADDED = `,
      'attributed_total', jsonb_build_object(
        'bookings',    (SELECT count(*)::integer FROM period_trips x WHERE NOT x.is_direct),
        'revenue_eur', (SELECT COALESCE(sum(x.amount_eur), 0)::integer FROM period_trips x WHERE NOT x.is_direct)
      ),
      'period_total', jsonb_build_object(
        'bookings',    (SELECT count(*)::integer FROM period_trips),
        'revenue_eur', (SELECT COALESCE(sum(x.amount_eur), 0)::integer FROM period_trips x)
      )`

describe('migration 083 stats_conversion period totals', () => {
  it('changes nothing but the two added keys', () => {
    expect(f083.replace(ADDED, '')).toBe(f081)
  })

  it('stays STABLE SECURITY DEFINER with a pinned search_path', () => {
    expect(f083).toMatch(/STABLE\s+SECURITY DEFINER\s+SET search_path = ''/)
  })

  it('re-runs the service-role-only grants and touches no other function', () => {
    expect(m083).toContain('REVOKE EXECUTE ON FUNCTION public.stats_conversion(date, date) FROM PUBLIC, anon, authenticated;')
    expect(m083).toContain('GRANT EXECUTE ON FUNCTION public.stats_conversion(date, date) TO service_role;')
    expect(m083.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(m083).not.toMatch(/DROP FUNCTION/)
  })
})
