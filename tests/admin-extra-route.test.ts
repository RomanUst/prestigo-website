// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'
import { createFakeStripe, type FakeStripe } from './helpers/fake-stripe'

/**
 * Phase 91 plan 91-08 (EXTRA-01; D-09, D-10, D-12, D-13, D-15, D-16): POST and GET /api/admin/bookings/[id]/extra. The route
 * and the extra-charge engine run for real against the in-memory payments database and the fake Stripe.
 */

const { world, mockSendEmail, mockWaitingRate } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    stripe: null as unknown,
    auth: 'admin' as 'admin' | '401' | '403',
  },
  mockSendEmail: vi.fn(),
  mockWaitingRate: { value: {} as Record<string, number> },
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: ADMIN_ID }, error: null }
  }),
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db!.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
vi.mock('@/lib/payments/stripe', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/stripe')>()),
  getPaymentsStripe: () => world.stripe,
}))
vi.mock('@/lib/payments/emails/send', () => ({ sendPaymentEmail: mockSendEmail, bookingEmailDataFromRow: (r: unknown) => r }))
vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: async () => ({ waitingRate: mockWaitingRate.value }),
}))

import { GET, POST } from '@/app/api/admin/bookings/[id]/extra/route'

const ID = '77777777-7777-4777-8777-777777777777'

let db: FakePaymentsDb
let fake: FakeStripe

function seed(over: Record<string, unknown> = {}, consentVersion: string | null = '2026-11-3') {
  db = createFakePaymentsDb({
    bookings: [
      {
        id: ID,
        status: 'completed',
        booking_source: 'online',
        payment_mode: 'card_hold',
        payment_state: 'captured',
        booking_reference: 'PRG-20261101-EXTR01',
        client_email: 'anna@example.com',
        locale: 'en',
        vehicle_class: 'business',
        payment_currency: 'eur',
        payment_amount_minor: 10000,
        captured_amount_minor: 10000,
        payment_intent_id: 'pi_original_capture',
        hold_payment_intent_id: 'pi_original_hold',
        stripe_customer_id: 'cus_1',
        stripe_payment_method_id: 'pm_ok',
        ...over,
      },
    ],
  })
  if (consentVersion) {
    db.state.booking_payment_consents.push({
      id: 'consent-1',
      booking_id: ID,
      text_version: consentVersion,
      accepted_at: new Date(Date.now() - 86_400_000).toISOString(),
    })
  }
  world.db = db
}

const row = () => db.state.bookings.find((b) => b.id === ID)!
const ledger = (kind?: string) => db.state.booking_payment_events.filter((e) => e.booking_id === ID && (kind ? e.kind === kind : true))
const charges = () => db.state.booking_extra_charges.filter((c) => c.booking_id === ID)

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}
function post(body: unknown, id = ID) {
  return POST(
    new Request(`http://localhost/api/admin/bookings/${id}/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params(id),
  )
}
function get(query = '', id = ID) {
  return GET(new Request(`http://localhost/api/admin/bookings/${id}/extra${query}`), params(id))
}

beforeEach(() => {
  vi.clearAllMocks()
  world.auth = 'admin'
  fake = createFakeStripe()
  world.stripe = fake.stripe
  mockSendEmail.mockResolvedValue('sent')
  mockWaitingRate.value = {}
  seed()
})

describe('tracer: POST other on a completed captured card booking charges the saved card off-session (EXTRA-01)', () => {
  it('charges 1500 eur once: admin_action first, card_extra PaymentIntent with key extra:<id>:1, extra_charged, receipt', async () => {
    const res = await post({ kind: 'other', description: 'Airport parking', amount_minor: 1500 })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { outcome: string; charge_id: string; amount_minor: number; currency: string }
    expect(json).toEqual({ outcome: 'charged', charge_id: expect.any(String), amount_minor: 1500, currency: 'eur' })

    // Stripe: one create, the saved customer and card, off-session, the card_extra kind, the key from the row id.
    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(1)
    expect(creates[0].params).toMatchObject({
      amount: 1500,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_ok',
      off_session: true,
      confirm: true,
      metadata: { kind: 'card_extra', cofBookingId: ID, extraChargeId: json.charge_id },
    })
    expect(creates[0].idempotencyKey).toBe(`extra:${json.charge_id}:1`)

    // Ledger: the click is on record BEFORE the Stripe call, then extra_charged with the PaymentIntent id.
    const kinds = ledger().map((e) => e.kind)
    expect(kinds).toEqual(['admin_action', 'extra_charged'])
    const [click, done] = ledger()
    expect(click).toMatchObject({ error_code: 'extra_charge', amount_minor: 1500, currency: 'eur', actor_type: 'admin', actor_id: ADMIN_ID })
    expect(String(click.event_key)).toMatch(new RegExp(`^admin:extra_charge:${ID}:\\d+:[0-9a-f]{8}$`))
    const piId = String((fake.state.paymentIntents.values().next().value as { id: string }).id)
    expect(done).toMatchObject({ event_key: `extra_charged:${json.charge_id}`, stripe_object_id: piId, amount_minor: 1500, currency: 'eur' })

    // The charge row.
    expect(charges()).toHaveLength(1)
    expect(charges()[0]).toMatchObject({
      id: json.charge_id,
      kind: 'other',
      status: 'charged',
      currency: 'eur',
      amount_minor: 1500,
      description: 'Airport parking',
      attempt: 1,
      stripe_payment_intent_id: piId,
    })
    expect(typeof charges()[0].charged_at).toBe('string')

    // The booking's own payment is untouched: the extra PaymentIntent is NEVER the booking's payment_intent_id.
    expect(row().payment_intent_id).toBe('pi_original_capture')
    expect(row().hold_payment_intent_id).toBe('pi_original_hold')
    expect(row().payment_state).toBe('captured')
    expect(row().status).toBe('completed')
    expect(row().captured_amount_minor).toBe(10000)

    // The client receipt.
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({
      kind: 'extra_charged',
      variant: 'other',
      feeMinor: 1500,
      extraItem: 'Airport parking',
      eventKey: `email:extra_charged:${json.charge_id}`,
    })
  })

  it('never writes the description into the ledger or the console', async () => {
    const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')]
    await post({ kind: 'other', description: 'Secret errand for Mr Smith', amount_minor: 2500 })
    expect(JSON.stringify(ledger())).not.toContain('Secret errand')
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain('Secret errand')
    spies.forEach((s) => s.mockRestore())
  })
})

describe('guards before the business rules', () => {
  it('unauthenticated -> 401 and non-admin -> 403, both before the body is parsed and with no write', async () => {
    world.auth = '401'
    expect((await post('{ not json')).status).toBe(401)
    expect((await get('?minutes=30')).status).toBe(401)
    world.auth = '403'
    expect((await post('{ not json')).status).toBe(403)
    expect((await get('?minutes=30')).status).toBe(403)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('a malformed id is a 400, malformed JSON is a 400, an unknown booking is a 404', async () => {
    expect((await post({ kind: 'other', description: 'Parking', amount_minor: 100 }, 'not-a-uuid')).status).toBe(400)
    expect((await post('{ not json')).status).toBe(400)
    const other = '88888888-8888-4888-8888-888888888888'
    expect((await post({ kind: 'other', description: 'Parking', amount_minor: 100 }, other)).status).toBe(404)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('a booking that is not eligible answers 422 action_not_allowed with the reason and charges nothing', async () => {
    row().status = 'confirmed'
    const res = await post({ kind: 'other', description: 'Parking', amount_minor: 100 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'not_completed' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })
})

describe('D-13 / strict schemas: what the body may carry', () => {
  const valid = { kind: 'other', description: 'Airport parking', amount_minor: 1500 }

  it('amount_minor 1 and 99 999 999 are accepted', async () => {
    expect((await post({ ...valid, amount_minor: 1 })).status).toBe(200)
    seed()
    expect((await post({ ...valid, amount_minor: 99_999_999 })).status).toBe(200)
  })

  it('amount_minor 0, -100, 12.5, 100 000 000 and a string are 400', async () => {
    for (const amount_minor of [0, -100, 12.5, 100_000_000, '1500']) {
      expect((await post({ ...valid, amount_minor })).status).toBe(400)
    }
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('a description of 2 or 201 characters, blank, or with a line break is 400', async () => {
    for (const description of ['ab', 'x'.repeat(201), '   ', 'two\nlines', 'tab\there', 'sep arated']) {
      expect((await post({ ...valid, description })).status).toBe(400)
    }
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('a currency, a booking id or any unknown key in the body is 400 (the currency comes from the booking row)', async () => {
    expect((await post({ ...valid, currency: 'czk' })).status).toBe(400)
    expect((await post({ ...valid, booking_id: ID })).status).toBe(400)
    expect((await post({ ...valid, whatever: 1 })).status).toBe(400)
    expect((await post({ kind: 'waiting', minutes: 30, expected_amount_minor: 1000, currency: 'czk' })).status).toBe(400)
    expect((await post({ kind: 'unknown' })).status).toBe(400)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('the description is trimmed before it is stored', async () => {
    await post({ ...valid, description: '  Airport parking  ' })
    expect(charges()[0].description).toBe('Airport parking')
  })
})

describe('GET ?minutes=N: the waiting amount the operator confirms (D-16)', () => {
  it('business EUR at rate 12.5, 45 minutes -> 3800, 3 blocks, no-store', async () => {
    mockWaitingRate.value = { business: 12.5 }
    const res = await get('?minutes=45')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ amount_minor: 3800, currency: 'eur', blocks: 3, rate_per_block_eur: 12.5 })
  })

  it('a CZK booking: eurToCzk(38) x 100', async () => {
    const { eurToCzk } = await import('@/lib/currency')
    seed({ payment_currency: 'czk' })
    mockWaitingRate.value = { business: 12.5 }
    const res = await get('?minutes=45')
    expect(await res.json()).toMatchObject({ amount_minor: eurToCzk(38) * 100, currency: 'czk', blocks: 3 })
  })

  it('a class without a rate answers 422 waiting_rate_missing', async () => {
    seed({ vehicle_class: 'first_class' })
    mockWaitingRate.value = { business: 12.5 }
    const res = await get('?minutes=30')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'waiting_rate_missing' })
  })

  it('minutes 0, 481, abc, 1.5 and missing are 400', async () => {
    mockWaitingRate.value = { business: 12.5 }
    for (const q of ['?minutes=0', '?minutes=481', '?minutes=abc', '?minutes=1.5', '']) {
      expect((await get(q)).status).toBe(400)
    }
  })

  it('an ineligible booking answers 422 action_not_allowed with the reason; a bad id is 400; unknown is 404', async () => {
    mockWaitingRate.value = { business: 12.5 }
    row().booking_source = 'gnet'
    const res = await get('?minutes=30')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'partner' })
    expect((await get('?minutes=30', 'nope')).status).toBe(400)
    expect((await get('?minutes=30', '88888888-8888-4888-8888-888888888888')).status).toBe(404)
  })
})

describe('POST waiting, decline, busy and resume over HTTP', () => {
  it('waiting with the stated amount is charged and the row keeps minutes, blocks and the rate', async () => {
    mockWaitingRate.value = { business: 12.5 }
    const res = await post({ kind: 'waiting', minutes: 45, expected_amount_minor: 3800 })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ outcome: 'charged', amount_minor: 3800, currency: 'eur' })
    expect(charges()[0]).toMatchObject({ kind: 'waiting', minutes: 45, blocks: 3, rate_per_block_eur: 12.5 })
  })

  it('a stated amount that differs answers 409 amount_changed with the server amount; nothing is written', async () => {
    mockWaitingRate.value = { business: 12.5 }
    const res = await post({ kind: 'waiting', minutes: 45, expected_amount_minor: 3700 })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'amount_changed', amount_minor: 3800 })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(charges()).toHaveLength(0)
  })

  it('a class without a rate answers 422 waiting_rate_missing', async () => {
    seed({ vehicle_class: 'first_class' })
    const res = await post({ kind: 'waiting', minutes: 30, expected_amount_minor: 2500 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'waiting_rate_missing' })
  })

  it('a decline answers 200 declined with the code and sends no email', async () => {
    seed({ stripe_payment_method_id: 'pm_decline_insufficient' })
    const res = await post({ kind: 'other', description: 'Parking', amount_minor: 900 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'declined', charge_id: expect.any(String), code: 'insufficient_funds' })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(charges()[0].status).toBe('failed')
  })

  it('transient -> 409 payment_busy; a new POST while charging -> 409; resume before the lease -> 409; after the lease -> charged', async () => {
    fake.failNextWith('paymentIntents.create', 'connection')
    const first = await post({ kind: 'other', description: 'Parking', amount_minor: 900 })
    expect(first.status).toBe(409)
    expect(await first.json()).toEqual({ error: 'payment_busy' })
    const chargeId = charges()[0].id as string

    const again = await post({ kind: 'other', description: 'Parking', amount_minor: 900 })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'payment_busy' })

    const early = await post({ kind: 'resume', charge_id: chargeId })
    expect(early.status).toBe(409)
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(1)

    charges()[0].updated_at = new Date(Date.now() - 11 * 60_000).toISOString()
    const late = await post({ kind: 'resume', charge_id: chargeId })
    expect(late.status).toBe(200)
    expect(await late.json()).toEqual({ outcome: 'charged', charge_id: chargeId, amount_minor: 900, currency: 'eur' })
    const creates = fake.callsTo('paymentIntents.create')
    expect(creates).toHaveLength(2)
    expect(creates[1].idempotencyKey).toBe(`extra:${chargeId}:1`)
    expect(charges()).toHaveLength(1)
  })

  it('resume with a malformed charge id or an extra key is 400; of an unknown charge is 422', async () => {
    expect((await post({ kind: 'resume', charge_id: 'nope' })).status).toBe(400)
    expect((await post({ kind: 'resume', charge_id: ID, amount_minor: 5 })).status).toBe(400)
    expect((await post({ kind: 'resume', charge_id: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(422)
  })

  it('a GNet booking is refused 422 partner on POST and nothing is charged', async () => {
    row().booking_source = 'gnet'
    const res = await post({ kind: 'other', description: 'Parking', amount_minor: 900 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'partner' })
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
  })

  it('an old consent answers 422 consent_not_covered', async () => {
    seed({}, '2026-11-2')
    const res = await post({ kind: 'other', description: 'Parking', amount_minor: 900 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'action_not_allowed', reason: 'consent_not_covered' })
  })

  it('an engine failure answers 500 Payment action failed with no description in the log', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = world.db
    world.db = {
      client: {
        from: (t: string) => {
          if (t === 'booking_extra_charges' && db.state.booking_extra_charges.length === 0) {
            // the context read works; the insert is what blows up
            const real = original!.client.from(t) as Record<string, unknown>
            return new Proxy(real, {
              get(target, prop) {
                if (prop === 'insert') return () => { throw new Error('boom with Secret errand') }
                const v = target[prop as string]
                return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
              },
            })
          }
          return original!.client.from(t)
        },
        rpc: (n: string, a?: Record<string, unknown>) => original!.client.rpc(n, a),
      },
    }
    const res = await post({ kind: 'other', description: 'Secret errand', amount_minor: 900 })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Payment action failed' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Secret errand')
    expect(fake.callsTo('paymentIntents.create')).toHaveLength(0)
    spy.mockRestore()
  })
})
