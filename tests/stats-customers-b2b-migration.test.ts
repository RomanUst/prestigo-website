// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 082 (Phase 85, plan 85-03): the read-only stats_b2b() RPC
// (STAT-03) and, from Task 2, stats_customers() (STAT-02). The live behaviour is proven by the
// rolled-back smoke 85-03-smoke.sql; these tests pin the guards that must never be edited out.
// Comment lines are stripped, so a rule mentioned only in a comment does not count.

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m082 = load('082_stats_customers_b2b.sql')

/** Header (CREATE ... up to AS $$) and body (between the dollar quotes) of one function. */
function fn(name: string): { header: string; body: string; all: string } {
  const start = m082.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const open = m082.indexOf('AS $$', start)
  expect(open, `function ${name} has no AS $$`).toBeGreaterThan(-1)
  const close = m082.indexOf('$$;', open + 5)
  expect(close, `function ${name} has no closing $$;`).toBeGreaterThan(-1)
  return {
    header: m082.slice(start, open),
    body: m082.slice(open + 5, close),
    all: m082.slice(start, close + 3),
  }
}

function count(text: string, needle: string | RegExp): number {
  if (typeof needle === 'string') return text.split(needle).length - 1
  return (text.match(new RegExp(needle.source, needle.flags.includes('g') ? needle.flags : needle.flags + 'g')) ?? []).length
}

describe('082 stats_b2b shape (STAT-03)', () => {
  it('is defined once, STABLE, SECURITY DEFINER, empty search_path, returns jsonb', () => {
    expect(count(m082, 'CREATE OR REPLACE FUNCTION public.stats_b2b(')).toBe(1)
    const { header } = fn('stats_b2b')
    expect(header).toMatch(/\bSTABLE\b/)
    expect(header).toMatch(/\bSECURITY DEFINER\b/)
    expect(header).toMatch(/SET search_path = ''/)
    expect(header).toMatch(/RETURNS jsonb/)
    expect(header).toMatch(/p_from date,\s*p_to\s+date/)
  })

  it('rejects a NULL or inverted period', () => {
    const { body } = fn('stats_b2b')
    expect(body).toMatch(/RAISE EXCEPTION 'invalid period'/)
    expect(body).toMatch(/p_from IS NULL OR p_to IS NULL OR p_from > p_to/)
  })

  it.each([
    'public.stats_trips()',
    'MATERIALIZED',
    'public.customer_profiles',
    `account_type = 'corporate'`,
    'auth.users',
    'public.identity_normalize_email(',
    `to_char(p_from, 'YYYY-MM-DD')`,
    `to_char(p_to, 'YYYY-MM-DD')`,
  ])('body contains %s', (needle) => {
    expect(fn('stats_b2b').body).toContain(needle)
  })

  it('reads stats_trips once (one materialised CTE)', () => {
    expect(count(fn('stats_b2b').body, 'public.stats_trips()')).toBe(1)
  })
})

describe('082 stats_b2b attribution (D-19, T-85-12)', () => {
  const { body } = fn('stats_b2b')

  it('a trip belongs to COALESCE(user_id, owner of the normalised client email), one key per trip', () => {
    expect(body).toMatch(/COALESCE\(\s*\w+\.user_id,/)
    expect(body).toMatch(/identity_normalize_email\(\w+\.client_email\)/)
    // ambiguous owners resolve to the lowest id, so a trip is never counted for two accounts
    expect(body).toMatch(/array_agg\(\w+\.id ORDER BY \w+\.id\)/)
  })

  it('lists only corporate profiles and drops accounts without a trip in the period', () => {
    expect(body).toMatch(/\bJOIN public\.customer_profiles\b/)
    expect(body).toMatch(/\.account_type = 'corporate'/)
  })

  it('filters the period on the pickup_date TEXT, never a cast (D-14)', () => {
    expect(body).toMatch(/pickup_date >= v_from/)
    expect(body).toMatch(/pickup_date <= v_to/)
  })

  it('average rounds half away from zero from the integer revenue', () => {
    expect(body).toMatch(/round\(\w+\.revenue_eur::numeric \/ \w+\.bookings\)::integer/)
  })

  it('sorts revenue DESC, bookings DESC, company ASC NULLS LAST, user ASC', () => {
    expect(body).toMatch(
      /ORDER BY a\.revenue_eur DESC, a\.bookings DESC, a\.company_name ASC NULLS LAST, a\.user_id ASC/,
    )
  })

  it.each([
    'from',
    'to',
    'accounts_total',
    'b2b_bookings',
    'b2b_revenue_eur',
    'all_bookings',
    'all_revenue_eur',
    'accounts',
    'user_id',
    'company_name',
    'full_name',
    'email',
    'bookings',
    'revenue_eur',
    'avg_eur',
    'last_trip',
    'without_amount',
  ])('result carries the contract key %s', (k) => {
    expect(body).toContain(`'${k}'`)
  })

  it('an empty period gives an empty accounts array, not NULL', () => {
    expect(body).toMatch(/COALESCE\(\s*\(SELECT jsonb_agg\(/)
    expect(body).toContain(`'[]'::jsonb`)
  })
})

describe('082 shared rules (D-18, D-14, read-only)', () => {
  it('never redefines stats_trips and never repeats the paid-status list', () => {
    expect(m082).not.toContain('FUNCTION public.stats_trips(')
    expect(m082).not.toContain(`'en_route'`)
    expect(m082).not.toContain(`'on_location'`)
  })

  it('never casts pickup_date', () => {
    expect(m082).not.toMatch(/pickup_date\s*::/)
  })

  it('no function body writes anything', () => {
    const names = [...m082.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((x) => x[1])
    expect(names).toContain('stats_b2b')
    expect(names).toContain('stats_customers')
    for (const name of names) {
      const { body } = fn(name)
      expect(body, `${name} must be read-only`).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b|outbox_enqueue/i)
    }
  })

  it('every function pins search_path (T-85-11)', () => {
    expect(count(m082, `SET search_path = ''`)).toBe(count(m082, 'CREATE OR REPLACE FUNCTION'))
  })
})

describe('082 grants (T-85-10)', () => {
  it.each(['stats_b2b(date, date)', 'stats_customers(date, date)'])('%s is service_role only', (sig) => {
    expect(m082).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`)
    expect(m082).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
  })
})

// ── Task 2: stats_customers (STAT-02) and the live smoke ────────────────────

describe('082 stats_customers shape (STAT-02)', () => {
  it('is defined once, STABLE, SECURITY DEFINER, empty search_path, returns jsonb', () => {
    expect(count(m082, 'CREATE OR REPLACE FUNCTION public.stats_customers(')).toBe(1)
    const { header } = fn('stats_customers')
    expect(header).toMatch(/\bSTABLE\b/)
    expect(header).toMatch(/\bSECURITY DEFINER\b/)
    expect(header).toMatch(/SET search_path = ''/)
    expect(header).toMatch(/RETURNS jsonb/)
    expect(header).toMatch(/p_from date,\s*p_to\s+date/)
  })

  it('both functions pin the search_path (two functions, two pins)', () => {
    expect(count(m082, 'CREATE OR REPLACE FUNCTION')).toBe(2)
    expect(count(m082, `SET search_path = ''`)).toBe(2)
  })

  it('rejects a NULL or inverted period', () => {
    const { body } = fn('stats_customers')
    expect(body).toMatch(/RAISE EXCEPTION 'invalid period'/)
    expect(body).toMatch(/p_from IS NULL OR p_to IS NULL OR p_from > p_to/)
  })

  it('reads stats_trips once and filters the period on the pickup_date text (D-14)', () => {
    const { body } = fn('stats_customers')
    expect(count(body, 'public.stats_trips()')).toBe(1)
    expect(body).toContain('MATERIALIZED')
    expect(body).toMatch(/pickup_date >= v_from/)
    expect(body).toMatch(/pickup_date <= v_to/)
  })
})

describe('082 stats_customers population (D-09, D-12)', () => {
  const { body } = fn('stats_customers')

  it('excludes GNet by source, anonymised rows and rows without a person key', () => {
    expect(body).toContain(`booking_source <> 'gnet'`)
    expect(body).toMatch(/NOT \w+\.anonymised/)
    expect(body).toContain('person_key IS NOT NULL')
  })

  it('a repeat customer has 2 or more trips all-time (trips after p_to included)', () => {
    expect(body).toMatch(/trips >= 2/)
    // the all-time aggregate is not period-filtered: only FILTER clauses carry the period
    expect(body).toMatch(/FILTER \(WHERE [^)]*pickup_date >= v_from/)
  })
})

describe('082 stats_customers result (D-10, D-11)', () => {
  const { body } = fn('stats_customers')

  it.each([
    'from',
    'to',
    'customers',
    'repeat_customers',
    'revenue_eur',
    'repeat_revenue_eur',
    'repeat_customers_all_time',
    'top',
    'name',
    'email',
    'trips',
    'first_trip',
    'last_trip',
  ])('carries the contract key %s', (k) => {
    expect(body).toContain(`'${k}'`)
  })

  it('top is at most 10 repeat customers in a stable order', () => {
    expect(body).toContain('LIMIT 10')
    expect(body).toMatch(
      /ORDER BY \w+\.revenue_eur DESC, \w+\.trips DESC, \w+\.last_trip DESC, \w+\.email ASC NULLS LAST, \w+\.person_key ASC/,
    )
  })

  it('name and email come from the newest trip and the person key is never returned', () => {
    expect(body).toMatch(/array_agg\(\w+\.client_name ORDER BY \w+\.created_at DESC/)
    expect(body).toMatch(/array_agg\(\w+\.client_email ORDER BY \w+\.created_at DESC/)
    expect(body).not.toContain(`'person_key'`)
  })

  it('an empty top list is an empty array, not NULL', () => {
    expect(body).toContain(`'[]'::jsonb`)
  })
})

describe('85-03-smoke.sql', () => {
  const smoke = readFileSync(
    join(process.cwd(), '.planning', 'milestones', 'v4.0-phases', '85-statistics', '85-03-smoke.sql'),
    'utf8',
  )

  it('is one DO block that ends by raising SMOKE_OK_85_03', () => {
    expect(count(smoke, `RAISE EXCEPTION 'SMOKE_OK_85_03'`)).toBe(1)
    expect(count(smoke, 'DO $smoke$')).toBe(1)
    expect(smoke.trimEnd().endsWith('$smoke$;')).toBe(true)
  })

  it('exercises both RPCs and the privilege checks', () => {
    expect(smoke).toContain('public.stats_customers(')
    expect(smoke).toContain('public.stats_b2b(')
    expect(smoke).toContain('has_function_privilege')
  })
})
