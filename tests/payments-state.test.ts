// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { latestCheckValues } from './helpers/latest-migration'
import { createFakePaymentsDb, FAKE_PAYMENT_VOCABULARY } from './helpers/fake-payments-db'

// Phase 88 (PAYF-01, D-05) tracer: the payment vocabulary exists once in SQL (migration 085 CHECKs)
// and once in TypeScript (lib/payments/state.ts), pinned together here, and applyTransition is the
// typed entry point to the apply_payment_transition compare-and-set RPC.

const { rpcMock, dbRef } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  // When set, the service client is the in-memory payments double (Phase 89 tracer); otherwise only rpc is mocked.
  dbRef: { client: null as null | { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> } },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => dbRef.client ?? { rpc: rpcMock },
}))

import {
  PAYMENT_STATES,
  PAYMENT_MODES,
  LEDGER_KINDS,
  TRANSITIONS,
  isLegalTransition,
  applyTransition,
} from '@/lib/payments/state'

const sorted = (xs: Iterable<string>) => [...xs].sort()
const BOOKING = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  rpcMock.mockReset()
  dbRef.client = null
})

describe('payment vocabulary vs the latest migration CHECKs', () => {
  it('PAYMENT_STATES equals bookings_payment_state_check', () => {
    expect(sorted(PAYMENT_STATES)).toEqual(sorted(latestCheckValues('bookings_payment_state_check', 'payment_state')))
  })

  it('PAYMENT_MODES equals bookings_payment_mode_check', () => {
    expect(sorted(PAYMENT_MODES)).toEqual(sorted(latestCheckValues('bookings_payment_mode_check', 'payment_mode')))
  })

  it('LEDGER_KINDS equals booking_payment_events_kind_check and carries the Phase 89 kinds', () => {
    expect(sorted(LEDGER_KINDS)).toEqual(sorted(latestCheckValues('booking_payment_events_kind_check', 'kind')))
    for (const k of ['fee_opened', 'cash_settled', 'cash_reopened']) expect(LEDGER_KINDS).toContain(k)
  })

  it('PAYMENT_STATES contains cash_settled', () => {
    expect(PAYMENT_STATES).toContain('cash_settled')
  })

  it('the fake DB vocabulary equals the TypeScript one (no drift in the double)', () => {
    expect(sorted(FAKE_PAYMENT_VOCABULARY.states)).toEqual(sorted(PAYMENT_STATES))
    expect(sorted(FAKE_PAYMENT_VOCABULARY.kinds)).toEqual(sorted(LEDGER_KINDS))
  })

  it('latestCheckValues throws for an unknown constraint', () => {
    expect(() => latestCheckValues('no_such_check', 'x')).toThrow()
  })
})

describe('TRANSITIONS', () => {
  it('names only known states, as keys and as targets', () => {
    const known = new Set<string>(PAYMENT_STATES)
    expect(sorted(Object.keys(TRANSITIONS))).toEqual(sorted(PAYMENT_STATES))
    for (const targets of Object.values(TRANSITIONS)) {
      for (const t of targets) expect(known.has(t)).toBe(true)
    }
  })

  it('captured and released are terminal', () => {
    expect(TRANSITIONS.captured).toEqual([])
    expect(TRANSITIONS.released).toEqual([])
  })

  it('cash_settled: reachable from card_saved and failed (D-21), reversible to card_saved only (D-22)', () => {
    expect(isLegalTransition(['card_saved'], 'cash_settled')).toBe(true)
    expect(isLegalTransition(['failed'], 'cash_settled')).toBe(true)
    expect(isLegalTransition(['cash_settled'], 'card_saved')).toBe(true)
    expect(isLegalTransition(['released'], 'cash_settled')).toBe(false)
    expect(isLegalTransition(['captured'], 'cash_settled')).toBe(false)
    expect(TRANSITIONS.cash_settled).toEqual(['card_saved'])
  })
})

describe('tracer: cash_settled through applyTransition on the fake DB', () => {
  it('moves a cash_guarantee row card_saved -> cash_settled -> card_saved with one ledger row each', async () => {
    const db = createFakePaymentsDb({ bookings: [{ payment_mode: 'cash_guarantee', payment_state: 'card_saved' }] })
    dbRef.client = db.client
    const id = db.state.bookings[0].id as string

    const settled = await applyTransition({
      bookingId: id,
      from: ['card_saved'],
      to: 'cash_settled',
      event: { key: 'cash_settled:1', kind: 'cash_settled', actor: { type: 'admin', id: 'op' } },
    })
    expect(settled.applied).toBe(true)
    expect(db.state.bookings[0].payment_state).toBe('cash_settled')

    const reopened = await applyTransition({
      bookingId: id,
      from: ['cash_settled'],
      to: 'card_saved',
      event: { key: 'cash_reopened:1', kind: 'cash_reopened', actor: { type: 'admin', id: 'op' } },
    })
    expect(reopened.applied).toBe(true)
    expect(db.state.bookings[0].payment_state).toBe('card_saved')

    expect(db.state.booking_payment_events.map((e) => [e.kind, e.from_state, e.to_state])).toEqual([
      ['cash_settled', 'card_saved', 'cash_settled'],
      ['cash_reopened', 'cash_settled', 'card_saved'],
    ])
  })

  it('a failed card booking can still settle in cash (D-21)', async () => {
    const db = createFakePaymentsDb({ bookings: [{ payment_mode: 'cash_guarantee', payment_state: 'failed' }] })
    dbRef.client = db.client
    const res = await applyTransition({
      bookingId: db.state.bookings[0].id as string,
      from: ['failed'],
      to: 'cash_settled',
      event: { key: 'cash_settled:2', kind: 'cash_settled', actor: { type: 'admin', id: 'op' } },
    })
    expect(res.applied).toBe(true)
  })
})

describe('isLegalTransition', () => {
  it('accepts when every from state lists the target', () => {
    expect(isLegalTransition(['card_saved', 'expired'], 'capturing')).toBe(true)
  })

  it('rejects a move out of a terminal state', () => {
    expect(isLegalTransition(['captured'], 'capturing')).toBe(false)
  })

  it('rejects a skipped step', () => {
    expect(isLegalTransition(['none'], 'card_saved')).toBe(false)
  })

  it('rejects when any one from state lacks the target', () => {
    expect(isLegalTransition(['card_saved', 'captured'], 'capturing')).toBe(false)
  })

  it('rejects an empty from list', () => {
    expect(isLegalTransition([], 'capturing')).toBe(false)
  })
})

describe('applyTransition', () => {
  const event = { key: 'setup_started:si_1', kind: 'setup_started' as const, actor: { type: 'system' as const, id: null } }

  it('throws on an illegal pair and makes no rpc call', async () => {
    await expect(
      applyTransition({ bookingId: BOOKING, from: ['captured'], to: 'capturing', event }),
    ).rejects.toThrow('illegal payment transition')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls apply_payment_transition with snake_case event keys and returns applied', async () => {
    rpcMock.mockResolvedValue({ data: { applied: true, previous_state: 'none', booking: { id: BOOKING } }, error: null })
    const patch = { payment_amount_minor: 4500, payment_currency: 'eur' as const }
    const res = await applyTransition({
      bookingId: BOOKING,
      from: ['none'],
      to: 'checkout_pending',
      patch,
      event: { ...event, stripeObjectId: 'si_1', amountMinor: 4500, currency: 'eur', errorCode: undefined },
    })
    expect(res.applied).toBe(true)
    expect(res.booking).toEqual({ id: BOOKING })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [name, args] = rpcMock.mock.calls[0]
    expect(name).toBe('apply_payment_transition')
    expect(args).toMatchObject({
      p_booking_id: BOOKING,
      p_from: ['none'],
      p_to: 'checkout_pending',
      p_patch: patch,
      p_event: {
        key: 'setup_started:si_1',
        kind: 'setup_started',
        stripe_object_id: 'si_1',
        amount_minor: 4500,
        currency: 'eur',
        actor_type: 'system',
        actor_id: null,
      },
    })
  })

  it('defaults the patch to an empty object', async () => {
    rpcMock.mockResolvedValue({ data: { applied: true }, error: null })
    await applyTransition({ bookingId: BOOKING, from: ['none'], to: 'checkout_pending', event })
    expect(rpcMock.mock.calls[0][1].p_patch).toEqual({})
  })

  it('maps a duplicate result', async () => {
    rpcMock.mockResolvedValue({
      data: { applied: false, duplicate: true, current_state: 'checkout_pending' },
      error: null,
    })
    const res = await applyTransition({ bookingId: BOOKING, from: ['none'], to: 'checkout_pending', event })
    expect(res).toMatchObject({ applied: false, duplicate: true, currentState: 'checkout_pending' })
  })

  it('maps a lost compare-and-set to the current state', async () => {
    rpcMock.mockResolvedValue({ data: { applied: false, current_state: 'captured' }, error: null })
    const res = await applyTransition({ bookingId: BOOKING, from: ['none'], to: 'checkout_pending', event })
    expect(res.applied).toBe(false)
    expect(res.duplicate).toBeUndefined()
    expect(res.currentState).toBe('captured')
  })

  it('requireStatus is sent as p_require_status and a blocked answer maps to statusBlocked (migration 086)', async () => {
    rpcMock.mockResolvedValue({
      data: { applied: false, status_blocked: true, current_state: 'card_saved', current_status: 'cancelled' },
      error: null,
    })
    const res = await applyTransition({
      bookingId: BOOKING,
      from: ['card_saved'],
      to: 'placing_hold',
      event,
      requireStatus: ['confirmed', 'assigned'],
    })
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_require_status: ['confirmed', 'assigned'] })
    expect(res).toEqual({ applied: false, statusBlocked: true, currentState: 'card_saved', currentStatus: 'cancelled' })
  })

  it('without requireStatus no p_require_status is sent (the 085 call shape)', async () => {
    rpcMock.mockResolvedValue({ data: { applied: true }, error: null })
    await applyTransition({ bookingId: BOOKING, from: ['none'], to: 'checkout_pending', event })
    expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_require_status')
  })

  it('an empty requireStatus is refused before any rpc call', async () => {
    await expect(
      applyTransition({ bookingId: BOOKING, from: ['card_saved'], to: 'placing_hold', event, requireStatus: [] }),
    ).rejects.toThrow('illegal payment transition')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('throws payment transition failed on an rpc error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(
      applyTransition({ bookingId: BOOKING, from: ['none'], to: 'checkout_pending', event }),
    ).rejects.toThrow('payment transition failed')
  })

  it('throws payment transition failed on a non-boolean applied', async () => {
    rpcMock.mockResolvedValue({ data: { applied: 'yes' }, error: null })
    await expect(
      applyTransition({ bookingId: BOOKING, from: ['none'], to: 'checkout_pending', event }),
    ).rejects.toThrow('payment transition failed')
    rpcMock.mockResolvedValue({ data: null, error: null })
    await expect(
      applyTransition({ bookingId: BOOKING, from: ['none'], to: 'checkout_pending', event }),
    ).rejects.toThrow('payment transition failed')
  })
})
