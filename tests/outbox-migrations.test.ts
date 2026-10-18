// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BOOKING_LEAD_STATUS } from '@/lib/lead-mapping'

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m064 = load('064_integration_outbox.sql')
const m065 = load('065_inquiries.sql')

describe('064_integration_outbox.sql', () => {
  it('enables RLS on both tables', () => {
    expect(m064).toMatch(/ALTER TABLE public\.integration_outbox ENABLE ROW LEVEL SECURITY/)
    expect(m064).toMatch(/ALTER TABLE public\.integration_config ENABLE ROW LEVEL SECURITY/)
  })

  it('revokes table privileges from anon/authenticated', () => {
    expect(m064).toMatch(
      /REVOKE ALL ON public\.integration_outbox, public\.integration_config FROM anon, authenticated/,
    )
  })

  it.each([
    'integration_outbox_set_updated_at()',
    'outbox_enqueue(text, text, uuid, text, timestamptz)',
    'outbox_claim(text, integer)',
    'outbox_complete(text, text, text)',
    'outbox_reschedule(text, timestamptz, text)',
  ])('revokes EXECUTE on %s from PUBLIC, anon, authenticated', (sig) => {
    const line = m064
      .split('\n')
      .find((l) => l.includes('REVOKE EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
    expect(line, `no REVOKE line for ${sig}`).toBeDefined()
    expect(line).toContain('FROM PUBLIC, anon, authenticated')
  })

  it('every function is SECURITY DEFINER-safe: search_path is pinned', () => {
    const fnCount = (m064.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    const pinned = (m064.match(/SET search_path = ''/g) ?? []).length
    expect(fnCount).toBeGreaterThan(0)
    expect(pinned).toBe(fnCount)
  })

  it('outbox_claim takes a per-aggregate advisory lock', () => {
    const claim = m064.slice(m064.indexOf('FUNCTION public.outbox_claim'))
    expect(claim).toContain('pg_advisory_xact_lock')
  })

  it('outbox_enqueue is idempotent on the key', () => {
    expect(m064).toContain('ON CONFLICT (idempotency_key) DO NOTHING')
  })

  it('constrains last_error to a short lowercase code', () => {
    expect(m064).toContain("last_error ~ '^[a-z0-9_]{1,40}$'")
  })

  it('does not seed integration_config', () => {
    expect(m064).not.toMatch(/INSERT INTO public\.integration_config/i)
    expect(m064).not.toContain('lead_capture_start')
  })

  it('grants the RPCs to service_role only', () => {
    expect(m064).toMatch(/GRANT EXECUTE ON FUNCTION public\.outbox_claim\(text, integer\) TO service_role/)
    const grants = m064.split('\n').filter((l) => /^\s*GRANT\b/.test(l))
    expect(grants.length).toBeGreaterThan(0)
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/)
  })
})

describe('065_inquiries.sql', () => {
  it('enables RLS with deny-all policies and revokes privileges', () => {
    expect(m065).toMatch(/ALTER TABLE public\.inquiries ENABLE ROW LEVEL SECURITY/)
    expect(m065).toMatch(/REVOKE ALL ON public\.inquiries FROM anon, authenticated/)
    expect(m065).toContain('USING (false)')
    expect(m065).toContain('WITH CHECK (false)')
  })

  it('every trigger function body has an exception guard', () => {
    const fns = m065.split('CREATE OR REPLACE FUNCTION').slice(1)
    const triggerFns = fns.filter((f) => /RETURNS\s+trigger/i.test(f))
    expect(triggerFns.length).toBeGreaterThan(0)
    for (const f of triggerFns) expect(f).toContain('EXCEPTION WHEN OTHERS')
  })

  it('revokes EXECUTE on the trigger function', () => {
    const line = m065
      .split('\n')
      .find((l) => l.includes('REVOKE EXECUTE ON FUNCTION public.enqueue_inquiry_lead()'))
    expect(line).toBeDefined()
    expect(line).toContain('FROM PUBLIC, anon, authenticated')
  })

  it('has no IP-address or browser-identification column (D-17)', () => {
    expect(m065).not.toMatch(/user_agent/i)
    expect(m065).not.toMatch(/\bip\b/i)
    expect(m065).not.toMatch(/\bip_address\b/i)
  })

  it('has no retention or purge (D-14)', () => {
    expect(m065).not.toMatch(/\bDELETE\b/i)
  })

  it('enqueues through outbox_enqueue with the inquiry key', () => {
    expect(m065).toContain("public.outbox_enqueue(")
    expect(m065).toContain("'lead.inquiry:' || NEW.id::text")
  })

  it('only stores the allowed kinds', () => {
    expect(m065).toContain("CHECK (kind IN ('contact', 'corporate', 'multiday_quote'))")
  })
})

const m067 = load('067_bookings_lead_outbox.sql')

/** Body of one function: from its name up to the next CREATE / REVOKE / GRANT / DROP statement. */
function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`)
  expect(start, `no function ${name}`).toBeGreaterThanOrEqual(0)
  const rest = sql.slice(start)
  const end = rest.search(/\n(?:CREATE OR REPLACE FUNCTION|REVOKE|GRANT|DROP TRIGGER)/)
  return end < 0 ? rest : rest.slice(0, end)
}

describe('067_bookings_lead_outbox.sql', () => {
  const trigger = fnBody(m067, 'enqueue_booking_lead')

  it('guards the whole trigger body and the kick in separate exception blocks', () => {
    expect((trigger.match(/EXCEPTION WHEN OTHERS/g) ?? []).length).toBe(2)
  })

  it('skips return legs and pre-capture rows', () => {
    expect(trigger).toContain("leg = 'return'")
    expect(trigger).toContain('lead_capture_start')
    expect(trigger).toContain('created_at <')
  })

  it('treats a missing capture start as capture off', () => {
    expect(trigger).toMatch(/v_start IS NULL THEN\s+RETURN NEW/)
  })

  it('does not filter on the booking source (all writers are captured)', () => {
    expect(m067).not.toContain('booking_source')
  })

  it('enqueues through outbox_enqueue with the booking key and a 90 s delay', () => {
    expect(trigger).toContain("'lead.booking'")
    expect(trigger).toContain("'lead.booking:' || NEW.id::text || ':' || v_new")
    expect(trigger).toContain("now() + interval '90 seconds'")
  })

  it('fires AFTER INSERT OR UPDATE OF status, per row', () => {
    expect(m067).toMatch(
      /CREATE TRIGGER bookings_lead_outbox\s+AFTER INSERT OR UPDATE OF status ON public\.bookings\s+FOR EACH ROW/,
    )
  })

  it.each(['booking_lead_status(text)', 'outbox_kick(text)', 'enqueue_booking_lead()'])(
    'revokes EXECUTE on %s from PUBLIC, anon, authenticated',
    (sig) => {
      const line = m067
        .split('\n')
        .find((l) => l.includes('REVOKE EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
      expect(line, `no REVOKE line for ${sig}`).toBeDefined()
      expect(line).toContain('FROM PUBLIC, anon, authenticated')
    },
  )

  it('grants only service_role, and only on the two helper functions', () => {
    const grants = m067.split('\n').filter((l) => /^\s*GRANT\b/.test(l))
    expect(grants).toHaveLength(2)
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/)
  })

  it('every function pins search_path', () => {
    const fnCount = (m067.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    expect((m067.match(/SET search_path = ''/g) ?? []).length).toBe(fnCount)
  })

  it('the kick sends the key only, with a Bearer header, from the Vault secrets', () => {
    const kick = fnBody(m067, 'outbox_kick')
    expect(kick).toContain("name = 'outbox_kick_url'")
    expect(kick).toContain("name = 'outbox_kick_secret'")
    expect(kick).toContain("jsonb_build_object('key', p_key)")
    expect(kick).toContain("'Authorization', 'Bearer ' || v_secret")
    expect(kick).toContain('timeout_milliseconds := 5000')
    expect(kick).toMatch(/v_url IS NULL OR v_secret IS NULL[^;]*THEN\s+RETURN/)
  })

  it('does not seed integration_config (capture stays off until go-live)', () => {
    expect(m067).not.toMatch(/INSERT INTO public\.integration_config/i)
  })

  it('parity: booking_lead_status() equals BOOKING_LEAD_STATUS for all 8 statuses', () => {
    const fn = fnBody(m067, 'booking_lead_status')
    const sqlMap: Record<string, string> = {}
    for (const m of fn.matchAll(/WHEN '([a-z_]+)'\s+THEN '([a-z_]+)'/g)) sqlMap[m[1]] = m[2]

    expect(Object.keys(BOOKING_LEAD_STATUS)).toHaveLength(8)
    expect(sqlMap).toEqual({ ...BOOKING_LEAD_STATUS })
    expect(fn).toMatch(/ELSE NULL/)
  })
})

const m068 = load('068_outbox_sweep.sql')

describe('068_outbox_sweep.sql', () => {
  const expired = fnBody(m068, 'outbox_enqueue_expired_unpaid')
  const purge = fnBody(m068, 'outbox_enqueue_abandoned_purge')
  const due = fnBody(m068, 'outbox_due_keys')

  it.each(['outbox_enqueue_expired_unpaid()', 'outbox_enqueue_abandoned_purge()', 'outbox_due_keys(integer)'])(
    'revokes EXECUTE on %s from PUBLIC, anon, authenticated and grants service_role',
    (sig) => {
      const revoke = m068
        .split('\n')
        .find((l) => l.includes('REVOKE EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
      expect(revoke, `no REVOKE line for ${sig}`).toBeDefined()
      expect(revoke).toContain('FROM PUBLIC, anon, authenticated')
      expect(m068).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
    },
  )

  it('grants only service_role', () => {
    const grants = m068.split('\n').filter((l) => /^\s*GRANT\b/.test(l))
    expect(grants).toHaveLength(3)
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/)
  })

  it('every function is SECURITY DEFINER with a pinned search_path', () => {
    const fnCount = (m068.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    expect(fnCount).toBe(3)
    expect((m068.match(/SET search_path = ''/g) ?? []).length).toBe(fnCount)
    expect((m068.match(/SECURITY DEFINER/g) ?? []).length).toBe(fnCount)
  })

  it('expired predicate: unpaid, pickup strictly in the past, outbound, created after the capture start (D-03)', () => {
    expect(expired).toContain("b.status = 'unpaid'")
    expect(expired).toContain('b.pickup_utc < now()')
    expect(expired).not.toContain('b.pickup_utc <= now()')
    expect(expired).toContain("b.leg IS DISTINCT FROM 'return'")
    expect(expired).toContain('b.created_at >= v_start')
    expect(expired).toContain("'lead.booking:' || b.id::text || ':dead'")
    expect(expired).toContain('ON CONFLICT (idempotency_key) DO NOTHING')
    expect(expired).toMatch(/v_start IS NULL THEN\s+RETURN 0/)
    expect(expired).toContain('GET DIAGNOSTICS v_n = ROW_COUNT')
  })

  it('purge predicate: online, unpaid, no payment link, outbound, > 90 days past pickup (D-15 / D-20)', () => {
    expect(purge).toContain("b.booking_source = 'online'")
    expect(purge).toContain("b.status = 'unpaid'")
    expect(purge).toContain('b.payment_link_id IS NULL')
    expect(purge).toContain("b.leg IS DISTINCT FROM 'return'")
    expect(purge).toContain('b.created_at >= v_start')
    expect(purge).toContain("b.pickup_utc < now() - interval '90 days'")
    expect(purge).not.toContain("b.pickup_utc <= now() - interval '90 days'")
    expect(purge).toContain("'lead.purge:' || b.id::text")
    expect(purge).toContain('ON CONFLICT (idempotency_key) DO NOTHING')
    expect(purge).toMatch(/v_start IS NULL THEN\s+RETURN 0/)
  })

  it('due keys: pending and due, or processing with an expired lease; capped and ordered', () => {
    expect(due).toContain("o.status = 'pending' AND o.available_at <= now()")
    expect(due).toContain("o.status = 'processing' AND o.lease_until < now()")
    expect(due).toContain('ORDER BY o.available_at')
    expect(due).toContain('LIMIT least(greatest(p_limit, 1), 500)')
  })

  it('never writes to bookings and never seeds integration_config', () => {
    expect(m068).not.toMatch(/\b(UPDATE|DELETE\s+FROM)\s+public\.bookings/i)
    expect(m068).not.toMatch(/INSERT INTO public\.bookings/i)
    expect(m068).not.toMatch(/INSERT INTO public\.integration_config/i)
  })

  it('only inserts into integration_outbox', () => {
    const inserts = [...m068.matchAll(/INSERT INTO ([a-z_.]+)/g)].map((m) => m[1])
    expect(inserts).toEqual(['public.integration_outbox', 'public.integration_outbox'])
  })
})
