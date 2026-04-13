import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Set CRON_SECRET before any vi.mock calls ───────────────────────────────────
process.env.CRON_SECRET = 'test-cron-secret'

// ── vi.hoisted stubs (must be declared before vi.mock factories) ───────────────

const {
  mockLogEmail,
  mockSendClientReminderEmail,
  mockSendDriverReminderEmail,
  mockFrom,
  mockSelect,
  mockEq,
  mockGte,
  mockLte,
  mockIn,
  mockOrder,
} = vi.hoisted(() => ({
  mockLogEmail:                  vi.fn(),
  mockSendClientReminderEmail:   vi.fn(),
  mockSendDriverReminderEmail:   vi.fn(),
  mockFrom:                      vi.fn(),
  mockSelect:                    vi.fn(),
  mockEq:                        vi.fn(),
  mockGte:                       vi.fn(),
  mockLte:                       vi.fn(),
  mockIn:                        vi.fn(),
  mockOrder:                     vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock('@/lib/email-log', () => ({
  logEmail: mockLogEmail,
}))

vi.mock('@/lib/email', () => ({
  sendClientReminderEmail: mockSendClientReminderEmail,
  sendDriverReminderEmail: mockSendDriverReminderEmail,
}))

// ── Import route after mocks are set up ──────────────────────────────────────
// NOTE: This import will FAIL (RED) until the route is created in Plan 02.
import { GET } from '@/app/api/cron/reminder-24h/route'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_BOOKING = {
  id: 'booking-uuid-0001',
  booking_reference: 'PRG-001',
  pickup_date: '2026-04-14',
  pickup_time: '10:00',
  origin_address: 'Václavské náměstí, Prague',
  destination_address: 'Václav Havel Airport Prague',
  vehicle_class: 'business',
  client_email: 'client@example.com',
  client_first_name: 'John',
  client_last_name: 'Doe',
  client_phone: '+420123456789',
  driver_assignments: [],
}

const BOOKING_WITH_DRIVER = {
  ...BASE_BOOKING,
  driver_assignments: [
    {
      status: 'accepted',
      drivers: {
        name: 'Karel Novák',
        email: 'driver@example.com',
        vehicle_info: 'Mercedes E-Class, 1AB2345',
      },
    },
  ],
}

const PRICING_GLOBALS_FLAGS_ON = {
  notification_flags: { reminder_24h: true, reminder_2h: true },
}

const PRICING_GLOBALS_FLAGS_OFF = {
  notification_flags: { reminder_24h: false, reminder_2h: true },
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string) {
  return new Request('http://localhost/api/cron/reminder-24h', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default: logEmail allows send
  mockLogEmail.mockResolvedValue(true)

  // Default chainable query builder
  // pricing_globals → single()
  const mockSingle = vi.fn().mockResolvedValue({ data: PRICING_GLOBALS_FLAGS_ON, error: null })
  const mockEqForPricing = vi.fn().mockReturnValue({ single: mockSingle })
  const mockSelectForPricing = vi.fn().mockReturnValue({ eq: mockEqForPricing })

  // bookings → gte().lte() or similar
  mockOrder.mockResolvedValue({ data: [BASE_BOOKING], error: null })
  mockLte.mockReturnValue({ order: mockOrder })
  mockGte.mockReturnValue({ lte: mockLte })
  mockIn.mockReturnValue({ gte: mockGte })
  mockSelect.mockReturnValue({ in: mockIn })
  mockEq.mockReturnValue({ select: mockSelect })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'pricing_globals') {
      return { select: mockSelectForPricing }
    }
    if (table === 'bookings') {
      return { select: mockSelect }
    }
    return {}
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NOTIF-04/DRIVER-06: 24h reminder cron', () => {
  it('returns 401 without CRON_SECRET', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong CRON_SECRET', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('skips send when reminder_24h flag is false', async () => {
    // Override pricing_globals to have reminder_24h: false
    const mockSingleOff = vi.fn().mockResolvedValue({ data: PRICING_GLOBALS_FLAGS_OFF, error: null })
    const mockEqOff = vi.fn().mockReturnValue({ single: mockSingleOff })
    const mockSelectOff = vi.fn().mockReturnValue({ eq: mockEqOff })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'pricing_globals') return { select: mockSelectOff }
      if (table === 'bookings') return { select: mockSelect }
      return {}
    })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendClientReminderEmail).not.toHaveBeenCalled()
    expect(mockSendDriverReminderEmail).not.toHaveBeenCalled()
  })

  it('skips booking when logEmail returns false (dedup)', async () => {
    mockLogEmail.mockResolvedValue(false)

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendClientReminderEmail).not.toHaveBeenCalled()
  })

  it('sends client reminder email for qualifying booking', async () => {
    mockLogEmail.mockResolvedValue(true)

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendClientReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_reference: BASE_BOOKING.booking_reference,
        client_email: BASE_BOOKING.client_email,
      }),
      '24h'
    )
  })

  it('sends driver reminder when driver assigned+accepted', async () => {
    // Override booking list to include booking with driver
    mockOrder.mockResolvedValue({ data: [BOOKING_WITH_DRIVER], error: null })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendDriverReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        driver_email: 'driver@example.com',
        driver_name: 'Karel Novák',
      }),
      '24h'
    )
  })

  it('does not send driver reminder when no driver assigned', async () => {
    // BASE_BOOKING has empty driver_assignments
    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    expect(mockSendDriverReminderEmail).not.toHaveBeenCalled()
  })

  it('double-run produces no duplicate sends — logEmail dedup', async () => {
    // First run: logEmail returns true → email sent
    // Second run: logEmail returns false → no email
    mockLogEmail
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const res1 = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res1.status).toBe(200)
    expect(mockSendClientReminderEmail).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    mockLogEmail.mockResolvedValue(false)
    mockOrder.mockResolvedValue({ data: [BASE_BOOKING], error: null })

    const res2 = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res2.status).toBe(200)
    expect(mockSendClientReminderEmail).not.toHaveBeenCalled()
  })
})
