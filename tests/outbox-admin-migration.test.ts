// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Comment lines are stripped so assertions only see executable SQL.
function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m070 = load('070_outbox_admin.sql')

/** Body of one function: from its CREATE line up to the next CREATE or the REVOKE tail. */
function fnBody(name: string): string {
  const start = m070.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} missing`).toBeGreaterThanOrEqual(0)
  const rest = m070.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return rest.slice(0, next === -1 ? undefined : next)
}

describe('070_outbox_admin.sql', () => {
  it('defines the four functions', () => {
    expect((m070.match(/CREATE OR REPLACE FUNCTION public\.outbox_/g) ?? []).length).toBe(4)
    for (const n of ['outbox_health', 'outbox_open_events', 'outbox_retry', 'outbox_retry_failed']) {
      expect(m070).toContain(`FUNCTION public.${n}(`)
    }
  })

  it('every function is SECURITY DEFINER with a pinned search_path', () => {
    const fnCount = (m070.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    expect((m070.match(/SECURITY DEFINER/g) ?? []).length).toBe(fnCount)
    expect((m070.match(/SET search_path = ''/g) ?? []).length).toBe(fnCount)
  })

  it.each([
    'outbox_health()',
    'outbox_open_events(text, integer)',
    'outbox_retry(text)',
    'outbox_retry_failed(integer)',
  ])('revokes EXECUTE on %s from PUBLIC, anon, authenticated and grants service_role', (sig) => {
    const revoke = m070
      .split('\n')
      .find((l) => l.includes('REVOKE EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
    expect(revoke, `no REVOKE line for ${sig}`).toBeDefined()
    expect(revoke).toContain('FROM PUBLIC, anon, authenticated')
    const grant = m070
      .split('\n')
      .find((l) => l.includes('GRANT EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
    expect(grant, `no GRANT line for ${sig}`).toBeDefined()
    expect(grant).toContain('TO service_role')
  })

  it('outbox_retry only revives failed or pending rows, never processing, and keeps last_error', () => {
    const body = fnBody('outbox_retry')
    expect(body).toMatch(/status IN \('failed', 'pending'\)/)
    expect(body).not.toContain('processing')
    expect(body).not.toMatch(/last_error\s*=/)
    expect(body).toContain('attempts     = 0')
    expect(body).toContain('lease_until  = NULL')
  })

  it('outbox_retry_failed only touches failed rows, never processing, and keeps last_error', () => {
    const body = fnBody('outbox_retry_failed')
    expect(body).toContain("o.status = 'failed'")
    expect(body).not.toContain('processing')
    expect(body).not.toMatch(/last_error\s*=/)
    expect(body).toContain('least(greatest(p_limit, 1), 500)')
    expect(body).toContain('RETURNING o.idempotency_key')
  })

  it('outbox_open_events lists only open rows, capped at 100, newest first', () => {
    const body = fnBody('outbox_open_events')
    expect(body).toContain("o.status IN ('pending', 'processing', 'failed')")
    expect(body).toContain('least(greatest(p_limit, 1), 100)')
    expect(body).toContain('ORDER BY o.updated_at DESC')
    expect(body).not.toMatch(/'sent'|'skipped'/)
  })

  it('outbox_open_events exposes no personal data columns', () => {
    const body = fnBody('outbox_open_events')
    expect(body).not.toMatch(/client_email|client_first_name|client_last_name|client_phone|\bemail\b|\bphone\b/)
    expect(body).toContain('b.booking_reference')
  })

  it('stuck means pending past 6 hours or an expired lease', () => {
    const health = fnBody('outbox_health')
    expect(health).toContain("interval '6 hours'")
    expect(health).toContain('lease_until < now()')
    const open = fnBody('outbox_open_events')
    expect(open).toContain("interval '6 hours'")
    expect(open).toContain('lease_until < now()')
  })
})
