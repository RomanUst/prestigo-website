// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 077 (Phase 83, plan 83-02). Live behaviour is proven by the
// rolled-back smoke 83-02-smoke.sql; these tests pin the guards that must never be edited out.

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m077 = load('077_identity_chat.sql')

/** Body of one function: from its CREATE line to the next CREATE OR REPLACE / REVOKE block. */
function fnBody(name: string): string {
  const start = m077.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m077.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m077.slice(start, next === -1 ? undefined : start + 10 + next)
}

const FUNCTION_SIGNATURES = [
  'identity_chat_lookup(text)',
  'identity_by_chatwoot_contact(bigint)',
  'identity_resolve_chat(text, text)',
  'identity_attach_chat_contact(uuid, text, text)',
  'identity_phone_usable(text)',
]

describe('077 basis check', () => {
  it('drops the basis CHECK by definition text, never by a hard-coded generated name', () => {
    expect(m077).toMatch(/pg_get_constraintdef\(\w+\.oid\)[^;]*basis/)
    expect(m077).toContain("'public.identity_emails'::regclass")
    expect(m077).toMatch(/DROP CONSTRAINT %I/)
    expect(m077).not.toMatch(/DROP CONSTRAINT identity_emails_basis_check\s*;/)
  })

  it("re-adds identity_emails_basis_check listing 'chat' next to the four old bases", () => {
    const add = m077.slice(m077.indexOf('ADD CONSTRAINT identity_emails_basis_check'))
    expect(add).toMatch(/CHECK \(basis IN \('email', 'phone', 'signup', 'split', 'chat'\)\)/)
    expect((m077.match(/ADD CONSTRAINT identity_emails_basis_check/g) ?? []).length).toBe(1)
  })
})

describe('077 identity_resolve_chat', () => {
  const body = fnBody('identity_resolve_chat')

  it('takes the same global advisory lock as every other resolver (T-83-10)', () => {
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('identity', 0))")
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('identity_resolve_core('))
  })

  it("delegates to identity_resolve_core with the 'chat' basis and no user id (T-83-09)", () => {
    expect(body).toMatch(/identity_resolve_core\(\s*p_email_raw,\s*p_phone_raw,\s*'chat',\s*NULL\s*\)/)
  })

  it('computes customer as account OR booking identity', () => {
    expect(body).toContain('user_id IS NOT NULL')
    expect(body).toContain('public.booking_identity')
  })
})

describe('077 identity_chat_lookup', () => {
  const body = fnBody('identity_chat_lookup')

  it('is a STABLE read with no writes and normalises the email', () => {
    expect(body).toMatch(/\bSTABLE\b/)
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
    expect(body).toContain('identity_normalize_email(')
  })
})

describe('077 identity_by_chatwoot_contact', () => {
  const body = fnBody('identity_by_chatwoot_contact')

  it('is a STABLE read capped at 2 rows (2 = ambiguous for the caller) with no writes', () => {
    expect(body).toMatch(/\bSTABLE\b/)
    expect(body).toContain('LIMIT 2')
    expect(body).toMatch(/ORDER BY c\.created_at/)
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
  })
})

describe('077 identity_attach_chat_contact (D-12)', () => {
  const body = fnBody('identity_attach_chat_contact')

  it('takes the global lock before touching any row', () => {
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('identity', 0))")
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('INSERT INTO'))
  })

  it('skips an email owned by another identity and never merges (T-83-09)', () => {
    expect(body).toContain("'owned_elsewhere'")
    expect(body).not.toMatch(/identity_resolve_core\(/)
    expect(body).not.toMatch(/UPDATE public\.identity_emails/)
    expect(body).not.toMatch(/\buser_id\s*=/)
  })

  it("inserts the email with basis 'chat' and never writes phone_flags", () => {
    expect(body).toMatch(/INSERT INTO public\.identity_emails \(email, identity_id, basis\)\s+VALUES \(v_email, p_identity_id, 'chat'\)/)
    expect(body).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM) public\.phone_flags/)
  })

  it('handles the missing and erasing identity outcomes', () => {
    expect(body).toContain("'identity_missing'")
    expect(body).toContain("'erasing'")
    expect(body).toContain("'shared'")
  })
})

describe('077 identity_phone_usable', () => {
  const body = fnBody('identity_phone_usable')

  it('normalises and refuses a number flagged shared', () => {
    expect(body).toContain('identity_normalize_phone(')
    expect(body).toContain('public.phone_flags')
    expect(body).toMatch(/\bSTABLE\b/)
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
  })
})

describe('077 grants and hardening (T-83-11)', () => {
  it('every function pins search_path, is SECURITY DEFINER and is created exactly once', () => {
    const creates = (m077.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    expect(creates).toBe(FUNCTION_SIGNATURES.length)
    expect((m077.match(/SET search_path = ''/g) ?? []).length).toBe(creates)
    expect((m077.match(/SECURITY DEFINER/g) ?? []).length).toBe(creates)
  })

  it('has a per-function REVOKE and a service_role GRANT for every created function', () => {
    for (const sig of FUNCTION_SIGNATURES) {
      const name = sig.slice(0, sig.indexOf('('))
      expect(m077, `FUNCTION ${name}`).toContain(`FUNCTION public.${name}(`)
      const esc = sig.replace(/[()]/g, '\\$&')
      expect(m077, `REVOKE ${sig}`).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated`),
      )
      expect(m077, `GRANT ${sig}`).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO service_role`))
    }
  })

  it('never writes bookings, customer_profiles, auth.users, booking_identity or phone_flags from a resolver path', () => {
    expect(m077).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.(bookings|customer_profiles|booking_identity|phone_flags)\b/)
    expect(m077).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+auth\.users\b/)
  })
})
