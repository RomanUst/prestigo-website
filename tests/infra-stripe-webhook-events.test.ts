// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake Stripe payloads are intentionally loose */
/**
 * Phase 88, Plan 04 - infra/stripe/webhook-events.mjs (PAYF-04) proven against an in-memory fake
 * Stripe client. No test here makes a network call or reads a real credential; every key is an
 * obviously fake value.
 */
import { describe, it, expect } from 'vitest'
import { runWebhookEvents, REQUIRED_EVENTS, KEPT_EVENTS } from '../infra/stripe/webhook-events.mjs'

const LIVE_URL = 'https://rideprestigo.com/api/webhooks/stripe'
const FAKE_KEY = 'sk_live_FAKE_key_for_tests_only'
const KEPT = ['payment_intent.succeeded', 'charge.refunded', 'checkout.session.completed']
const NEW_SIX = [
  'setup_intent.succeeded',
  'setup_intent.setup_failed',
  'payment_intent.amount_capturable_updated',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.dispute.created',
]

type Endpoint = { id: string; url: string; status?: string; enabled_events: string[] }

function fakeStripe(endpoints: Endpoint[], opts: { failOn?: 'list' | 'update' } = {}) {
  const state = endpoints.map((e) => ({ status: 'enabled', ...e, enabled_events: [...e.enabled_events] }))
  const calls = { list: 0, update: [] as Array<{ id: string; params: any }> }
  const client = {
    webhookEndpoints: {
      async list(_params?: any) {
        calls.list++
        if (opts.failOn === 'list') throw new Error(`Invalid API Key provided: ${FAKE_KEY}`)
        return { data: state.map((e) => ({ ...e, enabled_events: [...e.enabled_events] })) }
      },
      async update(id: string, params: any) {
        calls.update.push({ id, params })
        if (opts.failOn === 'update') throw new Error('rate limited')
        const target = state.find((e) => e.id === id)!
        target.enabled_events = [...params.enabled_events]
        return { ...target }
      },
    },
  }
  return { client, calls, state }
}

async function run(argv: string[], client: any, extra: Record<string, unknown> = {}) {
  const out: string[] = []
  const err: string[] = []
  const code = await runWebhookEvents({
    argv,
    client,
    isTTY: false,
    out: (t: string) => out.push(t),
    err: (t: string) => err.push(t),
    ...extra,
  })
  return { code, out, err, text: out.join('\n'), errText: err.join('\n'), all: `${out.join('\n')}\n${err.join('\n')}` }
}

const sorted = (xs: string[]) => [...xs].sort()

describe('exports', () => {
  it('REQUIRED_EVENTS is the six new card-flow events and KEPT_EVENTS the three legacy ones', () => {
    expect(sorted(REQUIRED_EVENTS)).toEqual(sorted(NEW_SIX))
    expect(REQUIRED_EVENTS).toHaveLength(6)
    expect(sorted(KEPT_EVENTS)).toEqual(sorted(KEPT))
  })
})

describe('ensure (tracer)', () => {
  it('adds only the six missing events to the one live endpoint and prints them', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(fake.calls.update).toHaveLength(1)
    expect(fake.calls.update[0].id).toBe('we_live')
    expect(fake.calls.update[0].params.enabled_events).toEqual(sorted([...KEPT, ...NEW_SIX]))
    expect(fake.calls.update[0].params.enabled_events).toHaveLength(9)
    expect(res.text).toContain('OK added:')
    for (const e of NEW_SIX) expect(res.text).toContain(e)
    for (const e of KEPT) expect(res.text.split('OK added:')[1]).not.toContain(e)
  })

  it('is the default command when none is given', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    const res = await run([], fake.client)
    expect(res.code).toBe(0)
    expect(fake.calls.update).toHaveLength(1)
  })

  it('a second run on the updated endpoint makes no update and prints OK unchanged', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    await run(['ensure'], fake.client)
    const second = await run(['ensure'], fake.client)
    expect(second.code).toBe(0)
    expect(second.text).toContain('OK unchanged')
    expect(fake.calls.update).toHaveLength(1)
  })

  it('never removes an event the endpoint already listens to and never adds one twice', async () => {
    const extra = ['customer.created', 'payment_intent.canceled', 'invoice.paid']
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: [...KEPT, ...extra] }])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    const sent: string[] = fake.calls.update[0].params.enabled_events
    expect(new Set(sent).size).toBe(sent.length)
    for (const e of [...KEPT, ...extra, ...NEW_SIX]) expect(sent).toContain(e)
    // payment_intent.canceled was already there, so it is not reported as added
    expect(res.text.split('OK added:')[1]).not.toContain('payment_intent.canceled')
  })

  it('reports an endpoint enabled for * as unchanged', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: ['*'] }])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(res.text).toContain('OK unchanged')
    expect(fake.calls.update).toHaveLength(0)
  })

  it('ignores endpoints on other hosts or paths', async () => {
    const fake = fakeStripe([
      { id: 'we_other', url: 'https://example.test/api/webhooks/stripe', enabled_events: ['charge.refunded'] },
      { id: 'we_live', url: LIVE_URL, enabled_events: KEPT },
      { id: 'we_path', url: 'https://rideprestigo.com/api/webhooks/chatwoot', enabled_events: ['charge.refunded'] },
    ])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(0)
    expect(fake.calls.update.map((c) => c.id)).toEqual(['we_live'])
  })
})

describe('--dry-run', () => {
  it('prints the alphabetically sorted diff, makes no update, and prints identically on repeat', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    const first = await run(['--dry-run'], fake.client)
    const second = await run(['--dry-run'], fake.client)
    expect(first.code).toBe(0)
    expect(fake.calls.update).toHaveLength(0)
    expect(first.out).toEqual(second.out)
    const added = first.out.filter((l) => l.startsWith('+ ')).map((l) => l.slice(2))
    expect(added).toEqual(sorted(NEW_SIX))
  })

  it('works together with ensure and still never writes', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    const res = await run(['ensure', '--dry-run'], fake.client)
    expect(res.code).toBe(0)
    expect(fake.calls.update).toHaveLength(0)
  })

  it('prints OK unchanged when nothing is missing', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: [...KEPT, ...NEW_SIX] }])
    const res = await run(['--dry-run'], fake.client)
    expect(res.code).toBe(0)
    expect(res.text).toContain('OK unchanged')
  })
})

describe('list', () => {
  it('prints id, url and sorted events for every endpoint and writes nothing', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    const res = await run(['list'], fake.client)
    expect(res.code).toBe(0)
    expect(res.text).toContain(`id=we_live url=${LIVE_URL}`)
    expect(res.text).toContain(sorted(KEPT).join(','))
    expect(fake.calls.update).toHaveLength(0)
  })
})

describe('refusals', () => {
  it('exits 1 with FAIL and no write when no endpoint matches rideprestigo.com + /api/webhooks/stripe', async () => {
    const fake = fakeStripe([
      { id: 'we_local', url: 'http://localhost:3000/api/webhooks/stripe', enabled_events: KEPT },
      { id: 'we_other', url: 'https://other.example.test/api/webhooks/stripe', enabled_events: KEPT },
    ])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(1)
    expect(res.all).toContain('FAIL')
    expect(fake.calls.update).toHaveLength(0)
  })

  it('exits 1 with FAIL on an account with no endpoints at all', async () => {
    const fake = fakeStripe([])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(1)
    expect(res.all).toContain('FAIL')
    expect(fake.calls.update).toHaveLength(0)
  })

  it('exits 1 ambiguous and writes nothing when two endpoints match', async () => {
    const fake = fakeStripe([
      { id: 'we_a', url: LIVE_URL, enabled_events: KEPT },
      { id: 'we_b', url: `${LIVE_URL}?x=1`, enabled_events: KEPT },
    ])
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(1)
    expect(res.all).toContain('ambiguous')
    expect(res.all).toContain('FAIL')
    expect(fake.calls.update).toHaveLength(0)
  })

  it('refuses a key (or any secret-looking value) on the command line, before any API call', async () => {
    for (const argv of [['ensure', FAKE_KEY], ['--key', FAKE_KEY], ['--api-key=whsec_FAKE_x'], ['rk_live_FAKE_restricted']]) {
      const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
      const res = await run(argv, fake.client)
      expect(res.code).toBe(1)
      expect(res.all).toContain('refused')
      expect(res.all).not.toContain(FAKE_KEY)
      expect(res.all).not.toContain('FAKE_restricted')
      expect(fake.calls.list).toBe(0)
      expect(fake.calls.update).toHaveLength(0)
    }
  })

  it('refuses unknown arguments with exit 1', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    const res = await run(['frobnicate'], fake.client)
    expect(res.code).toBe(1)
    expect(fake.calls.list).toBe(0)
  })
})

describe('API errors', () => {
  it('exits 2 with a FAIL line when listing fails, and never prints the key', async () => {
    const fake = fakeStripe([], { failOn: 'list' })
    const res = await run(['ensure'], fake.client, { knownSecrets: [FAKE_KEY] })
    expect(res.code).toBe(2)
    expect(res.all).toContain('FAIL')
    expect(res.all).not.toContain(FAKE_KEY)
    expect(res.all).not.toContain('sk_live_')
  })

  it('exits 2 with a FAIL line when the update fails', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }], { failOn: 'update' })
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(2)
    expect(res.all).toContain('FAIL')
  })

  it('exits 1 when Stripe answers the update without one of the requested events', async () => {
    const fake = fakeStripe([{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }])
    fake.client.webhookEndpoints.update = async () => ({ id: 'we_live', enabled_events: KEPT }) as any
    const res = await run(['ensure'], fake.client)
    expect(res.code).toBe(1)
    expect(res.all).toContain('FAIL')
  })
})

describe('secret custody', () => {
  it('no output line of any command contains a Stripe key, whsec_ or the fake key value', async () => {
    const scenarios: Array<[string[], Endpoint[], Record<string, unknown>?]> = [
      [['ensure'], [{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }]],
      [['--dry-run'], [{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }]],
      [['list'], [{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }]],
      [['ensure'], []],
      [['ensure', FAKE_KEY], [{ id: 'we_live', url: LIVE_URL, enabled_events: KEPT }]],
    ]
    for (const [argv, endpoints] of scenarios) {
      const fake = fakeStripe(endpoints)
      const res = await run(argv, fake.client, { knownSecrets: [FAKE_KEY] })
      for (const needle of ['sk_live_', 'sk_test_', 'whsec_', FAKE_KEY]) expect(res.all).not.toContain(needle)
    }
  })

  it('redacts a key that appears inside an upstream error message even when it was not pre-registered', async () => {
    const fake = fakeStripe([], { failOn: 'list' })
    const res = await run(['ensure'], fake.client)
    expect(res.all).not.toContain('sk_live_')
  })
})
