import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGetRoutePrice, mockGetAllRoutes, mockSupabaseFrom } = vi.hoisted(() => ({
  mockGetRoutePrice: vi.fn(),
  mockGetAllRoutes:  vi.fn(),
  mockSupabaseFrom:  vi.fn(),
}))

// Route-prices: mock getRoutePrice + getAllRoutes (used by findRouteForGnet)
vi.mock('@/lib/route-prices', () => ({
  getRoutePrice: mockGetRoutePrice,
  getAllRoutes:   mockGetAllRoutes,
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

// Actual GNet payload format (griddID, preferredVehicleType, nested locations with lat/lon)
// Dropoff is Dresden (lat 51.05, lon 13.74) — matches DEST_COORDS → "prague-dresden"
const validBookingPayload = {
  griddID:              'PRESTIGO-PROVIDER-ID',
  transactionId:        'tx-001',
  preferredVehicleType: 'SEDAN',
  reservationType:      'REGULAR',
  locations: {
    pickup: {
      address:      'PRG',
      locationType: 'airport',
      time:         '2026-05-10T14:30:00',
      country:      'Czech Republic',
    },
    dropOff: {
      address:      'Dresden, Germany',
      lat:          '51.0500',
      lon:          '13.7400',
      locationType: 'address',
      city:         'Dresden',
      country:      'DE',
    },
  },
  passengerCount: '1',
  passengers: [{ firstName: 'Test', lastName: 'Passenger', email: 'test@test.com', phoneNumber: '+49123' }],
  affiliateReservation: {
    requesterResNo: 'GR-001',
    providerId:     'gnettest',
    requesterId:    'PRESTIGO-PROVIDER-ID',
  },
}

const validQuotePayload = {
  griddID:              'PRESTIGO-PROVIDER-ID',
  transactionId:        'tx-quote-001',
  preferredVehicleType: 'SEDAN',
  reservationType:      'QUOTE',
  locations: {
    pickup: {
      address:      'PRG',
      locationType: 'airport',
      time:         '2026-05-10T14:30:00',
    },
    dropOff: {
      address: 'Dresden, Germany',
      lat:     '51.0500',
      lon:     '13.7400',
      city:    'Dresden',
      country: 'DE',
    },
  },
}

const fakeRoute = {
  slug:         'prague-dresden',
  fromLabel:    'Prague',
  toLabel:      'Dresden',
  distanceKm:   150,
  eClassEur:    95,
  sClassEur:    145,
  vClassEur:    175,
  displayOrder: 1,
  placeIds:     [],
}

beforeEach(() => {
  mockGetRoutePrice.mockReset()
  mockGetAllRoutes.mockReset()
  mockGetAllRoutes.mockResolvedValue([]) // default: no fallback routes
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

  it('does not short-circuit on length-matching wrong credentials', async () => {
    const sameLen = 'Basic ' + Buffer.from('test-key:test-secreu').toString('base64')
    const res = await POST(makeReq(validBookingPayload, { authorization: sameLen }))
    expect(res.status).toBe(401)
  })

  it('valid Basic Auth + valid Zod payload → not 401', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).not.toBe(401)
  })
})

describe('POST /api/gnet/farmin Zod (FARMIN-10)', () => {
  it('invalid JSON body → 200 { success:false }', async () => {
    const res = await POST(makeReq('{not json', { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('missing required fields → 200 { success:false }', async () => {
    // Missing griddID, preferredVehicleType, locations
    const res = await POST(makeReq({ transactionId: 'tx-only' }, { authorization: validAuth }))
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

describe('POST /api/gnet/farmin griddID check (FARMIN-04)', () => {
  it('wrong griddID → 200 { success:false }', async () => {
    const res = await POST(makeReq({ ...validQuotePayload, griddID: 'WRONG' }, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toBeTruthy()
    expect(mockGetRoutePrice).not.toHaveBeenCalled()
  })
})

describe('POST /api/gnet/farmin QUOTE (FARMIN-05, FARMIN-07, FARMIN-09)', () => {
  it('QUOTE happy path returns price, no DB writes', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
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
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['reservationId', 'success', 'totalAmount', 'transactionId'])
  })

  it('totalAmount is string with 2 decimals', async () => {
    mockGetRoutePrice.mockResolvedValue({ ...fakeRoute, eClassEur: 99.5 })
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('99.50')
  })

  it('uses eClassEur for vehicleClass=business (SEDAN)', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, preferredVehicleType: 'SEDAN' }, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('95.00')
  })

  it('uses sClassEur for vehicleClass=first_class (SEDAN_LUX)', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, preferredVehicleType: 'SEDAN_LUX' }, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('145.00')
  })

  it('uses vClassEur for vehicleClass=business_van (VAN_CORP)', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, preferredVehicleType: 'VAN_CORP' }, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('175.00')
  })
})

describe('POST /api/gnet/farmin business failures (FARMIN-08)', () => {
  it('unknown route (null from route lookup) → 200 { success:false, message }', async () => {
    mockGetRoutePrice.mockResolvedValue(null)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toBeTruthy()
  })

  it('unknown vehicle type → 200 { success:false, message }', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const res = await POST(makeReq({ ...validQuotePayload, preferredVehicleType: 'HELICOPTER' }, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})

/**
 * Helper to build a chainable Supabase mock that mimics:
 *   .from(table).insert(rows).select(...).single()
 *   .from(table).upsert(rows, opts).select(...)
 *   .from(table).select(...).eq(...).single()
 *   .from(table).delete().eq(...)
 */
function buildSupabaseMock(opts: {
  bookingsInsertResult?: { data: { id: string; booking_reference: string } | null; error: unknown };
  gnetUpsertResult?:    { data: { id: string; booking_id: string }[] | null; error: unknown };
  gnetSelectExisting?:  { data: { id: string; booking_id: string } | null; error: unknown };
  bookingsSelectByPk?:  { data: { booking_reference: string } | null; error: unknown };
}) {
  const calls: { table: string; op: string; args: unknown[] }[] = []
  const fromImpl = (table: string) => {
    const chain: any = {
      insert: (rows: unknown) => {
        calls.push({ table, op: 'insert', args: [rows] })
        return {
          select: () => ({
            single: async () => opts.bookingsInsertResult ?? { data: null, error: 'not configured' },
          }),
        }
      },
      upsert: (rows: unknown, upsertOpts: unknown) => {
        calls.push({ table, op: 'upsert', args: [rows, upsertOpts] })
        return {
          select: async () => opts.gnetUpsertResult ?? { data: null, error: 'not configured' },
        }
      },
      select: (_cols: string) => {
        calls.push({ table, op: 'select', args: [_cols] })
        return {
          eq: (_col: string, _val: unknown) => ({
            single: async () => {
              if (table === 'gnet_bookings') return opts.gnetSelectExisting ?? { data: null, error: 'not configured' }
              if (table === 'bookings')      return opts.bookingsSelectByPk ?? { data: null, error: 'not configured' }
              return { data: null, error: 'unknown table' }
            },
          }),
        }
      },
      delete: () => {
        calls.push({ table, op: 'delete', args: [] })
        return {
          eq: async () => ({ error: null }),
        }
      },
    }
    return chain
  }
  mockSupabaseFrom.mockImplementation(fromImpl)
  return { calls }
}

describe('POST /api/gnet/farmin BOOKING + idempotency (FARMIN-01, FARMIN-06)', () => {
  it('valid BOOKING creates bookings row + gnet_bookings row (FARMIN-01)', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const { calls } = buildSupabaseMock({
      bookingsInsertResult: { data: { id: 'booking-uuid-1', booking_reference: 'PRG-20260510-ABC123' }, error: null },
      gnetUpsertResult:     { data: [{ id: 'gnet-uuid-1', booking_id: 'booking-uuid-1' }], error: null },
    })

    const res = await POST(makeReq(validBookingPayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.reservationId).toBe('PRG-20260510-ABC123')
    expect(body.transactionId).toBe('tx-001')

    const bookingsInsert = calls.find(c => c.table === 'bookings' && c.op === 'insert')
    expect(bookingsInsert).toBeDefined()
    const row = (bookingsInsert!.args[0] as any[])[0]
    expect(row.booking_source).toBe('gnet')
    expect(row.status).toBe('pending')
    expect(row.leg).toBe('outbound')
    expect(row.vehicle_class).toBe('business')
    expect(row.trip_type).toBe('transfer')

    const gnetUpsert = calls.find(c => c.table === 'gnet_bookings' && c.op === 'upsert')
    expect(gnetUpsert).toBeDefined()
    const gnetRow = (gnetUpsert!.args[0] as any[])[0]
    expect(gnetRow.transaction_id).toBe('tx-001')
    expect(gnetRow.gnet_res_no).toBe('GR-001') // from affiliateReservation.requesterResNo
    expect(gnetRow.booking_id).toBe('booking-uuid-1')
    expect(gnetRow.raw_payload).toMatchObject({ griddID: 'PRESTIGO-PROVIDER-ID', transactionId: 'tx-001' })
    expect(gnetUpsert!.args[1]).toMatchObject({ onConflict: 'transaction_id', ignoreDuplicates: true })
  })

  it('duplicate transaction_id returns existing reservationId, no new rows (FARMIN-06)', async () => {
    mockGetRoutePrice.mockResolvedValue(fakeRoute)
    const { calls } = buildSupabaseMock({
      bookingsInsertResult: { data: { id: 'orphan-booking-uuid', booking_reference: 'PRG-ORPHAN-REF' }, error: null },
      gnetUpsertResult:     { data: [], error: null },
      gnetSelectExisting:   { data: { id: 'gnet-uuid-existing', booking_id: 'booking-uuid-existing' }, error: null },
      bookingsSelectByPk:   { data: { booking_reference: 'PRG-20260101-EXIST1' }, error: null },
    })

    const res = await POST(makeReq(validBookingPayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.reservationId).toBe('PRG-20260101-EXIST1')

    const deleteCalls = calls.filter(c => c.table === 'bookings' && c.op === 'delete')
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1)

    const gnetUpsert = calls.find(c => c.table === 'gnet_bookings' && c.op === 'upsert')
    expect(gnetUpsert).toBeDefined()
    expect(gnetUpsert!.args[1]).toMatchObject({ onConflict: 'transaction_id', ignoreDuplicates: true })
  })
})
