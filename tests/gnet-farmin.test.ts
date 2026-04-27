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

const validQuotePayload = {
  reservationType: 'QUOTE' as const,
  providerId: 'PRESTIGO-PROVIDER-ID',
  transactionId: 'tx-quote-001',
  vehicleType: 'SEDAN',
  pickupPlaceId: 'ChIJplace_origin',
  dropoffPlaceId: 'ChIJplace_dest',
}

const fakeRoute = {
  slug: 'prague-berlin',
  fromLabel: 'Prague',
  toLabel: 'Berlin',
  distanceKm: 350,
  eClassEur: 95,
  sClassEur: 145,
  vClassEur: 175,
  displayOrder: 1,
  placeIds: ['ChIJplace_origin', 'ChIJplace_dest'],
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
  it('unknown providerId → 200 { success:false }', async () => {
    const res = await POST(makeReq({ ...validQuotePayload, providerId: 'WRONG' }, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toBeTruthy()
    expect(mockFindRoute).not.toHaveBeenCalled()
  })
})

describe('POST /api/gnet/farmin QUOTE (FARMIN-05, FARMIN-07, FARMIN-09)', () => {
  it('QUOTE happy path returns price, no DB writes', async () => {
    mockFindRoute.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.totalAmount).toBe('95.00')
    expect(body.transactionId).toBe('tx-quote-001')
    expect(body.reservationId).toMatch(/^PRG-\d{8}-[A-F0-9]{6}$/)
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
  })

  it('response has exactly { success, reservationId, totalAmount, transactionId }', async () => {
    mockFindRoute.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['reservationId', 'success', 'totalAmount', 'transactionId'])
  })

  it('totalAmount is string with 2 decimals', async () => {
    mockFindRoute.mockResolvedValue({ ...fakeRoute, eClassEur: 99.5 })
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('99.50')
  })

  it('uses eClassEur for vehicleClass=business (SEDAN)', async () => {
    mockFindRoute.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, vehicleType: 'SEDAN' }, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('95.00')
  })

  it('uses sClassEur for vehicleClass=first_class (EXECUTIVE)', async () => {
    mockFindRoute.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, vehicleType: 'EXECUTIVE' }, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('145.00')
  })

  it('uses vClassEur for vehicleClass=business_van (VAN)', async () => {
    mockFindRoute.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, vehicleType: 'VAN' }, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('175.00')
  })
})

describe('POST /api/gnet/farmin business failures (FARMIN-08)', () => {
  it('unknown route → 200 { success:false, message }', async () => {
    mockFindRoute.mockResolvedValue(null)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toBeTruthy()
  })

  it('unknown vehicle type → 200 { success:false, message }', async () => {
    mockFindRoute.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, vehicleType: 'TRUCK' }, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})

describe('POST /api/gnet/farmin BOOKING + idempotency (FARMIN-01, FARMIN-06)', () => {
  it.todo('valid BOOKING creates bookings row (booking_source=gnet, status=pending) and gnet_bookings row')
  it.todo('duplicate transaction_id returns existing reservationId without new rows')
})
