// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { BOOKING_STATUSES } from '@/lib/booking-status'
import { UI_TRANSITIONS, VALID_TRANSITIONS } from '@/lib/booking-transitions'
import {
  planMove,
  completeEffect,
  hasCancelMoney,
  showsPaymentBadge,
  type MoveBooking,
  type MoveSurface,
} from '@/components/admin/bookingMoves'

const SURFACES: MoveSurface[] = ['board', 'panel']

function b(status: string, extra: Partial<MoveBooking> = {}): MoveBooking {
  return { status, ...extra }
}

describe('planMove: UI_TRANSITIONS gate (matrix)', () => {
  const combos: Array<[string, string, MoveSurface]> = []
  for (const from of BOOKING_STATUSES) {
    for (const to of BOOKING_STATUSES) {
      for (const surface of SURFACES) combos.push([from, to, surface])
    }
  }

  it('covers all 200 (from, to, surface) combinations', () => {
    expect(combos).toHaveLength(200)
  })

  it.each(combos)('%s -> %s on %s is non-rejected exactly when UI_TRANSITIONS allows it', (from, to, surface) => {
    const allowed = (UI_TRANSITIONS[from] ?? []).includes(to)
    // Use a booking with no money so the kind is never influenced by payment data.
    expect(planMove(b(from), to, surface).kind !== 'rejected').toBe(allowed)
    // And with a card hold: still the same allowed/rejected split.
    expect(planMove(b(from, { payment_mode: 'card_hold', payment_amount_minor: 8500, payment_currency: 'eur' }), to, surface).kind !== 'rejected').toBe(allowed)
  })
})

describe('planMove: carried-forward rejections', () => {
  it.each(SURFACES)('rejects confirmed -> completed and assigned -> completed on %s (VALID_TRANSITIONS allows them)', (s) => {
    expect(VALID_TRANSITIONS.confirmed).toContain('completed')
    expect(VALID_TRANSITIONS.assigned).toContain('completed')
    expect(planMove(b('confirmed'), 'completed', s).kind).toBe('rejected')
    expect(planMove(b('assigned'), 'completed', s).kind).toBe('rejected')
  })

  it.each(SURFACES)('rejects a move to the current status on %s', (s) => {
    expect(planMove(b('en_route'), 'en_route', s).kind).toBe('rejected')
  })

  it.each(SURFACES)('rejects an unknown status on %s', (s) => {
    expect(planMove(b('bogus'), 'confirmed', s).kind).toBe('rejected')
  })
})

describe('planMove: assigned and no_show always route to a dialog or picker', () => {
  it.each(SURFACES)('confirmed -> assigned is the driver picker on %s', (s) => {
    expect(planMove(b('confirmed'), 'assigned', s)).toEqual({ kind: 'assign_picker' })
  })

  it.each(SURFACES)('on_location -> no_show is the no-show dialog on %s, never direct', (s) => {
    const plan = planMove(b('on_location', { payment_mode: 'card_hold' }), 'no_show', s)
    expect(plan).toEqual({ kind: 'no_show_dialog' })
    expect(plan.kind).not.toBe('direct')
  })
})

describe('planMove: cancelled', () => {
  it('board: cancel dialog for every booking, with or without money', () => {
    expect(planMove(b('confirmed'), 'cancelled', 'board')).toEqual({ kind: 'cancel_dialog' })
    expect(planMove(b('confirmed', { payment_mode: 'card_hold' }), 'cancelled', 'board')).toEqual({ kind: 'cancel_dialog' })
    expect(planMove(b('assigned', { payment_mode: 'pay_now' }), 'cancelled', 'board')).toEqual({ kind: 'cancel_dialog' })
  })

  it('panel: cancel dialog for card_hold and cash_guarantee', () => {
    expect(planMove(b('confirmed', { payment_mode: 'card_hold' }), 'cancelled', 'panel')).toEqual({ kind: 'cancel_dialog' })
    expect(planMove(b('confirmed', { payment_mode: 'cash_guarantee' }), 'cancelled', 'panel')).toEqual({ kind: 'cancel_dialog' })
  })

  it('panel: cancel dialog when a payment intent exists', () => {
    expect(planMove(b('confirmed', { payment_mode: 'pay_now', payment_intent_id: 'pi_123' }), 'cancelled', 'panel')).toEqual({ kind: 'cancel_dialog' })
  })

  it('panel: direct (the existing status PATCH) when there is no money', () => {
    expect(planMove(b('confirmed'), 'cancelled', 'panel')).toEqual({ kind: 'direct' })
    expect(planMove(b('confirmed', { payment_mode: 'pay_now', payment_intent_id: '' }), 'cancelled', 'panel')).toEqual({ kind: 'direct' })
    expect(planMove(b('confirmed', { payment_mode: null, payment_intent_id: null }), 'cancelled', 'panel')).toEqual({ kind: 'direct' })
  })
})

describe('planMove: completed', () => {
  const FROM = ['en_route', 'on_location', 'on_board']

  it.each(FROM)('%s: card_hold states the capture from the row amount and currency', (from) => {
    for (const s of SURFACES) {
      expect(planMove(b(from, { payment_mode: 'card_hold', payment_amount_minor: 8500, payment_currency: 'eur' }), 'completed', s)).toEqual({
        kind: 'confirm_complete',
        effect: { kind: 'capture', amountMinor: 8500, currency: 'eur' },
      })
    }
  })

  it.each(FROM)('%s: cash_guarantee confirms the cash effect', (from) => {
    for (const s of SURFACES) {
      expect(planMove(b(from, { payment_mode: 'cash_guarantee' }), 'completed', s)).toEqual({
        kind: 'confirm_complete',
        effect: { kind: 'cash' },
      })
    }
  })

  it.each(FROM)('%s: GNet partner booking has no money effect, direct', (from) => {
    for (const s of SURFACES) {
      expect(planMove(b(from, { booking_source: 'gnet', payment_mode: 'card_hold', payment_amount_minor: 8500, payment_currency: 'eur' }), 'completed', s)).toEqual({ kind: 'direct' })
      expect(planMove(b(from, { booking_source: 'gnet', payment_mode: 'cash_guarantee' }), 'completed', s)).toEqual({ kind: 'direct' })
    }
  })

  it.each(FROM)('%s: pay_now and no payment_mode are direct', (from) => {
    for (const s of SURFACES) {
      expect(planMove(b(from, { payment_mode: 'pay_now' }), 'completed', s)).toEqual({ kind: 'direct' })
      expect(planMove(b(from, { payment_mode: null }), 'completed', s)).toEqual({ kind: 'direct' })
      expect(planMove(b(from), 'completed', s)).toEqual({ kind: 'direct' })
    }
  })

  it('keeps an unknown currency as null and a missing amount as null', () => {
    expect(planMove(b('en_route', { payment_mode: 'card_hold', payment_amount_minor: 8500, payment_currency: 'usd' }), 'completed', 'board')).toEqual({
      kind: 'confirm_complete',
      effect: { kind: 'capture', amountMinor: 8500, currency: null },
    })
    expect(planMove(b('en_route', { payment_mode: 'card_hold' }), 'completed', 'board')).toEqual({
      kind: 'confirm_complete',
      effect: { kind: 'capture', amountMinor: null, currency: null },
    })
  })
})

describe('planMove: plain forward moves are direct', () => {
  it.each(SURFACES)('en_route -> on_location, on_location -> on_board, unpaid/pending -> confirmed on %s', (s) => {
    expect(planMove(b('en_route'), 'on_location', s)).toEqual({ kind: 'direct' })
    expect(planMove(b('on_location'), 'on_board', s)).toEqual({ kind: 'direct' })
    expect(planMove(b('unpaid'), 'confirmed', s)).toEqual({ kind: 'direct' })
    expect(planMove(b('pending'), 'confirmed', s)).toEqual({ kind: 'direct' })
    expect(planMove(b('assigned'), 'en_route', s)).toEqual({ kind: 'direct' })
  })
})

describe('helpers', () => {
  it('showsPaymentBadge: card_hold and cash_guarantee only', () => {
    expect(showsPaymentBadge({ payment_mode: 'card_hold' })).toBe(true)
    expect(showsPaymentBadge({ payment_mode: 'cash_guarantee' })).toBe(true)
    expect(showsPaymentBadge({ payment_mode: 'pay_now' })).toBe(false)
    expect(showsPaymentBadge({ payment_mode: null })).toBe(false)
    expect(showsPaymentBadge({})).toBe(false)
  })

  it('hasCancelMoney: badge modes or a non-empty payment intent', () => {
    expect(hasCancelMoney({ payment_mode: 'card_hold' })).toBe(true)
    expect(hasCancelMoney({ payment_mode: 'pay_now', payment_intent_id: 'pi_1' })).toBe(true)
    expect(hasCancelMoney({ payment_mode: 'pay_now', payment_intent_id: '' })).toBe(false)
    expect(hasCancelMoney({})).toBe(false)
  })

  it('completeEffect: null for a partner and for no money', () => {
    expect(completeEffect(b('on_board', { booking_source: 'gnet', payment_mode: 'card_hold' }))).toBeNull()
    expect(completeEffect(b('on_board', { payment_mode: 'pay_now' }))).toBeNull()
    expect(completeEffect(b('on_board', { payment_mode: 'cash_guarantee' }))).toEqual({ kind: 'cash' })
  })
})
