// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake Stripe payloads are intentionally loose */
/**
 * Phase 88, Plan 04 - infra/stripe/card-flow-smoke.mjs (PAYF-04 test-mode path) proven against a
 * scripted fake Stripe client that behaves like test mode for the SCA test cards. No network call,
 * no real credential: every key is an obviously fake value.
 */
import { describe, it, expect } from 'vitest'
import { runCardFlowSmoke, isTestKey } from '../infra/stripe/card-flow-smoke.mjs'

const TEST_KEY = 'sk_test_FAKE_key_for_tests_only'
const NOW = 1_800_000_000_000

type Behaviour = 'ok' | 'authentication_required' | 'sca_decline' | 'generic_decline'
const PM_BEHAVIOUR: Record<string, Behaviour> = {
  pm_card_visa: 'ok',
  pm_card_authenticationRequired: 'authentication_required',
  pm_card_authenticationRequiredChargeDeclinedInsufficientFunds: 'sca_decline',
  pm_card_chargeCustomerFail: 'generic_decline',
}

function cardError(code: string, decline?: string) {
  const e: any = new Error(`Your card was declined (${code})`)
  e.type = 'StripeCardError'
  e.code = code
  if (decline) e.decline_code = decline
  return e
}

/** An in-memory Stripe that reproduces the documented test-mode semantics the smoke relies on. */
function fakeStripe(overrides: { breakSearch?: boolean; authCardSucceeds?: boolean; noReplay?: boolean } = {}) {
  const calls: Array<{ op: string; params?: any; opts?: any; id?: string }> = []
  const pis = new Map<string, any>()
  const pmOwner = new Map<string, string>() // pm id -> behaviour token
  const idem = new Map<string, any>()
  let seq = 0

  const client: any = {
    customers: {
      async create(params: any) {
        calls.push({ op: 'customers.create', params })
        return { id: `cus_${++seq}` }
      },
      async del(id: string) {
        calls.push({ op: 'customers.del', id })
        return { id, deleted: true }
      },
    },
    paymentMethods: {
      async attach(token: string, params: any) {
        calls.push({ op: 'paymentMethods.attach', params: { token, ...params } })
        const id = `pm_${++seq}`
        pmOwner.set(id, token)
        return { id }
      },
    },
    setupIntents: {
      async create(params: any) {
        calls.push({ op: 'setupIntents.create', params })
        return { id: `seti_${++seq}`, status: 'succeeded' }
      },
    },
    paymentIntents: {
      async create(params: any, opts: any = {}) {
        calls.push({ op: 'paymentIntents.create', params, opts })
        const key = opts.idempotencyKey
        if (key && idem.has(key) && !overrides.noReplay) return idem.get(key)
        const behaviour = PM_BEHAVIOUR[pmOwner.get(params.payment_method) ?? ''] ?? 'ok'
        if (behaviour === 'authentication_required' && !overrides.authCardSucceeds) throw cardError('authentication_required')
        if (behaviour === 'sca_decline') throw cardError('authentication_required')
        if (behaviour === 'generic_decline') throw cardError('card_declined', 'generic_decline')
        const pi = {
          id: `pi_${++seq}`,
          status: params.capture_method === 'manual' ? 'requires_capture' : 'succeeded',
          amount: params.amount,
          amount_capturable: params.amount,
          metadata: params.metadata,
        }
        pis.set(pi.id, pi)
        if (key) idem.set(key, { ...pi })
        return pi
      },
      async capture(id: string, params: any, opts: any = {}) {
        calls.push({ op: 'paymentIntents.capture', id, params, opts })
        const pi = pis.get(id)
        const received = params?.amount_to_capture ?? pi.amount
        pi.status = 'succeeded'
        pi.amount_received = received
        return { ...pi }
      },
      async cancel(id: string, params: any, opts: any = {}) {
        calls.push({ op: 'paymentIntents.cancel', id, params, opts })
        const pi = pis.get(id)
        pi.status = 'canceled'
        return { ...pi }
      },
      async search(params: any) {
        calls.push({ op: 'paymentIntents.search', params })
        if (overrides.breakSearch) return { data: [] }
        const m = /metadata\['cofBookingId'\]:'([^']+)'/.exec(params.query)
        const attempt = /metadata\['attempt'\]:'([^']+)'/.exec(params.query)
        const data = [...pis.values()].filter(
          (p) => p.metadata?.cofBookingId === m?.[1] && (!attempt || p.metadata?.attempt === attempt[1]),
        )
        return { data }
      },
    },
  }
  return { client, calls, pis }
}

async function run(opts: { key?: string; client: any; argv?: string[] }) {
  const out: string[] = []
  const err: string[] = []
  const code = await runCardFlowSmoke({
    key: opts.key,
    client: opts.client,
    argv: opts.argv,
    now: () => NOW,
    sleep: async () => {},
    out: (t: string) => out.push(t),
    err: (t: string) => err.push(t),
  })
  return { code, out, err, all: `${out.join('\n')}\n${err.join('\n')}` }
}

const verdictLines = (lines: string[]) => lines.filter((l) => /^(PASS|FAIL) /.test(l))
const smokeId = `smoke-${NOW}`

describe('key guard', () => {
  it('isTestKey accepts only sk_test_ keys', () => {
    expect(isTestKey(TEST_KEY)).toBe(true)
    for (const bad of ['sk_live_x', 'rk_live_x', 'rk_test_x', 'pk_test_x', '', undefined, 'whatever']) expect(isTestKey(bad as any)).toBe(false)
  })

  it('refuses a live or restricted key with exit 1 and makes no client call', async () => {
    for (const key of ['sk_live_x', 'rk_live_x', undefined]) {
      const touched: string[] = []
      const client = new Proxy({}, { get: (_t, prop) => { touched.push(String(prop)); return {} } })
      const res = await run({ key, client })
      expect(res.code).toBe(1)
      expect(res.all).toContain('refused: test-mode key required')
      expect(touched).toEqual([])
      expect(res.all).not.toContain('sk_live_')
      expect(res.all).not.toContain('rk_live_')
    }
  })

  it('refuses any command-line argument (a key must never arrive on argv)', async () => {
    const fake = fakeStripe()
    const res = await run({ key: TEST_KEY, client: fake.client, argv: [TEST_KEY] })
    expect(res.code).toBe(1)
    expect(res.all).toContain('refused')
    expect(res.all).not.toContain(TEST_KEY)
    expect(fake.calls).toHaveLength(0)
  })
})

describe('all scenarios pass against test-mode semantics', () => {
  it('prints exactly one PASS line per scenario S1..S8 and exits 0', async () => {
    const fake = fakeStripe()
    const res = await run({ key: TEST_KEY, client: fake.client })
    const verdicts = verdictLines(res.out)
    expect(verdicts).toHaveLength(8)
    expect(verdicts.every((l) => l.startsWith('PASS '))).toBe(true)
    expect(verdicts.map((l) => l.split(' ')[1].split('_')[0])).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'])
    expect(res.code).toBe(0)
  })

  it('S1 uses the exact hold call shape: manual capture, off-session, confirm, card only, no bookingId, attempt-numbered key', async () => {
    const fake = fakeStripe()
    await run({ key: TEST_KEY, client: fake.client })
    const first = fake.calls.find((c) => c.op === 'paymentIntents.create')!
    expect(first.params).toMatchObject({
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      payment_method_types: ['card'],
      metadata: { kind: 'card_hold', cofBookingId: smokeId, attempt: '1' },
    })
    expect(first.params.metadata).not.toHaveProperty('bookingId')
    expect(first.params.metadata.bookingReference).toMatch(/^SMOKE-/)
    expect(first.opts.idempotencyKey).toBe(`hold:${smokeId}:1`)
    expect(fake.calls.some((c) => c.op === 'paymentMethods.attach' && c.params.token === 'pm_card_visa')).toBe(true)
    expect(fake.calls.some((c) => c.op === 'setupIntents.create')).toBe(true)
  })

  it('S2 captures less than the amount with a cap: key, S3 cancels as requested_by_customer with a rel: key', async () => {
    const fake = fakeStripe()
    await run({ key: TEST_KEY, client: fake.client })
    const capture = fake.calls.find((c) => c.op === 'paymentIntents.capture')!
    expect(capture.params.amount_to_capture).toBeLessThan(fake.calls.find((c) => c.op === 'paymentIntents.create')!.params.amount)
    expect(capture.opts.idempotencyKey).toMatch(new RegExp(`^cap:${smokeId}:\\d+$`))
    const cancel = fake.calls.find((c) => c.op === 'paymentIntents.cancel')!
    expect(cancel.params).toEqual({ cancellation_reason: 'requested_by_customer' })
    expect(cancel.opts.idempotencyKey).toMatch(new RegExp(`^rel:${smokeId}:\\d+$`))
  })

  it('S4, S5, S6 attach the three SCA / decline test cards by their pm_card_ tokens', async () => {
    const fake = fakeStripe()
    await run({ key: TEST_KEY, client: fake.client })
    const tokens = fake.calls.filter((c) => c.op === 'paymentMethods.attach').map((c) => c.params.token)
    for (const t of [
      'pm_card_authenticationRequired',
      'pm_card_authenticationRequiredChargeDeclinedInsufficientFunds',
      'pm_card_chargeCustomerFail',
    ]) {
      expect(tokens).toContain(t)
    }
  })

  it('S8 searches by metadata cofBookingId and finds the S1 PaymentIntent', async () => {
    const fake = fakeStripe()
    await run({ key: TEST_KEY, client: fake.client })
    const search = fake.calls.find((c) => c.op === 'paymentIntents.search')!
    expect(search.params.query).toContain(`metadata['cofBookingId']:'${smokeId}'`)
  })

  it('carries no personal data into Stripe (customer has only synthetic metadata)', async () => {
    const fake = fakeStripe()
    await run({ key: TEST_KEY, client: fake.client })
    const customer = fake.calls.find((c) => c.op === 'customers.create')!
    expect(Object.keys(customer.params).sort()).toEqual(['metadata'])
    expect(JSON.stringify(fake.calls)).not.toMatch(/@/)
  })

  it('cleans the test customer up at the end (best effort)', async () => {
    const fake = fakeStripe()
    await run({ key: TEST_KEY, client: fake.client })
    expect(fake.calls.some((c) => c.op === 'customers.del')).toBe(true)
  })
})

describe('a scenario Stripe does not reproduce is a FAIL with the observed value, never skipped', () => {
  it('S4 FAILs with exit 1 when the always-authenticate card is accepted off-session', async () => {
    const fake = fakeStripe({ authCardSucceeds: true })
    const res = await run({ key: TEST_KEY, client: fake.client })
    const verdicts = verdictLines(res.out)
    expect(verdicts).toHaveLength(8)
    const s4 = verdicts.find((l) => l.includes('S4_'))!
    expect(s4).toMatch(/^FAIL S4_\S+ expected=\S+ observed=\S+/)
    expect(s4).toContain('authentication_required')
    expect(verdicts.filter((l) => l.startsWith('PASS ')).length).toBe(7)
    expect(res.code).toBe(1)
  })

  it('S7 FAILs when the same idempotency key does not replay the same PaymentIntent', async () => {
    const fake = fakeStripe({ noReplay: true })
    const res = await run({ key: TEST_KEY, client: fake.client })
    const s7 = verdictLines(res.out).find((l) => l.includes('S7_'))!
    expect(s7.startsWith('FAIL ')).toBe(true)
    expect(res.code).toBe(1)
  })

  it('S8 FAILs (not skipped) when search finds nothing, after retrying for index delay', async () => {
    const fake = fakeStripe({ breakSearch: true })
    const res = await run({ key: TEST_KEY, client: fake.client })
    const s8 = verdictLines(res.out).find((l) => l.includes('S8_'))!
    expect(s8).toMatch(/^FAIL S8_\S+ expected=\S+ observed=\S+/)
    expect(fake.calls.filter((c) => c.op === 'paymentIntents.search').length).toBeGreaterThan(1)
    expect(res.code).toBe(1)
  })

  it('reports dependent scenarios as FAIL (not skipped) when S1 cannot hold', async () => {
    const fake = fakeStripe()
    fake.client.paymentMethods.attach = async () => {
      throw cardError('resource_missing')
    }
    const res = await run({ key: TEST_KEY, client: fake.client })
    const verdicts = verdictLines(res.out)
    expect(verdicts).toHaveLength(8)
    expect(verdicts.some((l) => l.startsWith('PASS '))).toBe(false)
    expect(res.code).toBe(1)
  })
})

describe('secret custody', () => {
  it('no output contains the key, sk_test_ or sk_live_ (even if Stripe echoes the key in an error)', async () => {
    const fake = fakeStripe()
    const original = fake.client.paymentIntents.create
    fake.client.paymentIntents.create = async (p: any, o: any) => {
      if (p.metadata.attempt === '3') {
        const e: any = new Error(`Invalid API Key provided: ${TEST_KEY}`)
        e.code = 'api_key_invalid'
        throw e
      }
      return original(p, o)
    }
    const res = await run({ key: TEST_KEY, client: fake.client })
    for (const needle of [TEST_KEY, 'sk_test_', 'sk_live_', 'whsec_']) expect(res.all).not.toContain(needle)
  })
})
