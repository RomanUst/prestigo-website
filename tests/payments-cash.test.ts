// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

/**
 * Phase 89 plan 89-12 (CASH-04, D-21, D-22): lib/payments/cash.ts, the cash settlement of a cash_guarantee booking.
 * settleCash / reopenCash go through applyTransition only; the ledger keeps every settle and every reopen as its own row.
 */

const { world, mockDeactivateLink } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
  },
  mockDeactivateLink: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db!.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/stripe-payment-links', () => ({ deactivateBookingPaymentLink: mockDeactivateLink }))

import { CASH_TRIP_STATUSES, addPaymentNote, reopenCash, settleCash } from '@/lib/payments/cash'

const ID = '77777777-7777-4777-8777-777777777777'
const ADMIN = { type: 'admin', id: 'admin-1' } as const
const DRIVER = { type: 'system', id: 'driver_trip' } as const

let db: FakePaymentsDb

function seed(over: Record<string, unknown> = {}) {
  db = createFakePaymentsDb({
    bookings: [
      {
        id: ID,
        status: 'completed',
        completed_at: new Date().toISOString(),
        booking_source: 'web',
        payment_mode: 'cash_guarantee',
        payment_state: 'card_saved',
        payment_currency: 'eur',
        payment_amount_minor: 8000,
        stripe_payment_method_id: 'pm_ok',
        ...over,
      },
    ],
  })
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))
const notes = () => db.state.booking_payment_notes.filter((n) => n.booking_id === ID)

beforeEach(() => {
  vi.clearAllMocks()
  mockDeactivateLink.mockResolvedValue(undefined)
})

describe('settleCash', () => {
  it('card_saved -> cash_settled with one ledger row keyed cash_settled:<id>:0 and the actor', async () => {
    seed()
    expect(await settleCash(row(), ADMIN)).toBe('settled')
    expect(row().payment_state).toBe('cash_settled')
    expect(ledger('cash_settled')).toEqual([expect.objectContaining({ event_key: `cash_settled:${ID}:0`, actor_type: 'admin', actor_id: 'admin-1' })])
  })

  it('the driver path settles as a system actor with the driver id', async () => {
    seed()
    expect(await settleCash(row(), DRIVER)).toBe('settled')
    expect(ledger('cash_settled')[0]).toMatchObject({ actor_type: 'system', actor_id: 'driver_trip' })
  })

  it('failed -> cash_settled, and the recovery link and the failure noise are cleared', async () => {
    seed({
      payment_state: 'failed',
      recovery_link_id: 'plink_1',
      recovery_link_url: 'https://pay.example/x',
      last_payment_error: 'card_declined',
      payment_failed_at: new Date().toISOString(),
      payment_retry_at: new Date().toISOString(),
    })
    expect(await settleCash({ ...row() }, ADMIN)).toBe('settled')
    expect(row()).toMatchObject({
      payment_state: 'cash_settled',
      recovery_link_id: null,
      recovery_link_url: null,
      last_payment_error: null,
      payment_failed_at: null,
      payment_retry_at: null,
    })
    expect(mockDeactivateLink).toHaveBeenCalledWith('plink_1')
  })

  it('a replay answers replay and writes nothing', async () => {
    seed()
    expect(await settleCash(row(), ADMIN)).toBe('settled')
    expect(await settleCash(row(), DRIVER)).toBe('replay')
    expect(await settleCash({ ...row(), payment_state: 'card_saved' }, DRIVER)).toBe('replay') // stale snapshot, the database decides
    expect(ledger('cash_settled')).toHaveLength(1)
  })

  it.each(['cancelled', 'no_show', 'pending', 'unpaid'])('a %s booking is refused inside the compare-and-set', async (status) => {
    seed({ status })
    expect(await settleCash(row(), ADMIN)).toBe('not_allowed')
    expect(row().payment_state).toBe('card_saved')
    expect(ledger()).toHaveLength(0)
  })

  it.each(['confirmed', 'assigned', 'en_route', 'on_location', 'on_board', 'completed'])('a %s trip can be settled', async (status) => {
    seed({ status })
    expect(CASH_TRIP_STATUSES).toContain(status)
    expect(await settleCash(row(), ADMIN)).toBe('settled')
  })

  it.each(['authorized', 'captured', 'released', 'checkout_pending', 'none', 'expired', 'placing_hold', 'capturing'])(
    'state %s is refused',
    async (payment_state) => {
      seed({ payment_state })
      expect(await settleCash(row(), ADMIN)).toBe('not_allowed')
      expect(row().payment_state).toBe(payment_state)
      expect(ledger()).toHaveLength(0)
    },
  )

  it('a card_hold, a pay-now and a partner booking are refused', async () => {
    for (const over of [{ payment_mode: 'card_hold' }, { payment_mode: 'pay_now' }, { booking_source: 'gnet', payment_mode: 'partner' }]) {
      seed(over)
      expect(await settleCash(row(), ADMIN)).toBe('not_allowed')
      expect(ledger()).toHaveLength(0)
    }
  })
})

describe('reopenCash', () => {
  it('cash_settled -> card_saved with a cash_reopened row and the note in booking_payment_notes', async () => {
    seed()
    await settleCash(row(), DRIVER)
    expect(await reopenCash(row(), ADMIN, 'driver tapped by mistake')).toBe('reopened')
    expect(row().payment_state).toBe('card_saved')
    expect(ledger('cash_reopened')).toEqual([expect.objectContaining({ event_key: `cash_reopened:${ID}:1`, actor_type: 'admin' })])
    expect(notes()).toEqual([expect.objectContaining({ kind: 'cash_reopen', note: 'driver tapped by mistake', created_by: 'admin-1' })])
    expect(JSON.stringify(db.state.booking_payment_events)).not.toContain('tapped by mistake')
  })

  it('settle, reopen, settle: three rows in order, each with its own key', async () => {
    seed()
    await settleCash(row(), DRIVER)
    await reopenCash(row(), ADMIN, 'wrong tap')
    expect(await settleCash(row(), ADMIN)).toBe('settled')
    const rows = ledger().filter((e) => e.kind === 'cash_settled' || e.kind === 'cash_reopened')
    expect(rows.map((e) => e.kind)).toEqual(['cash_settled', 'cash_reopened', 'cash_settled'])
    expect(rows.map((e) => e.event_key)).toEqual([`cash_settled:${ID}:0`, `cash_reopened:${ID}:1`, `cash_settled:${ID}:1`])
    // A second reopen of the second settlement gets its own key as well.
    expect(await reopenCash(row(), ADMIN, 'wrong again')).toBe('reopened')
    expect(ledger('cash_reopened').map((e) => e.event_key)).toEqual([`cash_reopened:${ID}:1`, `cash_reopened:${ID}:2`])
    expect(notes()).toHaveLength(2)
  })

  it('refuses a booking that is not cash_settled and stores no note', async () => {
    seed()
    expect(await reopenCash(row(), ADMIN, 'why')).toBe('not_allowed')
    expect(notes()).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
  })

  it('refuses an empty note', async () => {
    seed({ payment_state: 'cash_settled' })
    expect(await reopenCash(row(), ADMIN, '   ')).toBe('not_allowed')
    expect(row().payment_state).toBe('cash_settled')
  })

  it('a double submit is a replay and removes the note it wrote (the history never holds a reversal that did not happen)', async () => {
    seed()
    await settleCash(row(), DRIVER)
    const stale = { ...row() } // still cash_settled
    expect(await reopenCash(row(), ADMIN, 'first')).toBe('reopened')
    // The same reversal arriving twice is a replay (same key), not an error; its note is dropped again.
    expect(await reopenCash(stale, ADMIN, 'second')).toBe('replay')
    expect(notes().map((n) => n.note)).toEqual(['first'])
    expect(ledger('cash_reopened')).toHaveLength(1)
  })

  it('a partner booking is refused', async () => {
    seed({ booking_source: 'gnet', payment_mode: 'partner', payment_state: 'cash_settled' })
    expect(await reopenCash(row(), ADMIN, 'x')).toBe('not_allowed')
    expect(notes()).toHaveLength(0)
  })
})

describe('addPaymentNote', () => {
  it('stores the trimmed note with the actor and rejects an empty one', async () => {
    seed()
    const id = await addPaymentNote(ID, 'cash_card_charge', '  client changed mind  ', ADMIN)
    expect(notes()[0]).toMatchObject({ id, kind: 'cash_card_charge', note: 'client changed mind', created_by: 'admin-1' })
    await expect(addPaymentNote(ID, 'cash_card_charge', '  ', ADMIN)).rejects.toThrow()
  })
})
