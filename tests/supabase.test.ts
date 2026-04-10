import { describe, it, expect, beforeEach, vi } from 'vitest'

// vi.hoisted ensures this runs before vi.mock factories AND before imports
const { supabaseServiceStub, rpcMock } = vi.hoisted(() => {
  const rpcMock = vi.fn()
  return {
    rpcMock,
    supabaseServiceStub: { rpc: rpcMock },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseServiceStub),
}))

import { buildBookingRow, buildBookingRows, saveRoundTripBookings } from '@/lib/supabase'

const BASE_META: Record<string, string> = {
  bookingReference: 'PRG-20260415-AAAAAA',
  returnBookingReference: 'PRG-20260415-BBBBBB',
  tripType: 'round_trip',
  originAddress: 'Prague Airport Terminal 2',
  originLat: '50.1008',
  originLng: '14.2632',
  destinationAddress: 'Hotel Hilton Old Town, Prague',
  destinationLat: '50.0881',
  destinationLng: '14.4281',
  pickupDate: '2026-04-15',
  pickupTime: '14:00',
  returnDate: '2026-04-17',
  returnTime: '18:30',
  vehicleClass: 'business',
  passengers: '2',
  luggage: '3',
  distanceKm: '17',
  extraChildSeat: 'true',
  extraMeetGreet: 'true',
  extraLuggage: 'false',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+420777111222',
  flightNumber: 'OK123',
  terminal: '2',
  specialRequests: 'Please call on arrival',
  amountEur: '260',
  amountCzk: '6585',
  outboundAmountCzk: '3500',
  returnAmountCzk: '3085',
  returnDiscountPct: '10',
  promoCode: '',
  discountPct: '0',
}

describe('lib/supabase — round-trip', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  describe('buildBookingRows — field mapping', () => {
    it('Test 1: outbound row mirrors buildBookingRow shape with correct fields', () => {
      const { outbound } = buildBookingRows(BASE_META, 'pi_xyz')
      expect(outbound.leg).toBe('outbound')
      expect(outbound.booking_reference).toBe('PRG-20260415-AAAAAA')
      expect(outbound.pickup_date).toBe('2026-04-15')
      expect(outbound.pickup_time).toBe('14:00')
      expect(outbound.extra_child_seat).toBe(true)
      expect(outbound.flight_number).toBe('OK123')
      expect((outbound as Record<string, unknown>).outbound_amount_czk).toBe(3500)
      expect((outbound as Record<string, unknown>).return_amount_czk).toBe(3085)
      expect((outbound as Record<string, unknown>).trip_type).toBe('round_trip')
      expect(outbound.booking_type).toBe('confirmed')
    })

    it('Test 2: return row has origin/destination swapped', () => {
      const { return: ret } = buildBookingRows(BASE_META, 'pi_xyz')
      expect(ret.origin_address).toBe('Hotel Hilton Old Town, Prague')
      expect(ret.destination_address).toBe('Prague Airport Terminal 2')
      expect(ret.origin_lat).toBeCloseTo(50.0881, 4)
      expect(ret.origin_lng).toBeCloseTo(14.4281, 4)
      expect(ret.destination_lat).toBeCloseTo(50.1008, 4)
      expect(ret.destination_lng).toBeCloseTo(14.2632, 4)
    })

    it('Test 3: return row has correct leg, reference and trip_type', () => {
      const { return: ret } = buildBookingRows(BASE_META, 'pi_xyz')
      expect(ret.leg).toBe('return')
      expect(ret.booking_reference).toBe('PRG-20260415-BBBBBB')
      expect(ret.payment_intent_id).toBe('pi_xyz')
      expect((ret as Record<string, unknown>).trip_type).toBe('round_trip')
      expect(ret.booking_type).toBe('confirmed')
    })

    it('Test 4: return row pickup uses returnDate/returnTime, NOT outbound pickupDate/pickupTime', () => {
      const { return: ret } = buildBookingRows(BASE_META, 'pi_xyz')
      expect(ret.pickup_date).toBe('2026-04-17')
      expect(ret.pickup_time).toBe('18:30')
    })

    it('Test 5: return row has per-leg amount_czk equal to returnAmountCzk', () => {
      const { return: ret } = buildBookingRows(BASE_META, 'pi_xyz')
      expect(ret.amount_czk).toBe(3085)
      expect((ret as Record<string, unknown>).return_amount_czk).toBe(3085)
      expect((ret as Record<string, unknown>).outbound_amount_czk).toBe(3500)
    })

    it('Test 6: return row extras are all false regardless of metadata values', () => {
      const { return: ret } = buildBookingRows(BASE_META, 'pi_xyz')
      expect(ret.extra_child_seat).toBe(false)
      expect(ret.extra_meet_greet).toBe(false)
      expect(ret.extra_luggage).toBe(false)
    })

    it('Test 7: return row has flight_number and terminal null even when metadata has values', () => {
      const { return: ret } = buildBookingRows(BASE_META, 'pi_xyz')
      expect(ret.flight_number).toBeNull()
      expect(ret.terminal).toBeNull()
    })
  })

  describe('saveRoundTripBookings — idempotency contract', () => {
    const outbound = buildBookingRow(
      { ...BASE_META },
      'pi_xyz',
      'confirmed'
    )
    const returnRow = {
      booking_reference: 'PRG-20260415-BBBBBB',
      payment_intent_id: 'pi_xyz',
      leg: 'return' as const,
      booking_type: 'confirmed' as const,
    } as ReturnType<typeof buildBookingRow>

    it('Test 8: happy path returns IDs and RPC was called once with correct args', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [{ outbound_id: 'uuid-a', return_id: 'uuid-b' }],
        error: null,
      })
      const result = await saveRoundTripBookings(outbound, returnRow)
      expect(result).toEqual({ outbound_id: 'uuid-a', return_id: 'uuid-b' })
      expect(rpcMock).toHaveBeenCalledTimes(1)
      expect(rpcMock).toHaveBeenCalledWith('create_round_trip_bookings', {
        p_outbound: outbound,
        p_return: returnRow,
      })
    })

    it('Test 9: returns null on Postgres 23505 error code (idempotent retry)', async () => {
      rpcMock.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })
      const result = await saveRoundTripBookings(outbound, returnRow)
      expect(result).toBeNull()
    })

    it('Test 10: returns null when error message contains constraint name (message fallback)', async () => {
      rpcMock.mockResolvedValueOnce({
        data: null,
        error: {
          code: undefined,
          message:
            'duplicate key value violates unique constraint "bookings_payment_intent_id_leg_key"',
        },
      })
      const result = await saveRoundTripBookings(outbound, returnRow)
      expect(result).toBeNull()
    })

    it('Test 11: throws on non-duplicate RPC error', async () => {
      rpcMock.mockResolvedValueOnce({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      })
      await expect(saveRoundTripBookings(outbound, returnRow)).rejects.toThrow(
        'relation does not exist'
      )
    })

    it('Test 12: returns null on empty data array (defensive corner case)', async () => {
      rpcMock.mockResolvedValueOnce({ data: [], error: null })
      const result = await saveRoundTripBookings(outbound, returnRow)
      expect(result).toBeNull()
    })

    it('Test 13: result shape has exactly outbound_id and return_id keys (D-02 contract)', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [{ outbound_id: 'uuid-c', return_id: 'uuid-d' }],
        error: null,
      })
      const result = await saveRoundTripBookings(outbound, returnRow)
      expect(result).not.toBeNull()
      const keys = Object.keys(result!)
      expect(keys).toHaveLength(2)
      expect(keys).toContain('outbound_id')
      expect(keys).toContain('return_id')
      expect(typeof result!.outbound_id).toBe('string')
      expect(typeof result!.return_id).toBe('string')
    })
  })

  describe('buildBookingRow one-way regression', () => {
    it('Test 14: existing buildBookingRow for one-way transfer still returns leg=outbound', () => {
      const row = buildBookingRow(
        {
          tripType: 'transfer',
          bookingReference: 'PRG-ONE-WAY',
          originAddress: 'Prague Airport',
          destinationAddress: 'Hotel Alcron',
          pickupDate: '2026-04-20',
          pickupTime: '10:00',
          vehicleClass: 'business',
          passengers: '1',
          luggage: '1',
          amountCzk: '1500',
          extraChildSeat: 'false',
          extraMeetGreet: 'false',
          extraLuggage: 'false',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phone: '+420123456789',
        },
        'pi_ow',
        'confirmed'
      )
      expect(row.leg).toBe('outbound')
    })
  })
})
