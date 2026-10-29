// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Text-level contract tests for migration 080 (Phase 84, plan 84-01): the read-only panel_bookings RPC
// behind the Chatwoot Dashboard App. The live behaviour is proven by the rolled-back smoke
// 84-01-smoke.sql; these tests pin the guards that must never be edited out.

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

const m080 = load('080_panel_bookings.sql')

/** Body of the function: from its CREATE line to the REVOKE block. */
function fnBody(): string {
  const start = m080.indexOf('FUNCTION public.panel_bookings(')
  expect(start, 'panel_bookings not found').toBeGreaterThan(-1)
  const rest = m080.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m080.slice(start, next === -1 ? undefined : start + 10 + next)
}

const ROW_KEYS = [
  'id',
  'booking_reference',
  'status',
  'leg',
  'trip_type',
  'pickup_utc',
  'pickup_date',
  'pickup_time',
  'origin_address',
  'destination_address',
  'hours',
  'vehicle_class',
  'passengers',
  'luggage',
  'amount_eur',
  'outbound_amount_czk',
  'return_amount_czk',
  'paid_at',
  'payment_link_url',
  'flight_number',
  'special_requests',
  'driver_name',
  'trip_progress',
  'trip_progress_updated_at',
]

const FORBIDDEN_IN_BODY = [
  'client_email',
  'client_phone',
  'client_first_name',
  'client_last_name',
  'operator_notes',
  'payment_intent_id',
  'trip_token',
]

describe('080 panel_bookings: shape and privileges', () => {
  const body = fnBody()

  it('defines exactly one function, STABLE SECURITY DEFINER with an empty search_path', () => {
    expect((m080.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(1)
    expect((m080.match(/CREATE OR REPLACE FUNCTION public\.panel_bookings\(/g) ?? []).length).toBe(1)
    expect(body).toMatch(/\bSTABLE\b/)
    expect(body).toMatch(/SECURITY DEFINER/)
    expect(body).toMatch(/SET search_path = ''/)
    expect(body).toMatch(/RETURNS jsonb/)
    expect(body).toMatch(/p_email\s+text,\s*p_phone\s+text,\s*p_conversation_id\s+bigint/)
  })

  it('search_path guard count equals function count', () => {
    expect((m080.match(/SET search_path = ''/g) ?? []).length).toBe(
      (m080.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length,
    )
  })

  it('revokes from PUBLIC, anon, authenticated and grants service_role for (text, text, bigint)', () => {
    expect(m080).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.panel_bookings\(text, text, bigint\) FROM PUBLIC, anon, authenticated;/,
    )
    expect(m080).toMatch(/GRANT EXECUTE ON FUNCTION public\.panel_bookings\(text, text, bigint\) TO service_role;/)
  })

  it('never writes (PANEL-02)', () => {
    expect(m080).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im)
    expect(m080).not.toMatch(/\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE\s+TABLE)\b/i)
    expect(m080).not.toMatch(/\bUPDATE\s+public\./i)
    expect(m080).not.toMatch(/PERFORM\s+public\.outbox_enqueue/)
    expect(m080).not.toMatch(/pg_advisory_xact_lock/)
  })
})

describe('080 panel_bookings: identity rules (D-10, D-11)', () => {
  const body = fnBody()

  it('reuses the 069/072 helpers instead of re-implementing normalisation', () => {
    expect(body).toMatch(/public\.identity_normalize_email\(/)
    expect(body).toMatch(/public\.identity_is_abandoned\(/)
  })

  it('returns only bookings linked through booking_identity, minus anonymised and abandoned', () => {
    expect(body).toMatch(/public\.booking_identity/)
    expect(body).toMatch(/anonymised_at IS NULL/)
    expect(body).toMatch(/NOT public\.identity_is_abandoned\(/)
  })

  it('never matches on a passenger or any booking contact column', () => {
    for (const col of FORBIDDEN_IN_BODY) {
      expect(body, `body mentions ${col}`).not.toMatch(new RegExp(`\\b${col}\\b`))
    }
    expect(body).not.toMatch(/\bd\.phone\b/)
    expect(body).not.toMatch(/\bd\.email\b/)
    expect(body).not.toMatch(/\bdr\.(phone|email)\b/)
    expect(body).not.toMatch(/\bacc\.(phone|email)\b/)
  })

  it('email owns the identity: it comes from identity_emails and the erasing flag is honoured', () => {
    expect(body).toMatch(/public\.identity_emails/)
    expect(body).toMatch(/public\.contact_identities/)
    expect(body).toMatch(/erasing_at/)
  })

  it('the erasing branch returns identity_found false, zero totals, no rows and no Lead', () => {
    expect(body).toMatch(/'identity_found',\s*false/)
    expect(body).toMatch(/'espo_lead_id',\s*NULL/)
    expect(body).toMatch(/'rows',\s*'\[\]'::jsonb/)
  })
})

describe('080 panel_bookings: projection allowlist (D-06) and cap (D-05)', () => {
  const body = fnBody()
  const build = body.slice(body.indexOf('jsonb_build_object'))

  it('builds each row with an explicit key list', () => {
    for (const key of ROW_KEYS) {
      expect(build, `row key ${key}`).toContain(`'${key}'`)
    }
  })

  it('projects only the driver name from drivers', () => {
    expect(body).toMatch(/dr\.name/)
    expect(body).toMatch(/da\.status = 'accepted'/)
    expect(body).toMatch(/ORDER BY da\.created_at DESC\s+LIMIT 1/)
  })

  it('caps rows at 200 with future bookings first and totals over all eligible rows', () => {
    expect(body).toMatch(/LIMIT 200/)
    expect(body).toMatch(/ORDER BY b\.pickup_utc DESC NULLS LAST,\s*b\.pickup_date DESC,\s*b\.pickup_time DESC/)
    expect(body).toMatch(/'total'/)
    expect(body).toMatch(/'trip_count'/)
    expect(body).toMatch(/'spent_eur'/)
  })

  it('counter rule parity with chatwoot-mapping: non-return, non-cancelled, five value statuses', () => {
    expect(body).toMatch(/leg IS DISTINCT FROM 'return'/)
    expect(body).toMatch(/status <> 'cancelled'/)
    expect(body).toMatch(/'confirmed',\s*'assigned',\s*'en_route',\s*'on_location',\s*'completed'/)
    expect(body).toMatch(/0\.04/)
    expect(body).toMatch(/round_trip/)
  })

  it('never casts pickup text columns (a cast could raise on a bad value)', () => {
    expect(body).not.toMatch(/pickup_date\s*::/)
    expect(body).not.toMatch(/pickup_time\s*::/)
    expect(body).not.toMatch(/::\s*date\b/i)
  })
})
