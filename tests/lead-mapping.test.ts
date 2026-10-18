// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildLeadFromBooking,
  buildLeadFromInquiry,
  parseLeadRef,
  type BookingRow,
  type InquiryRow,
} from '@/lib/lead-mapping'

const NOW = new Date('2026-10-18T12:00:00.000Z')
const INQUIRY_ID = '11111111-1111-4111-8111-111111111111'
const BOOKING_ID = '22222222-2222-4222-8222-222222222222'

function contactInquiry(over: Partial<InquiryRow> = {}): InquiryRow {
  return {
    id: INQUIRY_ID,
    kind: 'contact',
    email: ' Anna@Example.COM ',
    name: 'Anna Novak',
    phone: '+420 601 234 567',
    company: null,
    payload: { service: 'Airport', message: 'Hi' },
    created_at: '2026-10-18T10:00:00.000Z',
    ...over,
  }
}

function booking(over: Partial<BookingRow> = {}): BookingRow {
  return {
    id: BOOKING_ID,
    booking_reference: 'PRG-A1B2',
    status: 'unpaid',
    booking_source: 'online',
    lead_channel: null,
    leg: 'outbound',
    trip_type: 'transfer',
    payment_link_id: null,
    pickup_utc: '2026-11-01T08:00:00.000Z',
    pickup_date: '2026-11-01',
    pickup_time: '09:00',
    origin_address: 'Prague Airport',
    destination_address: 'Hotel Aria',
    vehicle_class: 'business',
    passengers: 2,
    hours: null,
    amount_eur: '123.45',
    client_first_name: 'Jan',
    client_last_name: 'Svoboda',
    client_email: 'jan@example.com',
    client_phone: '+420 725 123 456',
    created_at: '2026-10-18T09:00:00.000Z',
    ...over,
  }
}

describe('tracer: contact inquiry -> Lead draft', () => {
  it('maps a contact form submission to a complete draft', () => {
    const draft = buildLeadFromInquiry(contactInquiry())
    expect(draft.ref).toBe(`inquiry:${INQUIRY_ID}`)
    expect(draft.email).toBe('anna@example.com')
    expect(draft.syncOwned).toEqual({})
    expect(draft.create).toMatchObject({
      cSupabaseRef: `inquiry:${INQUIRY_ID}`,
      status: 'New',
      source: 'Contact form',
      firstName: 'Anna',
      lastName: 'Novak',
      emailAddress: 'anna@example.com',
      phoneNumber: '+420601234567',
    })
    expect(String(draft.create.description)).toContain('Airport')
    expect(String(draft.create.description)).toContain('Hi')
  })
})

describe('tracer: website booking -> Lead draft', () => {
  it('maps an online unpaid one-way booking', () => {
    const draft = buildLeadFromBooking(booking(), null, NOW)
    expect(draft).not.toBeNull()
    expect(draft!.ref).toBe(`booking:${BOOKING_ID}`)
    expect(draft!.email).toBe('jan@example.com')
    expect(draft!.syncOwned).toEqual({
      status: 'New',
      opportunityAmount: 123.45,
      opportunityAmountCurrency: 'EUR',
      cBookingReference: 'PRG-A1B2',
      cAdminLink: 'https://rideprestigo.com/admin/bookings?search=PRG-A1B2',
    })
    expect(draft!.create).toMatchObject({
      ...draft!.syncOwned,
      cSupabaseRef: `booking:${BOOKING_ID}`,
      source: 'Website booking',
      firstName: 'Jan',
      lastName: 'Svoboda',
      emailAddress: 'jan@example.com',
      phoneNumber: '+420725123456',
    })
    expect(draft!.create).not.toHaveProperty('cReturnBookingReference')
  })
})

describe('invariant: every draft ref parses back to (kind, uuid)', () => {
  it('holds for inquiry and booking variants', () => {
    const inq = buildLeadFromInquiry(contactInquiry())
    const bk = buildLeadFromBooking(booking(), null, NOW)!
    expect(parseLeadRef(inq.ref)).toEqual({ kind: 'inquiry', id: INQUIRY_ID })
    expect(parseLeadRef(bk.ref)).toEqual({ kind: 'booking', id: BOOKING_ID })
    expect(inq.create.cSupabaseRef).toBe(inq.ref)
    expect(bk.create.cSupabaseRef).toBe(bk.ref)
  })

  it.each([
    ['booking:not-a-uuid'],
    ['booking:'],
    ['unknown:11111111-1111-4111-8111-111111111111'],
    ['11111111-1111-4111-8111-111111111111'],
    [''],
  ])('rejects %s', (ref) => {
    expect(parseLeadRef(ref)).toBeNull()
  })
})
