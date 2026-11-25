import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 94 plan 94-09 (D-09, D-11, D-12, D-18; DCAB-11, DCAB-12).
 * Part 1: the cabinet offer email and the offer push payload (real lib/email.ts, resend mocked).
 * Part 2: the admin assign route branch on drivers.cabinet_enabled.
 */

const h = vi.hoisted(() => ({
  resendSend: vi.fn(),
  pushSend: vi.fn(),
  assignmentEmail: vi.fn(),
  notifyStub: vi.fn(),
  adminUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  logEmail: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: h.resendSend } }
  },
}))

vi.mock('@/lib/driver-cabinet/push', () => ({
  sendDriverPush: h.pushSend,
}))

// The real module for everything except the legacy assignment sender (route tests assert it is called or not).
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendDriverAssignmentEmail: h.assignmentEmail }
})

// The route tests spy on the notifier; the unit tests call the real one through importActual.
vi.mock('@/lib/driver-cabinet/offer-notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/driver-cabinet/offer-notify')>()
  return { ...actual, notifyCabinetDriverOfOffer: h.notifyStub }
})

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      try {
        void Promise.resolve(fn()).catch(() => undefined)
      } catch {
        /* noop */
      }
    },
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getAdminUser: h.adminUser,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: h.from, rpc: h.rpc })),
}))

vi.mock('@/lib/email-log', () => ({ logEmail: h.logEmail }))

vi.mock('@/lib/gnet-client', () => ({
  pushGnetStatus: vi.fn().mockResolvedValue(undefined),
  prestigoToGnetStatus: vi.fn().mockReturnValue(null),
}))

import {
  buildDriverCabinetOfferHtml,
  driverCabinetOfferSubject,
  sendDriverCabinetOfferEmail,
  type DriverCabinetOfferEmailData,
} from '@/lib/email'
import { buildOfferPushPayload } from '@/lib/driver-cabinet/offer-notify'
import { POST as assignPost } from '@/app/api/admin/bookings/[id]/assign/route'

const ASSIGNMENT_ID = 'a1a2a3a4-0000-4000-8000-000000000001'

function offerData(over: Partial<DriverCabinetOfferEmailData> = {}): DriverCabinetOfferEmailData {
  return {
    to: 'driver@example.com',
    pickupDate: '2026-11-27',
    pickupTime: '14:30',
    originAddress: 'Václav Havel Airport Prague, Aviatická, Praha 6',
    destinationAddress: 'Hotel Aria, Tržiště 9, Praha 1',
    passengerFirstName: 'Alice',
    vehicleClass: 'business',
    driverPriceCzk: 2500,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
  h.resendSend.mockResolvedValue({ data: { id: 'x' }, error: null })
  h.pushSend.mockResolvedValue({ sent: 1, pruned: 0 })
})

describe('buildDriverCabinetOfferHtml (D-18, D-11, D-12)', () => {
  it('has exactly one button, to /driver/offers with no query string and no token', () => {
    const html = buildDriverCabinetOfferHtml(offerData())
    const anchors = html.match(/<a\s[^>]*href="[^"]*"/g) ?? []
    const hrefs = anchors.map((a) => /href="([^"]*)"/.exec(a)![1])
    const buttonHrefs = hrefs.filter((href) => !href.startsWith('mailto:') && !href.startsWith('tel:'))
    expect(buttonHrefs).toEqual(['https://rideprestigo.com/driver/offers'])
    expect(buttonHrefs[0]).not.toContain('?')
    expect(html).toContain('Open in cabinet')
    expect(html).toContain('Open Prestigo to accept or decline this ride.')
    expect(html).toContain('You have a new ride offer')
    expect(html).toContain(
      'Accept or decline in the cabinet. If you are not signed in, we will ask for a code sent to this email.',
    )
  })

  it('has no token link, no Accept button, no euro, no contact or reference data', () => {
    const html = buildDriverCabinetOfferHtml(offerData())
    expect(html).not.toContain('/driver/response')
    expect(html).not.toContain('/driver/trip/')
    expect(html).not.toContain('€')
    expect(html).not.toContain('EUR')
    expect(html).not.toMatch(/accept trip|decline trip|view trip sheet/i)
    expect(html).not.toMatch(/Passenger Phone|Flight|Notes|BOOKING REFERENCE|Landing|valid for 48 hours/i)
  })

  it('shows the fee as formatCZK alone for a positive integer', () => {
    const html = buildDriverCabinetOfferHtml(offerData({ driverPriceCzk: 2500 }))
    expect(html).toContain('Your Fee')
    expect(html).toMatch(/2[\s  ]?500[\s  ]?Kč/)
  })

  it.each([null, 0, 12.5, -3])('omits the fee row for %s', (fee) => {
    const html = buildDriverCabinetOfferHtml(offerData({ driverPriceCzk: fee as number | null }))
    expect(html).not.toContain('Your Fee')
    expect(html).not.toContain('Kč')
  })

  it('renders As directed for an empty destination', () => {
    expect(buildDriverCabinetOfferHtml(offerData({ destinationAddress: null }))).toContain('As directed')
    expect(buildDriverCabinetOfferHtml(offerData({ destinationAddress: '  ' }))).toContain('As directed')
  })

  it('escapes every user value', () => {
    const html = buildDriverCabinetOfferHtml(
      offerData({ passengerFirstName: '<b>x', originAddress: '<script>1</script>' }),
    )
    expect(html).toContain('&lt;b&gt;x')
    expect(html).not.toContain('<b>x')
    expect(html).not.toContain('<script>1</script>')
  })

  it('shows the first name only', () => {
    const html = buildDriverCabinetOfferHtml(offerData({ passengerFirstName: 'Alice' }))
    expect(html).toContain('Passenger')
    expect(html).toContain('Alice')
  })
})

describe('driverCabinetOfferSubject', () => {
  it('reads New ride offer: Fri 27 Nov at 14:30', () => {
    expect(driverCabinetOfferSubject({ pickupDate: '2026-11-27', pickupTime: '14:30' })).toBe(
      'New ride offer: Fri 27 Nov at 14:30',
    )
  })
})

describe('sendDriverCabinetOfferEmail', () => {
  it('sends the subject and html and returns true', async () => {
    const ok = await sendDriverCabinetOfferEmail(offerData())
    expect(ok).toBe(true)
    expect(h.resendSend).toHaveBeenCalledTimes(1)
    const arg = h.resendSend.mock.calls[0][0]
    expect(arg.to).toEqual(['driver@example.com'])
    expect(arg.subject).toBe('New ride offer: Fri 27 Nov at 14:30')
    expect(arg.from).toContain('bookings@rideprestigo.com')
  })

  it('returns false on an error and never logs the address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.resendSend.mockRejectedValue(new Error('resend down'))
    await expect(sendDriverCabinetOfferEmail(offerData())).resolves.toBe(false)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('driver@example.com')
    spy.mockRestore()
  })
})

describe('buildOfferPushPayload (D-12)', () => {
  const base = {
    assignmentId: ASSIGNMENT_ID,
    pickupDate: '2026-11-25',
    pickupTime: '14:30',
    originAddress: 'Václav Havel Airport Prague, Aviatická 1',
    destinationAddress: 'Hotel Aria, Tržiště 9',
    vehicleClass: 'business',
    todayIso: '2026-11-25',
  }

  it('builds title, one-line body, tag and url for a same-day ride', () => {
    const p = buildOfferPushPayload(base)
    expect(p.title).toBe('New ride offer')
    expect(p.body).toBe('Today 14:30. Václav Havel Airport Prague to Hotel Aria. Business.')
    expect(p.tag).toBe(`offer-${ASSIGNMENT_ID}`)
    expect(p.url).toBe('/driver/offers')
  })

  it('uses a short date for a later day', () => {
    expect(buildOfferPushPayload({ ...base, pickupDate: '2026-11-27' }).body).toMatch(/^Fri 27 Nov 14:30\./)
  })

  it('says as directed without a destination', () => {
    expect(buildOfferPushPayload({ ...base, destinationAddress: null }).body).toBe(
      'Today 14:30. Václav Havel Airport Prague, as directed. Business.',
    )
  })

  it('cuts long place labels to 28 characters and stays under 140', () => {
    const long = 'A'.repeat(80)
    const p = buildOfferPushPayload({ ...base, originAddress: long, destinationAddress: long })
    expect(p.body).toContain(`${'A'.repeat(27)}…`)
    expect(p.body).not.toContain('A'.repeat(29))
    expect(p.body.length).toBeLessThan(140)
  })

  it('carries no passenger name, fee, reference or extra uuid', () => {
    const json = JSON.stringify(buildOfferPushPayload(base))
    expect(json).not.toContain('Alice')
    expect(json).not.toContain('Kč')
    expect(json).not.toMatch(/PRG-|booking/i)
    const uuids = json.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []
    expect(uuids).toEqual([ASSIGNMENT_ID])
  })
})

describe('notifyCabinetDriverOfOffer (never rejects)', () => {
  async function loadActual() {
    return vi.importActual<typeof import('@/lib/driver-cabinet/offer-notify')>('@/lib/driver-cabinet/offer-notify')
  }
  const supabase = { from: vi.fn() }

  it('sends the email then the push', async () => {
    const { notifyCabinetDriverOfOffer } = await loadActual()
    await notifyCabinetDriverOfOffer({ supabase, driverId: 'd1', assignmentId: ASSIGNMENT_ID, email: offerData() })
    expect(h.resendSend).toHaveBeenCalledTimes(1)
    expect(h.pushSend).toHaveBeenCalledTimes(1)
    const [client, driverId, payload] = h.pushSend.mock.calls[0]
    expect(client).toBe(supabase)
    expect(driverId).toBe('d1')
    expect(payload.title).toBe('New ride offer')
    expect(payload.tag).toBe(`offer-${ASSIGNMENT_ID}`)
  })

  it('still pushes when the email sender fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.resendSend.mockRejectedValue(new Error('resend down'))
    const { notifyCabinetDriverOfOffer } = await loadActual()
    await expect(
      notifyCabinetDriverOfOffer({ supabase, driverId: 'd1', assignmentId: ASSIGNMENT_ID, email: offerData() }),
    ).resolves.toBeUndefined()
    expect(h.pushSend).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('swallows a throwing push', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.pushSend.mockRejectedValue(new Error('push down'))
    const { notifyCabinetDriverOfOffer } = await loadActual()
    await expect(
      notifyCabinetDriverOfOffer({ supabase, driverId: 'd1', assignmentId: ASSIGNMENT_ID, email: offerData() }),
    ).resolves.toBeUndefined()
    expect(h.resendSend).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Part 2: the assign route
// ───────────────────────────────────────────────────────────────────────────

const bookingId = 'a0000001-0000-4000-8000-000000000001'
const driverId = 'a0000002-0000-4000-8000-000000000002'
const assignmentToken = 'a0000003-0000-4000-8000-000000000003'
const tripToken = 'a0000004-0000-4000-8000-000000000004'

const booking = {
  id: bookingId,
  booking_reference: 'PRG-001',
  pickup_date: '2026-11-27',
  pickup_time: '14:30',
  origin_address: 'Prague Airport',
  destination_address: 'Wenceslas Square',
  client_first_name: 'Alice',
  client_last_name: 'Smith',
  client_phone: '+420123456789',
  vehicle_class: 'business',
  status: 'pending',
  booking_source: 'website',
  driver_price_czk: 2500,
  special_requests: null,
  landing_date: null,
  landing_time: null,
  pickup_offset_min: null,
}

function setupRoute(opts: { driver: Record<string, unknown>; flags?: unknown }) {
  const assignment = { id: ASSIGNMENT_ID, driver_id: driverId, status: 'pending', token: assignmentToken, trip_token: tripToken }
  let n = 0
  h.from.mockImplementation(() => {
    n++
    if (n === 1) {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.driver, error: null }) }) }) }
    }
    if (n === 2) {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: booking, error: null }) }) }) }
    }
    if (n === 3) {
      return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: assignment, error: null }) }) }) }
    }
    return {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: { notification_flags: opts.flags ?? { driver_assigned: true } }, error: null }) }),
      }),
    }
  })
}

function assignRequest(): Request {
  return new Request(`http://localhost/api/admin/bookings/${bookingId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driver_id: driverId }),
  })
}

async function runAssign() {
  const res = await assignPost(assignRequest(), { params: Promise.resolve({ id: bookingId }) })
  await new Promise((r) => setTimeout(r, 10))
  return res
}

describe('assign route: cabinet branch (D-18, D-15, D-09)', () => {
  beforeEach(() => {
    h.adminUser.mockResolvedValue({ user: { id: '1', app_metadata: { is_admin: true } }, error: null })
    h.rpc.mockResolvedValue({ data: { applied: true }, error: null })
    h.logEmail.mockResolvedValue(true)
    h.assignmentEmail.mockResolvedValue(undefined)
    h.notifyStub.mockResolvedValue(undefined)
  })

  it('a cabinet driver gets the cabinet notification, not the token email', async () => {
    setupRoute({ driver: { id: driverId, name: 'John', email: 'driver@example.com', cabinet_enabled: true } })
    const res = await runAssign()
    expect(res.status).toBe(201)
    expect(h.notifyStub).toHaveBeenCalledTimes(1)
    const arg = h.notifyStub.mock.calls[0][0]
    expect(arg.driverId).toBe(driverId)
    expect(arg.assignmentId).toBe(ASSIGNMENT_ID)
    expect(arg.email).toEqual({
      to: 'driver@example.com',
      pickupDate: '2026-11-27',
      pickupTime: '14:30',
      originAddress: 'Prague Airport',
      destinationAddress: 'Wenceslas Square',
      passengerFirstName: 'Alice',
      vehicleClass: 'business',
      driverPriceCzk: 2500,
    })
    expect(h.assignmentEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['false', { cabinet_enabled: false }],
    ['absent', {}],
  ])('a driver with cabinet_enabled %s keeps today\'s email argument object', async (_label, extra) => {
    setupRoute({ driver: { id: driverId, name: 'John', email: 'driver@example.com', ...extra } })
    const res = await runAssign()
    expect(res.status).toBe(201)
    expect(h.notifyStub).not.toHaveBeenCalled()
    expect(h.assignmentEmail).toHaveBeenCalledTimes(1)
    expect(h.assignmentEmail.mock.calls[0][0]).toEqual({
      driverName: 'John',
      driverEmail: 'driver@example.com',
      bookingReference: 'PRG-001',
      pickupDate: '2026-11-27',
      pickupTime: '14:30',
      originAddress: 'Prague Airport',
      destinationAddress: 'Wenceslas Square',
      passengerFirstName: 'Alice',
      passengerLastName: 'Smith',
      passengerPhone: '+420123456789',
      driverPriceCzk: 2500,
      specialRequests: null,
      bookingId,
      landingDate: null,
      landingTime: null,
      pickupOffsetMin: null,
      acceptUrl: `https://rideprestigo.com/driver/response?token=${assignmentToken}&action=accepted`,
      declineUrl: `https://rideprestigo.com/driver/response?token=${assignmentToken}&action=declined`,
      tripUrl: `https://rideprestigo.com/driver/trip/${tripToken}`,
    })
  })

  it('notification_flags.driver_assigned === false suppresses both', async () => {
    setupRoute({
      driver: { id: driverId, name: 'John', email: 'driver@example.com', cabinet_enabled: true },
      flags: { driver_assigned: false },
    })
    const res = await runAssign()
    expect(res.status).toBe(201)
    expect(h.notifyStub).not.toHaveBeenCalled()
    expect(h.assignmentEmail).not.toHaveBeenCalled()
  })

  it('a deduped logEmail suppresses both', async () => {
    h.logEmail.mockResolvedValue(false)
    setupRoute({ driver: { id: driverId, name: 'John', email: 'driver@example.com', cabinet_enabled: true } })
    await runAssign()
    expect(h.notifyStub).not.toHaveBeenCalled()
    expect(h.assignmentEmail).not.toHaveBeenCalled()
  })

  it('a rejecting notifier does not change the 201 response', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    h.notifyStub.mockRejectedValue(new Error('boom'))
    setupRoute({ driver: { id: driverId, name: 'John', email: 'driver@example.com', cabinet_enabled: true } })
    const res = await runAssign()
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.assignment).toEqual({ id: ASSIGNMENT_ID, driver_id: driverId, status: 'pending' })
    expect(json.booking_status).toBe('pending')
    spy.mockRestore()
  })
})
