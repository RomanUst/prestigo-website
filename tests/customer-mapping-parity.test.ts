// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rowToBooking, SYNCED_BOOKING_FIELDS } from '../infra/espocrm/lib/booking-map.mjs'
import { buildCBookingDraft, buildContactDraft, CBOOKING_SYNCED_FIELDS } from '@/lib/customer-mapping'
import type { CrmBookingRecord, PersonRecord } from '@/lib/identity-store'

// Synthetic fixtures only (example/x.test domains, fake names). Tests may import infra code; lib must not.

const BASE: CrmBookingRecord = {
  id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
  booking_reference: 'PRG-20260315-ABC123',
  status: 'confirmed',
  booking_source: 'online',
  lead_channel: null,
  leg: '',
  trip_type: 'transfer',
  payment_intent_id: 'pi_test_123',
  payment_link_id: null,
  invoice_number: null,
  pickup_utc: '2026-03-15T08:30:00+00:00',
  pickup_date: '2026-03-15',
  pickup_time: '09:30',
  origin_address: 'Vaclav Havel Airport Prague, Terminal 2',
  destination_address: 'Hotel Example, Praha 1',
  vehicle_class: 'business',
  passengers: 2,
  hours: null,
  amount_eur: 120,
  amount_czk: 3000,
  outbound_amount_czk: null,
  return_amount_czk: null,
  client_first_name: 'Test',
  client_last_name: 'Person',
  client_email: 'test.person@example.test',
  client_phone: '+420700000000',
  flight_number: 'OK123',
  driver_name: 'Driver One',
  user_id: null,
  anonymised_at: null,
  created_at: '2026-03-10T09:00:00+00:00',
  abandoned: false,
}

const row = (over: Partial<CrmBookingRecord>): CrmBookingRecord => ({ ...BASE, ...over })

const FIXTURES: Array<[string, CrmBookingRecord]> = [
  ['confirmed online Stripe', BASE],
  ['null leg', row({ leg: null as unknown as string })],
  ['outbound leg', row({ leg: 'outbound' })],
  ['return leg', row({ leg: 'return' })],
  ['manual cash', row({ booking_source: 'manual', payment_intent_id: null })],
  ['gnet other', row({ booking_source: 'gnet', payment_intent_id: null })],
  ['invoice', row({ payment_intent_id: null, invoice_number: 'INV-2026-001' })],
  ['payment link', row({ payment_intent_id: null, payment_link_id: 'plink_1' })],
  ['missing source counts as online', row({ booking_source: null as unknown as string, payment_intent_id: null })],
  ['czk only', row({ amount_eur: null, amount_czk: 3001 })],
  ['both amounts missing', row({ amount_eur: null, amount_czk: null })],
  ['pickup from local date+time (summer)', row({ pickup_utc: null, pickup_date: '2026-07-01', pickup_time: '14:05' })],
  ['pickup from local date+time (winter)', row({ pickup_utc: null, pickup_date: '2026-12-01', pickup_time: '14:05:30' })],
  ['pickup spring switch (skipped hour)', row({ pickup_utc: null, pickup_date: '2026-03-29', pickup_time: '02:30' })],
  ['pickup autumn switch (repeated hour)', row({ pickup_utc: null, pickup_date: '2026-10-25', pickup_time: '02:30' })],
  ['no usable pickup', row({ pickup_utc: null, pickup_date: 'not-a-date', pickup_time: '' })],
  ['null driver and flight', row({ driver_name: null, flight_number: null })],
  [
    'long addresses and control characters',
    row({
      origin_address: `${'A'.repeat(300)}\u0000x`,
      destination_address: `Hotel\u0007 ${'B'.repeat(300)}`,
      flight_number: 'F'.repeat(40),
      driver_name: 'D'.repeat(150),
      client_first_name: `Fi\u0001rst ${'n'.repeat(100)}`,
      client_last_name: 'L'.repeat(100),
    }),
  ],
  ['blank last name', row({ client_last_name: '' })],
  ['reference with spaces and symbols', row({ booking_reference: ' PRG 2026/01 &x ' })],
  ...['unpaid', 'pending', 'confirmed', 'completed', 'cancelled', 'assigned', 'en_route', 'on_location'].map(
    (status) => [`status ${status}`, row({ status })] as [string, CrmBookingRecord],
  ),
  ...['business', 'first_class', 'business_van'].map(
    (vehicle) => [`vehicle ${vehicle}`, row({ vehicle_class: vehicle })] as [string, CrmBookingRecord],
  ),
  ...['transfer', 'hourly', 'daily', 'round_trip'].map(
    (trip) => [`trip ${trip}`, row({ trip_type: trip })] as [string, CrmBookingRecord],
  ),
]

describe('buildCBookingDraft equals the Phase 80 rowToBooking', () => {
  it.each(FIXTURES)('%s', (_name, fixture) => {
    const built = buildCBookingDraft(fixture)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.draft).toEqual(rowToBooking(fixture))
  })

  it('writes exactly the same field names, in the same order, as the backfill', () => {
    expect([...CBOOKING_SYNCED_FIELDS]).toEqual([...SYNCED_BOOKING_FIELDS])
    const built = buildCBookingDraft(BASE)
    if (!built.ok) throw new Error('fixture must map')
    expect(Object.keys(built.draft)).toEqual([...SYNCED_BOOKING_FIELDS])
  })

  it.each([
    ['status', { status: 'refunded' }],
    ['source', { booking_source: 'partner' }],
    ['leg', { leg: 'middle' }],
    ['trip_type', { trip_type: 'one_way' }],
    ['vehicle_class', { vehicle_class: 'limousine' }],
    ['id', { id: '' }],
  ] as Array<[string, Partial<CrmBookingRecord>]>)('an unknown %s is rejected by both mappers', (_name, over) => {
    const bad = row(over)
    expect(() => rowToBooking(bad)).toThrow()
    expect(buildCBookingDraft(bad)).toEqual({ ok: false, code: 'booking_unmapped' })
  })

  it('anonymised: the TS mapper blanks the customer text and keeps the accounting fields', () => {
    const anon = row({ anonymised_at: '2026-10-19T08:00:00.000Z' })
    const built = buildCBookingDraft(anon)
    if (!built.ok) throw new Error('fixture must map')
    expect(built.draft).toEqual({
      ...rowToBooking(anon),
      passengerName: '',
      flightNumber: '',
      pickup: '',
      dropoff: '',
    })
    expect(built.draft).toMatchObject({ name: BASE.booking_reference, amount: 120, status: 'confirmed', vehicleClass: 'business' })
  })
})

describe('buildContactDraft', () => {
  const person = (over: Partial<PersonRecord> = {}): PersonRecord => ({
    identity: { id: '5a1f0c2e-7b3d-4c9a-8e1f-0a1b2c3d4e5f', user_id: null, espo_contact_id: null, chatwoot_contact_id: null, erasing_at: null },
    emails: [{ email: 'a@x.test', basis: 'booking', via_phone: null }],
    phones: [],
    profile: null,
    bookings: [],
    ...over,
  })

  it('primary is the first non-phone email; every identity email is listed, primary first', () => {
    const draft = buildContactDraft(
      person({
        emails: [
          { email: 'p@x.test', basis: 'phone', via_phone: '+420700000001' },
          { email: 'b@x.test', basis: 'booking', via_phone: null },
          { email: 'c@x.test', basis: 'signup', via_phone: null },
        ],
      }),
    )
    expect(draft?.primaryEmail).toBe('b@x.test')
    expect(draft?.emails).toEqual(['b@x.test', 'p@x.test', 'c@x.test'])
  })

  it('with only phone-basis emails the first one is primary', () => {
    const draft = buildContactDraft(person({ emails: [{ email: 'p@x.test', basis: 'phone', via_phone: '+420700000001' }] }))
    expect(draft?.primaryEmail).toBe('p@x.test')
  })

  it('names: profile full name first, else the newest booking, lastName falls back to first name then email local part', () => {
    expect(buildContactDraft(person({ profile: { email: null, full_name: 'Jana Nováková', phone: null } }))).toMatchObject({
      firstName: 'Jana',
      lastName: 'Nováková',
    })
    const withBookings = person({
      bookings: [
        { ...BASE, client_first_name: 'Old', client_last_name: 'Name' },
        { ...BASE, client_first_name: 'New', client_last_name: 'Guest' },
      ],
    })
    expect(buildContactDraft(withBookings)).toMatchObject({ firstName: 'New', lastName: 'Guest' })
    expect(buildContactDraft(person({ bookings: [{ ...BASE, client_first_name: 'Solo', client_last_name: '' }] }))).toMatchObject({
      firstName: 'Solo',
      lastName: 'Solo',
    })
    expect(buildContactDraft(person())).toMatchObject({ firstName: null, lastName: 'a' })
  })

  it('phone: the first E.164 number only, never guessed from a bare number', () => {
    expect(buildContactDraft(person({ phones: ['+420777900001', '+420777900002'] }))?.phoneNumber).toBe('+420777900001')
    expect(buildContactDraft(person({ phones: ['777900001', '00420777900001'] }))?.phoneNumber).toBeNull()
    expect(buildContactDraft(person())?.phoneNumber).toBeNull()
  })

  it('a person without any usable email has no Contact draft', () => {
    expect(buildContactDraft(person({ emails: [] }))).toBeNull()
    expect(buildContactDraft(person({ emails: [{ email: 'not-an-email', basis: 'booking', via_phone: null }] }))).toBeNull()
  })
})

describe('library isolation', () => {
  it('lib/customer-mapping.ts and lib/crm-sync.ts import no infra code', () => {
    for (const file of ['lib/customer-mapping.ts', 'lib/crm-sync.ts']) {
      const text = readFileSync(join(process.cwd(), file), 'utf8')
      expect(text).not.toMatch(/from ['"][^'"]*infra\//)
    }
  })
})
