// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 076 (Phase 83, plan 83-01). The live behaviour is proven
// by the rolled-back smoke 83-01-smoke.sql; these tests pin the guards that must never be edited out.

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m076 = load('076_inbound_webhooks.sql')

/** Body of one function: from its CREATE line to the next CREATE OR REPLACE / REVOKE block. */
function fnBody(name: string): string {
  const start = m076.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m076.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m076.slice(start, next === -1 ? undefined : start + 10 + next)
}

const FUNCTION_SIGNATURES = [
  'webhook_ingest(text, text, text, integer, text, text, uuid, text, timestamptz)',
  'webhook_ingest_espo(text, text, integer, integer, text)',
  'webhook_purge(integer, integer)',
]

describe('076 webhook_deliveries', () => {
  it('is deny-all: RLS on, privileges revoked, no permissive policy', () => {
    expect(m076).toMatch(/ALTER TABLE public\.webhook_deliveries ENABLE ROW LEVEL SECURITY/)
    expect(m076).toMatch(/REVOKE ALL ON public\.webhook_deliveries FROM anon, authenticated/)
    for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(m076, op).toMatch(new RegExp(`CREATE POLICY webhook_deliveries_no_public_\\w+\\s+ON public\\.webhook_deliveries FOR ${op}`))
    }
    expect(m076).not.toMatch(/USING \(true\)|WITH CHECK \(true\)/)
  })

  it('keys on (source, delivery_id) and constrains every column', () => {
    expect(m076).toMatch(/PRIMARY KEY \(source, delivery_id\)/)
    expect(m076).toMatch(/source\s+text\s+NOT NULL CHECK \(source IN \('chatwoot', 'espocrm'\)\)/)
    expect(m076).toMatch(/char_length\(delivery_id\) BETWEEN 8 AND 128/)
    expect(m076).toMatch(/entity_key ~ '\^\(cw:conv\|cw:contact\|espo:contact\):\[0-9a-z\]\{1,24\}\$'/)
    expect(m076).toMatch(/webhook_deliveries_entity_idx\s+ON public\.webhook_deliveries \(source, entity_key, received_at\)/)
  })
})

describe('076 webhook_ingest', () => {
  const body = fnBody('webhook_ingest')

  it('allowlists the four Chatwoot hook types and ties the key to the event type', () => {
    expect(body).toContain("'^hook\\.(chat_intake|chat_resolve|chat_label|chat_contact)$'")
    expect(body).toMatch(/starts_with\(p_key, p_event_type \|\| ':'\)/)
    expect(body).toMatch(/p_source IS DISTINCT FROM 'chatwoot'/)
    expect(body).toMatch(/RAISE EXCEPTION 'webhook_ingest_bad_event'/)
  })

  it('is gated on chat_hooks_start read inside a nested exception block', () => {
    expect(body).toContain("c.key = 'chat_hooks_start'")
    expect(body).toMatch(/BEGIN\s+SELECT c\.value::timestamptz INTO v_start[\s\S]*?EXCEPTION WHEN OTHERS THEN\s+v_start := NULL;\s+END;/)
    expect(body).toMatch(/IF v_start IS NULL THEN\s+RETURN 'off'/)
  })

  it('dedups on conflict, fuses, then enqueues through outbox_enqueue', () => {
    expect(body).toContain('ON CONFLICT DO NOTHING')
    expect(body).toMatch(/RETURN 'duplicate'/)
    expect(body).toMatch(/interval '10 minutes'/)
    expect(body).toMatch(/p_fuse_limit IS NOT NULL/)
    expect(body).toMatch(/RETURN 'fused'/)
    expect(body).toContain('public.outbox_enqueue(')
    expect(body).toMatch(/RETURN 'queued'/)
    expect(body).toMatch(/RETURN 'exists'/)
  })

  it('checks the gate before it writes anything', () => {
    expect(body.indexOf("RETURN 'off'")).toBeLessThan(body.indexOf('INSERT INTO public.webhook_deliveries'))
    expect(body.indexOf('webhook_ingest_bad_event')).toBeLessThan(body.indexOf("c.key = 'chat_hooks_start'"))
  })
})

describe('076 webhook_ingest_espo (D-19)', () => {
  const body = fnBody('webhook_ingest_espo')

  it('validates its inputs and raises on anything malformed', () => {
    expect(body).toContain("p_espo_contact_id !~ '^[0-9a-f]{17}$'")
    expect(body).toContain("p_tag_suffix !~ '^m[1-7]$'")
    expect(body).toMatch(/p_bucket_seconds NOT BETWEEN 10 AND 300/)
    expect(body).toMatch(/RAISE EXCEPTION 'webhook_ingest_espo_bad_input'/)
  })

  it('reads the gate inside a nested exception block and returns off before writing', () => {
    expect(body).toContain("c.key = 'chat_hooks_start'")
    expect(body).toMatch(/BEGIN\s+SELECT c\.value::timestamptz INTO v_start[\s\S]*?EXCEPTION WHEN OTHERS THEN\s+v_start := NULL;\s+END;/)
    expect(body.indexOf("'off'")).toBeLessThan(body.indexOf('INSERT INTO public.webhook_deliveries'))
  })

  it('dedups per content-hash delivery id with source espocrm', () => {
    expect(body).toMatch(/VALUES \('espocrm', p_delivery_id, 'espo:contact:' \|\| p_espo_contact_id\)/)
    expect(body).toContain('ON CONFLICT DO NOTHING')
    expect(body).toContain("'duplicate'")
  })

  it('resolves the person inside the RPC and reports unlinked / erasing', () => {
    expect(body).toMatch(/FROM public\.contact_identities c\s+WHERE c\.espo_contact_id = p_espo_contact_id\s+ORDER BY c\.created_at\s+LIMIT 1/)
    expect(body).toContain("'unlinked'")
    expect(body).toMatch(/v_erasing IS NOT NULL/)
    expect(body).toContain("'erasing'")
  })

  it('fuses, then enqueues a bucketed hook.espo_contact row on the person aggregate', () => {
    expect(body).toContain("'fused'")
    expect(body).toMatch(/p_fuse_limit IS NOT NULL/)
    expect(body).toContain("'hook.espo_contact:' || v_person::text || ':b' || v_bucket::text || p_tag_suffix")
    expect(body).toMatch(/public\.outbox_enqueue\(\s*'hook\.espo_contact',\s*'person',\s*v_person/)
    expect(body).toContain('to_timestamp((v_bucket + 1) * p_bucket_seconds)')
    expect(body).toContain("'queued'")
    expect(body).toContain("'exists'")
  })

  it('returns outcome, idempotency_key and available_at', () => {
    expect(body).toMatch(/RETURNS TABLE\(outcome text, idempotency_key text, available_at timestamptz\)/)
  })
})

describe('076 webhook_purge', () => {
  const body = fnBody('webhook_purge')

  it('clamps both day arguments to 1..365 and deletes per source', () => {
    expect(body).toMatch(/GREATEST\(1, LEAST\(365, [^)]*p_chatwoot_days/)
    expect(body).toMatch(/GREATEST\(1, LEAST\(365, [^)]*p_espo_days/)
    expect(body).toMatch(/d\.source = 'chatwoot'/)
    expect(body).toMatch(/d\.source = 'espocrm'/)
    expect(body).toMatch(/DELETE FROM public\.webhook_deliveries d/)
    expect(body).toMatch(/RETURNS integer/)
  })
})

describe('076 function hardening', () => {
  it.each(FUNCTION_SIGNATURES)('%s: EXECUTE revoked from PUBLIC, anon, authenticated and granted to service_role', (sig) => {
    expect(m076).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`)
    expect(m076).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
  })

  it('every function is SECURITY DEFINER with an empty search_path', () => {
    const fns = (m076.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    expect(fns).toBe(FUNCTION_SIGNATURES.length)
    expect((m076.match(/SET search_path = ''/g) ?? []).length).toBe(fns)
    expect((m076.match(/SECURITY DEFINER/g) ?? []).length).toBe(fns)
  })

  it('no statement writes bookings, customer_profiles or auth.users', () => {
    const writes = m076.match(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[\w.]+/gi) ?? []
    for (const w of writes) {
      expect(w).not.toMatch(/bookings|customer_profiles|auth\.users/i)
    }
  })
})
