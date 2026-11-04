// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { latestFunctionBody, loadMigration } from './helpers/latest-migration'
import { createFakePaymentsDb } from './helpers/fake-payments-db'

// Text-level contract of migration 086 (88-REVIEW A-WR-04, C-WR-01): apply_payment_transition gains the optional
// booking status gate p_require_status, read under the same row lock as payment_state. Plus the fake mirrors it.

const m086 = loadMigration('086_payment_transition_status_gate.sql')
const SIG6 = 'uuid, text[], text, jsonb, jsonb, text[]'

describe('086 apply_payment_transition status gate', () => {
  const body = latestFunctionBody('apply_payment_transition')

  it('replaces the 5-argument function by one with p_require_status text[] DEFAULT NULL', () => {
    expect(m086).toContain('DROP FUNCTION IF EXISTS public.apply_payment_transition(uuid, text[], text, jsonb, jsonb);')
    expect(body).toMatch(/p_require_status text\[\] DEFAULT NULL/)
  })

  it('re-revokes PUBLIC / anon / authenticated and grants service_role on the new signature only', () => {
    expect(m086).toContain(`REVOKE EXECUTE ON FUNCTION public.apply_payment_transition(${SIG6}) FROM PUBLIC, anon, authenticated;`)
    expect(m086).toContain(`GRANT EXECUTE ON FUNCTION public.apply_payment_transition(${SIG6}) TO service_role;`)
    expect(m086).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_payment_transition[^;]*TO (PUBLIC|anon|authenticated)/)
    expect(body).toContain('SECURITY DEFINER')
    expect(body).toContain("SET search_path = ''")
  })

  it('reads the status under the payment row lock and refuses before any write', () => {
    expect(body).toMatch(/SELECT b\.payment_state, b\.status INTO v_prev, v_status[\s\S]*?FOR UPDATE;/)
    const gate = body.indexOf('p_require_status IS NOT NULL')
    expect(gate).toBeGreaterThan(body.indexOf('FOR UPDATE;'))
    expect(gate).toBeLessThan(body.indexOf('UPDATE public.bookings b SET'))
    expect(body).toMatch(/NOT COALESCE\(v_status = ANY \(p_require_status\), false\)/)
    expect(body).toContain("'status_blocked', true")
  })

  it('keeps every 085 rule of the compare-and-set', () => {
    expect(body).toMatch(/b\.payment_state = ANY \(p_from\)/)
    expect(body).toMatch(/COALESCE\(b\.payment_lease_until > now\(\), false\)/)
    expect(body).toMatch(/ON CONFLICT \(booking_id, event_key\) DO NOTHING/)
    expect(body).toMatch(/v_patch \? 'payment_intent_id' AND p_to NOT IN \('captured', 'balance_due'\)/)
  })
})

describe('fake-payments-db mirrors the 086 status gate', () => {
  const ev = (key: string) => ({ key, kind: 'hold_started', actor_type: 'system', actor_id: null })

  it('a status outside p_require_status: status_blocked, nothing written', async () => {
    const db = createFakePaymentsDb({ bookings: [{ status: 'cancelled', payment_mode: 'card_hold', payment_state: 'card_saved' }] })
    const id = db.state.bookings[0].id as string
    const res = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id,
      p_from: ['card_saved'],
      p_to: 'placing_hold',
      p_patch: {},
      p_event: ev('k1'),
      p_require_status: ['confirmed', 'assigned'],
    })
    expect(res.data).toEqual({ applied: false, status_blocked: true, current_state: 'card_saved', current_status: 'cancelled' })
    expect(db.state.bookings[0].payment_state).toBe('card_saved')
    expect(db.state.booking_payment_events).toHaveLength(0)
  })

  it('an allowed status, or no p_require_status at all, applies as in 085', async () => {
    const db = createFakePaymentsDb({ bookings: [{ status: 'confirmed', payment_mode: 'card_hold', payment_state: 'card_saved' }] })
    const id = db.state.bookings[0].id as string
    const ok = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id,
      p_from: ['card_saved'],
      p_to: 'card_saved',
      p_patch: {},
      p_event: ev('k2'),
      p_require_status: ['confirmed'],
    })
    expect(ok.data).toMatchObject({ applied: true })
    const legacy = await db.client.rpc('apply_payment_transition', {
      p_booking_id: id,
      p_from: ['card_saved'],
      p_to: 'card_saved',
      p_patch: {},
      p_event: ev('k3'),
    })
    expect(legacy.data).toMatchObject({ applied: true })
  })
})
