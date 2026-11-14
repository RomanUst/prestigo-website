// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { countingClient, seedPublicQuote, QUOTE_SECRETS, type PublicQuoteFixture } from './helpers/quote-public-fixture'
import { hashQuoteToken, newQuoteToken } from '@/lib/quotes/token'

/**
 * Phase 92 plan 92-09 Task 1 (tracer; QUOTE-02, QUOTE-06; D-02, D-05, D-10): a token becomes the current version of its
 * quote or nothing, with no side effect; the client-safe view carries no personal data and no separate waiting amount.
 * Runs lib/quotes/resolve.ts and lib/quotes/view.ts for real against the in-memory payments database.
 */

const { world } = vi.hoisted(() => ({
  world: { client: null as null | { from: (t: string) => unknown }, calls: 0, failTable: null as null | string },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => {
    world.calls += 1
    return {
      from: (table: string) => {
        if (world.failTable === table) {
          const failure = { message: 'boom detail value', code: 'XX000' }
          const chain: Record<string, unknown> = {}
          for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'update', 'insert', 'maybeSingle', 'single']) {
            chain[m] = () => chain
          }
          chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: failure })
          return chain
        }
        return world.client!.from(table)
      },
    }
  },
}))

import { resolveQuoteToken, markQuoteViewed } from '@/lib/quotes/resolve'
import { buildQuoteView } from '@/lib/quotes/view'

// Prague wall clock 2027-06-10 10:30 is 08:30 UTC (CEST). Now is a month before.
const NOW = Date.parse('2027-05-10T10:00:00Z')

let db: FakePaymentsDb
let counter: ReturnType<typeof countingClient>

async function seed(over: Parameters<typeof seedPublicQuote>[1] = {}): Promise<PublicQuoteFixture> {
  const fx = await seedPublicQuote(db, over)
  counter.writes.count = 0
  return fx
}

beforeEach(() => {
  db = createFakePaymentsDb()
  counter = countingClient(db)
  world.client = counter
  world.calls = 0
  world.failTable = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveQuoteToken', () => {
  it('a malformed token returns null and never reaches the database', async () => {
    for (const bad of ['', 'short', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}!`, null, undefined, 42, {}, ['x']]) {
      expect(await resolveQuoteToken(bad, NOW)).toBeNull()
    }
    expect(world.calls).toBe(0)
  })

  it('an unknown token returns null', async () => {
    await seed()
    expect(await resolveQuoteToken(newQuoteToken(), NOW)).toBeNull()
  })

  it('a live sent quote returns the offer with lines and stops ordered by position', async () => {
    const fx = await seed()
    const r = await resolveQuoteToken(fx.token, NOW)
    expect(r).not.toBeNull()
    expect(r!.state).toBe('offer')
    expect(r!.quote.id).toBe(fx.quoteId)
    expect(r!.version.id).toBe(fx.versionId)
    expect(r!.linkId).toBe(fx.linkId)
    expect(r!.lines.map((l) => l.position)).toEqual([1, 2])
    expect(r!.lines[0].stops).toEqual([])
    expect(r!.lines[1].stops.map((s) => s.position)).toEqual([1, 2])
    expect(r!.lines[1].stops.map((s) => s.address)).toEqual(['Cesky Sternberk Castle', 'Kutna Hora, Czechia'])
    expect(r!.bookings).toEqual([])
  })

  it('viewed and accepted quotes are still offers', async () => {
    for (const status of ['viewed', 'accepted'] as const) {
      db = createFakePaymentsDb()
      counter = countingClient(db)
      world.client = counter
      const fx = await seed({ status })
      expect((await resolveQuoteToken(fx.token, NOW))?.state).toBe('offer')
    }
  })

  it('a paid quote returns state paid with its bookings', async () => {
    const fx = await seed({ status: 'paid', withBooking: true })
    const r = await resolveQuoteToken(fx.token, NOW)
    expect(r?.state).toBe('paid')
    expect(r!.bookings).toHaveLength(1)
    expect(r!.bookings[0]).toMatchObject({ booking_reference: 'PR-9001', quote_line_id: fx.lineIds[0], status: 'confirmed' })
  })

  it('a paid quote stays readable after its first pickup has passed', async () => {
    const fx = await seed({ status: 'paid' })
    const afterTrips = Date.parse('2027-07-01T00:00:00Z')
    expect((await resolveQuoteToken(fx.token, afterTrips))?.state).toBe('paid')
  })

  it.each([
    ['draft', { status: 'draft' as const }],
    ['voided', { status: 'voided' as const }],
    ['expired status', { status: 'expired' as const }],
    ['revoked link', { revokeLink: true }],
    ['superseded (version 1 link while version 2 is current)', { supersede: true }],
    ['cancelled', { cancelledAt: '2027-05-01T00:00:00.000Z' }],
    ['past operator expiry (D-02)', { expiresAt: '2027-05-09T00:00:00.000Z' }],
    ['anonymised', { anonymised: true }],
  ])('%s returns null', async (_name, over) => {
    const fx = await seed(over)
    expect(await resolveQuoteToken(fx.token, NOW)).toBeNull()
  })

  it('past the first pickup returns null (D-05)', async () => {
    const fx = await seed()
    expect(await resolveQuoteToken(fx.token, Date.parse('2027-06-10T08:30:00Z'))).toBeNull()
    expect(await resolveQuoteToken(fx.token, Date.parse('2027-06-10T08:29:59Z'))).not.toBeNull()
  })

  it('a future operator expiry still resolves', async () => {
    const fx = await seed({ expiresAt: '2027-06-01T00:00:00.000Z' })
    expect(await resolveQuoteToken(fx.token, NOW)).not.toBeNull()
  })

  it('performs zero inserts, updates and deletes', async () => {
    const fx = await seed({ status: 'sent' })
    await resolveQuoteToken(fx.token, NOW)
    await resolveQuoteToken(newQuoteToken(), NOW)
    expect(counter.writes.count).toBe(0)
    expect(db.state.quote_events).toHaveLength(0)
    expect(db.state.quotes[0].status).toBe('sent')
  })

  it('a database error returns null and logs neither the token nor its hash', async () => {
    const fx = await seed()
    const spies = [
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'log').mockImplementation(() => {}),
    ]
    for (const table of ['quote_links', 'quotes', 'quote_versions', 'quote_version_lines']) {
      world.failTable = table
      expect(await resolveQuoteToken(fx.token, NOW)).toBeNull()
    }
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls))
    expect(output).not.toContain(fx.token)
    expect(output).not.toContain(hashQuoteToken(fx.token))
    expect(output).not.toContain('boom detail value')
  })
})

describe('buildQuoteView', () => {
  it('carries the itemised offer: one price per line, total, deposit, remainder', async () => {
    const fx = await seed()
    const r = (await resolveQuoteToken(fx.token, NOW))!
    const v = buildQuoteView(r, NOW)
    expect(v).toMatchObject({
      reference: 'Q-20261114-ABC123',
      versionNo: 1,
      state: 'offer',
      locale: 'en',
      currency: 'eur',
      clientFirstName: QUOTE_SECRETS.firstName,
      expiresAt: null,
      totalMinor: 30000,
      depositMinor: 9000,
      remainderMinor: 21000,
      remainderMethod: 'saved_card',
      bookingReferences: [],
    })
    expect(v.lines).toHaveLength(2)
    expect(v.lines[0]).toMatchObject({
      position: 1,
      tripType: 'transfer',
      pickupDate: '2027-06-10',
      pickupTime: '10:30',
      landingTime: '10:05',
      origin: 'Vaclav Havel Airport Prague',
      destination: 'Hotel Aria, Prague',
      vehicleClass: 'business',
      passengers: 2,
      luggage: 2,
      hours: null,
      totalMinor: 12000,
    })
    expect(v.lines[1].stops).toEqual([
      { address: 'Cesky Sternberk Castle', waitMinutes: 30 },
      { address: 'Kutna Hora, Czechia', waitMinutes: 45 },
    ])
    expect(v.lines[1].landingTime).toBeNull()
  })

  it('state follows the quote: accepted and paid', async () => {
    let fx = await seed({ status: 'accepted' })
    expect(buildQuoteView((await resolveQuoteToken(fx.token, NOW))!, NOW).state).toBe('accepted')
    db = createFakePaymentsDb()
    counter = countingClient(db)
    world.client = counter
    fx = await seed({ status: 'paid', withBooking: true })
    const v = buildQuoteView((await resolveQuoteToken(fx.token, NOW))!, NOW)
    expect(v.state).toBe('paid')
    expect(v.bookingReferences).toEqual(['PR-9001'])
  })

  it('carries no email, phone, last name, billing, special requests, waiting amount or internal id', async () => {
    const fx = await seed({ withBooking: true, status: 'paid' })
    const r = (await resolveQuoteToken(fx.token, NOW))!
    const text = JSON.stringify(buildQuoteView(r, NOW))
    for (const secret of Object.values(QUOTE_SECRETS)) {
      if (secret === QUOTE_SECRETS.firstName) continue
      expect(text).not.toContain(secret)
    }
    for (const id of [fx.quoteId, fx.versionId, fx.linkId, ...fx.lineIds, hashQuoteToken(fx.token), fx.token]) {
      expect(text).not.toContain(id)
    }
    // Stop fees exist in the rows (14 and 7 EUR); the view has no field for them.
    expect(text).not.toMatch(/fee_eur|fee_per_block|free_minutes|blocks/i)
    const keys = new Set<string>()
    const collect = (o: unknown) => {
      if (Array.isArray(o)) o.forEach(collect)
      else if (o && typeof o === 'object') {
        for (const [k, val] of Object.entries(o)) {
          keys.add(k)
          collect(val)
        }
      }
    }
    collect(JSON.parse(text))
    expect([...keys].filter((k) => /email|phone|last|billing|special|note|^id$|_id$|token|fee_|waitFee|waitAmount/i.test(k))).toEqual([])
  })

  it('terms: free until the first pickup minus the stored free hours; remainder is total minus deposit', async () => {
    const fx = await seed({ cancelFreeHours: 72, cancelFeePercent: 40 })
    const r = (await resolveQuoteToken(fx.token, NOW))!
    const v = buildQuoteView(r, NOW)
    const firstPickup = Date.parse('2027-06-10T08:30:00Z')
    expect(v.terms.freeUntilMs).toBe(firstPickup - 72 * 3_600_000)
    expect(v.terms.feePercent).toBe(40)
    expect(v.terms.freePassed).toBe(false)
    expect(v.remainderMinor).toBe(v.totalMinor - v.depositMinor)
    // Inside the last 72 hours the free window has passed.
    const late = buildQuoteView(r, firstPickup - 10 * 3_600_000)
    expect(late.terms.freePassed).toBe(true)
  })

  it('carries the operator expiry when one is set', async () => {
    const fx = await seed({ expiresAt: '2027-06-01T00:00:00.000Z' })
    const v = buildQuoteView((await resolveQuoteToken(fx.token, NOW))!, NOW)
    expect(v.expiresAt).toBe('2027-06-01T00:00:00.000Z')
  })
})

describe('markQuoteViewed', () => {
  it('moves sent to viewed with one viewed event, and a repeat changes nothing', async () => {
    const fx = await seed({ status: 'sent' })
    const r = (await resolveQuoteToken(fx.token, NOW))!
    await markQuoteViewed(r)
    expect(db.state.quotes[0].status).toBe('viewed')
    expect(db.state.quote_events).toHaveLength(1)
    expect(db.state.quote_events[0]).toMatchObject({
      quote_id: fx.quoteId,
      kind: 'viewed',
      event_key: `viewed:${fx.versionId}`,
      version_id: fx.versionId,
      actor_type: 'client',
    })
    await markQuoteViewed(r)
    expect(db.state.quotes[0].status).toBe('viewed')
    expect(db.state.quote_events).toHaveLength(1)
  })

  it.each(['viewed', 'accepted', 'paid'] as const)('leaves a %s quote unchanged', async (status) => {
    const fx = await seed({ status })
    const r = (await resolveQuoteToken(fx.token, NOW))!
    await markQuoteViewed(r)
    expect(db.state.quotes[0].status).toBe(status)
    expect(db.state.quote_events).toHaveLength(0)
  })
})
