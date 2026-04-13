import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── vi.hoisted stubs (must be declared before vi.mock factories) ───────────────

const {
  mockLogEmail,
  mockSendClientReminderEmail,
  mockSendDriverReminderEmail,
  mockReceiverVerify,
  mockFrom,
} = vi.hoisted(() => ({
  mockLogEmail:                  vi.fn(),
  mockSendClientReminderEmail:   vi.fn(),
  mockSendDriverReminderEmail:   vi.fn(),
  mockReceiverVerify:            vi.fn(),
  mockFrom:                      vi.fn(),
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
  // Pure function — provide real implementation so route logic works unchanged
  getAcceptedDriver: (assignments: Array<{ status: string; drivers?: unknown }> | null | undefined) => {
    const a = (assignments ?? []).find(da => da.status === 'accepted')
    return a?.drivers
  },
}))

vi.mock('@upstash/qstash', () => ({
  // Must use regular function (not arrow) so that `new Receiver(...)` works with Reflect.construct
  Receiver: vi.fn().mockImplementation(function () {
    return { verify: mockReceiverVerify }
  }),
  Client: vi.fn().mockImplementation(function () {
    return { publishJSON: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }) }
  }),
}))

// ── Import route after mocks are set up ──────────────────────────────────────
// NOTE: This import will FAIL (RED) until the route is created in Plan 02.
import { POST } from '@/app/api/cron/reminder-2h/route'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_BOOKING = {
  id: '00000000-0000-0000-0000-000000000002',
  booking_reference: 'PRG-002',
  status: 'confirmed',
  pickup_date: '2026-04-14',
  pickup_time: '12:00',
  origin_address: 'Václavské náměstí, Prague',
  destination_address: 'Václav Havel Airport Prague',
  vehicle_class: 'business',
  client_email: 'client@example.com',
  client_first_name: 'Jane',
  client_last_name: 'Smith',
  client_phone: '+420987654321',
  driver_assignments: [],
}

const BOOKING_WITH_DRIVER = {
  ...BASE_BOOKING,
  driver_assignments: [
    {
      status: 'accepted',
      drivers: {
        name: 'Pavel Novotný',
        email: 'driver2@example.com',
        vehicle_info: 'BMW 5 Series, 2CD3456',
      },
    },
  ],
}

const CANCELLED_BOOKING = {
  ...BASE_BOOKING,
  status: 'cancelled',
}

const PRICING_GLOBALS_FLAGS_ON = {
  notification_flags: { reminder_24h: true, reminder_2h: true },
}

const PRICING_GLOBALS_FLAGS_2H_OFF = {
  notification_flags: { reminder_24h: true, reminder_2h: false },
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown> = { booking_id: '00000000-0000-0000-0000-000000000002' }) {
  return new Request('http://localhost/api/cron/reminder-2h', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'upstash-signature': 'valid-sig',
    },
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default: QStash signature verification passes
  mockReceiverVerify.mockResolvedValue(true)

  // Default: logEmail allows send
  mockLogEmail.mockResolvedValue(true)

  // Default chainable query builder for pricing_globals
  const mockSinglePricing = vi.fn().mockResolvedValue({ data: PRICING_GLOBALS_FLAGS_ON, error: null })
  const mockEqPricing = vi.fn().mockReturnValue({ single: mockSinglePricing })
  const mockSelectPricing = vi.fn().mockReturnValue({ eq: mockEqPricing })

  // Default: booking query
  const mockSingleBooking = vi.fn().mockResolvedValue({ data: BASE_BOOKING, error: null })
  const mockEqBooking = vi.fn().mockReturnValue({ single: mockSingleBooking })
  const mockSelectBooking = vi.fn().mockReturnValue({ eq: mockEqBooking })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'pricing_globals') return { select: mockSelectPricing }
    if (table === 'bookings') return { select: mockSelectBooking }
    return {}
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NOTIF-05/DRIVER-07: 2h QStash reminder', () => {
  it('returns 401 on invalid QStash signature', async () => {
    mockReceiverVerify.mockRejectedValue(new Error('Invalid signature'))

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    expect(mockSendClientReminderEmail).not.toHaveBeenCalled()
  })

  it('skips cancelled booking and returns 200', async () => {
    const mockSingleCancelled = vi.fn().mockResolvedValue({ data: CANCELLED_BOOKING, error: null })
    const mockEqCancelled = vi.fn().mockReturnValue({ single: mockSingleCancelled })
    const mockSelectCancelled = vi.fn().mockReturnValue({ eq: mockEqCancelled })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'pricing_globals') {
        const single = vi.fn().mockResolvedValue({ data: PRICING_GLOBALS_FLAGS_ON, error: null })
        const eq = vi.fn().mockReturnValue({ single })
        return { select: vi.fn().mockReturnValue({ eq }) }
      }
      if (table === 'bookings') return { select: mockSelectCancelled }
      return {}
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSendClientReminderEmail).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.skipped).toBe(true)
  })

  it('skips when reminder_2h flag is false', async () => {
    const mockSingleOff = vi.fn().mockResolvedValue({ data: PRICING_GLOBALS_FLAGS_2H_OFF, error: null })
    const mockEqOff = vi.fn().mockReturnValue({ single: mockSingleOff })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'pricing_globals') return { select: vi.fn().mockReturnValue({ eq: mockEqOff }) }
      if (table === 'bookings') {
        const single = vi.fn().mockResolvedValue({ data: BASE_BOOKING, error: null })
        const eq = vi.fn().mockReturnValue({ single })
        return { select: vi.fn().mockReturnValue({ eq }) }
      }
      return {}
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSendClientReminderEmail).not.toHaveBeenCalled()
  })

  it('skips when logEmail returns false (dedup)', async () => {
    mockLogEmail.mockResolvedValue(false)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSendClientReminderEmail).not.toHaveBeenCalled()
  })

  it('sends client 2h reminder for confirmed booking', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSendClientReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_reference: BASE_BOOKING.booking_reference,
        client_email: BASE_BOOKING.client_email,
      }),
      '2h'
    )
  })

  it('sends driver 2h reminder when driver assigned+accepted', async () => {
    const mockSingleWithDriver = vi.fn().mockResolvedValue({ data: BOOKING_WITH_DRIVER, error: null })
    const mockEqWithDriver = vi.fn().mockReturnValue({ single: mockSingleWithDriver })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'pricing_globals') {
        const single = vi.fn().mockResolvedValue({ data: PRICING_GLOBALS_FLAGS_ON, error: null })
        const eq = vi.fn().mockReturnValue({ single })
        return { select: vi.fn().mockReturnValue({ eq }) }
      }
      if (table === 'bookings') return { select: vi.fn().mockReturnValue({ eq: mockEqWithDriver }) }
      return {}
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSendDriverReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        driver_email: 'driver2@example.com',
        driver_name: 'Pavel Novotný',
      }),
      '2h'
    )
  })

  it('does not send driver 2h reminder when no driver assigned', async () => {
    // BASE_BOOKING has empty driver_assignments
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSendDriverReminderEmail).not.toHaveBeenCalled()
  })
})
