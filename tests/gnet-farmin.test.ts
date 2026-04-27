import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGetPricingConfig, mockSupabaseFrom, mockPublicFrom, mockFetch } = vi.hoisted(() => ({
  mockGetPricingConfig: vi.fn(),
  mockSupabaseFrom:     vi.fn(),
  mockPublicFrom:       vi.fn(),
  mockFetch:            vi.fn(),
}))

vi.mock('@/lib/pricing-config', () => ({
  getPricingConfig: mockGetPricingConfig,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient:    () => ({ from: mockSupabaseFrom }),
  createSupabasePublicReadClient: () => ({ from: mockPublicFrom }),
}))

// Default zone-check mock: empty zones (no active coverage configured) → check is skipped.
// Tests that want to assert zone rejection override this with mockPublicFrom.mockImplementation(...).
function stubNoZones(): void {
  mockPublicFrom.mockImplementation((_table: string) => ({
    select: () => ({
      eq: async () => ({ data: [], error: null }),
    }),
  }))
}

vi.stubGlobal('fetch', mockFetch)

process.env.GNET_WEBHOOK_KEY    = 'test-key'
process.env.GNET_WEBHOOK_SECRET = 'test-secret'
process.env.GNET_GRIDDID        = 'PRESTIGO-PROVIDER-ID'
process.env.GOOGLE_MAPS_API_KEY = 'test-google-key'

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

// Mock pricing config matching admin defaults (per the user's screenshot)
const fakeRates = {
  ratePerKm:  { business: 1.55, first_class: 2.55, business_van: 1.71 },
  hourlyRate: { business: 49,   first_class: 120,  business_van: 76 },
  dailyRate:  { business: 320,  first_class: 480,  business_van: 400 },
  minFare:    { business: 65,   first_class: 120,  business_van: 76 },
  globals: {
    airportFee:             40,
    nightCoefficient:       1.15,
    holidayCoefficient:     1.30,
    extraChildSeat:         0,
    extraLuggage:           0,
    holidayDates:           [],
    returnDiscountPercent:  10,
    hourlyMinHours:         2,
    hourlyMaxHours:         24,
    notificationFlags:      null,
    airportPromoActive:     false,
    airportRegularPriceEur: 80,
    airportPromoPriceEur:   59,
  },
}

// Helper: stub Google Routes API to return a fixed distance
function stubGoogleDistance(km: number): void {
  mockFetch.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
      return {
        ok:   true,
        json: async () => ({ routes: [{ distanceMeters: km * 1000 }] }),
      } as Response
    }
    throw new Error('Unexpected fetch URL: ' + url)
  })
}

beforeEach(() => {
  mockGetPricingConfig.mockReset()
  mockGetPricingConfig.mockResolvedValue(fakeRates)
  mockSupabaseFrom.mockReset()
  mockPublicFrom.mockReset()
  mockFetch.mockReset()
  stubNoZones()
  stubGoogleDistance(150) // PRG → Dresden ~150 km
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
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/gnet/farmin QUOTE pricing', () => {
  it('QUOTE happy path: distance × ratePerKm + airport fee, clamped by minFare', async () => {
    // 150 km × 1.55 €/km = 232.5 → 233 base + 40 airport fee = 273
    stubGoogleDistance(150)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.totalAmount).toBe('273.00')
    expect(body.transactionId).toBe('tx-quote-001')
    expect(body.reservationId).toMatch(/^PRG-\d{8}-[A-F0-9]{6}$/)
  })

  it('SEDAN_LUX uses first_class rate (2.55 €/km)', async () => {
    // 150 km × 2.55 = 382.5 → 383 base + 40 airport = 423
    stubGoogleDistance(150)
    const res = await POST(makeReq(
      { ...validQuotePayload, preferredVehicleType: 'SEDAN_LUX' },
      { authorization: validAuth },
    ))
    const body = await res.json()
    expect(body.totalAmount).toBe('423.00')
  })

  it('VAN_CORP uses business_van rate (1.71 €/km)', async () => {
    // 150 km × 1.71 = 256.5 → 257 base + 40 airport = 297
    stubGoogleDistance(150)
    const res = await POST(makeReq(
      { ...validQuotePayload, preferredVehicleType: 'VAN_CORP' },
      { authorization: validAuth },
    ))
    const body = await res.json()
    expect(body.totalAmount).toBe('297.00')
  })

  it('short trip clamped to minFare', async () => {
    // 5 km × 1.55 = 7.75 → 8 base + 40 airport = 48; min business = 65 → clamped
    stubGoogleDistance(5)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('65.00')
  })

  it('night pickup applies 1.15× coefficient', async () => {
    // round(150 × 1.55) = 233 → round(233 × 1.15) = 268 → + 40 airport = 308
    stubGoogleDistance(150)
    const nightPayload = {
      ...validQuotePayload,
      locations: {
        ...validQuotePayload.locations,
        pickup: { ...validQuotePayload.locations.pickup, time: '2026-05-10T23:30:00' },
      },
    }
    const res = await POST(makeReq(nightPayload, { authorization: validAuth }))
    const body = await res.json()
    expect(body.totalAmount).toBe('308.00')
  })

  it('QUOTE returns exactly { success, reservationId, totalAmount, transactionId }', async () => {
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['reservationId', 'success', 'totalAmount', 'transactionId'])
  })

  it('QUOTE does not write to DB', async () => {
    await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
  })
})

describe('POST /api/gnet/farmin coverage zone check', () => {
  it('rejects when neither pickup nor dropoff is in any active zone', async () => {
    // Active zone covering only Brno (~49.19, 16.61) — neither PRG (50.10, 14.26)
    // nor Dresden (51.05, 13.74) falls inside.
    const brnoZone = {
      type: 'Polygon',
      coordinates: [[[16.5, 49.1], [16.7, 49.1], [16.7, 49.3], [16.5, 49.3], [16.5, 49.1]]],
    }
    mockPublicFrom.mockImplementation(() => ({
      select: () => ({
        eq: async () => ({ data: [{ id: 'zone-1', geojson: brnoZone }], error: null }),
      }),
    }))
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/coverage/i)
    expect(mockFetch).not.toHaveBeenCalled() // never reached Google Routes
  })

  it('accepts when pickup is in active zone (dropoff outside is fine)', async () => {
    // Zone covering PRG airport (50.1008, 14.26)
    const prgZone = {
      type: 'Polygon',
      coordinates: [[[14.0, 49.9], [14.5, 49.9], [14.5, 50.3], [14.0, 50.3], [14.0, 49.9]]],
    }
    mockPublicFrom.mockImplementation(() => ({
      select: () => ({
        eq: async () => ({ data: [{ id: 'zone-1', geojson: prgZone }], error: null }),
      }),
    }))
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

describe('POST /api/gnet/farmin business failures (FARMIN-08)', () => {
  it('Google Routes failure → 200 { success:false, message }', async () => {
    mockFetch.mockResolvedValue({ ok: false, text: async () => 'API error' } as unknown as Response)
    const res = await POST(makeReq(validQuotePayload, { authorization: validAuth }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toBeTruthy()
  })

  it('unknown vehicle type → 200 { success:false, message }', async () => {
    const res = await POST(makeReq(
      { ...validQuotePayload, preferredVehicleType: 'HELICOPTER' },
      { authorization: validAuth },
    ))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('dropoff without lat/lon → 200 { success:false }', async () => {
    const noCoords = {
      ...validQuotePayload,
      locations: {
        ...validQuotePayload.locations,
        dropOff: { address: 'Somewhere', city: 'Anywhere' },
      },
    }
    const res = await POST(makeReq(noCoords, { authorization: validAuth }))
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
    stubGoogleDistance(150)
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
    expect(row.distance_km).toBe(150)

    const gnetUpsert = calls.find(c => c.table === 'gnet_bookings' && c.op === 'upsert')
    expect(gnetUpsert).toBeDefined()
    const gnetRow = (gnetUpsert!.args[0] as any[])[0]
    expect(gnetRow.transaction_id).toBe('tx-001')
    expect(gnetRow.gnet_res_no).toBe('GR-001')
    expect(gnetRow.booking_id).toBe('booking-uuid-1')
    expect(gnetRow.raw_payload).toMatchObject({ griddID: 'PRESTIGO-PROVIDER-ID', transactionId: 'tx-001' })
    expect(gnetUpsert!.args[1]).toMatchObject({ onConflict: 'transaction_id', ignoreDuplicates: true })
  })

  it('duplicate transaction_id returns existing reservationId, no new rows (FARMIN-06)', async () => {
    stubGoogleDistance(150)
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
