// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as map from '../infra/espocrm/lib/booking-map.mjs'

// Synthetic fixture only (example.test domain, fake names) - T-80-07.
const CONFIRMED_ONLINE_ROW = {
  id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
  booking_reference: 'PRG-20260315-ABC123',
  status: 'confirmed',
  booking_source: 'online',
  leg: null,
  trip_type: 'transfer',
  vehicle_class: 'business',
  pickup_utc: '2026-03-15T08:30:00+00:00',
  pickup_date: '2026-03-15',
  pickup_time: '09:30',
  origin_address: 'Vaclav Havel Airport Prague, Terminal 2',
  destination_address: 'Hotel Example, Praha 1',
  amount_eur: 120,
  amount_czk: 3000,
  client_first_name: 'Test',
  client_last_name: 'Person',
  client_email: 'test.person@example.test',
  client_phone: '+420700000000',
  flight_number: 'OK123',
  payment_intent_id: 'pi_test_123',
  payment_link_id: null,
  invoice_number: null,
  paid_at: '2026-03-10T10:00:00+00:00',
  attempt_id: null,
  user_id: null,
  created_at: '2026-03-10T09:00:00+00:00',
  driver_name: 'Driver One',
  company_name: null,
  account_type: null,
}

describe('tracer: confirmed online row -> CBooking + Contact payload', () => {
  it('rowToBooking builds the complete CBooking payload', () => {
    expect(map.rowToBooking(CONFIRMED_ONLINE_ROW)).toEqual({
      name: 'PRG-20260315-ABC123',
      supabaseBookingId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
      leg: '',
      pickupAt: '2026-03-15 08:30:00',
      pickup: 'Vaclav Havel Airport Prague, Terminal 2',
      dropoff: 'Hotel Example, Praha 1',
      tripType: 'transfer',
      vehicleClass: 'business',
      status: 'confirmed',
      amount: 120,
      amountCurrency: 'EUR',
      paymentMethod: 'Stripe',
      passengerName: 'Test Person',
      flightNumber: 'OK123',
      driverName: 'Driver One',
      source: 'online',
      adminLink: 'https://rideprestigo.com/admin/bookings?search=PRG-20260315-ABC123',
    })
  })

  it('rowToBooking payload keys equal SYNCED_BOOKING_FIELDS', () => {
    expect(Object.keys(map.rowToBooking(CONFIRMED_ONLINE_ROW)).sort()).toEqual(
      [...map.SYNCED_BOOKING_FIELDS].sort(),
    )
  })

  it('rowToContact builds the Contact payload', () => {
    expect(map.rowToContact(CONFIRMED_ONLINE_ROW)).toEqual({
      firstName: 'Test',
      lastName: 'Person',
      emailAddress: 'test.person@example.test',
      phoneNumber: '+420700000000',
    })
  })

  it('buildAdminLink URL-encodes the reference', () => {
    expect(map.buildAdminLink('PRG-20260928-D8E6DC')).toBe(
      'https://rideprestigo.com/admin/bookings?search=PRG-20260928-D8E6DC',
    )
    expect(map.buildAdminLink('A B&C')).toBe(
      'https://rideprestigo.com/admin/bookings?search=A%20B%26C',
    )
  })

  it('normalizeEmail trims and lower-cases (D-07)', () => {
    expect(map.normalizeEmail(' Ann@Hotel.CZ ')).toBe(map.normalizeEmail('ann@hotel.cz'))
    expect(map.normalizeEmail(' Ann@Hotel.CZ ')).toBe('ann@hotel.cz')
  })
})
