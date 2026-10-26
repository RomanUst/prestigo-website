// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 078 (Phase 83, plan 83-03). The live behaviour is proven by
// the rolled-back smoke 83-03-smoke.sql; these tests pin the guards that must never be edited out.

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m078 = load('078_chat_registry.sql')

/** Body of one function: from its CREATE line to the next CREATE OR REPLACE / REVOKE block. */
function fnBody(name: string): string {
  const start = m078.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m078.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m078.slice(start, next === -1 ? undefined : start + 10 + next)
}

/** CREATE TABLE statement text up to the closing ");" at line start. */
function tableBody(name: string): string {
  const start = m078.indexOf(`CREATE TABLE IF NOT EXISTS public.${name}`)
  expect(start, `table ${name} not found`).toBeGreaterThan(-1)
  const end = m078.indexOf('\n);', start)
  return m078.slice(start, end + 3)
}

const FUNCTION_SIGNATURES = [
  'chat_hooks_start()',
  'chat_lead_reserve(text, uuid, bigint, text, text)',
  'chat_lead_set_espo(uuid, text, text)',
  'chat_lead_close(uuid, text, uuid)',
  'chat_lead_link_identity(bigint, uuid)',
  'chat_conversation_record(bigint, bigint, uuid, uuid, text, text, text)',
  'chat_conversation(bigint)',
  'chat_open_leads_for_person(uuid, text[])',
  'chat_erasure_scope(uuid, bigint[], text[])',
  'chat_erase(uuid, bigint[], text[])',
]

describe('078 tables', () => {
  it.each(['chat_leads', 'chat_conversations'])('%s is deny-all RLS', (table) => {
    expect(m078).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
    expect(m078).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`))
    expect(m078).toMatch(new RegExp(`ON public\\.${table} FOR SELECT\\s+USING \\(false\\)`))
    expect(m078).toMatch(new RegExp(`ON public\\.${table} FOR INSERT\\s+WITH CHECK \\(false\\)`))
  })

  it('chat_leads_one_open is a UNIQUE partial index on person_key WHERE open', () => {
    expect(m078).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS chat_leads_one_open\s+ON public\.chat_leads \(person_key\) WHERE open/,
    )
  })

  it('constrains person_key, lead_ref, espo ids and the outcome vocabulary', () => {
    const leads = tableBody('chat_leads')
    expect(leads).toMatch(/lead_ref\s+text\s+NOT NULL UNIQUE/)
    expect(leads).toMatch(/person_key[\s\S]*?\(i:\[0-9a-f\]\{8\}[\s\S]*?\|c:\[1-9\]\[0-9\]\{0,17\}\)/)
    expect(leads).toMatch(/\[0-9a-f\]\{17\}/)
    expect(leads).toMatch(/closed_reason IN \('converted', 'dead', 'closed_in_crm'\)/)
    expect(leads).toMatch(/identity_id\s+uuid\s+REFERENCES public\.contact_identities\(id\) ON DELETE CASCADE/)
    const conv = tableBody('chat_conversations')
    for (const outcome of [
      'lead_created',
      'lead_appended',
      'lead_adopted',
      'customer',
      'known_contact',
      'filtered',
      'no_lead_label',
    ]) {
      expect(conv).toContain(`'${outcome}'`)
    }
  })

  it('stores ids and codes only: no name, email, content or message column', () => {
    for (const table of ['chat_leads', 'chat_conversations']) {
      const body = tableBody(table)
      for (const col of ['name', 'email', 'content', 'message']) {
        expect(body, `${table}.${col}`).not.toMatch(new RegExp(`^\\s*${col}\\s`, 'm'))
        expect(body, `${table}.*${col}`).not.toMatch(new RegExp(`^\\s*\\w*_${col}\\s`, 'm'))
      }
    }
  })
})

describe('078 functions', () => {
  it('chat_lead_reserve takes a per-person advisory lock before reading', () => {
    const body = fnBody('chat_lead_reserve')
    expect(body).toContain("hashtextextended('chat_lead:' ||")
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('SELECT'))
  })

  it.each(FUNCTION_SIGNATURES)('%s is revoked from PUBLIC/anon/authenticated and granted to service_role', (sig) => {
    const escaped = sig.replace(/[()[\]]/g, '\\$&')
    expect(m078).toMatch(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${escaped} FROM PUBLIC, anon, authenticated;`),
    )
    expect(m078).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO service_role;`))
  })

  it('every function is SECURITY DEFINER with an empty search_path', () => {
    const creates = (m078.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    expect(creates).toBe(FUNCTION_SIGNATURES.length)
    expect((m078.match(/SET search_path = ''/g) ?? []).length).toBe(creates)
    expect((m078.match(/SECURITY DEFINER/g) ?? []).length).toBe(creates)
  })

  it('never writes bookings, customer_profiles, auth.users, booking_identity or identity_emails', () => {
    expect(m078).not.toMatch(
      /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?(bookings|customer_profiles|booking_identity|identity_emails)\b/i,
    )
    expect(m078).not.toMatch(/auth\.users/i)
  })

  it('chat_hooks_start returns NULL on an unparseable value', () => {
    const body = fnBody('chat_hooks_start')
    expect(body).toContain("c.key = 'chat_hooks_start'")
    expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RETURN NULL/)
  })

  it('chat_lead_close only updates rows that are still open', () => {
    expect(fnBody('chat_lead_close')).toMatch(/WHERE l\.id = p_chat_lead_id AND l\.open;/)
  })

  it('chat_lead_link_identity locks both person keys and moves only when the identity has no open lead', () => {
    const body = fnBody('chat_lead_link_identity')
    expect((body.match(/pg_advisory_xact_lock/g) ?? []).length).toBe(2)
    expect(body).toContain('LEAST(v_c_key, v_i_key)')
    expect(body).toContain('GREATEST(v_c_key, v_i_key)')
    expect(body).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.chat_leads l WHERE l\.person_key = v_i_key AND l\.open/)
  })

  it('chat_open_leads_for_person returns open rows only', () => {
    expect(fnBody('chat_open_leads_for_person')).toMatch(/WHERE l\.open\b/)
  })

  it('chat_erase deletes chat_conversations before chat_leads', () => {
    const body = fnBody('chat_erase')
    const conv = body.indexOf('DELETE FROM public.chat_conversations')
    const leads = body.indexOf('DELETE FROM public.chat_leads')
    expect(conv).toBeGreaterThan(-1)
    expect(leads).toBeGreaterThan(conv)
  })

  it('erasure never selects the whole registry for an empty request', () => {
    // every predicate is an equality / ANY against a parameter; NULL and empty arrays match nothing
    for (const name of ['chat_erase', 'chat_erasure_scope']) {
      const body = fnBody(name)
      expect(body).toContain('COALESCE(p_chatwoot_contact_ids, ARRAY[]::bigint[])')
      expect(body).toContain('COALESCE(p_phones, ARRAY[]::text[])')
    }
  })
})
