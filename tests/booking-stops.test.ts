// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 91 plan 91-06 (STOP-04, Pitfalls 5 and 9): lib/booking-stops.ts over the in-memory payments DB, which models
// booking_stops with the 089 CHECKs, the foreign key and the (booking_id, position) unique rule.

const { dbHolder } = vi.hoisted(() => ({ dbHolder: { client: null as unknown } }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => dbHolder.client),
}))

import { attachStops, loadStopsByBookingIds, loadStopsSafe, saveBookingStops } from '@/lib/booking-stops'
import { priceStops, type PricedStop } from '@/lib/stops'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

let db: FakePaymentsDb

const KV = { address: 'Karlovy Vary', lat: 50.2319, lng: 12.8715, waitMinutes: 45 }
const PLZEN = { address: 'Plzen', lat: 49.7384, lng: 13.3736, waitMinutes: 15 }
const TWO: PricedStop[] = priceStops([KV, PLZEN], 12)

const stopRows = (bookingId?: string) =>
  db.state.booking_stops.filter((r) => bookingId === undefined || r.booking_id === bookingId)

/** A client whose every query ends in a database error carrying an address, to prove errors never leak it. */
function failingClient(message: string) {
  const result = { data: null, error: { message } }
  const query: unknown = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return () => query
    },
  })
  return { from: () => query, rpc: () => query }
}

beforeEach(() => {
  db = createFakePaymentsDb({ bookings: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }] })
  dbHolder.client = db.client
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saveBookingStops', () => {
  it('stores two priced stops with position and the price snapshot', async () => {
    await saveBookingStops('b1', TWO)
    const rows = stopRows('b1')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      booking_id: 'b1',
      position: 1,
      address: 'Karlovy Vary',
      lat: 50.2319,
      lng: 12.8715,
      wait_minutes: 45,
      free_minutes: 15,
      blocks: 2,
      fee_per_block_eur: 12,
      fee_eur: 24,
    })
    expect(rows[1]).toMatchObject({ position: 2, address: 'Plzen', wait_minutes: 15, blocks: 0, fee_per_block_eur: null, fee_eur: 0 })
  })

  it('a second call replaces the first: one stop left', async () => {
    await saveBookingStops('b1', TWO)
    await saveBookingStops('b1', [TWO[0]])
    expect(stopRows('b1')).toHaveLength(1)
    expect(stopRows('b1')[0].position).toBe(1)
  })

  it('an empty list clears every stop of the booking and touches no other booking', async () => {
    await saveBookingStops('b1', TWO)
    await saveBookingStops('b2', [TWO[0]])
    await saveBookingStops('b1', [])
    expect(stopRows('b1')).toHaveLength(0)
    expect(stopRows('b2')).toHaveLength(1)
  })

  it('an empty list on a booking with no stops is a no-op', async () => {
    await expect(saveBookingStops('b1', [])).resolves.toBeUndefined()
    expect(stopRows()).toHaveLength(0)
  })

  it('stores a stop without a typed address as NULL (the column forbids an empty string)', async () => {
    await saveBookingStops('b1', [{ ...TWO[0], address: '' }])
    expect(stopRows('b1')[0].address).toBeNull()
  })

  it('a database refusal throws a fixed message with no address in it', async () => {
    await expect(saveBookingStops('b1', [{ ...TWO[0], waitMinutes: 7 }])).rejects.toThrow('booking stops save failed')
    dbHolder.client = failingClient('boom Karlovy Vary 50.2319')
    const err = await saveBookingStops('b1', TWO).then(() => new Error('did not throw'), (e: unknown) => e as Error)
    expect(err.message).toBe('booking stops save failed')
  })
})

describe('loadStopsByBookingIds', () => {
  it('returns each booking stops ordered by position, and no entry for a booking without stops', async () => {
    await saveBookingStops('b1', TWO)
    const map = await loadStopsByBookingIds(['b1', 'b2'])
    expect([...map.keys()]).toEqual(['b1'])
    expect(map.get('b1')!.map((s) => s.position)).toEqual([1, 2])
    expect(map.get('b1')![0]).toEqual({
      position: 1,
      address: 'Karlovy Vary',
      lat: 50.2319,
      lng: 12.8715,
      waitMinutes: 45,
      freeMinutes: 15,
      blocks: 2,
      feePerBlockEur: 12,
      feeEur: 24,
    })
    expect(map.get('b1')![1].feePerBlockEur).toBeNull()
  })

  it('orders by position even when the rows were stored out of order', async () => {
    db.state.booking_stops.push(
      { id: 's2', booking_id: 'b1', position: 2, address: 'B', lat: 1, lng: 1, wait_minutes: 0, free_minutes: 15, blocks: 0, fee_per_block_eur: null, fee_eur: 0 },
      { id: 's1', booking_id: 'b1', position: 1, address: 'A', lat: 1, lng: 1, wait_minutes: 0, free_minutes: 15, blocks: 0, fee_per_block_eur: null, fee_eur: 0 },
    )
    const map = await loadStopsByBookingIds(['b1'])
    expect(map.get('b1')!.map((s) => s.address)).toEqual(['A', 'B'])
  })

  it('casts numeric columns that the driver returns as strings', async () => {
    db.state.booking_stops.push({
      id: 's1',
      booking_id: 'b1',
      position: '1',
      address: 'A',
      lat: '50.5',
      lng: '14.25',
      wait_minutes: '45',
      free_minutes: '15',
      blocks: '2',
      fee_per_block_eur: '12.5',
      fee_eur: '25.0',
    })
    const stop = (await loadStopsByBookingIds(['b1'])).get('b1')![0]
    expect(stop).toEqual({
      position: 1,
      address: 'A',
      lat: 50.5,
      lng: 14.25,
      waitMinutes: 45,
      freeMinutes: 15,
      blocks: 2,
      feePerBlockEur: 12.5,
      feeEur: 25,
    })
  })

  it('makes no query for an empty list', async () => {
    const from = vi.fn()
    dbHolder.client = { from }
    const map = await loadStopsByBookingIds([])
    expect(map.size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })

  it('reads 450 ids in chunks of 200', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`)
    const inSizes: number[] = []
    const real = db.client
    dbHolder.client = {
      from: (table: string) => {
        const q = real.from(table)
        const original = q.in.bind(q)
        q.in = (col: string, vals: unknown[]) => {
          inSizes.push(vals.length)
          return original(col, vals)
        }
        return q
      },
    }
    await loadStopsByBookingIds(ids)
    expect(inSizes).toEqual([200, 200, 50])
  })

  it('throws on a read error', async () => {
    dbHolder.client = failingClient('boom')
    await expect(loadStopsByBookingIds(['b1'])).rejects.toThrow('booking stops read failed')
  })
})

describe('attachStops', () => {
  it('gives the row its stops and the others stops: []', async () => {
    await saveBookingStops('b2', TWO)
    const out = await attachStops([{ id: 'b1', ref: 'x' }, { id: 'b2', ref: 'y' }, { id: 'b3', ref: 'z' }])
    expect(out.map((r) => r.stops.length)).toEqual([0, 2, 0])
    expect(out[1]).toMatchObject({ id: 'b2', ref: 'y' })
    expect(out[0].stops).toEqual([])
  })

  it('an empty row list makes no query', async () => {
    const from = vi.fn()
    dbHolder.client = { from }
    expect(await attachStops([])).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })
})

describe('loadStopsSafe', () => {
  it('returns the stops of one booking', async () => {
    await saveBookingStops('b1', TWO)
    expect(await loadStopsSafe('b1')).toHaveLength(2)
    expect(await loadStopsSafe('b2')).toEqual([])
  })

  it('returns [] on a failing select and logs the booking id with no address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dbHolder.client = failingClient('boom Karlovy Vary 50.2319')
    expect(await loadStopsSafe('b1')).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(spy.mock.calls[0])
    expect(logged).toContain('b1')
    expect(logged).not.toContain('Karlovy')
    expect(logged).not.toContain('50.2319')
  })
})
