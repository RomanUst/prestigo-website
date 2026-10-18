// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BOOKING_LEAD_STATUS,
  LEAD_ATTR,
  LEAD_SOURCE,
  LEAD_STATUS_VALUE,
  adminLink,
  bookingLeadStatus,
  bookingLeadAmountEur,
  buildLeadFromBooking,
  buildLeadFromInquiry,
  diffSyncOwned,
  isPurgeEligible,
  itineraryText,
  leadPhone,
  leadSourceForBooking,
  leadSourceForInquiry,
  normalizeLeadEmail,
  parseLeadRef,
  splitName,
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

// ─────────────────────────────────────────────────────────────────────────────
// Task 2: every remaining rule
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
const RETURN_ID = '33333333-3333-4333-8333-333333333333'

describe('bookingLeadStatus (D-06, D-03)', () => {
  const FUTURE = '2026-11-01T08:00:00.000Z'
  it.each([
    ['unpaid', 'new'],
    ['pending', 'in_process'],
    ['confirmed', 'converted'],
    ['assigned', 'converted'],
    ['en_route', 'converted'],
    ['on_location', 'converted'],
    ['completed', 'converted'],
    ['cancelled', 'dead'],
    ['weird', null],
    ['constructor', null],
  ])('%s -> %s', (status, expected) => {
    expect(bookingLeadStatus(status, FUTURE, NOW)).toBe(expected)
  })

  it('has exactly the 8 statuses of migration 053', () => {
    expect(Object.keys(BOOKING_LEAD_STATUS).sort()).toEqual(
      ['assigned', 'cancelled', 'completed', 'confirmed', 'en_route', 'on_location', 'pending', 'unpaid'],
    )
  })

  it('maps keys to EspoCRM values', () => {
    expect(LEAD_STATUS_VALUE).toEqual({
      new: 'New',
      in_process: 'In Process',
      converted: 'Converted',
      dead: 'Dead',
    })
  })

  it('unpaid with pickup 1 ms in the past -> dead', () => {
    expect(bookingLeadStatus('unpaid', new Date(NOW.getTime() - 1).toISOString(), NOW)).toBe('dead')
  })
  it('unpaid with pickup exactly now -> new', () => {
    expect(bookingLeadStatus('unpaid', NOW.toISOString(), NOW)).toBe('new')
  })
  it('unpaid with null pickup -> new', () => {
    expect(bookingLeadStatus('unpaid', null, NOW)).toBe('new')
  })
  it('converted statuses ignore a past pickup', () => {
    expect(bookingLeadStatus('confirmed', '2020-01-01T00:00:00.000Z', NOW)).toBe('converted')
    expect(bookingLeadStatus('pending', '2020-01-01T00:00:00.000Z', NOW)).toBe('in_process')
  })
})

describe('lead sources (D-08)', () => {
  it.each([
    ['online', null, 'Website booking'],
    ['online', 'whatsapp', 'Website booking'],
    ['gnet', null, 'GNet'],
    ['manual', 'whatsapp', 'WhatsApp'],
    ['manual', 'phone', 'Phone'],
    ['manual', 'email', 'Email'],
    ['manual', 'partner', 'Partner'],
    ['manual', 'other', 'Other'],
    ['manual', null, 'Other'],
    ['manual', 'unexpected', 'Other'],
  ])('booking %s / %s -> %s', (source, channel, expected) => {
    expect(leadSourceForBooking(source, channel)).toBe(expected)
  })

  it.each([
    ['contact', 'Contact form'],
    ['corporate', 'Corporate form'],
    ['multiday_quote', 'Multi-day quote'],
  ] as const)('inquiry %s -> %s', (kind, expected) => {
    expect(leadSourceForInquiry(kind)).toBe(expected)
  })

  it('LEAD_SOURCE and LEAD_ATTR fix the CRM names', () => {
    expect(LEAD_ATTR).toEqual({
      supabaseRef: 'cSupabaseRef',
      bookingReference: 'cBookingReference',
      returnBookingReference: 'cReturnBookingReference',
      adminLink: 'cAdminLink',
      existingCustomer: 'cExistingCustomer',
      existingContactId: 'cExistingContactId',
    })
    expect([...Object.values(LEAD_SOURCE)].sort()).toEqual(
      ['Contact form', 'Corporate form', 'Email', 'GNet', 'Multi-day quote', 'Other', 'Partner', 'Phone', 'WhatsApp', 'Website booking'].sort(),
    )
  })
})

describe('corporate inquiry (D-12)', () => {
  const corp = (over: Partial<InquiryRow> = {}): InquiryRow =>
    contactInquiry({
      kind: 'corporate',
      company: 'ACME',
      payload: { trips: '10 airport transfers per month', notes: 'Invoice required' },
      ...over,
    })

  it('carries the company as accountName text with trips and notes in the description', () => {
    const d = buildLeadFromInquiry(corp())
    expect(d.create.accountName).toBe('ACME')
    expect(d.create.source).toBe('Corporate form')
    expect(String(d.create.description)).toContain('10 airport transfers per month')
    expect(String(d.create.description)).toContain('Invoice required')
  })

  it('omits accountName when the company is empty', () => {
    expect(buildLeadFromInquiry(corp({ company: '' })).create).not.toHaveProperty('accountName')
    expect(buildLeadFromInquiry(corp({ company: '   ' })).create).not.toHaveProperty('accountName')
    expect(buildLeadFromInquiry(corp({ company: null })).create).not.toHaveProperty('accountName')
  })

  it('produces no Account/Contact link attribute other than accountName', () => {
    const d = buildLeadFromInquiry(corp())
    const bad = Object.keys(d.create).filter((k) => /account|contact/i.test(k) && k !== 'accountName')
    expect(bad).toEqual([])
  })
})

describe('multi-day inquiry (LEAD-03)', () => {
  const days = [
    {
      type: 'transfer' as const,
      date: '2026-12-01',
      time: '09:00',
      from: 'Prague Airport',
      to: 'Hotel Aria',
      stops: [{ address: 'Charles Bridge' }, { address: 'Prague Castle' }],
    },
    { type: 'hourly' as const, date: '2026-12-02', time: '10:00', city: 'Prague', hours: 6 },
    { type: 'transfer' as const, time: '08:30', from: 'Hotel Aria', to: 'Vienna', stops: [] },
  ]
  const multi = (over: Partial<InquiryRow> = {}): InquiryRow => ({
    id: INQUIRY_ID,
    kind: 'multiday_quote',
    email: 'trip@example.com',
    name: 'Ignored Name',
    phone: '+49 30 1234567',
    company: null,
    payload: {
      quoteReference: 'MDQ-2026-ABCD',
      startDate: '2026-12-01',
      days,
      firstName: 'Petra',
      lastName: 'Meyer',
      specialRequests: 'Child seat',
    },
    created_at: '2026-10-18T10:00:00.000Z',
    ...over,
  })

  it('starts with the quote reference and lists one line per day in order', () => {
    const d = buildLeadFromInquiry(multi())
    const desc = String(d.create.description)
    expect(desc.split('\n')[0]).toContain('MDQ-2026-ABCD')
    const dayLines = desc.split('\n').filter((l) => /^Day \d+/.test(l))
    expect(dayLines).toHaveLength(3)
    expect(dayLines[0]).toMatch(/^Day 1/)
    expect(dayLines[1]).toMatch(/^Day 2/)
    expect(dayLines[2]).toMatch(/^Day 3/)
    expect(dayLines[0]).toContain('2026-12-01')
    expect(dayLines[0]).toContain('09:00')
    expect(dayLines[0]).toContain('Prague Airport -> Hotel Aria')
    expect(dayLines[0]).toContain('Charles Bridge')
    expect(dayLines[0]).toContain('Prague Castle')
    expect(dayLines[1]).toContain('Prague')
    expect(dayLines[1]).toContain('6')
    expect(desc).toContain('Child seat')
  })

  it('uses the payload names and the Multi-day quote source', () => {
    const d = buildLeadFromInquiry(multi())
    expect(d.create.firstName).toBe('Petra')
    expect(d.create.lastName).toBe('Meyer')
    expect(d.create.source).toBe('Multi-day quote')
    expect(d.create.phoneNumber).toBe('+49301234567')
  })

  it('shows "date not set" for a day without a date even when startDate exists', () => {
    const desc = String(buildLeadFromInquiry(multi()).create.description)
    const line3 = desc.split('\n').find((l) => /^Day 3/.test(l))!
    expect(line3).toContain('date not set')
    expect(line3).not.toContain('2026-12-01')
  })

  it('itineraryText: single day gives one line, order is preserved', () => {
    const one = itineraryText([days[1]], null)
    expect(one.split('\n')).toHaveLength(1)
    expect(one).toMatch(/^Day 1/)
    const reordered = itineraryText([days[2], days[1], days[0]], null).split('\n')
    expect(reordered[0]).toContain('Hotel Aria -> Vienna')
    expect(reordered[2]).toContain('Prague Airport -> Hotel Aria')
  })
})

describe('round trip (D-19)', () => {
  it('outbound row with a return leg carries both references', () => {
    const d = buildLeadFromBooking(
      booking({ amount_eur: 300 }),
      { id: RETURN_ID, booking_reference: 'PRG-R' },
      NOW,
    )!
    expect(d.ref).toBe(`booking:${BOOKING_ID}`)
    expect(d.create.cReturnBookingReference).toBe('PRG-R')
    expect(d.syncOwned.cReturnBookingReference).toBe('PRG-R')
    const desc = String(d.create.description)
    expect(desc).toContain('PRG-A1B2')
    expect(desc).toContain('PRG-R')
    expect(d.syncOwned.opportunityAmount).toBe(300)
  })

  it('a return-leg row is never mapped to its own Lead', () => {
    expect(buildLeadFromBooking(booking({ leg: 'return', id: RETURN_ID }), null, NOW)).toBeNull()
  })

  it('a return leg without a reference adds no return attribute', () => {
    const d = buildLeadFromBooking(booking(), { id: RETURN_ID, booking_reference: null }, NOW)!
    expect(d.syncOwned).not.toHaveProperty('cReturnBookingReference')
  })

  it('an unmapped status yields no draft', () => {
    expect(buildLeadFromBooking(booking({ status: 'weird' }), null, NOW)).toBeNull()
  })

  it('D-05: two bookings of one customer give two refs', () => {
    const a = buildLeadFromBooking(booking(), null, NOW)!
    const b = buildLeadFromBooking(booking({ id: '44444444-4444-4444-8444-444444444444' }), null, NOW)!
    expect(a.ref).not.toBe(b.ref)
  })
})

describe('placeholder identities and names', () => {
  it('GNet placeholder email/phone never reach the Lead', () => {
    const d = buildLeadFromBooking(
      booking({
        booking_source: 'gnet',
        client_email: 'noreply@gnet.local',
        client_phone: 'unknown',
        client_first_name: 'GNet',
        client_last_name: 'Partner',
      }),
      null,
      NOW,
    )!
    expect(d.email).toBeNull()
    expect(d.create).not.toHaveProperty('emailAddress')
    expect(d.create).not.toHaveProperty('phoneNumber')
    expect(d.create.source).toBe('GNet')
  })

  it('normalizeLeadEmail', () => {
    expect(normalizeLeadEmail('  A@B.CZ ')).toBe('a@b.cz')
    expect(normalizeLeadEmail('')).toBeNull()
    expect(normalizeLeadEmail('   ')).toBeNull()
    expect(normalizeLeadEmail('no-at-sign')).toBeNull()
    expect(normalizeLeadEmail('x@gnet.local')).toBeNull()
    expect(normalizeLeadEmail('X@GNET.LOCAL')).toBeNull()
    expect(normalizeLeadEmail(null)).toBeNull()
  })

  it('leadPhone', () => {
    expect(leadPhone('+420 601 234 567')).toBe('+420601234567')
    expect(leadPhone('unknown')).toBeNull()
    expect(leadPhone(null)).toBeNull()
    expect(leadPhone('601234567')).toBeNull()
  })

  it('names fall back to the email local part, then Unknown', () => {
    const a = buildLeadFromBooking(
      booking({ client_first_name: null, client_last_name: null, client_email: 'a.b@x.cz' }),
      null,
      NOW,
    )!
    expect(a.create.lastName).toBe('a.b')
    expect(a.create.firstName).toBeNull()
    const b = buildLeadFromBooking(
      booking({ client_first_name: null, client_last_name: null, client_email: null }),
      null,
      NOW,
    )!
    expect(b.create.lastName).toBe('Unknown')
  })

  it('splitName', () => {
    expect(splitName('Cher', null)).toEqual({ firstName: null, lastName: 'Cher' })
    expect(splitName('Anna Maria Novak', null)).toEqual({ firstName: 'Anna', lastName: 'Maria Novak' })
    expect(splitName('  ', 'q@x.cz')).toEqual({ firstName: null, lastName: 'q' })
    expect(splitName(null, null)).toEqual({ firstName: null, lastName: 'Unknown' })
    expect(buildLeadFromInquiry(contactInquiry({ name: 'Cher' })).create).toMatchObject({
      firstName: null,
      lastName: 'Cher',
    })
  })
})

describe('amount (LEAD-06 precision)', () => {
  it('uses amount_eur exactly as stored', () => {
    const d = buildLeadFromBooking(booking({ amount_eur: '123.45' }), null, NOW)!
    expect(d.syncOwned.opportunityAmount).toBe(123.45)
    expect(d.syncOwned.opportunityAmountCurrency).toBe('EUR')
    expect(buildLeadFromBooking(booking({ amount_eur: 99 }), null, NOW)!.syncOwned.opportunityAmount).toBe(99)
  })

  it('null amount -> no amount and no currency key', () => {
    const d = buildLeadFromBooking(booking({ amount_eur: null }), null, NOW)!
    expect(d.syncOwned).not.toHaveProperty('opportunityAmount')
    expect(d.syncOwned).not.toHaveProperty('opportunityAmountCurrency')
    expect(d.create).not.toHaveProperty('opportunityAmount')
  })

  it('round trip: the outbound amount_eur is the combined checkout total and is not added to (WR-03)', () => {
    const row = booking({ trip_type: 'round_trip', amount_eur: '280', outbound_amount_czk: 3750, return_amount_czk: 3375 })
    const d = buildLeadFromBooking(row, { id: 'r', booking_reference: 'PRG-R1' }, NOW)!
    expect(d.syncOwned.opportunityAmount).toBe(280)
  })

  it('round trip saved without amount_eur: value is both legs, from the per-leg columns (WR-03)', () => {
    // The two real production rows of 2026-08-18 have exactly this shape (amount_eur null on both legs).
    const row = booking({ trip_type: 'round_trip', amount_eur: null, outbound_amount_czk: 1475, return_amount_czk: 1325 })
    const d = buildLeadFromBooking(row, { id: 'r', booking_reference: 'PRG-R1' }, NOW)!
    expect(d.syncOwned.opportunityAmount).toBe(112) // round(2800 CZK * 0.04)
    expect(d.syncOwned.opportunityAmountCurrency).toBe('EUR')
    expect(bookingLeadAmountEur({ ...row, return_amount_czk: null })).toBe(59)
  })

  it('a one-way booking never falls back to the per-leg columns (WR-03)', () => {
    expect(bookingLeadAmountEur(booking({ amount_eur: null, outbound_amount_czk: 1000 }))).toBeNull()
    expect(bookingLeadAmountEur(booking({ trip_type: 'round_trip', amount_eur: null }))).toBeNull()
  })

  it('the description never contains an amount', () => {
    const desc = String(buildLeadFromBooking(booking({ amount_eur: '123.45' }), null, NOW)!.create.description)
    expect(desc).not.toContain('123.45')
    expect(desc).not.toMatch(/EUR|€/)
  })
})

describe('isPurgeEligible (D-15 / D-20)', () => {
  const old = new Date(NOW.getTime() - 90 * DAY_MS - 1).toISOString()
  const exact = new Date(NOW.getTime() - 90 * DAY_MS).toISOString()
  const abandoned = (over: Partial<BookingRow> = {}) => booking({ pickup_utc: old, ...over })

  it('true for an abandoned online unpaid outbound booking older than 90 days', () => {
    expect(isPurgeEligible(abandoned(), NOW)).toBe(true)
    expect(isPurgeEligible(abandoned({ leg: null }), NOW)).toBe(true)
  })
  it('false at exactly 90 days', () => {
    expect(isPurgeEligible(abandoned({ pickup_utc: exact }), NOW)).toBe(false)
  })
  it('false for each failed condition', () => {
    expect(isPurgeEligible(abandoned({ booking_source: 'manual' }), NOW)).toBe(false)
    expect(isPurgeEligible(abandoned({ booking_source: 'gnet' }), NOW)).toBe(false)
    expect(isPurgeEligible(abandoned({ payment_link_id: 'plink_1' }), NOW)).toBe(false)
    expect(isPurgeEligible(abandoned({ status: 'cancelled' }), NOW)).toBe(false)
    expect(isPurgeEligible(abandoned({ status: 'pending' }), NOW)).toBe(false)
    expect(isPurgeEligible(abandoned({ leg: 'return' }), NOW)).toBe(false)
    expect(isPurgeEligible(abandoned({ pickup_utc: null }), NOW)).toBe(false)
  })
})

describe('diffSyncOwned', () => {
  it('identical -> empty', () => {
    expect(diffSyncOwned({ status: 'New', cBookingReference: 'A' }, { status: 'New', cBookingReference: 'A' })).toEqual({})
  })
  it('changed status only', () => {
    expect(diffSyncOwned({ status: 'New', cBookingReference: 'A' }, { status: 'Converted', cBookingReference: 'A' })).toEqual({
      status: 'Converted',
    })
  })
  it('numeric string vs number compares numerically', () => {
    expect(diffSyncOwned({ opportunityAmount: '123.45' }, { opportunityAmount: 123.45 })).toEqual({})
    expect(diffSyncOwned({ opportunityAmount: '123.40' }, { opportunityAmount: 123.45 })).toEqual({ opportunityAmount: 123.45 })
  })
  it('key absent in live is included', () => {
    expect(diffSyncOwned({}, { cAdminLink: 'x' })).toEqual({ cAdminLink: 'x' })
    expect(diffSyncOwned({ cAdminLink: null }, { cAdminLink: 'x' })).toEqual({ cAdminLink: 'x' })
  })
})

describe('field ownership and ordering', () => {
  it('syncOwned keys for a round-trip booking are exactly the owned set', () => {
    const d = buildLeadFromBooking(booking(), { id: RETURN_ID, booking_reference: 'PRG-R' }, NOW)!
    expect(Object.keys(d.syncOwned).sort()).toEqual(
      [
        'cAdminLink',
        'cBookingReference',
        'cReturnBookingReference',
        'opportunityAmount',
        'opportunityAmountCurrency',
        'status',
      ].sort(),
    )
    for (const k of ['description', 'assignedUserId', 'firstName', 'lastName', 'emailAddress', 'phoneNumber', 'accountName', 'source']) {
      expect(d.syncOwned).not.toHaveProperty(k)
    }
  })

  it('inquiry Leads have no sync-owned status', () => {
    expect(buildLeadFromInquiry(contactInquiry()).syncOwned).toEqual({})
    expect(buildLeadFromInquiry(contactInquiry()).create.status).toBe('New')
  })

  it('the draft depends only on the row and now (order-independent convergence)', () => {
    const row = booking({ status: 'confirmed' })
    const first = buildLeadFromBooking(booking({ status: 'unpaid' }), null, NOW)
    const final = buildLeadFromBooking(row, null, NOW)
    expect(final).toEqual(buildLeadFromBooking(row, null, NOW))
    expect(first!.syncOwned.status).toBe('New')
    expect(final!.syncOwned.status).toBe('Converted')
  })

  it('never produces Contact, CBooking or conversion data (D-09)', () => {
    const d = buildLeadFromBooking(booking(), { id: RETURN_ID, booking_reference: 'PRG-R' }, NOW)!
    const keys = Object.keys(d.create)
    expect(keys.some((k) => /contactId|accountId|convert|cExisting/i.test(k))).toBe(false)
  })

  it('adminLink only for allowlisted references', () => {
    expect(adminLink('PRG-A1B2')).toBe('https://rideprestigo.com/admin/bookings?search=PRG-A1B2')
    expect(adminLink('bad ref&x=1')).toBeNull()
    expect(adminLink('a'.repeat(41))).toBeNull()
    expect(adminLink(null)).toBeNull()
    expect(adminLink('')).toBeNull()
  })

  it('vehicle labels use fleet names', () => {
    const desc = (v: string) => String(buildLeadFromBooking(booking({ vehicle_class: v }), null, NOW)!.create.description)
    expect(desc('business')).toContain('E-Class')
    expect(desc('first_class')).toContain('S-Class')
    expect(desc('business_van')).toContain('V-Class')
  })
})
