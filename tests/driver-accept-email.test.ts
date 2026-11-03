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

vi.mock('@/lib/email-log', () => ({ logEmail: logEmailStub }))

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendStub } }
  },
}))

import { POST as respondPost } from '@/app/api/driver/respond/route'

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
    await respondPost(makeRequest('accepted'))
    await flush()
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
    await respondPost(makeRequest('accepted'))
    await flush()
    const html: string = sendStub.mock.calls[0][0].html
    expect(html).toContain(`href="https://rideprestigo.com/driver/trip/${tripToken}"`)
    expect(html).not.toContain('com//driver')
  })

  it('never selects the client price columns (D-06)', async () => {
    await respondPost(makeRequest('accepted'))
    await flush()
    expect(state.joinSelects).toHaveLength(1)
    expect(state.joinSelects[0]).not.toMatch(/amount_(eur|czk)/)
    expect(state.joinSelects[0]).toContain('driver_price_czk')
  })
})
