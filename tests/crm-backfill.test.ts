// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const sql = load('074_crm_backfill.sql')

function body(fn: string): string {
  const start = sql.indexOf(`FUNCTION public.${fn}`)
  expect(start, `function ${fn} not found`).toBeGreaterThan(-1)
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 10)
  return sql.slice(start, next === -1 ? sql.indexOf('REVOKE EXECUTE') : next)
}

describe('074_crm_backfill.sql', () => {
  it('defines exactly the three backfill functions', () => {
    expect((sql.match(/CREATE OR REPLACE FUNCTION public\.crm_/g) ?? []).length).toBe(3)
    for (const fn of ['crm_backfill_identity_pass', 'crm_identity_report', 'crm_backfill_enqueue']) {
      expect(sql).toContain(`FUNCTION public.${fn}`)
    }
  })

  it('has at least three created_at orderings (deterministic, oldest first)', () => {
    expect((sql.match(/ORDER BY .*created_at/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(body('crm_backfill_identity_pass')).toMatch(/ORDER BY bk\.created_at, bk\.id/)
    expect(body('crm_backfill_identity_pass')).toMatch(/ORDER BY cp\.created_at, cp\.user_id/)
    expect(body('crm_backfill_enqueue')).toMatch(/ORDER BY bk\.created_at, bk\.id/)
    expect(body('crm_backfill_enqueue')).toMatch(/ORDER BY cp\.created_at, cp\.user_id/)
  })

  describe('crm_backfill_identity_pass', () => {
    const fn = body('crm_backfill_identity_pass')
    it('replays history through the live resolvers', () => {
      expect(fn).toContain('public.identity_resolve_booking(')
      expect(fn).toContain('public.identity_resolve_user(')
    })
    it('skips abandoned bookings via the shared predicate and counts them', () => {
      expect(fn).toContain('public.identity_is_abandoned(')
      expect(fn).toContain("'abandoned_skipped'")
    })
    it('returns the contract keys', () => {
      for (const k of [
        'bookings_seen',
        'bookings_linked',
        'bookings_no_identity',
        'bookings_erasing',
        'abandoned_skipped',
        'profiles_seen',
        'profiles_linked',
      ]) {
        expect(fn).toContain(`'${k}'`)
      }
    })
  })

  describe('crm_identity_report', () => {
    const fn = body('crm_identity_report')
    it('returns the contract count keys', () => {
      for (const k of [
        'identities',
        'identities_with_user',
        'emails_by_basis',
        'phone_merges',
        'shared_phones',
        'bookings_total',
        'bookings_abandoned',
        'bookings_linked',
        'bookings_no_identity',
        'bookings_placeholder_email',
        'bookings_unparseable_phone',
        'profiles',
        'profiles_linked',
      ]) {
        expect(fn).toContain(`'${k}'`)
      }
    })
    it('outputs counts only: every value is an aggregate, no personal column is selected as a value', () => {
      // each jsonb value expression is a count(*) subquery
      const keys = fn.match(/'[a-z_]+',\s*\n?\s*\(SELECT count\(\*\)/g) ?? []
      expect(keys.length).toBeGreaterThanOrEqual(10)
      // personal columns appear only inside predicates (WHERE / LIKE / normalise), never as an output
      expect(fn).not.toMatch(/array_agg|string_agg|jsonb_agg|json_agg/)
      expect(fn).not.toMatch(/SELECT\s+(b\.|e\.|c\.)?(client_email|client_phone|email|phone|full_name)\b/)
    })
    it('counts placeholder emails and unparseable phones', () => {
      expect(fn).toContain('@gnet.local')
      expect(fn).toContain('public.identity_normalize_phone(')
    })
  })

  describe('crm_backfill_enqueue', () => {
    const fn = body('crm_backfill_enqueue')
    it("validates the tag with '^bf[0-9]{0,3}$' and raises invalid_tag", () => {
      expect(fn).toContain("'^bf[0-9]{0,3}$'")
      expect(fn).toContain("RAISE EXCEPTION 'invalid_tag'")
    })
    it('clamps the stagger to 1..60', () => {
      expect(fn).toMatch(/least\(greatest\(.*,\s*1\),\s*60\)/)
    })
    it('enqueues booking and signup keys that carry the tag', () => {
      expect(fn).toContain("'sync.booking'")
      expect(fn).toContain("'sync.signup'")
      expect(fn).toMatch(/'sync\.booking:' \|\| b\.id::text \|\| ':' \|\| p_tag/)
      expect(fn).toMatch(/'sync\.signup:' \|\| p\.user_id::text \|\| ':' \|\| p_tag/)
      expect(fn).toContain('public.outbox_enqueue(')
    })
    it('skips abandoned bookings via the shared predicate', () => {
      expect(fn).toContain('NOT public.identity_is_abandoned(')
    })
    it('spreads available_at by n * stagger and counts only inserted rows', () => {
      expect(fn).toMatch(/now\(\) \+ make_interval\(secs => v_n \* v_stagger\)/)
      expect(fn).toMatch(/v_n := v_n \+ 1/)
    })
    it('kicks every key inside a nested EXCEPTION WHEN OTHERS block', () => {
      expect((fn.match(/PERFORM public\.outbox_kick\(v_key\)/g) ?? []).length).toBe(2)
      expect((fn.match(/EXCEPTION WHEN OTHERS THEN/g) ?? []).length).toBe(2)
      expect(fn).toContain('RAISE WARNING')
    })
  })

  describe('security tail', () => {
    it.each([
      'crm_backfill_identity_pass()',
      'crm_identity_report()',
      'crm_backfill_enqueue(text, integer)',
    ])('revokes EXECUTE on %s from PUBLIC, anon, authenticated and grants service_role', (sig) => {
      const revoke = sql
        .split('\n')
        .find((l) => l.includes('REVOKE EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
      expect(revoke, `no REVOKE for ${sig}`).toBeDefined()
      expect(revoke).toContain('FROM PUBLIC, anon, authenticated')
      const grant = sql
        .split('\n')
        .find((l) => l.includes('GRANT EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
      expect(grant).toContain('TO service_role')
    })

    it('is SECURITY DEFINER with a pinned search_path on every function', () => {
      const fnCount = (sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
      expect((sql.match(/SET search_path = ''/g) ?? []).length).toBe(fnCount)
      expect((sql.match(/SECURITY DEFINER/g) ?? []).length).toBe(fnCount)
    })

    it('contains no mapping code or hard-coded country prefix guessing', () => {
      expect(sql).not.toMatch(/\+420/)
      expect(sql).not.toMatch(/espo|chatwoot/i)
    })
  })
})
