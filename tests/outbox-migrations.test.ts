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
