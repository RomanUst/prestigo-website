// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { latestFunctionBody, loadMigration } from './helpers/latest-migration'

// Text contract for migration 088 (Phase 89, plan 89-05; 88 D-23, T-89-15..17). The live behaviour is
// proven by the rolled-back smoke 89-05-smoke.sql, which the orchestrator runs after applying 088. These
// tests pin what must never be edited out: the full 075 body is still there, the new personal data is
// erased, the Stripe ids are cleared only for finished payments, the request guard exists, and the
// SECURITY DEFINER grants are repeated.

const m088 = loadMigration('088_erasure_payment_pii.sql')
const m075 = loadMigration('075_erasure.sql')

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Body of one function in ONE migration text: from its CREATE line up to and including `$$;`. */
function bodyIn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const open = sql.indexOf('AS $$', start)
  const close = sql.indexOf('$$;', open + 5)
  return sql.slice(start, close + 3)
}

/** Every `;`-terminated chunk of the 075 body must still be in the 088 body (nothing edited out). */
function expectSupersetOf075(name: string): void {
  const old = bodyIn(m075, name)
  const next = norm(bodyIn(m088, name))
  const chunks = old
    .split(';')
    .map(norm)
    .filter((c) => c.length > 0)
  expect(chunks.length).toBeGreaterThan(3)
  for (const chunk of chunks) {
    expect(next, `statement missing from 088 ${name}: ${chunk.slice(0, 80)}`).toContain(chunk)
  }
}

describe('088 erasure_anonymise_person (tracer: consent IP nulling through a copy of the 075 function)', () => {
  const body = latestFunctionBody('erasure_anonymise_person')

  it('is the 088 definition (the last one in filename order) and names the payment tables', () => {
    expect(body).toContain('booking_payment_consents')
    expect(body).toContain('booking_manage_tokens')
    expect(body).toContain('booking_payment_notes')
    expect(body).toContain('booking_fee_cases')
    expect(norm(body)).toBe(norm(bodyIn(m088, 'erasure_anonymise_person')))
  })

  it('still contains every statement of the 075 body', () => {
    expectSupersetOf075('erasure_anonymise_person')
  })

  it('nulls the consent ip and user agent for the person\'s bookings', () => {
    expect(norm(body)).toMatch(
      /UPDATE public\.booking_payment_consents pc SET ip = NULL, user_agent = NULL WHERE pc\.booking_id = ANY \(v_ids\)/,
    )
  })

  it('deletes the manage tokens and the operator notes of the person\'s bookings', () => {
    expect(norm(body)).toMatch(/DELETE FROM public\.booking_manage_tokens mt WHERE mt\.booking_id = ANY \(v_ids\)/)
    expect(norm(body)).toMatch(/DELETE FROM public\.booking_payment_notes pn WHERE pn\.booking_id = ANY \(v_ids\)/)
  })

  it('scrubs the free text and the evidence of fee cases but keeps the case row', () => {
    expect(norm(body)).toMatch(
      /UPDATE public\.booking_fee_cases fc SET reason = NULL, contact_note = NULL, evidence = '\{\}'::jsonb WHERE fc\.booking_id = ANY \(v_ids\)/,
    )
    expect(body).not.toMatch(/DELETE FROM public\.booking_fee_cases/)
  })

  it('clears the Stripe ids only inside a condition on terminal payment states', () => {
    const flat = norm(body)
    const at = flat.indexOf('SET stripe_customer_id = NULL')
    expect(at).toBeGreaterThan(-1)
    const stmt = flat.slice(flat.lastIndexOf('UPDATE public.bookings', at), flat.indexOf('GET DIAGNOSTICS n_stripe', at))
    for (const col of [
      'stripe_customer_id',
      'stripe_payment_method_id',
      'setup_intent_id',
      'hold_payment_intent_id',
      'recovery_link_url',
    ]) {
      expect(stmt, col).toContain(`${col} = NULL`)
    }
    expect(stmt).toMatch(/payment_state IN \('captured', 'released', 'cash_settled'\)/)
    // The booking-wide anonymising UPDATE (the first one) never touches the Stripe ids.
    const first = flat.slice(flat.indexOf('UPDATE public.bookings b'), flat.indexOf('GET DIAGNOSTICS n_book'))
    expect(first).not.toMatch(/stripe_|setup_intent_id|hold_payment_intent_id|recovery_link_url/)
  })

  it('refuses to run before the stripe step is recorded, and reports the new counts', () => {
    expect(norm(body)).toMatch(/IF r\.steps -> 'stripe' IS NULL THEN RAISE EXCEPTION 'erasure_anonymise_person: stripe step is not finished'/)
    for (const key of [
      'consents_scrubbed',
      'manage_tokens_deleted',
      'payment_notes_deleted',
      'fee_cases_scrubbed',
      'stripe_ids_cleared',
    ]) {
      expect(body, key).toContain(`'${key}'`)
    }
  })
})

describe('088 request guard', () => {
  const guard = bodyIn(m088, 'erasure_payment_open')

  it('counts a live hold, a pending fee case and a future pickup with a card flow still open', () => {
    const flat = norm(guard)
    expect(flat).toMatch(/payment_state IN \('placing_hold', 'authorized', 'capturing'\)/)
    expect(flat).toMatch(/fee_case_status = 'pending'/)
    expect(flat).toMatch(/FROM public\.booking_fee_cases c WHERE c\.booking_id = b\.id AND c\.status = 'pending'/)
    expect(flat).toMatch(
      /pickup_utc >= now\(\) AND b\.status <> 'cancelled' AND b\.payment_state NOT IN \('none', 'captured', 'released', 'cash_settled'\)/,
    )
  })

  it('erasure_confirm refuses with payment_open BEFORE it writes anything', () => {
    const body = latestFunctionBody('erasure_confirm')
    expect(body).toContain("RETURN 'payment_open'")
    expect(body).toContain('public.erasure_payment_open(v_bookings)')
    expect(body.indexOf("RETURN 'payment_open'")).toBeLessThan(body.indexOf('UPDATE public.erasure_requests'))
    expectSupersetOf075('erasure_confirm')
  })

  it('erasure_scope reports the number of open payments in the preview counts', () => {
    const body = latestFunctionBody('erasure_scope')
    expect(body).toMatch(/'payment_open', v_payment_open/)
    expect(body).toContain('public.erasure_payment_open(v_bookings)')
    // Its closing RETURN gains the new count by design, so the whole-body superset check does not apply;
    // every outcome of the 075 scope is still answered.
    for (const outcome of ['invalid', 'shared_phone', 'not_found', 'already_in_progress', 'ok']) {
      expect(body, outcome).toContain(`'${outcome}'`)
    }
    expect(body).toMatch(/'upcoming', v_upcoming/)
  })

  it('erasure_record_step accepts the stripe step and keeps every old step name', () => {
    const body = latestFunctionBody('erasure_record_step')
    expect(norm(body)).toContain("p_step NOT IN ('chatwoot', 'espocrm', 'verify', 'stripe', 'supabase', 'auth')")
    expect(body).toContain("RAISE EXCEPTION 'erasure_record_step: invalid step'")
  })
})

describe('088 grants (T-89-17)', () => {
  const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', '088_erasure_payment_pii.sql'), 'utf8')

  it('repeats REVOKE FROM PUBLIC, anon, authenticated for every function it replaces or adds', () => {
    for (const sig of [
      'erasure_payment_open(uuid[])',
      'erasure_record_step(uuid, text, jsonb)',
      'erasure_confirm(uuid, uuid)',
      'erasure_anonymise_person(uuid)',
      'erasure_scope(text, text)',
    ]) {
      expect(m088, sig).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`)
    }
  })

  it('grants the saga and admin functions to service_role only, and the internal helper to nobody', () => {
    for (const sig of [
      'erasure_record_step(uuid, text, jsonb)',
      'erasure_confirm(uuid, uuid)',
      'erasure_anonymise_person(uuid)',
      'erasure_scope(text, text)',
    ]) {
      expect(m088, sig).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)
    }
    expect(m088).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.erasure_payment_open/)
    expect(m088).not.toMatch(/GRANT EXECUTE ON FUNCTION [^;]* TO (PUBLIC|anon|authenticated)/)
  })

  it('has the schema-file header and names its ordering after 087', () => {
    expect(raw).toMatch(/Schema FILE only/)
    expect(raw).toMatch(/AFTER 087/)
  })
})
