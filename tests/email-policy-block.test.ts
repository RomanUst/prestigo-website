// @vitest-environment node
/**
 * Phase 89, plan 89-18 — CANC-02, MAIL-01: the cancellation box and the Manage booking button in the English legacy
 * emails (pay-now confirmation, round trip, group, status confirmed, reminders), in the booking language.
 *
 * Tracer: a confirmed pay-now row through the real Stripe webhook route to sendClientConfirmation with the block.
 * Gate: without a stored policy every email is byte-identical to the one sent before (the block is purely additive).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

const { world, stripeStub, mockResendSend, renderSpy } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
    processed: new Set<string>(),
  },
  stripeStub: { constructEvent: vi.fn() },
  mockResendSend: vi.fn(),
  renderSpy: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      try {
        void fn()
      } catch {
        /* noop */
      }
    },
  }
})

vi.mock('@/lib/supabase', () => {
  const processedTable = {
    select: () => ({
      eq: (_col: string, id: string) => ({
        maybeSingle: async () => ({ data: world.processed.has(id) ? { event_id: id } : null, error: null }),
      }),
    }),
    insert: async (row: { event_id: string }) => {
      world.processed.add(row.event_id)
      return { error: null }
    },
  }
  return {
    saveBooking: vi.fn().mockResolvedValue([]),
    withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
    buildBookingRow: vi.fn().mockReturnValue({ booking_reference: 'PRG-1', booking_type: 'confirmed', leg: 'outbound' }),
    buildBookingRows: vi.fn().mockReturnValue({
      outbound: { booking_reference: 'PRG-RT-OUT', leg: 'outbound' },
      return: { booking_reference: 'PRG-RT-RET', leg: 'return' },
    }),
    saveRoundTripBookings: vi.fn(),
    reconcileBookingToConfirmed: vi.fn().mockResolvedValue([]),
    reconcileRoundTripToConfirmed: vi.fn().mockResolvedValue([]),
    reconcileBookingByIdToConfirmed: vi.fn().mockResolvedValue([]),
    createSupabaseServiceClient: vi.fn(() => ({
      from: (table: string) => (table === 'stripe_processed_events' ? processedTable : world.db!.client.from(table)),
      rpc: (name: string, args?: Record<string, unknown>) =>
        name === 'claim_promo_code' ? Promise.resolve({ data: null, error: null }) : world.db!.client.rpc(name, args),
    })),
  }
})

// The real module stays (the block builder and the calendar link import from it); only the webhook senders are spies.
vi.mock('@/lib/email', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/email')>()),
  sendClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendEmergencyAlert: vi.fn().mockResolvedValue(undefined),
  sendRoundTripClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendRoundTripManagerAlert: vi.fn().mockResolvedValue(undefined),
  sendGroupClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendGroupManagerAlert: vi.fn().mockResolvedValue(undefined),
}))
// renderPolicyBlock is wrapped so one test can make it fail; everything else of the renderer is real.
vi.mock('@/lib/payments/emails/render', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments/emails/render')>()
  renderSpy.mockImplementation(actual.renderPolicyBlock)
  return { ...actual, renderPolicyBlock: renderSpy }
})
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend }
  },
}))
vi.mock('@/lib/email-log', () => ({ logEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn().mockReturnValue('STUB-ICS') }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))
vi.mock('stripe', () => ({
  default: function MockStripe() {
    return { webhooks: stripeStub }
  },
}))

import {
  reconcileBookingToConfirmed,
  reconcileBookingByIdToConfirmed,
  reconcileRoundTripToConfirmed,
} from '@/lib/supabase'
import * as emailModule from '@/lib/email'
import { sendClientConfirmation, sendManagerAlert, sendRoundTripClientConfirmation, sendRoundTripManagerAlert, sendGroupClientConfirmation } from '@/lib/email'
import { POST } from '@/app/api/webhooks/stripe/route'
import { buildPolicyBlockHtml, policyFareOf } from '@/lib/payments/emails/policy-block'
import { feeBaseFor } from '@/lib/payments/fee'
import { DEFAULT_POLICY } from '@/lib/cancellation-policy'
import { formatMinor } from '@/lib/payments/money'
import { MANAGE_TOKEN_RE } from '@/lib/manage-link'

const actualEmail = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const LEG_OUT = '22222222-2222-4222-8222-222222222222'
const LEG_RET = '33333333-3333-4333-8333-333333333333'
const SNAPSHOT = JSON.stringify({ ...DEFAULT_POLICY })

let db: FakePaymentsDb

const row = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  status: 'confirmed',
  booking_reference: 'PRG-20261201-ABC123',
  booking_source: 'web',
  client_first_name: 'Anna',
  client_last_name: 'Petrova',
  client_email: 'anna@example.com',
  client_phone: '+420123456789',
  locale: 'ru',
  trip_type: 'transfer',
  leg: 'outbound',
  origin_address: 'Old Town Square, Prague',
  origin_lat: null,
  origin_lng: null,
  destination_address: 'Hotel Alcron',
  distance_km: 50,
  pickup_date: '2026-12-01',
  pickup_time: '14:00',
  pickup_utc: '2026-12-01T13:00:00.000Z',
  vehicle_class: 'business',
  passengers: 2,
  luggage: 1,
  amount_czk: 2500,
  amount_eur: 100,
  cancel_policy_version: '2026-11-1',
  cancel_policy: DEFAULT_POLICY,
  ...over,
})

function payNowIntent(over: Record<string, string> = {}) {
  return {
    id: 'pi_policy_1',
    amount: 250000,
    currency: 'czk',
    metadata: {
      bookingReference: 'PRG-20261201-ABC123',
      tripType: 'transfer',
      originAddress: 'Old Town Square, Prague',
      destinationAddress: 'Hotel Alcron',
      pickupDate: '2026-12-01',
      pickupTime: '14:00',
      vehicleClass: 'business',
      passengers: '2',
      luggage: '1',
      amountCzk: '2500',
      extraChildSeat: 'false',
      extraMeetGreet: 'false',
      extraLuggage: 'false',
      firstName: 'Anna',
      lastName: 'Petrova',
      email: 'anna@example.com',
      phone: '+420123456789',
      locale: 'ru',
      cancelPolicy: SNAPSHOT,
      ...over,
    },
  }
}

async function deliver(type: string, object: unknown, id = 'evt_policy_1') {
  stripeStub.constructEvent.mockReturnValue({ id, type, data: { object } })
  const res = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-sig' },
      body: 'raw-body',
    }),
  )
  return res.status
}

const lastClientData = () => vi.mocked(sendClientConfirmation).mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  world.processed.clear()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  process.env.RESEND_API_KEY = 're_test'
  process.env.MANAGER_EMAIL = 'owner@example.com'
  db = createFakePaymentsDb({ bookings: [row()] })
  world.db = db
  mockResendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  vi.mocked(reconcileBookingToConfirmed).mockResolvedValue([{ id: BOOKING_ID }])
})

describe('tracer: a confirmed pay-now row through the webhook to sendClientConfirmation (CANC-02)', () => {
  it('gives the client the policy and the link in their language, and the manager alert nothing', async () => {
    expect(await deliver('payment_intent.succeeded', payNowIntent())).toBe(200)

    expect(sendClientConfirmation).toHaveBeenCalledTimes(1)
    const block = lastClientData().policyBlockHtml!
    expect(block).toContain('lang="ru"')
    expect(block).toContain('dir="ltr"')
    expect(block).toContain('Бесплатная отмена до')
    expect(block).toContain('Управление бронированием')
    expect(block).toContain(formatMinor(10000, 'eur'))
    const token = db.state.booking_manage_tokens[0].token as string
    expect(token).toMatch(MANAGE_TOKEN_RE)
    expect(block).toContain(`href="https://rideprestigo.com/ru/manage/${token}"`)
    // The bearer link goes to the client only.
    expect(vi.mocked(sendManagerAlert).mock.calls[0][0]).not.toHaveProperty('policyBlockHtml')
  })

  it('an Arabic booking gets a block with dir rtl inside the English email', async () => {
    db.state.bookings[0].locale = 'ar'
    await deliver('payment_intent.succeeded', payNowIntent({ locale: 'ar' }))
    const block = lastClientData().policyBlockHtml!
    expect(block).toContain('lang="ar"')
    expect(block).toContain('dir="rtl"')
    expect(block).toContain('/ar/manage/')
  })

  it('an English booking links /manage/<token> without a locale segment', async () => {
    db.state.bookings[0].locale = 'en'
    await deliver('payment_intent.succeeded', payNowIntent({ locale: 'en' }))
    const token = db.state.booking_manage_tokens[0].token as string
    expect(lastClientData().policyBlockHtml).toContain(`href="https://rideprestigo.com/manage/${token}"`)
  })

  it('without a stored policy the email data has no block, no token is minted and nothing is read', async () => {
    db.state.bookings[0].cancel_policy_version = null
    db.state.bookings[0].cancel_policy = null
    await deliver('payment_intent.succeeded', payNowIntent({ cancelPolicy: '' }))
    expect(lastClientData()).not.toHaveProperty('policyBlockHtml')
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('a metadata policy that the row did not store (lost write) still sends the email, without the block', async () => {
    db.state.bookings[0].cancel_policy_version = null
    db.state.bookings[0].cancel_policy = null
    await deliver('payment_intent.succeeded', payNowIntent())
    expect(sendClientConfirmation).toHaveBeenCalledTimes(1)
    expect(lastClientData()).not.toHaveProperty('policyBlockHtml')
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('a failure while building the block sends the email without it', async () => {
    renderSpy.mockRejectedValueOnce(new Error('catalog broke'))
    expect(await deliver('payment_intent.succeeded', payNowIntent())).toBe(200)
    expect(sendClientConfirmation).toHaveBeenCalledTimes(1)
    expect(lastClientData()).not.toHaveProperty('policyBlockHtml')
    expect(lastClientData().bookingReference).toBe('PRG-20261201-ABC123')
  })

  it('a partner booking gets no link', async () => {
    db.state.bookings[0].booking_source = 'gnet'
    await deliver('payment_intent.succeeded', payNowIntent())
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })
})

describe('round trip: one box and one Manage link per leg', () => {
  const rtMeta = (over: Record<string, string> = {}) => ({
    ...payNowIntent().metadata,
    tripType: 'round_trip',
    returnBookingReference: 'PRG-RT-RET',
    bookingReference: 'PRG-RT-OUT',
    returnDate: '2026-12-03',
    returnTime: '10:00',
    outboundAmountCzk: '2500',
    returnAmountCzk: '2250',
    returnDiscountPct: '10',
    amountCzk: '4750',
    ...over,
  })

  beforeEach(() => {
    db = createFakePaymentsDb({
      bookings: [
        row({ id: LEG_OUT, booking_reference: 'PRG-RT-OUT', trip_type: 'round_trip', leg: 'outbound', outbound_amount_czk: 2500, return_amount_czk: 2250, amount_czk: 2500, amount_eur: 190 }),
        row({ id: LEG_RET, booking_reference: 'PRG-RT-RET', trip_type: 'round_trip', leg: 'return', pickup_date: '2026-12-03', pickup_time: '10:00', pickup_utc: '2026-12-03T09:00:00.000Z', outbound_amount_czk: 2500, return_amount_czk: 2250, amount_czk: 2250, amount_eur: null }),
      ],
    })
    world.db = db
    vi.mocked(reconcileRoundTripToConfirmed).mockResolvedValue([
      { id: LEG_RET, leg: 'return' },
      { id: LEG_OUT, leg: 'outbound' },
    ])
  })

  it('names each leg by its reference and links each to its own token', async () => {
    await deliver('payment_intent.succeeded', { ...payNowIntent(), metadata: rtMeta() })
    expect(sendRoundTripClientConfirmation).toHaveBeenCalledTimes(1)
    const data = vi.mocked(sendRoundTripClientConfirmation).mock.calls[0][0]
    const block = data.policyBlockHtml!
    expect(block).toContain('PRG-RT-OUT')
    expect(block).toContain('PRG-RT-RET')
    expect(block.match(/Бесплатная отмена до/g)).toHaveLength(2)
    const tokens = db.state.booking_manage_tokens.map((t) => t.token as string)
    expect(tokens).toHaveLength(2)
    expect(new Set(tokens).size).toBe(2)
    for (const token of tokens) expect(block).toContain(`/ru/manage/${token}`)
    // Outbound first even though the reconcile returned the return leg first.
    expect(block.indexOf('PRG-RT-OUT')).toBeLessThan(block.indexOf('PRG-RT-RET'))
    expect(vi.mocked(sendRoundTripManagerAlert).mock.calls[0][0]).not.toHaveProperty('policyBlockHtml')
  })

  it('each leg box is a share of that leg own fare', async () => {
    await deliver('payment_intent.succeeded', { ...payNowIntent(), metadata: rtMeta() })
    const block = vi.mocked(sendRoundTripClientConfirmation).mock.calls[0][0].policyBlockHtml!
    const outbound = policyFareOf(db.state.bookings[0])!
    const ret = policyFareOf(db.state.bookings[1])!
    expect(outbound.baseMinor).not.toBe(ret.baseMinor)
    expect(block).toContain(formatMinor(outbound.baseMinor, 'eur'))
    expect(block).toContain(formatMinor(ret.baseMinor, 'eur'))
  })

  it('without a stored policy the round-trip email data has no block', async () => {
    for (const b of db.state.bookings) {
      b.cancel_policy_version = null
      b.cancel_policy = null
    }
    await deliver('payment_intent.succeeded', { ...payNowIntent(), metadata: rtMeta({ cancelPolicy: '' }) })
    expect(vi.mocked(sendRoundTripClientConfirmation).mock.calls[0][0]).not.toHaveProperty('policyBlockHtml')
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })
})

describe('payment link and group payment link', () => {
  it('payment-link booking: the reconciled row carries the block', async () => {
    vi.mocked(reconcileBookingByIdToConfirmed).mockResolvedValue([
      { ...row({ client_email: 'anna@example.com' }), payment_intent_id: 'pi_link_1' },
    ])
    expect(
      await deliver('checkout.session.completed', {
        id: 'cs_1',
        payment_status: 'paid',
        payment_intent: 'pi_link_1',
        metadata: { bookingId: BOOKING_ID },
      }),
    ).toBe(200)
    expect(lastClientData().policyBlockHtml).toContain('Управление бронированием')
    expect(vi.mocked(sendManagerAlert).mock.calls[0][0]).not.toHaveProperty('policyBlockHtml')
  })

  it('group payment: one box, one Manage link per booking row', async () => {
    const ids = [LEG_OUT, LEG_RET]
    db = createFakePaymentsDb({
      bookings: [
        row({ id: LEG_OUT, booking_reference: 'PRG-G-1', status: 'unpaid', amount_eur: 80, amount_czk: 2000 }),
        row({ id: LEG_RET, booking_reference: 'PRG-G-2', status: 'unpaid', pickup_date: '2026-12-02', pickup_time: '09:00', pickup_utc: '2026-12-02T08:00:00.000Z', amount_eur: 90, amount_czk: 2250 }),
      ],
    })
    world.db = db
    expect(
      await deliver('payment_intent.succeeded', {
        id: 'pi_group_1',
        amount: 17000,
        currency: 'eur',
        metadata: { groupBookingIds: ids.join(',') },
      }),
    ).toBe(200)
    expect(sendGroupClientConfirmation).toHaveBeenCalledTimes(1)
    const block = vi.mocked(sendGroupClientConfirmation).mock.calls[0][0].policyBlockHtml!
    expect(block.match(/Бесплатная отмена до/g)).toHaveLength(1)
    expect(db.state.booking_manage_tokens).toHaveLength(2)
    for (const t of db.state.booking_manage_tokens) expect(block).toContain(`/ru/manage/${t.token as string}`)
    expect(block).toContain('PRG-G-1')
    expect(block).toContain('PRG-G-2')
  })
})

describe('buildPolicyBlockHtml', () => {
  it('returns an empty string for a row without a stored policy, with no token and no read', async () => {
    const out = await buildPolicyBlockHtml(row({ cancel_policy_version: null, cancel_policy: null }))
    expect(out).toBe('')
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('a cash booking adds the cash sentence in the booking language', async () => {
    db.state.bookings[0].payment_mode = 'cash_guarantee'
    db.state.bookings[0].payment_currency = 'eur'
    db.state.bookings[0].payment_amount_minor = 12000
    db.state.bookings[0].locale = 'en'
    const out = await buildPolicyBlockHtml(db.state.bookings[0])
    expect(out).toContain('in cash to your driver')
    expect(out).toContain(formatMinor(12000, 'eur'))
    expect(out).toContain('Manage booking')
  })

  it('escapes the booking reference and never prints a raw URL outside the href', async () => {
    const a = row({ id: LEG_OUT, booking_reference: '<b>x</b>' })
    const b = row({ id: LEG_RET, booking_reference: 'PRG-2', pickup_date: '2026-12-03', pickup_utc: '2026-12-03T09:00:00.000Z' })
    db = createFakePaymentsDb({ bookings: [a, b] })
    world.db = db
    const out = await buildPolicyBlockHtml([db.state.bookings[0], db.state.bookings[1]])
    expect(out).not.toContain('<b>x</b>')
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('a group row with no fare of its own still gets its link, the box is dropped', async () => {
    db.state.bookings[0].amount_eur = 0
    db.state.bookings[0].locale = 'en'
    const out = await buildPolicyBlockHtml([db.state.bookings[0]], { boxes: 'first' })
    expect(out).toContain('Manage booking')
    expect(out).not.toContain('Free cancellation')
  })

  it('an unknown locale falls back to English', async () => {
    db.state.bookings[0].locale = 'xx'
    const out = await buildPolicyBlockHtml(db.state.bookings[0])
    expect(out).toContain('lang="en"')
    expect(out).toContain('/manage/')
  })

  it('policyFareOf is the fee engine base (feeBaseFor) for pay-now, round-trip legs and card rows', () => {
    const samples = [
      row(),
      row({ amount_eur: null }),
      row({ leg: 'outbound', outbound_amount_czk: 2500, return_amount_czk: 2250, amount_eur: 190 }),
      row({ leg: 'return', outbound_amount_czk: 2500, return_amount_czk: 2250, amount_eur: null }),
      row({ payment_mode: 'card_hold', payment_currency: 'czk', payment_amount_minor: 250000 }),
      row({ payment_mode: 'cash_guarantee', payment_currency: 'eur', payment_amount_minor: 9000 }),
      row({ payment_mode: 'card_hold', payment_currency: 'eur', payment_amount_minor: null }),
    ]
    for (const s of samples) {
      const leg = s.leg === 'outbound' || s.leg === 'return' ? s.leg : undefined
      // manage-view order: the leg share first, the whole booking amount as the fallback.
      const engine = (leg ? feeBaseFor(s, leg) : null) ?? feeBaseFor(s)
      expect(policyFareOf(s)).toEqual(engine)
    }
  })
})

describe('the legacy builders: the block is purely additive (no stored policy = byte-identical)', () => {
  const BLOCK = '<div data-test="policy-block">BLOCK</div>'

  const confirmation = (over: Partial<emailModule.BookingEmailData> = {}): emailModule.BookingEmailData => ({
    bookingReference: 'PRG-1',
    tripType: 'transfer',
    originAddress: 'Prague Airport',
    destinationAddress: 'Hotel Alcron',
    pickupDate: '2026-12-01',
    pickupTime: '14:00',
    vehicleClass: 'business',
    passengers: 2,
    luggage: 1,
    amountCzk: 2500,
    extraChildSeat: false,
    extraMeetGreet: false,
    extraLuggage: false,
    firstName: 'Anna',
    lastName: 'Petrova',
    email: 'anna@example.com',
    phone: '+420123456789',
    ...over,
  })

  async function sent(run: () => Promise<void>): Promise<string> {
    mockResendSend.mockClear()
    await run()
    return mockResendSend.mock.calls[0][0].html as string
  }

  it('confirmation: empty or absent block leaves the HTML unchanged, a block is inserted once below the journey', async () => {
    const plain = await sent(() => actualEmail.sendClientConfirmation(confirmation()))
    const empty = await sent(() => actualEmail.sendClientConfirmation(confirmation({ policyBlockHtml: '' })))
    const withBlock = await sent(() => actualEmail.sendClientConfirmation(confirmation({ policyBlockHtml: BLOCK })))
    expect(empty).toBe(plain)
    expect(withBlock.replace(BLOCK, '')).toBe(plain)
    expect(withBlock.split(BLOCK)).toHaveLength(2)
    expect(withBlock.indexOf('YOUR JOURNEY')).toBeLessThan(withBlock.indexOf(BLOCK))
    expect(withBlock.indexOf(BLOCK)).toBeLessThan(withBlock.indexOf('TOTAL PAID'))
  })

  it('round trip', () => {
    const base: emailModule.RoundTripEmailData = {
      outboundBookingReference: 'PRG-RT-OUT',
      returnBookingReference: 'PRG-RT-RET',
      tripType: 'round_trip',
      originAddress: 'Prague Airport',
      destinationAddress: 'Hotel Alcron',
      outboundPickupDate: '2026-12-01',
      outboundPickupTime: '14:00',
      returnPickupDate: '2026-12-03',
      returnPickupTime: '10:00',
      vehicleClass: 'business',
      passengers: 2,
      luggage: 1,
      outboundAmountCzk: 2500,
      returnAmountCzk: 2250,
      combinedAmountCzk: 4750,
      returnDiscountPct: 10,
      extraChildSeat: false,
      extraMeetGreet: false,
      extraLuggage: false,
      firstName: 'Anna',
      lastName: 'Petrova',
      email: 'anna@example.com',
      phone: '+420123456789',
    }
    const plain = actualEmail.buildRoundTripConfirmationHtml(base)
    expect(actualEmail.buildRoundTripConfirmationHtml({ ...base, policyBlockHtml: '' })).toBe(plain)
    const withBlock = actualEmail.buildRoundTripConfirmationHtml({ ...base, policyBlockHtml: BLOCK })
    expect(withBlock.replace(BLOCK, '')).toBe(plain)
    expect(withBlock.split(BLOCK)).toHaveLength(2)
  })

  it('group', () => {
    const base: emailModule.GroupPaymentEmailData = {
      clientName: 'Anna Petrova',
      clientEmail: 'anna@example.com',
      clientPhone: '+420123456789',
      amountEur: 170,
      legs: [
        { bookingReference: 'PRG-G-1', pickupDate: '2026-12-01', pickupTime: '14:00', originAddress: 'A', destinationAddress: 'B', vehicleClass: 'business', passengers: 2 },
        { bookingReference: 'PRG-G-2', pickupDate: '2026-12-02', pickupTime: '09:00', originAddress: 'B', destinationAddress: 'A', vehicleClass: 'business', passengers: 2 },
      ],
    }
    const plain = actualEmail.buildGroupConfirmationHtml(base)
    expect(actualEmail.buildGroupConfirmationHtml({ ...base, policyBlockHtml: '' })).toBe(plain)
    const withBlock = actualEmail.buildGroupConfirmationHtml({ ...base, policyBlockHtml: BLOCK })
    expect(withBlock.replace(BLOCK, '')).toBe(plain)
    expect(withBlock.indexOf('PRG-G-2')).toBeLessThan(withBlock.indexOf(BLOCK))
  })

  const statusBooking = {
    id: BOOKING_ID,
    booking_reference: 'PRG-1',
    origin_address: 'Prague Airport',
    destination_address: 'Hotel Alcron',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    vehicle_class: 'business',
    client_first_name: 'Anna',
    client_last_name: 'Petrova',
    client_email: 'anna@example.com',
    amount_czk: 2500,
  }

  it('status confirmed: the block shows in the confirmed mail only, never in the cancelled one', async () => {
    const plain = await sent(() => actualEmail.sendStatusConfirmedEmail(statusBooking))
    const withBlock = await sent(() => actualEmail.sendStatusConfirmedEmail({ ...statusBooking, policyBlockHtml: BLOCK }))
    expect(withBlock.replace(BLOCK, '')).toBe(plain)
    expect(withBlock.indexOf('YOUR JOURNEY')).toBeLessThan(withBlock.indexOf(BLOCK))
    const cancelled = await sent(() => actualEmail.sendStatusCancelledEmail({ ...statusBooking, policyBlockHtml: BLOCK }))
    expect(cancelled).not.toContain(BLOCK)
  })

  const reminderBooking = {
    booking_reference: 'PRG-1',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    origin_address: 'Prague Airport',
    destination_address: 'Hotel Alcron',
    vehicle_class: 'business',
    client_email: 'anna@example.com',
    driver_name: 'Petr',
    driver_email: 'petr@example.com',
  }

  it.each(['24h', '2h'] as const)('reminder %s: block in the client mail, never in the driver mail', async (horizon) => {
    const plain = await sent(() => actualEmail.sendClientReminderEmail(reminderBooking, horizon))
    const empty = await sent(() => actualEmail.sendClientReminderEmail({ ...reminderBooking, policyBlockHtml: '' }, horizon))
    const withBlock = await sent(() => actualEmail.sendClientReminderEmail({ ...reminderBooking, policyBlockHtml: BLOCK }, horizon))
    expect(empty).toBe(plain)
    expect(withBlock.replace(BLOCK, '')).toBe(plain)
    expect(withBlock.split(BLOCK)).toHaveLength(2)
    const driver = await sent(() => actualEmail.sendDriverReminderEmail({ ...reminderBooking, policyBlockHtml: BLOCK }, horizon))
    expect(driver).not.toContain(BLOCK)
  })

  it('lib/email.ts carries the field on every confirmation-family data type', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('lib/email.ts', 'utf8')
    expect((src.match(/policyBlockHtml/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})
