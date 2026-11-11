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
