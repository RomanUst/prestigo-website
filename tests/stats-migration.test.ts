// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 081 (Phase 85, plan 85-01): the chat channel column, the
// shared stats_trips() helper and the read-only stats_conversion() funnel RPC. The live behaviour is
// proven by the rolled-back smoke 85-01-smoke.sql; these tests pin the guards that must never be
// edited out. Comment lines are stripped, so a rule mentioned only in a comment does not count.

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m081 = load('081_stats_conversion.sql')

/** Header (CREATE ... up to AS $$) and body (between the dollar quotes) of one function. */
function fn(name: string): { header: string; body: string; all: string } {
  const start = m081.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const open = m081.indexOf('AS $$', start)
  expect(open, `function ${name} has no AS $$`).toBeGreaterThan(-1)
  const close = m081.indexOf('$$;', open + 5)
  expect(close, `function ${name} has no closing $$;`).toBeGreaterThan(-1)
  return {
    header: m081.slice(start, open),
    body: m081.slice(open + 5, close),
    all: m081.slice(start, close + 3),
  }
}

function count(text: string, needle: string | RegExp): number {
  if (typeof needle === 'string') return text.split(needle).length - 1
  return (text.match(new RegExp(needle.source, needle.flags.includes('g') ? needle.flags : needle.flags + 'g')) ?? []).length
}

const PAID = `'confirmed', 'assigned', 'en_route', 'on_location', 'completed'`

const FUNNEL_SOURCES = [
  'chat_web',
  'chat_whatsapp',
  'chat_email',
  'chat_telegram',
  'chat_other',
  'form_contact',
  'form_corporate',
  'form_multiday_quote',
  'abandoned',
]

describe('081 chat_leads.channel', () => {
  it('adds the column idempotently', () => {
    expect(m081).toMatch(/ALTER TABLE public\.chat_leads ADD COLUMN IF NOT EXISTS channel text/)
  })

  it('constrains it to exactly the five buckets (or NULL)', () => {
    expect(m081).toMatch(/DROP CONSTRAINT IF EXISTS chat_leads_channel_check/)
    const m = m081.match(/ADD CONSTRAINT chat_leads_channel_check\s+CHECK \(channel IS NULL OR channel IN \(([^)]*)\)\)/)
    expect(m, 'chat_leads_channel_check not found').not.toBeNull()
    const values = (m![1].match(/'[a-z]+'/g) ?? []).map((v) => v.replace(/'/g, ''))
    expect(values.sort()).toEqual(['email', 'other', 'telegram', 'web', 'whatsapp'])
  })
})

describe('081 function shape', () => {
  it.each(['stats_trips', 'stats_conversion'])('%s is defined once, STABLE, SECURITY DEFINER, empty search_path', (name) => {
    expect(count(m081, `CREATE OR REPLACE FUNCTION public.${name}(`)).toBe(1)
    const { header } = fn(name)
    expect(header).toMatch(/\bSTABLE\b/)
    expect(header).toMatch(/\bSECURITY DEFINER\b/)
    expect(header).toMatch(/SET search_path = ''/)
  })

  it('stats_conversion returns jsonb', () => {
    expect(fn('stats_conversion').header).toMatch(/RETURNS jsonb/)
  })

  it('no stats function writes anything (no INSERT, UPDATE, DELETE, TRUNCATE or outbox call)', () => {
    const names = [...m081.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((x) => x[1])
    expect(names).toContain('stats_conversion')
    for (const name of names) {
      if (name === 'chat_lead_reserve') continue
      const { body } = fn(name)
      expect(body, `${name} must be read-only`).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b|outbox_enqueue/i)
    }
  })

  it('never casts pickup_date (a bad text value must not raise and break a tab)', () => {
    expect(m081).not.toMatch(/pickup_date\s*::/)
  })
})

describe('081 stats_trips (D-02 + D-18)', () => {
  it('lists the five paid statuses exactly once in the whole file, next to the non-return rule', () => {
    expect(count(m081, PAID)).toBe(1)
    const { body } = fn('stats_trips')
    expect(body).toContain(PAID)
    expect(body).toContain(`leg IS DISTINCT FROM 'return'`)
  })

  it('person key is the identity, else the normalised email, and never both legs of a round trip', () => {
    const { body } = fn('stats_trips')
    expect(body).toContain('public.booking_identity')
    expect(body).toContain('public.identity_normalize_email(')
    expect(body).toMatch(/'e:' \|\|/)
  })

  it('uses the 080 round-trip amount fallback', () => {
    const { body } = fn('stats_trips')
    expect(body).toContain('outbound_amount_czk')
    expect(body).toContain('return_amount_czk')
    expect(body).toContain('0.04')
  })
})

describe('081 stats_conversion funnel (D-01, D-03, D-14, D-20, D-21)', () => {
  const { body } = fn('stats_conversion')

  it.each([
    'Europe/Prague',
    `interval '90 days'`,
    'LIMIT 1',
    'public.stats_trips()',
    'public.identity_is_abandoned(',
    'public.inquiries',
    'public.chat_leads',
    'converted_booking_id',
    'count(DISTINCT',
    'MATERIALIZED',
  ])('body contains %s', (needle) => {
    expect(body).toContain(needle)
  })

  it.each(FUNNEL_SOURCES)('body mentions the funnel source %s', (src) => {
    expect(body).toContain(`'${src}'`)
  })

  it('rejects a NULL or inverted period', () => {
    expect(body).toMatch(/RAISE EXCEPTION 'invalid period'/)
    expect(body).toMatch(/p_from IS NULL OR p_to IS NULL OR p_from > p_to/)
  })

  it('reads stats_trips once (one materialised CTE)', () => {
    expect(count(body, 'public.stats_trips()')).toBe(1)
  })

  it('does not restate the paid status list', () => {
    expect(body).not.toContain(`'en_route'`)
  })

  it('result carries every contract key', () => {
    for (const k of [
      'from',
      'to',
      'funnel',
      'funnel_total',
      'converting_bookings',
      'direct',
      'direct_total',
      'trips_in_period',
      'attributed_bookings',
      'window_open',
      'revenue_eur',
    ]) {
      expect(body, `key ${k}`).toContain(`'${k}'`)
    }
  })
})

describe('081 grants (T-85-01)', () => {
  it.each(['stats_trips()', 'stats_conversion(date, date)'])('%s is service_role only', (sig) => {
    expect(m081).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`)
    expect(m081).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
  })
})

// ── Task 2: chat channel writer, phone-resolved chat leads, direct rows ─────

const DIRECT_SOURCES = [
  'manual_whatsapp',
  'manual_phone',
  'manual_email',
  'manual_partner',
  'manual_other',
  'manual_unknown',
  'gnet',
  'online',
]

describe('081 chat_lead_reserve (D-04, 6-arg)', () => {
  it('drops the 5-arg overload before creating the 6-arg one', () => {
    const drop = m081.indexOf('DROP FUNCTION IF EXISTS public.chat_lead_reserve(text, uuid, bigint, text, text);')
    const create = m081.indexOf('CREATE OR REPLACE FUNCTION public.chat_lead_reserve(')
    expect(drop, 'DROP of the old signature').toBeGreaterThan(-1)
    expect(create, 'CREATE of the new signature').toBeGreaterThan(-1)
    expect(drop).toBeLessThan(create)
    expect(count(m081, 'CREATE OR REPLACE FUNCTION public.chat_lead_reserve(')).toBe(1)
  })

  it('new signature ends with p_channel text DEFAULT NULL and keeps the advisory lock', () => {
    const { header, body } = fn('chat_lead_reserve')
    expect(header).toMatch(/p_channel\s+text\s+DEFAULT NULL\s*\)/)
    expect(header).toMatch(/SECURITY DEFINER/)
    expect(header).toMatch(/SET search_path = ''/)
    expect(body).toContain('pg_advisory_xact_lock')
    expect(body).toContain('public.chat_channel_bucket(p_channel)')
  })

  it('stores the channel on INSERT only (existing-row paths never relabel a lead)', () => {
    const { body } = fn('chat_lead_reserve')
    expect(count(body, /\bINSERT\b/)).toBe(1)
    expect(body).not.toMatch(/\bUPDATE\b/i)
    expect(body).toMatch(/INSERT INTO public\.chat_leads\s*\(lead_ref, person_key, identity_id, chatwoot_contact_id, phone, channel\)/)
  })
})

describe('081 chat_channel_bucket (D-04)', () => {
  it('maps exactly the four Chatwoot classes leadSourceForChannel maps', () => {
    const { body } = fn('chat_channel_bucket')
    const sqlClasses = [...new Set(body.match(/Channel::\w+/g) ?? [])].sort()
    const ts = readFileSync(join(process.cwd(), 'lib', 'chat-classify.ts'), 'utf8')
    const start = ts.indexOf('export function leadSourceForChannel')
    expect(start).toBeGreaterThan(-1)
    const fnText = ts.slice(start, ts.indexOf('\n}\n', start))
    const tsClasses = [...fnText.matchAll(/case '(Channel::\w+)'/g)].map((m) => m[1]).sort()
    expect(tsClasses).toHaveLength(4)
    expect(sqlClasses).toEqual(tsClasses)
  })

  it('NULL stays NULL, unknown classes fall to other, and it is IMMUTABLE with a pinned search_path', () => {
    const { header, body } = fn('chat_channel_bucket')
    expect(header).toMatch(/\bIMMUTABLE\b/)
    expect(header).toMatch(/SET search_path = ''/)
    expect(body).toMatch(/p_raw IS NULL THEN NULL/)
    expect(body).toMatch(/ELSE 'other'/)
    for (const b of ['web', 'whatsapp', 'email', 'telegram']) expect(body).toContain(`'${b}'`)
  })
})

describe('081 grants on the new signatures (T-85-01)', () => {
  it.each(['chat_lead_reserve(text, uuid, bigint, text, text, text)', 'chat_channel_bucket(text)'])(
    '%s is service_role only',
    (sig) => {
      expect(m081).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`)
      expect(m081).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
    },
  )

  it('no REVOKE or GRANT names the old 5-arg chat_lead_reserve', () => {
    expect(m081).not.toMatch(/(REVOKE|GRANT) EXECUTE ON FUNCTION public\.chat_lead_reserve\(text, uuid, bigint, text, text\)\s/)
  })

  it('every function pins search_path (T-85-02)', () => {
    expect(count(m081, `SET search_path = ''`)).toBe(count(m081, 'CREATE OR REPLACE FUNCTION'))
  })
})

describe('081 stats_conversion: phone-resolved chat leads and direct rows (D-06)', () => {
  const { body } = fn('stats_conversion')

  it('resolves a chat lead phone only when not shared and exactly one identity owns it', () => {
    expect(body).toContain('public.phone_flags')
    expect(body).toMatch(/f\.shared/)
    expect(body).toContain('public.identity_phones')
    expect(body).toMatch(/count\(DISTINCT p\.identity_id\) = 1/)
    expect(body).not.toMatch(/\bmin\s*\(/i)
  })

  it.each(DIRECT_SOURCES)('direct source %s is present', (src) => {
    expect(body).toContain(src)
  })

  it('direct rule: no inquiry of the person in the 90 days before, and not a converted chat lead', () => {
    expect(body).toMatch(/NOT EXISTS \(\s*SELECT 1\s+FROM inq_all/)
    expect(body).toMatch(/NOT EXISTS \(\s*SELECT 1\s+FROM public\.chat_leads/)
    expect(body).toContain(`t.created_at - interval '90 days'`)
  })
})

describe('85-01-smoke.sql', () => {
  const smoke = readFileSync(
    join(process.cwd(), '.planning', 'phases', '85-statistics', '85-01-smoke.sql'),
    'utf8',
  )

  it('is one DO block that ends by raising SMOKE_OK_85_01', () => {
    expect(count(smoke, `RAISE EXCEPTION 'SMOKE_OK_85_01'`)).toBe(1)
    expect(count(smoke, 'DO $smoke$')).toBe(1)
    expect(smoke.trimEnd().endsWith('$smoke$;')).toBe(true)
  })
})
