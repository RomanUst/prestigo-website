// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { latestCheckValues } from './helpers/latest-migration'

/**
 * Phase 92 plan 92-01 Task 3 (QUOTE-05): lib/quotes/events.ts writes the quote event ledger exactly once per
 * (quote, key). The module runs for real against the in-memory payments database.
 */

const { world } = vi.hoisted(() => ({
  world: {
    client: null as null | {
      from: (t: string) => unknown
    },
    failWith: null as null | { message: string; code?: string },
  },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      if (world.failWith) {
        const failure = world.failWith
        const chain: Record<string, unknown> = {
          insert: () => chain,
          select: () => chain,
          eq: () => chain,
          limit: () => chain,
          maybeSingle: () => chain,
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: failure }),
        }
        return chain
      }
      return world.client!.from(table)
    },
  }),
}))

import { QUOTE_EVENT_KINDS, appendQuoteEvent, hasQuoteEvent, type QuoteEventInput } from '@/lib/quotes/events'

const QUOTE_ID = '00000000-0000-4000-8000-0000000000aa'
const VERSION_ID = '00000000-0000-4000-8000-0000000000bb'

let db: FakePaymentsDb

async function seedQuote(): Promise<string> {
  const res = await db.client
    .from('quotes')
    .insert({
      id: QUOTE_ID,
      reference: 'Q-20261114-ABC123',
      client_first_name: 'Ada',
      client_last_name: 'Lovelace',
      client_email: 'ada@example.com',
      lead_channel: 'email',
    })
    .select('*')
    .single()
  expect(res.error).toBeNull()
  return QUOTE_ID
}

const sent = (over: Partial<QuoteEventInput> = {}): QuoteEventInput => ({
  key: 'sent:v1',
  kind: 'sent',
  actor: { type: 'admin', id: 'admin-1' },
  ...over,
})

beforeEach(async () => {
  db = createFakePaymentsDb()
  world.client = db.client
  world.failWith = null
  await seedQuote()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('appendQuoteEvent', () => {
  it('inserts one row with the key, kind, actor and amounts and reports inserted true', async () => {
    const out = await appendQuoteEvent(
      QUOTE_ID,
      sent({
        key: 'deposit_paid:pi_1',
        kind: 'deposit_paid',
        versionId: VERSION_ID,
        stripeObjectId: 'pi_1',
        amountMinor: 2700,
        currency: 'eur',
        actor: { type: 'webhook', id: 'evt_1' },
      }),
    )
    expect(out).toEqual({ inserted: true })
    expect(db.state.quote_events).toHaveLength(1)
    expect(db.state.quote_events[0]).toMatchObject({
      quote_id: QUOTE_ID,
      event_key: 'deposit_paid:pi_1',
      kind: 'deposit_paid',
      version_id: VERSION_ID,
      stripe_object_id: 'pi_1',
      amount_minor: 2700,
      currency: 'eur',
      actor_type: 'webhook',
      actor_id: 'evt_1',
      error_code: null,
    })
  })

  it('stores nulls for every optional field that is left out', async () => {
    await appendQuoteEvent(QUOTE_ID, { key: 'created', kind: 'created', actor: { type: 'system' } })
    expect(db.state.quote_events[0]).toMatchObject({
      version_id: null,
      stripe_object_id: null,
      amount_minor: null,
      currency: null,
      actor_id: null,
      error_code: null,
    })
  })

  it('the same key again returns inserted false, writes no second row and does not throw', async () => {
    expect(await appendQuoteEvent(QUOTE_ID, sent())).toEqual({ inserted: true })
    expect(await appendQuoteEvent(QUOTE_ID, sent({ amountMinor: 5 }))).toEqual({ inserted: false })
    expect(db.state.quote_events).toHaveLength(1)
    expect(db.state.quote_events[0].amount_minor).toBeNull()
  })

  it('another key for the same quote, and the same key for another quote, are both new rows', async () => {
    expect(await appendQuoteEvent(QUOTE_ID, sent())).toEqual({ inserted: true })
    expect(await appendQuoteEvent(QUOTE_ID, sent({ key: 'sent:v2' }))).toEqual({ inserted: true })
    const other = '00000000-0000-4000-8000-0000000000cc'
    await db.client.from('quotes').insert({
      id: other,
      reference: 'Q-20261114-ZZZ999',
      client_first_name: 'Grace',
      client_last_name: 'Hopper',
      client_email: 'grace@example.com',
      lead_channel: 'phone',
    })
    expect(await appendQuoteEvent(other, sent())).toEqual({ inserted: true })
    expect(db.state.quote_events).toHaveLength(3)
  })

  it('cuts error_code to 60 characters', async () => {
    await appendQuoteEvent(QUOTE_ID, sent({ key: 'deposit_failed:1', kind: 'deposit_failed', errorCode: 'x'.repeat(80) }))
    expect(db.state.quote_events[0].error_code).toBe('x'.repeat(60))
  })

  it('a database error other than a duplicate throws a fixed message and logs only the quote id and the key', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    world.failWith = { message: 'connection to ada@example.com refused', code: '08006' }
    await expect(appendQuoteEvent(QUOTE_ID, sent({ key: 'sent:secret-key' }))).rejects.toThrow('quote event write failed')
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).toContain(QUOTE_ID)
    expect(logged).toContain('sent:secret-key')
    expect(logged).not.toContain('ada@example.com')
    expect(logged).not.toContain('refused')
  })

  it('a rejected row (an unknown kind forced past the type) is a write failure, not a duplicate', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = { key: 'k', kind: 'teleported', actor: { type: 'admin' } } as unknown as QuoteEventInput
    await expect(appendQuoteEvent(QUOTE_ID, bad)).rejects.toThrow('quote event write failed')
    expect(db.state.quote_events).toHaveLength(0)
  })
})

describe('hasQuoteEvent', () => {
  it('is true after the insert and false for another key or another quote', async () => {
    expect(await hasQuoteEvent(QUOTE_ID, 'sent:v1')).toBe(false)
    await appendQuoteEvent(QUOTE_ID, sent())
    expect(await hasQuoteEvent(QUOTE_ID, 'sent:v1')).toBe(true)
    expect(await hasQuoteEvent(QUOTE_ID, 'sent:v2')).toBe(false)
    expect(await hasQuoteEvent('00000000-0000-4000-8000-0000000000dd', 'sent:v1')).toBe(false)
  })

  it('throws the same fixed message on a database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    world.failWith = { message: 'boom', code: 'XX000' }
    await expect(hasQuoteEvent(QUOTE_ID, 'k')).rejects.toThrow('quote event read failed')
  })
})

describe('QUOTE_EVENT_KINDS', () => {
  it('equals quote_events_kind_check of the latest migration, in order', () => {
    expect([...QUOTE_EVENT_KINDS]).toEqual(latestCheckValues('quote_events_kind_check', 'kind'))
  })
})
