// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 073 (Phase 82, plan 82-08). The live behaviour is proven
// by the rolled-back smoke 82-08-smoke.sql; these tests pin the guards that must never be edited out.

const m073 = readFileSync(join(process.cwd(), 'supabase', 'migrations', '073_identity_admin.sql'), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')

/** Body of one function: from its CREATE line to the next CREATE OR REPLACE / REVOKE block. */
function fnBody(name: string): string {
  const start = m073.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m073.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m073.slice(start, next === -1 ? undefined : start + 10 + next)
}

describe('073 identity_admin_log', () => {
  it('is ids-only with an action check', () => {
    const table = m073.slice(m073.indexOf('CREATE TABLE IF NOT EXISTS public.identity_admin_log'))
    const def = table.slice(0, table.indexOf(');'))
    expect(def).toMatch(/action\s+text\s+NOT NULL CHECK \(action IN \('split', 'mark_shared'\)\)/)
    expect(def).toMatch(/actor\s+uuid\s+NOT NULL/)
    expect(def).toMatch(/identity_id\s+uuid/)
    expect(def).not.toMatch(/email|phone|note/i)
  })

  it('has RLS on and no privileges for anon / authenticated', () => {
    expect(m073).toMatch(/REVOKE ALL ON public\.identity_admin_log FROM anon, authenticated/)
    expect(m073).toMatch(/ALTER TABLE public\.identity_admin_log ENABLE ROW LEVEL SECURITY/)
    expect(m073).toMatch(/_no_public_read/)
  })
})

describe('073 identity_split', () => {
  const body = fnBody('identity_split')

  it('takes the global identity lock before reading', () => {
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('identity', 0))")
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('SELECT e.identity_id'))
  })

  it('only splits phone-based emails and refuses erasing identities', () => {
    expect(body).toMatch(/v_basis <> 'phone'/)
    expect(body).toContain("'not_phone_merge'")
    expect(body).toContain("'erasing'")
    expect(body).toContain("'not_found'")
  })

  it('re-homes the email with basis split, moves its bookings and the matching account link', () => {
    expect(body).toMatch(/basis = 'split'/)
    expect(body).toMatch(/UPDATE public\.booking_identity/)
    expect(body).toMatch(/identity_normalize_email\(b\.client_email\) = v_email/)
    expect(body).toMatch(/auth\.users/)
  })

  it('flags the causing phone as split but never downgrades a manual mark', () => {
    expect(body).toMatch(/INSERT INTO public\.phone_flags/)
    expect(body).toContain("'split'")
    expect(body).toMatch(/ON CONFLICT \(phone\) DO UPDATE/)
    expect(body).toMatch(/phone_flags\.source <> 'manual'/)
  })

  it('writes an audit row and enqueues espo + chatwoot rows for both identities', () => {
    expect(body).toMatch(/INSERT INTO public\.identity_admin_log/)
    expect((body.match(/outbox_enqueue\('sync\.(espo|chatwoot)'/g) ?? []).length).toBe(2)
    expect(body).toMatch(/FOREACH v_id IN ARRAY ARRAY\[v_new, v_old\]/)
    expect(body).toMatch(/':s'/)
  })

  it('is SECURITY DEFINER with an empty search_path and calls no CRM / Chatwoot HTTP', () => {
    expect(body).toMatch(/SECURITY DEFINER/)
    expect(body).toMatch(/SET search_path = ''/)
    expect(body).not.toMatch(/net\.http|http_post|identity_normalize_phone/)
  })
})

describe('073 privileges', () => {
  // Full signatures (argument types only) of every function 073 creates.
  const SIGNATURES = ['public.identity_split(text, uuid)']
  const created = [...m073.matchAll(/CREATE OR REPLACE FUNCTION (public\.[a-z_]+)\(/g)].map((m) => m[1])

  it('every function has one REVOKE line from PUBLIC, anon, authenticated and a GRANT to service_role', () => {
    expect(created.length).toBe(SIGNATURES.length)
    for (const sig of SIGNATURES) {
      const esc = sig.replace(/[().]/g, '\\$&')
      expect((m073.match(new RegExp(`REVOKE EXECUTE ON FUNCTION ${esc} FROM PUBLIC, anon, authenticated`, 'g')) ?? []).length).toBe(1)
      expect((m073.match(new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO service_role`, 'g')) ?? []).length).toBe(1)
    }
  })

  it('every function is SECURITY DEFINER with an empty search_path', () => {
    expect((m073.match(/SECURITY DEFINER/g) ?? []).length).toBe(created.length)
    expect((m073.match(/SET search_path = ''/g) ?? []).length).toBe(created.length)
  })
})
