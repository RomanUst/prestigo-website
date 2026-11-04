// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { latestCheckValues } from './helpers/latest-migration'

// Phase 88 (PAYF-01, D-05) tracer: the payment vocabulary exists once in SQL (migration 085 CHECKs)
// and once in TypeScript (lib/payments/state.ts), pinned together here, and applyTransition is the
// typed entry point to the apply_payment_transition compare-and-set RPC.

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcMock }),
}))

import {
  PAYMENT_STATES,
  PAYMENT_MODES,
  TRANSITIONS,
  isLegalTransition,
  applyTransition,
} from '@/lib/payments/state'

const sorted = (xs: Iterable<string>) => [...xs].sort()
const BOOKING = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  rpcMock.mockReset()
})

describe('payment vocabulary vs the latest migration CHECKs', () => {
  it('PAYMENT_STATES equals bookings_payment_state_check', () => {
    expect(sorted(PAYMENT_STATES)).toEqual(sorted(latestCheckValues('bookings_payment_state_check', 'payment_state')))
  })

  it('PAYMENT_MODES equals bookings_payment_mode_check', () => {
    expect(sorted(PAYMENT_MODES)).toEqual(sorted(latestCheckValues('bookings_payment_mode_check', 'payment_mode')))
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
