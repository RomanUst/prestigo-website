import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub } = vi.hoisted(() => {
  const supabaseAuthStub = { auth: { getUser: vi.fn() } }
  const supabaseServiceStub = { from: vi.fn() }
  return { supabaseAuthStub, supabaseServiceStub }
})

const { stubCreateBookingPaymentLink, stubSendPaymentRequestEmail, stubLogEmail } = vi.hoisted(() => ({
  stubCreateBookingPaymentLink: vi.fn(),
  stubSendPaymentRequestEmail: vi.fn(),
  stubLogEmail: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => { try { void fn() } catch { /* noop */ } },
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
  getAdminUser: vi.fn(async () => {
    const { data: { user }, error } = await supabaseAuthStub.auth.getUser()
    if (error || !user) return { user: null, error: '401' as const }
    if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
    return { user, error: null }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

vi.mock('@/lib/email-log', () => ({
  logEmail: stubLogEmail,
}))

vi.mock('@/lib/email', () => ({
  sendPaymentRequestEmail: stubSendPaymentRequestEmail,
}))

vi.mock('@/lib/stripe-payment-links', () => ({
  createBookingPaymentLink: stubCreateBookingPaymentLink,
}))

// Mocks required only by the ANEW-05 invariant test, which exercises the
// main POST /api/admin/bookings route (not the [id]/payment-link route) to
// prove a no-link save persists payment_intent_id/payment_link_url as NULL.
vi.mock('@/lib/booking-reference', () => ({
  generateBookingReference: vi.fn(() => 'PRG-20260601-NOLINK'),
}))

vi.mock('@/lib/currency', () => ({
  czkToEur: vi.fn((czk: number) => Math.round(czk * 0.04)),
  eurToCzk: vi.fn((_eur: number) => 1500),
}))

vi.mock('@/lib/server-pricing', () => ({
  computeOutboundLegTotal: vi.fn(() => 60),
}))

vi.mock('@/lib/extras', () => ({
  computeExtrasTotal: vi.fn(() => 0),
}))

import { POST as PAYMENT_LINK_POST } from '@/app/api/admin/bookings/[id]/payment-link/route'
import { POST as ADMIN_BOOKINGS_POST } from '@/app/api/admin/bookings/route'

function makeRequest(id: string, body: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost/api/admin/bookings/${id}/payment-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeAdminBookingsPostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Fixtures ────────────────────────────────────────────────────────────

const UNPAID_BOOKING = {
  id: 'booking-unpaid-1',
  booking_reference: 'PRG-20260601-AAAA',
  status: 'unpaid',
  amount_eur: 80,
  leg: null,
  payment_intent_id: null,
  payment_link_url: null,
  payment_link_id: null,
  client_email: 'client@example.com',
  client_first_name: 'Jana',
  client_last_name: 'Novakova',
  origin_address: 'Prague Airport',
  destination_address: 'Hotel Alcron',
  pickup_date: '2026-06-01',
  pickup_time: '09:00',
  vehicle_class: 'business',
  flight_number: null,
}

const PENDING_BOOKING = { ...UNPAID_BOOKING, id: 'booking-pending-1', status: 'pending' }
const CONFIRMED_BOOKING = { ...UNPAID_BOOKING, id: 'booking-confirmed-1', status: 'confirmed' }
const ALREADY_LINKED_BOOKING = {
  ...UNPAID_BOOKING,
  id: 'booking-linked-1',
  payment_link_url: 'https://buy.stripe.com/existing_link',
  payment_link_id: 'plink_existing',
}
const OUTBOUND_LEG_BOOKING = {
  ...UNPAID_BOOKING,
  id: 'booking-outbound-1',
  leg: 'outbound' as const,
  payment_intent_id: 'pi_stale_123',
  // Data-model reality (buildBookingRows): the outbound leg's amount_eur is
  // already the COMBINED round-trip total.
  amount_eur: 150,
}
// The return leg's amount_eur is always persisted NULL (buildBookingRows) —
// only the sibling outbound leg carries the correct combined total.
const RETURN_LEG_BOOKING = {
  ...UNPAID_BOOKING,
  id: 'booking-return-1',
  leg: 'return' as const,
  payment_intent_id: 'pi_stale_123',
  amount_eur: null,
}
const SIBLING_RETURN_LEG = { id: 'booking-return-sibling-1', amount_eur: null, payment_link_url: null }
const SIBLING_OUTBOUND_LEG = { id: 'booking-outbound-sibling-1', amount_eur: 150, payment_link_url: null }
// CR-01: sibling already has a live payment link — generating on this leg
// must reuse it instead of minting a second, independently payable link.
const SIBLING_RETURN_LEG_ALREADY_LINKED = {
  id: 'booking-return-sibling-1',
  amount_eur: null,
  payment_link_url: 'https://buy.stripe.com/sibling_existing_link',
}

// ── Mock chain builders (match the route's exact Supabase call shape) ───

function makeBookingFetchStub(row: Record<string, unknown> | null) {
  const single = vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  return { select }
}

function makeSiblingStub(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const neq = vi.fn().mockReturnValue({ eq: eq2 })
  const eq1 = vi.fn().mockReturnValue({ neq })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  return { select }
}

// WR-01: the real update chain is .update().in(ids).is('payment_link_url',
// null).select('id') and resolves { data, error }. By default (matchIds
// omitted) it simulates every id passed to .in() as successfully updated —
// the "won the race" happy path every existing test exercises. Pass
// matchIds explicitly to simulate a TOCTOU loss (e.g. matchIds: [] means
// zero rows still had payment_link_url IS NULL by the time this UPDATE ran).
function makeUpdateStub(error: unknown = null, matchIds?: string[]) {
  let inIds: string[] = []
  const select = vi.fn().mockImplementation(() => {
    const data = error ? null : (matchIds ?? inIds).map((id) => ({ id }))
    return Promise.resolve({ data, error })
  })
  const is = vi.fn().mockReturnValue({ select })
  const inFn = vi.fn().mockImplementation((_col: string, ids: string[]) => {
    inIds = ids
    return { is }
  })
  const update = vi.fn().mockReturnValue({ in: inFn })
  return { update, in: inFn, is, select }
}

beforeEach(() => {
  vi.clearAllMocks()

  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: { id: 'admin-1', app_metadata: { is_admin: true } } },
    error: null,
  })

  stubCreateBookingPaymentLink.mockResolvedValue({ url: 'https://buy.stripe.com/test_link', id: 'plink_new_123' })
  stubSendPaymentRequestEmail.mockResolvedValue(undefined)
  stubLogEmail.mockResolvedValue(true)
})

describe('POST /api/admin/bookings/[id]/payment-link (D-05 attach-later + resend)', () => {
  it('Test 1: returns 401 when no session', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    const res = await PAYMENT_LINK_POST(makeRequest(UNPAID_BOOKING.id), makeParams(UNPAID_BOOKING.id))
    expect(res.status).toBe(401)
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
  })

  it('Test 2: returns 403 for non-admin user', async () => {
    supabaseAuthStub.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u1', app_metadata: {} } },
      error: null,
    })
    const res = await PAYMENT_LINK_POST(makeRequest(UNPAID_BOOKING.id), makeParams(UNPAID_BOOKING.id))
    expect(res.status).toBe(403)
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
  })

  it('Test 3: generate for an unpaid booking — link persisted, status stays unpaid, email logged+sent', async () => {
    const updateStub = makeUpdateStub()
    supabaseServiceStub.from
      .mockReturnValueOnce(makeBookingFetchStub(UNPAID_BOOKING))
      .mockReturnValueOnce(updateStub)

    const res = await PAYMENT_LINK_POST(makeRequest(UNPAID_BOOKING.id), makeParams(UNPAID_BOOKING.id))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.paymentLinkUrl).toBe('https://buy.stripe.com/test_link')
    expect(json.linkedBookingId).toBeNull()

    expect(stubCreateBookingPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: UNPAID_BOOKING.id, amountEur: 80, leg: null })
    )
    expect(updateStub.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'unpaid',
        payment_link_url: 'https://buy.stripe.com/test_link',
        payment_link_id: 'plink_new_123',
      })
    )
    expect(stubLogEmail).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: UNPAID_BOOKING.id, emailType: 'payment_request', recipient: UNPAID_BOOKING.client_email })
    )
    expect(stubSendPaymentRequestEmail).toHaveBeenCalledTimes(1)
  })

  it('Test 4: generate for a pending booking — status flips to unpaid (Pitfall 2, bypasses VALID_TRANSITIONS)', async () => {
    const updateStub = makeUpdateStub()
    supabaseServiceStub.from
      .mockReturnValueOnce(makeBookingFetchStub(PENDING_BOOKING))
      .mockReturnValueOnce(updateStub)

    const res = await PAYMENT_LINK_POST(makeRequest(PENDING_BOOKING.id), makeParams(PENDING_BOOKING.id))
    expect(res.status).toBe(200)
    expect(updateStub.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'unpaid' }))
  })

  it('Test 5: reject when status=confirmed — 4xx, no Stripe call', async () => {
    supabaseServiceStub.from.mockReturnValueOnce(makeBookingFetchStub(CONFIRMED_BOOKING))

    const res = await PAYMENT_LINK_POST(makeRequest(CONFIRMED_BOOKING.id), makeParams(CONFIRMED_BOOKING.id))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
  })

  it('Test 6: reject when payment_link_url already exists — 4xx, no Stripe call (D-04)', async () => {
    supabaseServiceStub.from.mockReturnValueOnce(makeBookingFetchStub(ALREADY_LINKED_BOOKING))

    const res = await PAYMENT_LINK_POST(makeRequest(ALREADY_LINKED_BOOKING.id), makeParams(ALREADY_LINKED_BOOKING.id))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
  })

  it('Test 7: round-trip sibling found → linkedBookingId passed to createBookingPaymentLink (Pitfall 3)', async () => {
    const updateStub = makeUpdateStub()
    supabaseServiceStub.from
      .mockReturnValueOnce(makeBookingFetchStub(OUTBOUND_LEG_BOOKING))
      .mockReturnValueOnce(makeSiblingStub(SIBLING_RETURN_LEG))
      .mockReturnValueOnce(updateStub)

    const res = await PAYMENT_LINK_POST(makeRequest(OUTBOUND_LEG_BOOKING.id), makeParams(OUTBOUND_LEG_BOOKING.id))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.linkedBookingId).toBe(SIBLING_RETURN_LEG.id)

    expect(stubCreateBookingPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ linkedBookingId: SIBLING_RETURN_LEG.id, leg: 'outbound', amountEur: 150 })
    )
    // UI-SPEC E4 zero-one-many: ONE payment-request email, combined amount,
    // "covers both legs" framing.
    expect(stubSendPaymentRequestEmail).toHaveBeenCalledTimes(1)
    expect(stubSendPaymentRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ amountEur: 150, coversBothLegs: true })
    )
    // CR-01: the persist step writes payment_link_url/id to BOTH legs (the
    // primary row AND the sibling), not just the one the operator generated
    // from — otherwise the sibling's own "already has a link" guard never
    // fires and a second, independent link can be minted on it later.
    expect(updateStub.in).toHaveBeenCalledWith('id', [OUTBOUND_LEG_BOOKING.id, SIBLING_RETURN_LEG.id])
  })

  it('Test 7c (CR-01): sibling leg already has a live payment link → reuse it, do NOT mint a second link or send a new email', async () => {
    supabaseServiceStub.from
      .mockReturnValueOnce(makeBookingFetchStub(OUTBOUND_LEG_BOOKING))
      .mockReturnValueOnce(makeSiblingStub(SIBLING_RETURN_LEG_ALREADY_LINKED))

    const res = await PAYMENT_LINK_POST(makeRequest(OUTBOUND_LEG_BOOKING.id), makeParams(OUTBOUND_LEG_BOOKING.id))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.paymentLinkUrl).toBe(SIBLING_RETURN_LEG_ALREADY_LINKED.payment_link_url)
    expect(json.linkedBookingId).toBe(SIBLING_RETURN_LEG_ALREADY_LINKED.id)

    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
    expect(stubSendPaymentRequestEmail).not.toHaveBeenCalled()
    expect(stubLogEmail).not.toHaveBeenCalled()
    // Only the booking fetch + sibling lookup ran — no update() call.
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(2)
  })

  it('Test 7b: generating from the RETURN leg (amount_eur NULL) falls back to the sibling outbound leg amount — never NaN', async () => {
    const updateStub = makeUpdateStub()
    supabaseServiceStub.from
      .mockReturnValueOnce(makeBookingFetchStub(RETURN_LEG_BOOKING))
      .mockReturnValueOnce(makeSiblingStub(SIBLING_OUTBOUND_LEG))
      .mockReturnValueOnce(updateStub)

    const res = await PAYMENT_LINK_POST(makeRequest(RETURN_LEG_BOOKING.id), makeParams(RETURN_LEG_BOOKING.id))
    expect(res.status).toBe(200)

    expect(stubCreateBookingPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ amountEur: 150, linkedBookingId: SIBLING_OUTBOUND_LEG.id, leg: 'return' })
    )
    expect(stubSendPaymentRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ amountEur: 150, coversBothLegs: true })
    )
  })

  it('Test 8: no sibling found for a round-trip leg → linkedBookingId is null, no linkedBookingId key sent to Stripe helper', async () => {
    const updateStub = makeUpdateStub()
    supabaseServiceStub.from
      .mockReturnValueOnce(makeBookingFetchStub(OUTBOUND_LEG_BOOKING))
      .mockReturnValueOnce(makeSiblingStub(null))
      .mockReturnValueOnce(updateStub)

    const res = await PAYMENT_LINK_POST(makeRequest(OUTBOUND_LEG_BOOKING.id), makeParams(OUTBOUND_LEG_BOOKING.id))
    const json = await res.json()
    expect(json.linkedBookingId).toBeNull()
    const callArg = stubCreateBookingPaymentLink.mock.calls[0][0]
    expect(callArg.linkedBookingId).toBeUndefined()
  })

  it('Test 8b (WR-01): lost TOCTOU race — own row not updated → no duplicate email, still returns 200', async () => {
    // matchIds: [] simulates a concurrent request already having claimed
    // payment_link_url (IS NULL no longer matches) between our read and write.
    const updateStub = makeUpdateStub(null, [])
    supabaseServiceStub.from
      .mockReturnValueOnce(makeBookingFetchStub(UNPAID_BOOKING))
      .mockReturnValueOnce(updateStub)

    const res = await PAYMENT_LINK_POST(makeRequest(UNPAID_BOOKING.id), makeParams(UNPAID_BOOKING.id))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.paymentLinkUrl).toBe('https://buy.stripe.com/test_link')

    // Stripe WAS called (link already minted before we discovered the race)
    // but no duplicate payment-request email was sent for it.
    expect(stubCreateBookingPaymentLink).toHaveBeenCalledTimes(1)
    expect(stubLogEmail).not.toHaveBeenCalled()
    expect(stubSendPaymentRequestEmail).not.toHaveBeenCalled()
  })

  it('Test 9: resend path — sendPaymentRequestEmail called directly, logEmail NOT called (D-07/Pitfall 5)', async () => {
    const bookingWithLink = { ...UNPAID_BOOKING, id: 'booking-resend-1', payment_link_url: 'https://buy.stripe.com/existing_link' }
    supabaseServiceStub.from.mockReturnValueOnce(makeBookingFetchStub(bookingWithLink))

    const res = await PAYMENT_LINK_POST(makeRequest(bookingWithLink.id, { resend: true }), makeParams(bookingWithLink.id))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.resent).toBe(true)

    expect(stubSendPaymentRequestEmail).toHaveBeenCalledTimes(1)
    expect(stubSendPaymentRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ paymentLinkUrl: 'https://buy.stripe.com/existing_link' })
    )
    expect(stubLogEmail).not.toHaveBeenCalled()
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
  })

  it('Test 10: resend rejected when no payment_link_url exists yet', async () => {
    supabaseServiceStub.from.mockReturnValueOnce(makeBookingFetchStub(UNPAID_BOOKING))

    const res = await PAYMENT_LINK_POST(makeRequest(UNPAID_BOOKING.id, { resend: true }), makeParams(UNPAID_BOOKING.id))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(stubSendPaymentRequestEmail).not.toHaveBeenCalled()
  })

  it('Test 11: returns 404 when booking not found', async () => {
    supabaseServiceStub.from.mockReturnValueOnce(makeBookingFetchStub(null))

    const res = await PAYMENT_LINK_POST(makeRequest('missing-id'), makeParams('missing-id'))
    expect(res.status).toBe(404)
  })

  it('Test 12: Stripe link-creation failure leaves the booking untouched — error response, no DB update', async () => {
    supabaseServiceStub.from.mockReturnValueOnce(makeBookingFetchStub(UNPAID_BOOKING))
    stubCreateBookingPaymentLink.mockRejectedValueOnce(new Error('Stripe API error'))

    const res = await PAYMENT_LINK_POST(makeRequest(UNPAID_BOOKING.id), makeParams(UNPAID_BOOKING.id))
    expect(res.status).toBeGreaterThanOrEqual(500)
    // Only ONE from() call (the booking fetch) — no update() call was ever made.
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })
})

// ── ANEW-05 invariant (Plan 01 assumption_delta note) ────────────────────
// A no-link admin-created booking (no collect_payment, this route never
// invoked) must yield exactly one row with BOTH payment_intent_id AND
// payment_link_url NULL — verified here via the main create route to keep
// this invariant visible alongside the new payment-link surface it guards.
describe('POST /api/admin/bookings — ANEW-05 no-link invariant', () => {
  const validPostPayload = {
    trip_type: 'transfer',
    pickup_date: '2026-06-10',
    pickup_time: '11:00',
    origin_address: 'Prague Airport Terminal 1',
    destination_address: 'Hotel Four Seasons Prague',
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    amount_czk: 1500,
    distance_km: 20,
    client_first_name: 'Petr',
    client_last_name: 'Svoboda',
    client_email: 'petr@example.com',
    client_phone: '+420600111222',
  }

  it('a no-collect_payment POST inserts one row with payment_intent_id NULL and no payment_link_url set', async () => {
    const singleFn = vi.fn().mockResolvedValue({
      data: { id: 'no-link-id', booking_reference: 'PRG-20260601-NOLINK' },
      error: null,
    })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const insertFn = vi.fn().mockReturnValue({ select: selectFn })
    supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

    const res = await ADMIN_BOOKINGS_POST(makeAdminBookingsPostRequest(validPostPayload))
    expect(res.status).toBe(201)

    expect(insertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ payment_intent_id: null, status: 'confirmed' }),
      ])
    )
    // No update() call ever happens for a no-link save — payment_link_url/id
    // stay whatever the DB column default is (NULL); no second write occurs.
    expect(insertFn.mock.calls[0][0][0]).not.toHaveProperty('payment_link_url')
    expect(stubCreateBookingPaymentLink).not.toHaveBeenCalled()
    expect(stubSendPaymentRequestEmail).not.toHaveBeenCalled()
    expect(supabaseServiceStub.from).toHaveBeenCalledTimes(1)
  })
})
