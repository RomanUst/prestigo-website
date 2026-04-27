import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFindRoute, mockSupabaseFrom } = vi.hoisted(() => ({
  mockFindRoute: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}))

vi.mock('@/lib/route-prices', () => ({
  findRouteByPlaceIds: mockFindRoute,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: mockSupabaseFrom }),
}))

process.env.GNET_WEBHOOK_KEY    = 'test-key'
process.env.GNET_WEBHOOK_SECRET = 'test-secret'
process.env.GNET_GRIDDID        = 'PRESTIGO-PROVIDER-ID'

const validAuth = 'Basic ' + Buffer.from('test-key:test-secret').toString('base64')

import { GET, POST } from '@/app/api/gnet/farmin/route'

beforeEach(() => {
  mockFindRoute.mockReset()
  mockSupabaseFrom.mockReset()
})

describe('GET /api/gnet/farmin (FARMIN-02)', () => {
  it('returns 200 with { success: true } and no auth required', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })
  })
})

describe('POST /api/gnet/farmin auth (FARMIN-03)', () => {
  it.todo('returns 401 when Authorization header is missing')
  it.todo('returns 401 when Basic Auth credentials are wrong')
  it.todo('uses crypto.timingSafeEqual (not === string compare)')
})

describe('POST /api/gnet/farmin providerId (FARMIN-04)', () => {
  it.todo('returns 200 { success:false, message } when providerId does not match GNET_GRIDDID')
})

describe('POST /api/gnet/farmin QUOTE (FARMIN-05, FARMIN-07, FARMIN-09)', () => {
  it.todo('returns price from route_prices for QUOTE without writing to DB')
  it.todo('response has exactly { success, reservationId, totalAmount, transactionId }')
  it.todo('totalAmount is string with 2 decimals')
  it.todo('uses eClassEur for vehicleClass=business')
  it.todo('uses sClassEur for vehicleClass=first_class')
  it.todo('uses vClassEur for vehicleClass=business_van')
})

describe('POST /api/gnet/farmin business failures (FARMIN-08)', () => {
  it.todo('unknown route → 200 { success:false, message }')
  it.todo('unknown vehicle type → 200 { success:false, message }')
})

describe('POST /api/gnet/farmin Zod (FARMIN-10)', () => {
  it.todo('invalid JSON body → 200 { success:false }')
  it.todo('missing required fields → 200 { success:false }')
})

describe('POST /api/gnet/farmin BOOKING + idempotency (FARMIN-01, FARMIN-06)', () => {
  it.todo('valid BOOKING creates bookings row (booking_source=gnet, status=pending) and gnet_bookings row')
  it.todo('duplicate transaction_id returns existing reservationId without new rows')
})
