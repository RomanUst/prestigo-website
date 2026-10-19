// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 069 (Phase 82, plan 82-01). The live behaviour is proven
// by the rolled-back smoke 82-01-smoke.sql; these tests pin the guards that must never be edited out.

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m069 = load('069_identity_core_sync_triggers.sql')

/** Body of one function: from its CREATE line to the next CREATE OR REPLACE / REVOKE block. */
function fnBody(name: string): string {
  const start = m069.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m069.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m069.slice(start, next === -1 ? undefined : start + 10 + next)
}

const FUNCTION_SIGNATURES = [
  'identity_normalize_email(text)',
  'identity_is_abandoned(text, text, text)',
  'identity_resolve_core(text, text, text, uuid)',
  'identity_resolve_booking(uuid)',
  'crm_booking(uuid)',
  'identity_person(uuid)',
  'identity_email_owners(text[])',
  'identity_set_espo_contact(uuid, text)',
  'identity_set_chatwoot_contact(uuid, bigint)',
  'enqueue_booking_sync()',
]

describe('069 booking capture trigger', () => {
  it('bookings_crm_sync is AFTER INSERT OR UPDATE OF with status and client_email', () => {
    const trig = m069.slice(m069.indexOf('CREATE TRIGGER bookings_crm_sync'))
    expect(trig).toMatch(/AFTER INSERT OR UPDATE OF/)
    expect(trig).toMatch(/\bstatus\b/)
    expect(trig).toMatch(/\bclient_email\b/)
    expect(trig).toMatch(/ON public\.bookings/)
    expect(trig).toMatch(/EXECUTE FUNCTION public\.enqueue_booking_sync\(\)/)
    expect((m069.match(/CREATE TRIGGER bookings_crm_sync/g) ?? []).length).toBe(1)
  })

  it('leaves the 063 and 067 triggers alone', () => {
    expect(m069).not.toMatch(/bookings_lead_outbox/)
    expect(m069).not.toMatch(/bookings_gcal_sync/)
  })

  it('enqueue_booking_sync is exception-safe twice (body and kick), gated and bucketed', () => {
    const body = fnBody('enqueue_booking_sync')
    expect((body.match(/EXCEPTION WHEN OTHERS/g) ?? []).length).toBe(2)
    expect(body).toContain('crm_sync_start')
    expect(body).toContain('anonymised_at IS NOT NULL')
    expect(body).toContain('IS NOT DISTINCT FROM')
    expect(body).toContain('/ 90')
    expect(body).toContain("interval '90 seconds'")
    expect(body).toContain("'sync.booking'")
    expect(body).toMatch(/outbox_enqueue\(/)
    expect(body).toMatch(/outbox_kick\(v_key\)/)
  })

  it('every synced column is in the trigger column list and in both row comparisons', () => {
    const synced = [
      'status', 'leg', 'booking_reference', 'pickup_utc', 'pickup_date', 'pickup_time', 'origin_address',
      'destination_address', 'trip_type', 'vehicle_class', 'amount_eur', 'amount_czk', 'outbound_amount_czk',
      'return_amount_czk', 'payment_intent_id', 'payment_link_id', 'invoice_number', 'booking_source',
      'client_first_name', 'client_last_name', 'client_email', 'client_phone', 'flight_number', 'driver_id',
      'user_id',
    ]
    const trig = m069.slice(m069.indexOf('CREATE TRIGGER bookings_crm_sync'))
    const body = fnBody('enqueue_booking_sync')
    for (const col of synced) {
      expect(trig, `trigger column ${col}`).toMatch(new RegExp(`\\b${col}\\b`))
      expect(body, `NEW.${col}`).toContain(`NEW.${col}`)
      expect(body, `OLD.${col}`).toContain(`OLD.${col}`)
    }
  })

  it('adds bookings.anonymised_at', () => {
    expect(m069).toMatch(/ALTER TABLE public\.bookings ADD COLUMN IF NOT EXISTS anonymised_at timestamptz/)
  })
})

describe('069 identity resolvers', () => {
  it('both public resolvers take the one global advisory lock', () => {
    const lock = "pg_advisory_xact_lock(hashtextextended('identity', 0))"
    expect(fnBody('identity_resolve_booking')).toContain(lock)
    expect((m069.match(/hashtextextended\('identity', 0\)/g) ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it('the core takes no lock itself and is not granted to service_role (callers hold the lock)', () => {
    expect(fnBody('identity_resolve_core')).not.toContain('pg_advisory_xact_lock')
    expect(m069).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.identity_resolve_core/)
  })

  it('the booking resolver reads the booking itself and honours the freeze hook', () => {
    const body = fnBody('identity_resolve_booking')
    expect(body).toContain('FROM public.bookings')
    expect(body).toContain('anonymised_at')
    expect(body).toContain("'erasing'")
    expect(body).toContain("'abandoned'")
    expect(body).toContain("'source_missing'")
    expect(body).toMatch(/identity_is_abandoned\(/)
  })

  it('the core sets the email basis and returns erasing for a frozen identity', () => {
    const body = fnBody('identity_resolve_core')
    expect(body).toContain('erasing_at')
    expect(body).toContain("'erasing'")
    expect(body).toContain("'no_identity'")
    expect(body).toContain('identity_normalize_email(')
  })

  it('normalises with trim + lower and rejects placeholder domains', () => {
    const body = fnBody('identity_normalize_email')
    expect(body).toContain('lower(btrim(')
    expect(body).toContain('@gnet.local')
    expect(body).toContain('@erased.invalid')
  })
})

describe('069 read contracts', () => {
  it('crm_booking emits driver_name and abandoned', () => {
    const body = fnBody('crm_booking')
    expect(body).toContain("'driver_name'")
    expect(body).toContain("'abandoned'")
    expect(body).toContain("da.status = 'accepted'")
  })

  it('identity_person excludes abandoned bookings and hides shared phones', () => {
    const body = fnBody('identity_person')
    expect(body).toMatch(/NOT public\.identity_is_abandoned\(/)
    expect(body).toMatch(/f\.shared = false/)
  })
})

describe('069 identity tables (D-06, T-82-02)', () => {
  const TABLES = ['contact_identities', 'identity_emails', 'identity_phones', 'phone_flags', 'booking_identity']

  it.each(TABLES)('%s has RLS enabled and privileges revoked from anon/authenticated', (table) => {
    expect(m069).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    expect(m069).toContain(`REVOKE ALL ON public.${table} FROM anon, authenticated`)
    expect(m069).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
  })

  it('deny-all policies for all four operations are created for every table', () => {
    expect(m069).toContain('FOR SELECT USING (false)')
    expect(m069).toContain('FOR INSERT WITH CHECK (false)')
    expect(m069).toContain('FOR UPDATE USING (false) WITH CHECK (false)')
    expect(m069).toContain('FOR DELETE USING (false)')
    for (const table of TABLES) expect(m069).toContain(`'${table}'`)
  })

  it('identity_emails.email is the primary key and a normalised address', () => {
    const tbl = m069.slice(m069.indexOf('CREATE TABLE IF NOT EXISTS public.identity_emails'))
    expect(tbl).toMatch(/email\s+text\s+PRIMARY KEY/)
    expect(tbl).toContain('email = lower(email)')
  })

  it('grants nothing to anyone but service_role', () => {
    const grants = m069.split('\n').filter((l) => /^\s*GRANT\b/.test(l))
    expect(grants.length).toBeGreaterThan(0)
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/)
  })

  it('does not seed integration_config (capture stays off until go-live)', () => {
    expect(m069).not.toMatch(/INSERT INTO public\.integration_config/i)
  })
})

describe('069 function hardening (T-82-03)', () => {
  it.each(FUNCTION_SIGNATURES)('revokes EXECUTE on %s from PUBLIC, anon, authenticated', (sig) => {
    const line = m069
      .split('\n')
      .find((l) => l.includes('REVOKE EXECUTE ON FUNCTION') && l.includes(`public.${sig}`))
    expect(line, `no REVOKE line for ${sig}`).toBeDefined()
    expect(line).toContain('FROM PUBLIC, anon, authenticated')
  })

  it('every function pins search_path', () => {
    const fnCount = (m069.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length
    const pinned = (m069.match(/SET search_path = ''/g) ?? []).length
    expect(fnCount).toBeGreaterThan(0)
    expect(pinned).toBe(fnCount)
  })

  it('uses no dynamic SQL inside a function (only the policy DO block runs EXECUTE format)', () => {
    const dynamic = m069.match(/\bEXECUTE\s+(?!FUNCTION|ON\b)/g) ?? []
    // 8 EXECUTE format(...) statements in the policy DO block, none anywhere else.
    expect(dynamic.length).toBe(8)
  })
})
