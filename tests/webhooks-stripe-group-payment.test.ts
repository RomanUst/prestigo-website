import { describe, it, expect, vi, beforeEach } from 'vitest'

// Group payment link: one Stripe link settles several manual bookings
// (metadata.groupBookingIds). The webhook must confirm every unpaid row and
// send ONE combined client confirmation + ONE manager alert with the total
// Stripe captured — and nothing on a retry where no row was newly confirmed.

const { stripeStub } = vi.hoisted(() => ({ stripeStub: { constructEvent: vi.fn() } }))

const { db } = vi.hoisted(() => {
  const db = {
    rows: {} as Record<string, Record<string, unknown>>,
    flips: [] as string[][],
    emailLog: [] as Array<{ booking_id: string; email_type: string; recipient: string }>,
  }
  return { db }
})

// Minimal stateful Supabase stub. Each awaited builder runs as ONE atomic
// statement (like a single Postgres UPDATE), but yields to the event loop
// first so two concurrent webhook handlers genuinely interleave.
function makeBuilder(table: string) {
  const state: {
    op: 'select' | 'update' | 'insert'
    patch?: Record<string, unknown>
    eq: Record<string, unknown>
    is: Record<string, unknown>
    in?: string[]
  } = { op: 'select', eq: {}, is: {} }
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = vi.fn(chain)
  builder.gte = vi.fn(chain)
  builder.limit = vi.fn(chain)
  builder.in = vi.fn((_col: string, vals: string[]) => { state.in = vals; return builder })
  builder.eq = vi.fn((col: string, val: unknown) => { state.eq[col] = val; return builder })
  builder.is = vi.fn((col: string, val: unknown) => { state.is[col] = val; return builder })
  builder.update = vi.fn((patch: Record<string, unknown>) => { state.op = 'update'; state.patch = patch; return builder })
  builder.insert = vi.fn((row: Record<string, unknown>) => { state.op = 'insert'; state.patch = row; return builder })
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null }))
  builder.then = async (resolve: (v: unknown) => unknown) => {
    await new Promise((r) => setTimeout(r, 0))
    if (table === 'email_log') {
      if (state.op === 'insert') {
        db.emailLog.push(state.patch as (typeof db.emailLog)[number])
        return resolve({ error: null })
      }
      const hits = db.emailLog.filter((e) =>
        e.booking_id === state.eq.booking_id && e.email_type === state.eq.email_type && e.recipient === state.eq.recipient)
      return resolve({ data: hits, error: null })
    }
    const matches = Object.values(db.rows).filter((r) =>
      (!state.in || state.in.includes(r.id as string)) &&
      Object.entries(state.eq).every(([k, v]) => r[k] === v) &&
      Object.entries(state.is).every(([k, v]) => (r[k] ?? null) === v))
    if (state.op === 'update') {
      for (const r of matches) Object.assign(r, state.patch)
      if (state.patch?.status === 'confirmed') db.flips.push(matches.map((r) => r.id as string))
    }
    return resolve({ data: matches.map((r) => ({ ...r })), error: null })
  }
  return builder
}

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } } }
})

vi.mock('@/lib/supabase', () => ({
  saveBooking: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
  buildBookingRow: vi.fn(),
  buildBookingRows: vi.fn(),
  saveRoundTripBookings: vi.fn(),
  reconcileBookingToConfirmed: vi.fn(),
  reconcileRoundTripToConfirmed: vi.fn(),
  reconcileBookingByIdToConfirmed: vi.fn(),
  createSupabaseServiceClient: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
}))

vi.mock('@/lib/email', () => ({
  sendClientConfirmation: vi.fn(),
  sendManagerAlert: vi.fn(),
  sendEmergencyAlert: vi.fn(),
  sendRoundTripClientConfirmation: vi.fn(),
  sendRoundTripManagerAlert: vi.fn(),
  sendGroupClientConfirmation: vi.fn().mockResolvedValue(undefined),
  sendGroupManagerAlert: vi.fn().mockResolvedValue(undefined),
}))

const { mockOperatorAlert } = vi.hoisted(() => ({ mockOperatorAlert: vi.fn() }))
vi.mock('@/lib/payments/alerts', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/alerts')>()),
  sendPaymentOperatorAlert: mockOperatorAlert,
}))

vi.mock('@/lib/ics', () => ({ buildIcs: vi.fn() }))
vi.mock('@/lib/qstash', () => ({ scheduleQStashReminder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics-server', () => ({ sendGa4Purchase: vi.fn().mockResolvedValue(true) }))
vi.mock('stripe', () => ({ default: function MockStripe() { return { webhooks: stripeStub } } }))

import { sendGroupClientConfirmation, sendGroupManagerAlert, sendClientConfirmation } from '@/lib/email'
import { scheduleQStashReminder } from '@/lib/qstash'
import { sendGa4Purchase } from '@/lib/analytics-server'
import { POST } from '@/app/api/webhooks/stripe/route'

const ID_A = '11111111-1111-1111-1111-111111111111'
const ID_B = '22222222-2222-2222-2222-222222222222'

function row(id: string, ref: string, date: string, operatorNotes: string | null = null) {
  return {
    id,
    status: 'unpaid',
    operator_notes: operatorNotes,
    booking_reference: ref,
    trip_type: 'transfer',
    origin_address: `From ${ref}`,
    destination_address: `To ${ref}`,
    pickup_date: date,
    pickup_time: '10:00',
    vehicle_class: 'business',
    passengers: 2,
    amount_czk: 0,
    amount_eur: null,
    client_first_name: 'Travel',
    client_last_name: 'Agency',
    client_email: 'ops@agency.example',
    client_phone: '',
    flight_number: null,
    special_requests: 'internal note',
    pickup_utc: `${date}T08:00:00Z`,
    locale: null,
  }
}

function request(): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: 'raw',
  })
}

function paymentIntentEvent() {
  return {
    id: 'evt_group_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_group_1',
        amount: 185250,
        amount_received: 185250,
        currency: 'eur',
        metadata: { groupBookingIds: `${ID_B},${ID_A}` },
      },
    },
  }
}

const ID_C = '33333333-3333-3333-3333-333333333333'

function checkoutEvent(ids: string) {
  return {
    id: 'evt_group_cs',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        payment_status: 'paid',
        payment_intent: 'pi_group_1',
        amount_total: 185250,
        currency: 'eur',
        metadata: { groupBookingIds: ids },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOperatorAlert.mockResolvedValue('sent')
  db.flips = []
  db.emailLog = []
  db.rows = {
    [ID_A]: row(ID_A, 'PRG-A', '2026-10-01', 'existing'),
    [ID_B]: row(ID_B, 'PRG-B', '2026-10-04'),
  }
})

describe('group payment link webhook', () => {
  it('confirms every row and sends one combined client + manager email with the Stripe total', async () => {
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    const res = await POST(request())
    expect(res.status).toBe(200)

    // One atomic flip covering every leg
    expect(db.flips).toEqual([[ID_A, ID_B]])
    expect(db.rows[ID_A].status).toBe('confirmed')
    expect(db.rows[ID_B].status).toBe('confirmed')
    expect(db.rows[ID_A].operator_notes).toBe('existing\nPaid via group payment link (PI pi_group_1).')
    expect(db.rows[ID_B].operator_notes).toBe('Paid via group payment link (PI pi_group_1).')

    expect(sendGroupClientConfirmation).toHaveBeenCalledTimes(1)
    expect(sendGroupManagerAlert).toHaveBeenCalledTimes(1)
    expect(sendClientConfirmation).not.toHaveBeenCalled()

    const data = vi.mocked(sendGroupClientConfirmation).mock.calls[0][0]
    expect(data.amountEur).toBe(1852.5)
    expect(data.clientEmail).toBe('ops@agency.example')
    // Legs sorted chronologically regardless of metadata order
    expect(data.legs.map((l) => l.bookingReference)).toEqual(['PRG-A', 'PRG-B'])

    expect(scheduleQStashReminder).toHaveBeenCalledTimes(2)
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendGa4Purchase).mock.calls[0][0].valueEur).toBe(1852.5)
  })

  it('reads the total from checkout.session.completed amount_total', async () => {
    const ev = checkoutEvent(ID_A)
    ev.data.object.amount_total = 50000
    stripeStub.constructEvent.mockReturnValue(ev)

    await POST(request())
    expect(vi.mocked(sendGroupClientConfirmation).mock.calls[0][0].amountEur).toBe(500)
  })

  it('sends nothing on a retry where no row is still unpaid', async () => {
    for (const r of Object.values(db.rows)) r.status = 'confirmed'
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    await POST(request())
    expect(sendGroupClientConfirmation).not.toHaveBeenCalled()
    expect(sendGroupManagerAlert).not.toHaveBeenCalled()
    expect(scheduleQStashReminder).not.toHaveBeenCalled()
    expect(sendGa4Purchase).not.toHaveBeenCalled()
  })

  it('sends exactly one email with ALL legs when both Stripe events race (incident 2026-10-18)', async () => {
    db.rows[ID_C] = row(ID_C, 'PRG-C', '2026-10-07')
    const ids = `${ID_A},${ID_B},${ID_C}`
    const pi = paymentIntentEvent()
    pi.data.object.metadata.groupBookingIds = ids
    stripeStub.constructEvent.mockReturnValueOnce(pi).mockReturnValueOnce(checkoutEvent(ids))

    const [r1, r2] = await Promise.all([POST(request()), POST(request())])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)

    // The group is flipped by exactly one statement; the other handler flips nothing.
    expect(db.flips.filter((f) => f.length > 0)).toEqual([[ID_A, ID_B, ID_C]])
    expect(sendGroupClientConfirmation).toHaveBeenCalledTimes(1)
    expect(sendGroupManagerAlert).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendGroupClientConfirmation).mock.calls[0][0].legs.map((l) => l.bookingReference))
      .toEqual(['PRG-A', 'PRG-B', 'PRG-C'])
    expect(vi.mocked(sendGroupManagerAlert).mock.calls[0][0].legs).toHaveLength(3)
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(3)
    expect(sendGa4Purchase).toHaveBeenCalledTimes(1)
  })

  it('lists every leg of the group even when one was confirmed earlier', async () => {
    db.rows[ID_A].status = 'confirmed'
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    await POST(request())
    expect(db.flips).toEqual([[ID_B]])
    expect(vi.mocked(sendGroupClientConfirmation).mock.calls[0][0].legs.map((l) => l.bookingReference))
      .toEqual(['PRG-A', 'PRG-B'])
    // Reminder only for the leg this payment newly confirmed
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(1)
  })

  it('suppresses a second client email for the same group via email_log', async () => {
    db.emailLog.push({ booking_id: ID_A, email_type: 'group_confirmed', recipient: 'ops@agency.example' })
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    await POST(request())
    expect(sendGroupClientConfirmation).not.toHaveBeenCalled()
    expect(sendGroupManagerAlert).toHaveBeenCalledTimes(1)
  })
})

describe('B2 (92-10): a group payment never confirms or lists a quote booking', () => {
  const QUOTE_ID = '5b0c8e1a-3d4f-4a6b-9c7d-1e2f3a4b5c6d'
  const keyOf = (id: string) => `alert:ops_attention:${id}:group:pi_group_1`

  it('only the ordinary row is confirmed and listed; the quote row raises one ops_attention alert keyed by the PaymentIntent', async () => {
    db.rows[ID_B] = { ...row(ID_B, 'PRG-B', '2026-10-04'), quote_id: QUOTE_ID }
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    const res = await POST(request())
    expect(res.status).toBe(200)

    expect(db.flips).toEqual([[ID_A]])
    expect(db.rows[ID_A].status).toBe('confirmed')
    expect(db.rows[ID_B].status).toBe('unpaid')
    expect(db.rows[ID_B].operator_notes).toBeNull()

    const data = vi.mocked(sendGroupClientConfirmation).mock.calls[0][0]
    expect(data.legs.map((l) => l.bookingReference)).toEqual(['PRG-A'])
    expect(vi.mocked(sendGroupManagerAlert).mock.calls[0][0].legs.map((l) => l.bookingReference)).toEqual(['PRG-A'])
    expect(scheduleQStashReminder).toHaveBeenCalledTimes(1)

    expect(mockOperatorAlert).toHaveBeenCalledTimes(1)
    expect(mockOperatorAlert).toHaveBeenCalledWith(
      'ops_attention',
      expect.objectContaining({ id: ID_B, booking_reference: 'PRG-B' }),
      expect.objectContaining({ eventKey: keyOf(ID_B), code: 'group_payment_quote_booking', note: 'group_payment_quote_booking' }),
    )
  })

  it('a replay of the event raises the alert under the same key (the alert ledger delivers it once) and confirms nothing again', async () => {
    db.rows[ID_B] = { ...row(ID_B, 'PRG-B', '2026-10-04'), quote_id: QUOTE_ID }
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    await POST(request())
    await POST(request())

    expect(db.flips.filter((f) => f.length > 0)).toEqual([[ID_A]])
    expect(sendGroupClientConfirmation).toHaveBeenCalledTimes(1)
    const keys = mockOperatorAlert.mock.calls.map((c) => (c[2] as { eventKey: string }).eventKey)
    expect(new Set(keys)).toEqual(new Set([keyOf(ID_B)]))
  })

  it('a group payment naming only quote bookings flips nothing, emails no client and alerts once per quote booking', async () => {
    db.rows[ID_A] = { ...row(ID_A, 'PRG-A', '2026-10-01'), quote_id: QUOTE_ID }
    db.rows[ID_B] = { ...row(ID_B, 'PRG-B', '2026-10-04'), quote_id: QUOTE_ID }
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())

    const res = await POST(request())
    expect(res.status).toBe(200)

    expect(db.flips.filter((f) => f.length > 0)).toEqual([])
    expect(db.rows[ID_A].status).toBe('unpaid')
    expect(db.rows[ID_B].status).toBe('unpaid')
    expect(sendGroupClientConfirmation).not.toHaveBeenCalled()
    expect(sendGroupManagerAlert).not.toHaveBeenCalled()
    expect(scheduleQStashReminder).not.toHaveBeenCalled()
    expect(sendGa4Purchase).not.toHaveBeenCalled()

    const keys = mockOperatorAlert.mock.calls.map((c) => (c[2] as { eventKey: string }).eventKey).sort()
    expect(keys).toEqual([keyOf(ID_A), keyOf(ID_B)].sort())
  })

  it('a group without quote bookings raises no alert', async () => {
    stripeStub.constructEvent.mockReturnValue(paymentIntentEvent())
    await POST(request())
    expect(mockOperatorAlert).not.toHaveBeenCalled()
  })
})
