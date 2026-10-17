// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

// ---------------------------------------------------------------------------
// Task 2: boundary, payment rule, currency, Prague time, empties, enum pins
// ---------------------------------------------------------------------------

const row = (over: Record<string, unknown> = {}) => ({ ...CONFIRMED_ONLINE_ROW, ...over })

describe('isAbandonedCheckout (D-08/D-21 boundary)', () => {
  it.each([
    ['unpaid + online + no link', { status: 'unpaid', booking_source: 'online', payment_link_id: null }, true],
    ['unpaid + missing source + no link', { status: 'unpaid', booking_source: null, payment_link_id: null }, true],
    ['unpaid + online + empty-string link', { status: 'unpaid', booking_source: 'online', payment_link_id: '' }, true],
    ['unpaid + manual + no link', { status: 'unpaid', booking_source: 'manual', payment_link_id: null }, false],
    ['unpaid + online + link', { status: 'unpaid', booking_source: 'online', payment_link_id: 'plink_x' }, false],
    ['pending + online + no link', { status: 'pending', booking_source: 'online', payment_link_id: null }, false],
    ['confirmed + online + no link', { status: 'confirmed', booking_source: 'online', payment_link_id: null }, false],
  ])('%s -> %s', (_name, over, expected) => {
    expect(map.isAbandonedCheckout(row(over))).toBe(expected)
  })
})

describe('inferPaymentMethod (D-21 order)', () => {
  const none = { payment_intent_id: null, payment_link_id: null, invoice_number: null, booking_source: 'online' }
  it.each([
    ['payment_intent_id', { payment_intent_id: 'pi_1' }, 'Stripe'],
    ['payment_link_id', { payment_link_id: 'plink_1' }, 'Stripe'],
    ['invoice_number', { invoice_number: 'INV-1' }, 'Invoice'],
    ['source gnet', { booking_source: 'gnet' }, 'Other'],
    ['source manual', { booking_source: 'manual' }, 'Cash'],
    ['online without any marker', {}, 'Other'],
    ['missing source without any marker', { booking_source: null }, 'Other'],
    ['intent and invoice together -> Stripe', { payment_intent_id: 'pi_1', invoice_number: 'INV-1' }, 'Stripe'],
    ['manual with invoice -> Invoice', { booking_source: 'manual', invoice_number: 'INV-1' }, 'Invoice'],
  ])('%s -> %s', (_name, over, expected) => {
    expect(map.inferPaymentMethod({ ...none, ...over })).toBe(expected)
  })

  it('PAYMENT_METHOD_RULE is a one-line description of the order', () => {
    expect(typeof map.PAYMENT_METHOD_RULE).toBe('string')
    expect(map.PAYMENT_METHOD_RULE).not.toContain('\n')
    expect(map.PAYMENT_METHOD_RULE.indexOf('payment_intent_id')).toBeLessThan(
      map.PAYMENT_METHOD_RULE.indexOf('invoice_number'),
    )
  })
})

describe('amountEur (precision)', () => {
  it.each([
    [{ amount_eur: 99.5, amount_czk: 2500 }, 99.5],
    [{ amount_eur: null, amount_czk: 2500 }, 100],
    [{ amount_eur: null, amount_czk: 2512 }, 100],
    [{ amount_eur: null, amount_czk: 2513 }, 101],
    [{ amount_eur: null, amount_czk: null }, null],
    [{ amount_eur: 0, amount_czk: 2500 }, 0],
  ])('%j -> %s', (over, expected) => {
    expect(map.amountEur(over)).toBe(expected)
  })

  it('both amounts missing gives a null amount in the payload, never 0', () => {
    expect(map.rowToBooking(row({ amount_eur: null, amount_czk: null })).amount).toBeNull()
  })
})

describe('pickupAtUtc (Europe/Prague local -> UTC)', () => {
  const local = (date: string | null, time: string | null) =>
    map.pickupAtUtc({ pickup_utc: null, pickup_date: date, pickup_time: time })

  it('prefers pickup_utc when present', () => {
    expect(map.pickupAtUtc(row({ pickup_utc: '2026-05-01T12:00:00+00:00' }))).toBe('2026-05-01 12:00:00')
  })

  it.each([
    ['winter (+1)', '2026-01-15', '10:00', '2026-01-15 09:00:00'],
    ['summer (+2)', '2026-07-15', '10:00', '2026-07-15 08:00:00'],
    ['spring switch day, after the switch', '2026-03-29', '03:30', '2026-03-29 01:30:00'],
    ['spring switch day, before the switch', '2026-03-29', '01:30', '2026-03-29 00:30:00'],
    ['autumn switch day, repeated hour -> earlier instant', '2026-10-25', '02:30', '2026-10-25 00:30:00'],
    ['autumn switch day, after the switch', '2026-10-25', '03:30', '2026-10-25 02:30:00'],
    ['HH:MM:SS input', '2026-01-15', '10:00:30', '2026-01-15 09:00:30'],
    ['midnight rolls back a day', '2026-01-15', '00:30', '2026-01-14 23:30:00'],
  ])('%s', (_name, date, time, expected) => {
    expect(local(date, time)).toBe(expected)
  })

  it.each([
    ['missing date', null, '10:00'],
    ['missing time', '2026-01-15', null],
    ['garbage date', 'not-a-date', '10:00'],
    ['garbage time', '2026-01-15', 'later'],
  ])('%s -> null', (_name, date, time) => {
    expect(local(date, time)).toBeNull()
  })
})

describe('round trip adjacency', () => {
  it('outbound and return legs map to two payloads with different keys', () => {
    const out = map.rowToBooking(row({ id: 'id-out', leg: 'outbound', trip_type: 'round_trip' }))
    const ret = map.rowToBooking(row({ id: 'id-ret', leg: 'return', trip_type: 'round_trip' }))
    expect(out.supabaseBookingId).not.toBe(ret.supabaseBookingId)
    expect(out.leg).toBe('outbound')
    expect(ret.leg).toBe('return')
  })
})

describe('normalizeContactPhone (Contact only; synthetic numbers)', () => {
  it('keeps an E.164 number unchanged', () => {
    expect(map.normalizeContactPhone('+420700000001')).toEqual({ phone: '+420700000001', kind: 'kept' })
    expect(map.normalizeContactPhone('+420 700 000 002')).toEqual({ phone: '+420700000002', kind: 'kept' })
  })

  it('strips spaces, dashes, dots and parentheses', () => {
    expect(map.normalizeContactPhone('+49 (151) 234-567.89')).toEqual({ phone: '+4915123456789', kind: 'kept' })
  })

  it('leading 00 becomes +', () => {
    expect(map.normalizeContactPhone('00420 700 000 003')).toEqual({ phone: '+420700000003', kind: 'kept' })
    expect(map.normalizeContactPhone('0049 151 2345 6789')).toEqual({ phone: '+4915123456789', kind: 'kept' })
  })

  it('a "+" number that is not E.164 is omitted', () => {
    expect(map.normalizeContactPhone('+12345').phone).toBeNull() // too short
    expect(map.normalizeContactPhone('+0123456789').phone).toBeNull() // leading zero country code
    expect(map.normalizeContactPhone('+4207000abc01').phone).toBeNull() // letters
    expect(map.normalizeContactPhone('+1234567890123456').phone).toBeNull() // 16 digits
  })

  it('exactly 9 digits gets +420', () => {
    expect(map.normalizeContactPhone('700000004')).toEqual({ phone: '+420700000004', kind: 'prefixed' })
    expect(map.normalizeContactPhone('700 000 005')).toEqual({ phone: '+420700000005', kind: 'prefixed' })
  })

  it.each(map.KNOWN_CALLING_CODES)('11-12 digits starting with calling code %s get a +', (cc) => {
    const digits = (cc + '555123456789').slice(0, 12)
    const out = map.normalizeContactPhone(digits)
    expect(out).toEqual({ phone: `+${digits}`, kind: 'prefixed' })
    const eleven = (cc + '55512345678').slice(0, 11)
    expect(map.normalizeContactPhone(eleven)).toEqual({ phone: `+${eleven}`, kind: 'prefixed' })
  })

  it('11-12 digits with an unknown calling code are omitted', () => {
    expect(map.normalizeContactPhone('99912345678')).toMatchObject({ phone: null, kind: 'omitted' })
    expect(map.normalizeContactPhone('999123456789')).toMatchObject({ phone: null, kind: 'omitted' })
  })

  it('10 digits, 13+ bare digits, other lengths and text are omitted', () => {
    for (const v of ['7000000006', '1234567', '12345678', '4207000000071', 'call me', '700-ABC-000']) {
      expect(map.normalizeContactPhone(v).phone).toBeNull()
    }
  })

  it('empty / null / blank are omitted with reason empty', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(map.normalizeContactPhone(v)).toEqual({ phone: null, kind: 'omitted', reason: 'empty' })
    }
  })

  it('rowToContact uses the normalised phone and omits the key when unusable', () => {
    expect((map.rowToContact(row({ client_phone: '700000007' })) as Record<string, unknown>).phoneNumber).toBe('+420700000007')
    expect((map.rowToContact(row({ client_phone: '00420700000008' })) as Record<string, unknown>).phoneNumber).toBe('+420700000008')
    for (const v of ['7000000009', '', null]) {
      const c = map.rowToContact(row({ client_phone: v }))
      expect(c).not.toBeNull()
      expect(Object.keys(c as object)).not.toContain('phoneNumber')
    }
  })

  it('rowToBooking never carries the phone (booking keeps its original on the source row)', () => {
    expect(Object.keys(map.rowToBooking(row({ client_phone: '700000007' })))).not.toContain('phoneNumber')
  })
})

describe('empties and sanitising', () => {
  it.each([[null], [''], ['   '], ['not-an-email']])('rowToContact(%j email) -> null', (email) => {
    expect(map.rowToContact(row({ client_email: email }))).toBeNull()
  })

  it('lastName falls back to firstName, then to the email local part', () => {
    expect(map.rowToContact(row({ client_last_name: '' }))?.lastName).toBe('Test')
    expect(map.rowToContact(row({ client_first_name: '', client_last_name: '' }))?.lastName).toBe('test.person')
  })

  it('same Contact key for differently cased / padded emails (D-07)', () => {
    const a = map.rowToContact(row({ client_email: ' Ann@Hotel.CZ ' }))
    const b = map.rowToContact(row({ client_email: 'ann@hotel.cz' }))
    expect(a?.emailAddress).toBe(b?.emailAddress)
  })

  it('null driver gives empty driverName, null leg gives empty string', () => {
    const b = map.rowToBooking(row({ driver_name: null, leg: null }))
    expect(b.driverName).toBe('')
    expect(b.leg).toBe('')
  })

  it('caps long addresses to FIELD_MAX_LENGTH and removes control characters', () => {
    const b = map.rowToBooking(row({ origin_address: 'A'.repeat(300), flight_number: 'OK\u0000\u001F12\u007F3' }))
    expect(b.pickup).toHaveLength(255)
    expect(b.flightNumber).toBe('OK123')
  })

  it('sanitizeText returns empty string for null', () => {
    expect(map.sanitizeText(null, 10)).toBe('')
  })

  it('missing source counts as online in the payload', () => {
    expect(map.rowToBooking(row({ booking_source: null })).source).toBe('online')
  })
})

describe('BookingMapError', () => {
  it.each([
    ['unknown_status', { status: 'archived' }],
    ['unknown_source', { booking_source: 'partner' }],
    ['unknown_trip_type', { trip_type: 'shuttle' }],
    ['unknown_vehicle_class', { vehicle_class: 'limo' }],
    ['missing_id', { id: null }],
  ])('throws %s', (code, over) => {
    let caught: unknown
    try {
      map.rowToBooking(row(over))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(map.BookingMapError)
    expect((caught as { code: string }).code).toBe(code)
  })
})

describe('pins against the site sources of truth', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

  it('BOOKING_STATUS_VALUES equals the list in migration 053', () => {
    const sql = read('supabase/migrations/053_unpaid_booking_status.sql')
    const block = sql.match(/bookings_status_check\s+CHECK \(status IN \(([\s\S]*?)\)\)/)
    expect(block).not.toBeNull()
    const values = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(map.BOOKING_STATUS_VALUES).toEqual(values)
  })

  it('BOOKING_SOURCE_VALUES equals the list in migration 039', () => {
    const sql = read('supabase/migrations/039_gnet_bookings.sql')
    const line = sql.match(/bookings_booking_source_check\s+CHECK \(booking_source IN \(([^)]*)\)\)/)
    expect(line).not.toBeNull()
    const values = [...line![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(map.BOOKING_SOURCE_VALUES).toEqual(values)
  })

  it('VEHICLE_CLASS_VALUES and TRIP_TYPE_VALUES equal the unions in types/booking.ts', () => {
    const ts = read('types/booking.ts')
    const union = (name: string) => {
      const m = ts.match(new RegExp(`export type ${name} = ([^\\n]+)`))
      expect(m).not.toBeNull()
      return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    }
    expect(map.VEHICLE_CLASS_VALUES).toEqual(union('VehicleClass'))
    expect(map.TRIP_TYPE_VALUES).toEqual(union('TripType'))
  })

  it('CZK_TO_EUR_RATE and EUR_TO_CZK_RATE equal the numbers in lib/currency.ts', () => {
    const ts = read('lib/currency.ts')
    const num = (name: string) => Number(ts.match(new RegExp(`export const ${name} = ([0-9.]+)`))![1])
    expect(map.CZK_TO_EUR_RATE).toBe(num('CZK_TO_EUR_RATE'))
    expect(map.EUR_TO_CZK_RATE).toBe(num('EUR_TO_CZK_RATE'))
  })

  it('czkToEur matches Math.round(czk * rate) like lib/currency.ts', () => {
    expect(map.czkToEur(2512)).toBe(100)
    expect(map.czkToEur(2513)).toBe(101)
  })
})
