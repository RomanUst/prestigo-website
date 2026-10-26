// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 079 (Phase 83 code-review fixes CR-01..CR-03). Live behaviour
// is proven by the rolled-back smoke 83-REVIEW-fix-smoke.sql; these tests pin the guards that must never
// be edited out.

const m079 = readFileSync(join(process.cwd(), 'supabase', 'migrations', '079_webhook_security_fixes.sql'), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')

function fnBody(name: string): string {
  const start = m079.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m079.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m079.slice(start, next === -1 ? undefined : start + 10 + next)
}

describe('079 CR-01: chat resolve never merges by phone', () => {
  const body = fnBody('identity_resolve_chat')

  it('calls the shared core with the email and a NULL phone', () => {
    expect(body).toMatch(/identity_resolve_core\(p_email_raw, NULL, 'chat', NULL\)/)
    expect(body).not.toMatch(/identity_resolve_core\([^)]*p_phone_raw/)
  })

  it('stores the phone only through the no-merge attach path', () => {
    expect(body).toMatch(/identity_attach_chat_contact\(v_id, NULL, p_phone_raw\)/)
    expect(body).not.toMatch(/INSERT INTO public\.identity_emails/)
    expect(body).not.toMatch(/phone_flags/)
  })

  it('keeps the global identity lock', () => {
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('identity', 0))")
  })
})

describe('079 CR-02: EspoCRM dedup only inside one hour', () => {
  const body = fnBody('webhook_ingest_espo')

  it('refreshes an older row with the same content hash instead of dropping the delivery', () => {
    expect(body).toMatch(/ON CONFLICT \(source, delivery_id\) DO UPDATE\s+SET received_at = now\(\)\s+WHERE d\.received_at < now\(\) - interval '1 hour'/)
    expect(body).not.toMatch(/ON CONFLICT DO NOTHING/)
  })

  it('keeps the input guard, the forward-only gate and the erasing check', () => {
    expect(body).toContain('webhook_ingest_espo_bad_input')
    expect(body).toContain("c.key = 'chat_hooks_start'")
    expect(body).toContain("'erasing'::text")
  })
})

describe('079 CR-03: erasure never reaches another identity through a shared contact id or phone', () => {
  for (const name of ['chat_erasure_scope', 'chat_erase']) {
    it(`${name}: contact-id and phone matches require identity_id IS NULL`, () => {
      const body = fnBody(name)
      expect(body).toMatch(/l\.identity_id = p_identity_id\s+OR \(l\.identity_id IS NULL/)
      expect(body).toMatch(/c\.identity_id IS NULL\s+AND c\.chatwoot_contact_id = ANY/)
      // no unguarded "OR l.chatwoot_contact_id = ANY" / "OR l.phone = ANY" at the top level
      expect(body).not.toMatch(/OR l\.chatwoot_contact_id = ANY/)
      expect(body).not.toMatch(/OR c\.chatwoot_contact_id = ANY/)
    })
  }
})

describe('079 grants', () => {
  const sigs = [
    'identity_resolve_chat(text, text)',
    'webhook_ingest_espo(text, text, integer, integer, text)',
    'chat_erasure_scope(uuid, bigint[], text[])',
    'chat_erase(uuid, bigint[], text[])',
  ]
  it.each(sigs)('%s is SECURITY DEFINER-safe: revoked from PUBLIC/anon/authenticated, granted to service_role', (sig) => {
    expect(m079).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`)
    expect(m079).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
  })

  it('every function sets an empty search_path', () => {
    const defs = m079.match(/CREATE OR REPLACE FUNCTION/g) ?? []
    const paths = m079.match(/SET search_path = ''/g) ?? []
    expect(defs).toHaveLength(4)
    expect(paths).toHaveLength(4)
  })
})
