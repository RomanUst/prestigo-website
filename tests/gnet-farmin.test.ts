import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

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

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/gnet/farmin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const validBookingPayload = {
  reservationType: 'BOOKING' as const,
  providerId: 'PRESTIGO-PROVIDER-ID',
  transactionId: 'tx-001',
  gnetResNo: 'GR-001',
  vehicleType: 'SEDAN',
  pickupPlaceId: 'ChIJplace_origin',
  dropoffPlaceId: 'ChIJplace_dest',
  pickupDate: '2026-05-10',
  pickupTime: '14:30',
}

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
  it('returns 401 when Authorization header is missing', async () => {
    const res = await POST(makeReq(validBookingPayload))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Basic Auth credentials are wrong', async () => {
    const wrong = 'Basic ' + Buffer.from('wrong:wrong').toString('base64')
    const res = await POST(makeReq(validBookingPayload, { authorization: wrong }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization scheme is not Basic', async () => {
    const res = await POST(makeReq(validBookingPayload, { authorization: 'Bearer xyz' }))
    expect(res.status).toBe(401)
  })

  it('uses crypto.timingSafeEqual (not === string compare)', () => {
    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, '../app/api/gnet/farmin/route.ts'),
      'utf8'
    )
    expect(routeSrc).toMatch(/timingSafeEqual/)
  })

  it('valid Basic Auth + valid Zod payload → not 401', async () => {
    const res = await POST(makeReq(validBookingPayload, { authorization: validAuth }))
    expect(res.status).not.toBe(401)
  })
})

describe('POST /api/gnet/farmin Zod (FARMIN-10)', () => {
  it('invalid JSON body → 200 { success:false }', async () => {
    mockFindRoute.mockResolvedValue(null)
    const res = await POST(makeReq('{not json', { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('missing required fields → 200 { success:false }', async () => {
    const res = await POST(makeReq({ reservationType: 'BOOKING' }, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('unknown reservationType → 200 { success:false }', async () => {
    const res = await POST(makeReq({ ...validBookingPayload, reservationType: 'INVALID' }, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})

describe('POST /api/gnet/farmin body-size guard', () => {
  it('payload over 50KB → 413', async () => {
    const big = 'x'.repeat(50_001)
    const req = new Request('http://localhost/api/gnet/farmin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '50001',
        authorization: validAuth,
      },
      body: big,
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })
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

describe('POST /api/gnet/farmin BOOKING + idempotency (FARMIN-01, FARMIN-06)', () => {
  it.todo('valid BOOKING creates bookings row (booking_source=gnet, status=pending) and gnet_bookings row')
  it.todo('duplicate transaction_id returns existing reservationId without new rows')
})
