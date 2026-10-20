// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  buildChatwootAttributes,
  buildChatwootContactDraft,
  CHATWOOT_SYNCED_ATTRIBUTE_KEYS,
} from '@/lib/chatwoot-mapping'
import type { CrmBookingRecord, PersonRecord } from '@/lib/identity-store'

// Synthetic fixtures only.

const NOW = new Date('2026-10-19T12:00:00.000Z')
const LINKS = { espoBaseUrl: 'https://crm.example.test', siteUrl: 'https://site.example.test' }

function booking(id: string, over: Partial<CrmBookingRecord> = {}): CrmBookingRecord {
  return {
    id,
    booking_reference: `PRG-${id.toUpperCase()}`,
    status: 'confirmed',
    booking_source: 'online',
    lead_channel: null,
    leg: 'outbound',
    trip_type: 'transfer',
    payment_intent_id: 'pi_test_123',
    payment_link_id: null,
    invoice_number: null,
    pickup_utc: '2026-12-01T09:00:00.000Z',
    pickup_date: '2026-12-01',
    pickup_time: '10:00',
    origin_address: 'Prague Airport',
    destination_address: 'Prague Old Town',
    vehicle_class: 'business',
    passengers: 2,
    hours: null,
    amount_eur: 100,
    amount_czk: null,
    outbound_amount_czk: null,
    return_amount_czk: null,
    client_first_name: 'Anna',
    client_last_name: 'Novak',
    client_email: 'a@x.test',
    client_phone: '+420777900010',
    flight_number: null,
    driver_name: null,
    user_id: null,
    anonymised_at: null,
    created_at: '2026-10-18T10:00:00.000Z',
    abandoned: false,
    ...over,
  }
}

function person(bookings: CrmBookingRecord[], over: Partial<PersonRecord> = {}): PersonRecord {
  return {
    identity: { id: 'i1', user_id: null, espo_contact_id: null, chatwoot_contact_id: null, erasing_at: null },
    emails: [{ email: 'a@x.test', basis: 'booking', via_phone: null }],
    phones: ['+420777900010'],
    profile: null,
    bookings,
    ...over,
  }
}

describe('CHATWOOT_SYNCED_ATTRIBUTE_KEYS', () => {
  it('equals the contact keys of infra/chatwoot/custom-attributes.json minus site_locale, same order', () => {
    const file = path.resolve(__dirname, '../infra/chatwoot/custom-attributes.json')
    const defs = JSON.parse(fs.readFileSync(file, 'utf8')) as { contact: Array<{ key: string }> }
    expect([...CHATWOOT_SYNCED_ATTRIBUTE_KEYS]).toEqual(defs.contact.map((d) => d.key).filter((k) => k !== 'site_locale'))
  })

  it('buildChatwootAttributes returns exactly those keys', () => {
    const attrs = buildChatwootAttributes(person([booking('b1')]), NOW, LINKS)
    expect(Object.keys(attrs)).toEqual([...CHATWOOT_SYNCED_ATTRIBUTE_KEYS])
  })
})

describe('buildChatwootAttributes: counters', () => {
  it('a round trip counts once and carries the combined total once (outbound row only)', () => {
    const outbound = booking('b1', { trip_type: 'round_trip', leg: 'outbound', amount_eur: 200 })
    const back = booking('b2', { trip_type: 'round_trip', leg: 'return', amount_eur: null, pickup_utc: '2026-12-05T09:00:00.000Z' })
    const attrs = buildChatwootAttributes(person([outbound, back]), NOW, LINKS)

    expect(attrs.trip_count).toBe('1')
    expect(attrs.lifetime_value).toBe('200.00 EUR')
    expect(attrs.repeat_customer).toBe('no')
  })

  it('a round trip saved without amount_eur uses the per-leg amounts of the outbound row', () => {
    const outbound = booking('b1', {
      trip_type: 'round_trip',
      amount_eur: null,
      outbound_amount_czk: 1250,
      return_amount_czk: 1250,
    })
    const attrs = buildChatwootAttributes(person([outbound]), NOW, LINKS)
    expect(attrs.lifetime_value).toMatch(/^\d+\.\d{2} EUR$/)
    expect(attrs.lifetime_value).not.toBe('0.00 EUR')
  })

  it('cancelled bookings are excluded from trip_count and lifetime_value', () => {
    const attrs = buildChatwootAttributes(
      person([booking('b1'), booking('b2', { status: 'cancelled', amount_eur: 80 })]),
      NOW,
      LINKS,
    )
    expect(attrs.trip_count).toBe('1')
    expect(attrs.lifetime_value).toBe('100.00 EUR')
  })

  it('unpaid and pending trips count as trips but not as lifetime value', () => {
    const attrs = buildChatwootAttributes(
      person([booking('b1', { status: 'unpaid', amount_eur: 70 }), booking('b2', { status: 'pending', amount_eur: 60 })]),
      NOW,
      LINKS,
    )
    expect(attrs.trip_count).toBe('2')
    expect(attrs.lifetime_value).toBe('0.00 EUR')
    expect(attrs.repeat_customer).toBe('yes')
  })

  it('every paid or active status adds to lifetime_value', () => {
    const statuses = ['confirmed', 'assigned', 'en_route', 'on_location', 'completed']
    const attrs = buildChatwootAttributes(
      person(statuses.map((status, i) => booking(`b${i}`, { status, amount_eur: 10.5 }))),
      NOW,
      LINKS,
    )
    expect(attrs.lifetime_value).toBe('52.50 EUR')
  })

  it('an abandoned checkout never counts', () => {
    const attrs = buildChatwootAttributes(person([booking('b1'), booking('b2', { abandoned: true })]), NOW, LINKS)
    expect(attrs.trip_count).toBe('1')
  })
})

describe('buildChatwootAttributes: trip dates', () => {
  it('no future trip -> next_trip "none"', () => {
    const past = booking('b1', { pickup_utc: '2026-09-01T09:00:00.000Z', pickup_date: '2026-09-01' })
    expect(buildChatwootAttributes(person([past]), NOW, LINKS).next_trip).toBe('none')
  })

  it('next_trip is the earliest future trip: date time · route · reference · status', () => {
    const later = booking('b1', { pickup_utc: '2027-01-10T09:00:00.000Z', pickup_date: '2027-01-10' })
    const sooner = booking('b2', { pickup_utc: '2026-11-02T14:30:00.000Z', pickup_date: '2026-11-02', pickup_time: '15:30', status: 'assigned' })
    const attrs = buildChatwootAttributes(person([later, sooner]), NOW, LINKS)
    expect(attrs.next_trip).toBe('2026-11-02 15:30 · Prague Airport → Prague Old Town · PRG-B2 · assigned')
  })

  it('two past trips -> repeat_customer yes and last_trip_date is the latest pickup_date', () => {
    const a = booking('b1', { pickup_utc: '2026-06-01T09:00:00.000Z', pickup_date: '2026-06-01' })
    const b = booking('b2', { pickup_utc: '2026-08-15T09:00:00.000Z', pickup_date: '2026-08-15' })
    const attrs = buildChatwootAttributes(person([a, b]), NOW, LINKS)
    expect(attrs.repeat_customer).toBe('yes')
    expect(attrs.last_trip_date).toBe('2026-08-15')
    expect(attrs.trip_count).toBe('2')
  })

  it('a trip with no pickup instant is counted but is neither next nor last', () => {
    const attrs = buildChatwootAttributes(person([booking('b1', { pickup_utc: null })]), NOW, LINKS)
    expect(attrs.trip_count).toBe('1')
    expect(attrs.next_trip).toBe('none')
    expect(attrs.last_trip_date).toBe('none')
  })

  it('control characters in addresses never reach the attribute', () => {
    const b = booking('b1', { origin_address: 'Hotel\nAlpha\u0000' })
    expect(buildChatwootAttributes(person([b]), NOW, LINKS).next_trip).toContain('Hotel Alpha')
  })
})

describe('buildChatwootAttributes: links', () => {
  it('crm_contact_url is empty when the Contact id or the EspoCRM base URL is missing', () => {
    expect(buildChatwootAttributes(person([booking('b1')]), NOW, LINKS).crm_contact_url).toBe('')
    const linked = person([booking('b1')])
    linked.identity.espo_contact_id = 'c00000000000000a1'
    expect(buildChatwootAttributes(linked, NOW, { ...LINKS, espoBaseUrl: null }).crm_contact_url).toBe('')
    expect(buildChatwootAttributes(linked, NOW, LINKS).crm_contact_url).toBe(
      'https://crm.example.test/#Contact/view/c00000000000000a1',
    )
    expect(buildChatwootAttributes(linked, NOW, { ...LINKS, espoBaseUrl: 'https://crm.example.test/' }).crm_contact_url).toBe(
      'https://crm.example.test/#Contact/view/c00000000000000a1',
    )
  })

  it("admin_bookings_url encodes the primary email (a '+' becomes %2B)", () => {
    const p = person([booking('b1')], { emails: [{ email: 'anna+vip@x.test', basis: 'booking', via_phone: null }] })
    expect(buildChatwootAttributes(p, NOW, LINKS).admin_bookings_url).toBe(
      'https://site.example.test/admin/bookings?search=anna%2Bvip%40x.test',
    )
  })

  it('no attribute value carries a currency symbol other than the EUR suffix of lifetime_value', () => {
    const attrs = buildChatwootAttributes(person([booking('b1')]), NOW, LINKS)
    for (const [key, value] of Object.entries(attrs)) {
      if (key !== 'lifetime_value') expect(value).not.toMatch(/EUR|CZK|€/)
    }
  })
})

describe('buildChatwootContactDraft', () => {
  it('name: profile full name first', () => {
    const p = person([booking('b1')], { profile: { email: 'a@x.test', full_name: 'Anna Profile', phone: null } })
    expect(buildChatwootContactDraft(p)?.name).toBe('Anna Profile')
  })

  it('name: otherwise the newest booking client names', () => {
    const older = booking('b1', { created_at: '2026-01-01T00:00:00.000Z', client_first_name: 'Old', client_last_name: 'Name' })
    const newer = booking('b2', { created_at: '2026-05-01T00:00:00.000Z', client_first_name: 'New', client_last_name: 'Name' })
    expect(buildChatwootContactDraft(person([newer, older]))?.name).toBe('New Name')
  })

  it('name: otherwise the email local part (also when the newest booking is anonymised)', () => {
    const anon = booking('b1', { client_first_name: '', client_last_name: '', anonymised_at: '2026-10-01T00:00:00.000Z' })
    expect(buildChatwootContactDraft(person([anon]))?.name).toBe('a')
    expect(buildChatwootContactDraft(person([]))?.name).toBe('a')
  })

  it('carries the primary email, the first phone and, with an account, the user id as identifier', () => {
    const p = person([booking('b1')], { phones: ['+420777900010', '+420777900011'] })
    p.identity.user_id = 'u1'
    expect(buildChatwootContactDraft(p)).toMatchObject({
      email: 'a@x.test',
      phone_number: '+420777900010',
      identifier: 'u1',
      phones: ['+420777900010', '+420777900011'],
    })
  })

  it('no phone and no account -> no phone_number and no identifier key', () => {
    const draft = buildChatwootContactDraft(person([booking('b1')], { phones: [] }))
    expect(draft).not.toBeNull()
    expect(draft && 'phone_number' in draft).toBe(false)
    expect(draft && 'identifier' in draft).toBe(false)
  })

  it('a non-E.164 phone is never sent', () => {
    expect(buildChatwootContactDraft(person([booking('b1')], { phones: ['0777900010'] }))?.phones).toEqual([])
  })

  it('a person without a usable email has no draft', () => {
    expect(buildChatwootContactDraft(person([booking('b1')], { emails: [] }))).toBeNull()
  })
})
