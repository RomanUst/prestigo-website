import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 87-15 (87-UAT gap 1): after the driver taps Accept the driver receives one email with the
 * order details and the permanent trip link. End to end through the real route, the real
 * lib/driver-accept-email.ts and the real lib/email.ts. Only Supabase, the email log, Resend and
 * next/server after() are mocked.
 */

const { sendStub, logEmailStub, state } = vi.hoisted(() => {
  const state = {
    // driver_assignments token lookup (route)
    lookup: null as unknown,
    // driver_assignments update (route)
    updated: null as unknown,
    // driver_assignments join read (helper)
    joinRow: null as unknown,
    joinError: null as unknown,
    // pricing_globals
    flags: null as unknown,
    joinSelects: [] as string[],
  }
  return { sendStub: vi.fn(), logEmailStub: vi.fn(), state }
})

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

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      if (table === 'pricing_globals') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { notification_flags: state.flags }, error: null }),
            }),
          }),
        }
      }
      // driver_assignments: lookup / join read (select) and single-use update
      return {
        select: (cols: string) => {
          if (cols.includes('token_used_at')) {
            return {
              eq: () => ({ single: () => Promise.resolve({ data: state.lookup, error: null }) }),
            }
          }
          state.joinSelects.push(cols)
          return {
            eq: () => ({
              single: () => Promise.resolve({ data: state.joinRow, error: state.joinError }),
            }),
          }
        },
        update: () => ({
          eq: () => ({
            gt: () => ({
              is: () => ({
                select: () => ({ single: () => Promise.resolve({ data: state.updated, error: null }) }),
              }),
            }),
          }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: () => '203.0.113.7',
}))

vi.mock('@/lib/email-log', () => ({ logEmail: logEmailStub }))

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendStub } }
  },
}))

import { POST as respondPost } from '@/app/api/driver/respond/route'
import {
  buildDriverAcceptedEmailHtml,
  sendDriverAssignmentEmail,
  type DriverAcceptedEmailData,
  type DriverAssignmentEmailData,
} from '@/lib/email'
import goldenAssignment from './fixtures/driver-assignment-email-golden.json'

const assignmentId = 'a1a2a3a4-0000-4000-8000-000000000001'
const bookingId = 'b0000001-0000-4000-8000-000000000001'
const driverId = 'd0000002-0000-4000-8000-000000000002'
const acceptToken = 'a0000003-0000-4000-8000-000000000003'
const tripToken = 'f0000004-0000-4000-8000-000000000004'

function makeRequest(action: 'accepted' | 'declined' = 'accepted'): Request {
  return new Request('http://localhost/api/driver/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: acceptToken, action }),
  })
}

function joinRow(overrides: Record<string, unknown> = {}, bookingOverrides: Record<string, unknown> = {}) {
  return {
    id: assignmentId,
    driver_id: driverId,
    status: 'accepted',
    trip_token: tripToken,
    bookings: {
      id: bookingId,
      booking_reference: 'PRG-20260501-ABCDEF',
      pickup_date: '2026-05-01',
      pickup_time: '10:00',
      origin_address: 'Prague Airport, Terminal 2',
      destination_address: 'Hotel Alcron, Stepanska 40',
      client_first_name: 'Jan',
      client_last_name: 'Novak',
      client_phone: '+420123456789',
      vehicle_class: 'business',
      passengers: 2,
      luggage: 3,
      flight_number: 'OK123',
      special_requests: 'Child seat please',
      driver_price_czk: 2000,
      status: 'assigned',
      driver_id: driverId,
      ...bookingOverrides,
    },
    drivers: { name: 'Petr Driver', email: 'petr@example.com' },
    ...overrides,
  }
}

async function flush() {
  await new Promise((r) => setTimeout(r, 20))
}

/** POST accepted, assert the answer is the unchanged 200 { ok: true } (so a 429 can never fake a pass), then let after() settle. */
async function accept() {
  const res = await respondPost(makeRequest('accepted'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
  await flush()
}

const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
const savedKey = process.env.RESEND_API_KEY

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY = 're_dummy_key'
  delete process.env.NEXT_PUBLIC_SITE_URL
  state.lookup = {
    id: assignmentId,
    booking_id: bookingId,
    driver_id: driverId,
    status: 'pending',
    token_used_at: null,
    token_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  }
  state.updated = { id: assignmentId, status: 'accepted', token_used_at: new Date().toISOString() }
  state.joinRow = joinRow()
  state.joinError = null
  state.flags = null
  state.joinSelects = []
  logEmailStub.mockResolvedValue(true)
  sendStub.mockResolvedValue({ data: { id: 'em_1' }, error: null })
})

afterEach(() => {
  if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl
  if (savedKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = savedKey
})

describe('87-15 tracer: accept -> one email with the order details and the trip link', () => {
  it('answers 200 { ok: true } and sends exactly one email to the driver', async () => {
    const res = await respondPost(makeRequest('accepted'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    await flush()
    expect(sendStub).toHaveBeenCalledTimes(1)
    const arg = sendStub.mock.calls[0][0]
    expect(arg.to).toEqual(['petr@example.com'])
    expect(arg.from).toBe('PRESTIGO Bookings <bookings@rideprestigo.com>')
    expect(arg.replyTo).toBeUndefined()
    expect(arg.subject.startsWith('Trip confirmed: PRG-20260501-ABCDEF')).toBe(true)
    expect(arg.html).toContain('PRG-20260501-ABCDEF')
    expect(arg.html).toContain('Prague Airport, Terminal 2')
    expect(arg.html).toContain('Hotel Alcron, Stepanska 40')
    expect(arg.html).toContain('Jan')
    expect(arg.html).toContain('Novak')
    expect(arg.html).toContain(`href="https://rideprestigo.com/driver/trip/${tripToken}"`)
  })

  it('logs the dedupe key driver_accepted:<assignmentId> once, before the Resend call', async () => {
    const order: string[] = []
    logEmailStub.mockImplementation(async () => {
      order.push('log')
      return true
    })
    sendStub.mockImplementation(async () => {
      order.push('send')
      return { data: { id: 'x' }, error: null }
    })
    await accept()
    expect(logEmailStub).toHaveBeenCalledTimes(1)
    expect(logEmailStub).toHaveBeenCalledWith({
      bookingId: null,
      emailType: `driver_accepted:${assignmentId}`,
      recipient: 'petr@example.com',
    })
    expect(order).toEqual(['log', 'send'])
  })

  it('does not make the 200 answer wait for the send (it runs inside after())', async () => {
    let release: () => void = () => {}
    sendStub.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ data: { id: 'x' }, error: null }) }),
    )
    const res = await respondPost(makeRequest('accepted'))
    expect(res.status).toBe(200)
    // The send is still pending when the response is already returned.
    await flush()
    release()
    await flush()
    expect(sendStub).toHaveBeenCalledTimes(1)
  })

  it('NEXT_PUBLIC_SITE_URL with a trailing slash and whitespace still yields exactly one slash', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com/ \n'
    await accept()
    const html: string = sendStub.mock.calls[0][0].html
    expect(html).toContain(`href="https://rideprestigo.com/driver/trip/${tripToken}"`)
    expect(html).not.toContain('com//driver')
  })

  it('never selects the client price columns (D-06)', async () => {
    await accept()
    expect(state.joinSelects).toHaveLength(1)
    expect(state.joinSelects[0]).not.toMatch(/amount_(eur|czk)/)
    expect(state.joinSelects[0]).toContain('driver_price_czk')
  })
})

describe('87-15 guards', () => {
  it('notification_flags { driver_assigned: false } -> no logEmail, no send', async () => {
    state.flags = { driver_assigned: false }
    await accept()
    expect(logEmailStub).not.toHaveBeenCalled()
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('notification_flags null or a missing key -> sends', async () => {
    state.flags = null
    await accept()
    expect(sendStub).toHaveBeenCalledTimes(1)

    sendStub.mockClear()
    state.flags = { client_confirmed: true }
    await accept()
    expect(sendStub).toHaveBeenCalledTimes(1)
  })

  it('logEmail returns false (dedupe window) -> no send', async () => {
    logEmailStub.mockResolvedValue(false)
    await accept()
    expect(logEmailStub).toHaveBeenCalledTimes(1)
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('booking reassigned to another driver -> no send', async () => {
    state.joinRow = joinRow({}, { driver_id: 'd0000099-0000-4000-8000-000000000099' })
    await accept()
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('booking has no driver -> no send', async () => {
    state.joinRow = joinRow({}, { driver_id: null })
    await accept()
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('assignment status declined -> no send', async () => {
    state.joinRow = joinRow({ status: 'declined' })
    await accept()
    expect(sendStub).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled', 'no_show'])('booking status %s -> no send', async (status) => {
    state.joinRow = joinRow({}, { status })
    await accept()
    expect(logEmailStub).not.toHaveBeenCalled()
    expect(sendStub).not.toHaveBeenCalled()
  })

  it.each([null, ''])('driver email %j -> no send', async (email) => {
    state.joinRow = joinRow({ drivers: { name: 'Petr Driver', email } })
    await accept()
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('trip_token missing -> no send', async () => {
    state.joinRow = joinRow({ trip_token: null })
    await accept()
    expect(sendStub).not.toHaveBeenCalled()
  })

  it('join read error or no row -> no send, one console.error with the assignment id and no token', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.joinRow = null
    state.joinError = { message: 'boom' }
    const res = await respondPost(makeRequest('accepted'))
    await flush()
    expect(res.status).toBe(200)
    expect(sendStub).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledTimes(1)
    const line = String(errSpy.mock.calls[0].join(' '))
    expect(line).toContain(assignmentId)
    expect(line).not.toContain(tripToken)
    expect(line).not.toContain(acceptToken)
    errSpy.mockRestore()
  })

  it('Resend send rejects -> the route still answers 200 { ok: true } and nothing throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sendStub.mockRejectedValue(new Error('resend down'))
    const res = await respondPost(makeRequest('accepted'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    await flush()
    expect(sendStub).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('declined sends no accept email', async () => {
    state.updated = { id: assignmentId, status: 'declined', token_used_at: new Date().toISOString() }
    const res = await respondPost(makeRequest('declined'))
    expect(res.status).toBe(200)
    await flush()
    expect(logEmailStub).not.toHaveBeenCalled()
  })

  it('outcome logs carry the assignment id and a code, never the token, name, email or phone', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await accept()
    const lines = logSpy.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('[driver-accept]'))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) {
      expect(l).toContain(assignmentId)
      expect(l).not.toContain(tripToken)
      expect(l).not.toContain('petr@example.com')
      expect(l).not.toContain('Novak')
      expect(l).not.toContain('+420')
    }
    logSpy.mockRestore()
  })
})

// ─── Task 3: shared detail rows ─────────────────────────────────────────────

const BASE_ASSIGNMENT: DriverAssignmentEmailData = {
  driverName: 'Petr',
  driverEmail: 'petr@example.com',
  bookingReference: 'PRG-20260415-ABCDEF',
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  originAddress: 'Prague Airport',
  destinationAddress: 'Hotel Alcron',
  passengerFirstName: 'Jan',
  passengerLastName: 'Novak',
  passengerPhone: '+420123456789',
  driverPriceCzk: 2000,
  acceptUrl: 'https://rideprestigo.com/driver/response?token=a',
  declineUrl: 'https://rideprestigo.com/driver/response?token=d',
  tripUrl: 'https://rideprestigo.com/driver/trip/t',
}

describe('87-15 assignment email stays byte-identical after the shared rows refactor', () => {
  // The fixture was captured from sendDriverAssignmentEmail BEFORE the refactor.
  async function assignmentHtml(overrides: Partial<DriverAssignmentEmailData>): Promise<string> {
    sendStub.mockClear()
    await sendDriverAssignmentEmail({ ...BASE_ASSIGNMENT, ...overrides })
    return sendStub.mock.calls[0][0].html as string
  }

  it('fee + no notes', async () => {
    expect(await assignmentHtml({})).toBe(goldenAssignment.full)
  })
  it('no fee + notes needing escaping', async () => {
    expect(await assignmentHtml({ driverPriceCzk: null, specialRequests: 'Child <seat> & "luggage"' })).toBe(
      goldenAssignment.noFeeNotes,
    )
  })
  it('fee + notes', async () => {
    expect(await assignmentHtml({ specialRequests: 'Wait at arrivals' })).toBe(goldenAssignment.feeNotes)
  })
  it('no fee + no notes', async () => {
    expect(await assignmentHtml({ driverPriceCzk: null })).toBe(goldenAssignment.bare)
  })
})

const FULL_ACCEPT: DriverAcceptedEmailData = {
  driverName: 'Petr Driver',
  driverEmail: 'petr@example.com',
  bookingReference: 'PRG-20260501-ABCDEF',
  pickupDate: '2026-05-01',
  pickupTime: '10:00',
  originAddress: 'Prague Airport, Terminal 2',
  destinationAddress: 'Hotel Alcron',
  passengerFirstName: 'Jan',
  passengerLastName: 'Novak',
  passengerPhone: '+420123456789',
  vehicleClass: 'business_van',
  passengers: 4,
  luggage: 5,
  flightNumber: 'OK123',
  specialRequests: 'Child seat please',
  driverPriceCzk: 2000,
  tripUrl: 'https://rideprestigo.com/driver/trip/tok',
}

const MINIMAL_ACCEPT: DriverAcceptedEmailData = {
  ...FULL_ACCEPT,
  destinationAddress: null,
  passengerPhone: null,
  vehicleClass: null,
  passengers: null,
  luggage: null,
  flightNumber: null,
  specialRequests: null,
  driverPriceCzk: null,
}

const ANY_ENTITY = /&(?:#\d+|[A-Za-z][A-Za-z0-9]*);/g

describe('87-15 accept email content', () => {
  it('shows every order detail, the OPEN TRIP anchor and none of the assignment-only text', () => {
    const html = buildDriverAcceptedEmailHtml(FULL_ACCEPT)
    expect(html).toContain('PRG-20260501-ABCDEF')
    expect(html).toContain('1 May 2026 at 10:00')
    for (const label of ['From', 'To', 'Passenger', 'Passenger Phone', 'Vehicle', 'Passengers', 'Luggage', 'Flight', 'Notes', 'Your Fee']) {
      expect(html).toContain(`>${label}</td>`)
    }
    expect(html).toContain('Prague Airport, Terminal 2')
    expect(html).toContain('Hotel Alcron')
    expect(html).toContain('Jan Novak')
    expect(html).toContain('+420123456789')
    expect(html).toContain('Business Van')
    expect(html).toContain('OK123')
    expect(html).toContain('Child seat please')
    expect(html).toContain('href="https://rideprestigo.com/driver/trip/tok"')
    expect(html).toContain('OPEN TRIP')
    for (const gone of ['ACCEPT TRIP', 'DECLINE TRIP', '48 hours']) {
      expect(html).not.toContain(gone)
    }
  })

  it('the Your Fee text equals the assignment email fee text', async () => {
    const feeCell = (h: string) => /Your Fee<\/td>\s*<td[^>]*>([^<]*)<\/td>/.exec(h)?.[1]
    sendStub.mockClear()
    await sendDriverAssignmentEmail(BASE_ASSIGNMENT)
    const assignmentFee = feeCell(sendStub.mock.calls[0][0].html as string)
    const acceptFee = feeCell(buildDriverAcceptedEmailHtml({ ...FULL_ACCEPT, driverPriceCzk: 2000 }))
    expect(assignmentFee).toBeTruthy()
    expect(acceptFee).toBe(assignmentFee)
  })

  it('omits optional rows when their values are null and renders a null destination as "As directed"', () => {
    const html = buildDriverAcceptedEmailHtml(MINIMAL_ACCEPT)
    for (const label of ['Passenger Phone', 'Vehicle', 'Passengers', 'Luggage', 'Flight', 'Notes', 'Your Fee']) {
      expect(html).not.toContain(`>${label}</td>`)
    }
    expect(html).toContain('As directed')
  })

  it('escapes user-supplied values', () => {
    const html = buildDriverAcceptedEmailHtml({ ...FULL_ACCEPT, passengerFirstName: '<b>&"x' })
    expect(html).toContain('&lt;b&gt;&amp;&quot;x')
    expect(html).not.toContain('<b>&"x')
  })

  it('uses no HTML entity other than &amp; &lt; &gt; &quot; &#39;', () => {
    const html = buildDriverAcceptedEmailHtml({
      ...FULL_ACCEPT,
      passengerFirstName: "O'Neil & <Sons>",
      specialRequests: 'say "hi"',
    })
    const allowed = new Set(['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'])
    const entities = html.match(ANY_ENTITY) ?? []
    expect(entities.length).toBeGreaterThan(0)
    expect(entities.filter((e) => !allowed.has(e))).toEqual([])
    expect(buildDriverAcceptedEmailHtml(MINIMAL_ACCEPT).match(ANY_ENTITY) ?? []).toEqual([])
  })

  it('never contains a client price label', () => {
    const html = buildDriverAcceptedEmailHtml(FULL_ACCEPT)
    expect(html).not.toMatch(/Total|Amount|Price Paid/i)
  })
})
