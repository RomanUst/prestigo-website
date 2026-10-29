// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PANEL_VALUE_STATUSES,
  PanelStoreError,
  buildNoContactResponse,
  buildPanelResponse,
  createPanelBookingsStore,
  paymentState,
  pickupInstantMs,
  type PanelRpcResult,
  type PanelRpcRow,
} from '@/lib/panel-bookings'
import { bookingLeadAmountEur, type BookingRow } from '@/lib/lead-mapping'
import { adminBookingHref } from '@/lib/panel-links'

// Synthetic fixtures only.

const NOW = new Date('2026-10-19T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const CONTACT = { email: 'guest@example.test', phone: null, verified: true }
const LINKS = { espoBaseUrl: 'https://crm.example.test' }

function row(id: string, over: Partial<PanelRpcRow> = {}): PanelRpcRow {
  return {
    id,
    booking_reference: `PRG-${id.toUpperCase()}`,
    status: 'confirmed',
    leg: 'outbound',
    trip_type: 'one_way',
    pickup_utc: new Date(NOW.getTime() + 3 * DAY).toISOString(),
    pickup_date: '2026-10-22',
    pickup_time: '12:00',
    origin_address: 'Prague Airport',
    destination_address: 'Old Town Square',
    hours: null,
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    amount_eur: 120,
    outbound_amount_czk: null,
    return_amount_czk: null,
    paid_at: null,
    payment_link_url: null,
    flight_number: null,
    special_requests: null,
    driver_name: null,
    trip_progress: null,
    trip_progress_updated_at: null,
    ...over,
  }
}

function rpcResult(rows: PanelRpcRow[], over: Partial<PanelRpcResult> = {}): PanelRpcResult {
  return {
    identity_found: true,
    phone_mismatch: false,
    espo_lead_id: null,
    total: rows.length,
    trip_count: rows.length,
    spent_eur: 0,
    rows,
    ...over,
  }
}

function fakeClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('createPanelBookingsStore', () => {
  it('calls rpc panel_bookings once with the three named arguments and returns the parsed result', async () => {
    const data = rpcResult([row('a')], { total: 1, trip_count: 1, spent_eur: 120 })
    const { client, rpc } = fakeClient({ data, error: null })
    const out = await createPanelBookingsStore(client).load({
      email: 'guest@example.test',
      phone: null,
      conversationId: 42,
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('panel_bookings', {
      p_email: 'guest@example.test',
      p_phone: null,
      p_conversation_id: 42,
    })
    expect(out.rows).toHaveLength(1)
    expect(out.total).toBe(1)
    expect(out.rows[0].booking_reference).toBe('PRG-A')
  })

  it('maps an rpc error to PanelStoreError db_error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(
      createPanelBookingsStore(client).load({ email: 'a@example.test', phone: null, conversationId: 1 }),
    ).rejects.toMatchObject({ name: 'PanelStoreError', code: 'db_error' })
  })

  it('maps a missing or non-array rows to PanelStoreError', async () => {
    const base = { identity_found: true, phone_mismatch: false, espo_lead_id: null, total: 0, trip_count: 0, spent_eur: 0 }
    for (const data of [base, { ...base, rows: 'nope' }, { ...base, rows: null }, null]) {
      const { client } = fakeClient({ data, error: null })
      await expect(
        createPanelBookingsStore(client).load({ email: 'a@example.test', phone: null, conversationId: 1 }),
      ).rejects.toBeInstanceOf(PanelStoreError)
    }
  })

  it('maps a thrown client (missing env) to PanelStoreError', async () => {
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error('network')),
    } as unknown as SupabaseClient
    await expect(
      createPanelBookingsStore(client).load({ email: null, phone: '+420700000000', conversationId: 1 }),
    ).rejects.toBeInstanceOf(PanelStoreError)
  })
})

describe('paymentState (RESEARCH A1)', () => {
  it('cancelled wins over paid', () => {
    expect(paymentState('cancelled', '2026-01-01T00:00:00Z')).toBe('cancelled')
    expect(paymentState('cancelled', null)).toBe('cancelled')
  })
  it('paid_at set means paid', () => {
    expect(paymentState('confirmed', '2026-01-01T00:00:00Z')).toBe('paid')
    expect(paymentState('unpaid', '2026-01-01T00:00:00Z')).toBe('paid')
  })
  it('unpaid is awaiting_payment, pending is quote', () => {
    expect(paymentState('unpaid', null)).toBe('awaiting_payment')
    expect(paymentState('pending', null)).toBe('quote')
  })
  it('every other status is paid', () => {
    expect(paymentState('assigned', null)).toBe('paid')
    expect(paymentState('completed', null)).toBe('paid')
    expect(paymentState('en_route', null)).toBe('paid')
    expect(paymentState('on_location', null)).toBe('paid')
    expect(paymentState('confirmed', null)).toBe('paid')
  })
})

describe('buildPanelResponse (tracer)', () => {
  it('splits one upcoming and one past booking and copies the SQL counters verbatim', () => {
    const upcoming = row('a')
    const past = row('b', {
      status: 'completed',
      pickup_utc: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      pickup_date: '2026-10-09',
    })
    const res = buildPanelResponse(
      rpcResult([upcoming, past], { total: 7, trip_count: 5, spent_eur: 640 }),
      CONTACT,
      NOW,
      LINKS,
    )
    expect(res.state).toBe('ok')
    expect(res.upcoming).toHaveLength(1)
    expect(res.past).toHaveLength(1)
    expect(res.upcoming[0].reference).toBe('PRG-A')
    expect(res.past[0].reference).toBe('PRG-B')
    expect(res.counters).toEqual({ trips: 5, totalSpentEur: 640 })
    expect(res.upcoming[0].adminHref).toBe('/admin/bookings?search=PRG-A')
    expect(res.generatedAt).toBe(NOW.toISOString())
    expect(res.contact).toEqual({ email: 'guest@example.test', phone: null, verified: true, phoneMismatch: false })
  })

  it('maps the allowlisted fields and turns null optionals into null', () => {
    const res = buildPanelResponse(
      rpcResult([
        row('a', {
          flight_number: '  ',
          special_requests: '   ',
          driver_name: null,
          payment_link_url: null,
          hours: 4,
          trip_progress: 'en_route',
        }),
      ]),
      CONTACT,
      NOW,
      LINKS,
    )
    const b = res.upcoming[0]
    expect(b.flightNumber).toBeNull()
    expect(b.notes).toBeNull()
    expect(b.driverName).toBeNull()
    expect(b.paymentLinkUrl).toBeNull()
    expect(b.hours).toBe(4)
    expect(b.tripProgress).toBe('en_route')
    expect(b.vehicleClass).toBe('business')
    expect(b.amountEur).toBe(120)
    expect(b.isReturnLeg).toBe(false)
    expect(b.pickupMs).toBe(Date.parse(b.pickupUtc as string))
  })

  it('trims notes and keeps the accepted driver name', () => {
    const res = buildPanelResponse(
      rpcResult([row('a', { special_requests: '  child seat  ', driver_name: 'Jan Novak' })]),
      CONTACT,
      NOW,
      LINKS,
    )
    expect(res.upcoming[0].notes).toBe('child seat')
    expect(res.upcoming[0].driverName).toBe('Jan Novak')
  })

  it('empty rows give empty lists and counters from the RPC totals', () => {
    const res = buildPanelResponse(rpcResult([], { total: 0, trip_count: 0, spent_eur: 0 }), CONTACT, NOW, LINKS)
    expect(res.upcoming).toEqual([])
    expect(res.past).toEqual([])
    expect(res.counters).toEqual({ trips: 0, totalSpentEur: 0 })
    expect(res.pastTruncated).toBe(false)
  })

  it('a single row yields exactly one booking in the right list', () => {
    const res = buildPanelResponse(rpcResult([row('a')]), CONTACT, NOW, LINKS)
    expect(res.upcoming).toHaveLength(1)
    expect(res.past).toHaveLength(0)
  })

  it('upcoming ascending, past descending', () => {
    const mk = (id: string, days: number) =>
      row(id, { pickup_utc: new Date(NOW.getTime() + days * DAY).toISOString() })
    const res = buildPanelResponse(rpcResult([mk('u2', 9), mk('u1', 2), mk('p1', -2), mk('p2', -8)]), CONTACT, NOW, LINKS)
    expect(res.upcoming.map((b) => b.id)).toEqual(['u1', 'u2'])
    expect(res.past.map((b) => b.id)).toEqual(['p1', 'p2'])
  })
})

describe('counter parity anchor (82 D-02)', () => {
  // A confirmed one_way 120; B completed round_trip no amount, 2500 + 2500 CZK; C confirmed return leg 50;
  // D cancelled 80; E pending 90. The Task 3 smoke asserts the same numbers against the SQL.
  const fixture = [
    { id: 'A', status: 'confirmed', leg: 'outbound', trip_type: 'one_way', amount_eur: 120, outbound_amount_czk: null, return_amount_czk: null },
    { id: 'B', status: 'completed', leg: 'outbound', trip_type: 'round_trip', amount_eur: null, outbound_amount_czk: 2500, return_amount_czk: 2500 },
    { id: 'C', status: 'confirmed', leg: 'return', trip_type: 'round_trip', amount_eur: 50, outbound_amount_czk: null, return_amount_czk: null },
    { id: 'D', status: 'cancelled', leg: 'outbound', trip_type: 'one_way', amount_eur: 80, outbound_amount_czk: null, return_amount_czk: null },
    { id: 'E', status: 'pending', leg: 'outbound', trip_type: 'one_way', amount_eur: 90, outbound_amount_czk: null, return_amount_czk: null },
  ]
  const trips = fixture.filter((b) => b.leg !== 'return' && b.status !== 'cancelled')

  it('the trip rule gives 3 trips', () => {
    expect(trips).toHaveLength(3)
  })

  it('the value sum over PANEL_VALUE_STATUSES gives 320', () => {
    let sum = 0
    for (const t of trips) {
      if (!PANEL_VALUE_STATUSES.has(t.status)) continue
      const amount = bookingLeadAmountEur(t as unknown as BookingRow)
      if (amount !== null) sum += amount
    }
    expect(sum).toBe(320)
  })

  it('PANEL_VALUE_STATUSES equals the VALUE_STATUSES literal in lib/chatwoot-mapping.ts', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'chatwoot-mapping.ts'), 'utf8')
    const m = src.match(/VALUE_STATUSES[^=]*=\s*new Set\(\[([^\]]+)\]\)/)
    expect(m, 'VALUE_STATUSES literal not found').not.toBeNull()
    const fromSource = (m as RegExpMatchArray)[1]
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean)
      .sort()
    expect([...PANEL_VALUE_STATUSES].sort()).toEqual(fromSource)
  })
})

describe('pickupInstantMs', () => {
  it('prefers pickup_utc', () => {
    expect(pickupInstantMs(row('a', { pickup_utc: '2026-11-12T13:30:00+00:00' }))).toBe(Date.UTC(2026, 10, 12, 13, 30))
  })
})

describe('adminBookingHref', () => {
  it('encodes a safe reference and refuses an unsafe one', () => {
    expect(adminBookingHref('PRG-AB12')).toBe('/admin/bookings?search=PRG-AB12')
    expect(adminBookingHref('x y')).toBeNull()
    expect(adminBookingHref(null)).toBeNull()
  })
})

describe('pickupInstantMs wall-clock fallback', () => {
  const wall = (date: string, time: string) => pickupInstantMs(row('w', { pickup_utc: null, pickup_date: date, pickup_time: time }))

  it('winter date uses UTC+1', () => {
    expect(wall('2026-11-12', '14:30')).toBe(Date.UTC(2026, 10, 12, 13, 30))
  })
  it('summer date uses UTC+2', () => {
    expect(wall('2026-07-15', '14:30')).toBe(Date.UTC(2026, 6, 15, 12, 30))
  })
  it('handles the DST change days', () => {
    // 2026-03-29: clocks go forward 02:00 -> 03:00; 10:00 is already summer time.
    expect(wall('2026-03-29', '10:00')).toBe(Date.UTC(2026, 2, 29, 8, 0))
    // 2026-10-25: clocks go back 03:00 -> 02:00; 10:00 is winter time.
    expect(wall('2026-10-25', '10:00')).toBe(Date.UTC(2026, 9, 25, 9, 0))
  })
  it('returns null for garbage and impossible dates, never throws', () => {
    expect(wall('garbage', '14:30')).toBeNull()
    expect(wall('2026-11-12', 'later')).toBeNull()
    expect(wall('2026-02-31', '10:00')).toBeNull()
    expect(wall('2026-13-01', '10:00')).toBeNull()
    expect(wall('2026-11-12', '25:00')).toBeNull()
    expect(wall('', '')).toBeNull()
  })
  it('falls back to the wall clock when pickup_utc is unparseable', () => {
    expect(pickupInstantMs(row('w', { pickup_utc: 'nonsense', pickup_date: '2026-11-12', pickup_time: '14:30' }))).toBe(
      Date.UTC(2026, 10, 12, 13, 30),
    )
  })
})

describe('buildPanelResponse edge matrix', () => {
  const future = new Date(NOW.getTime() + 5 * DAY).toISOString()
  const past = new Date(NOW.getTime() - 5 * DAY).toISOString()

  it('a null-pickup_utc row is placed by its wall clock and never dropped', () => {
    const res = buildPanelResponse(
      rpcResult([row('n', { pickup_utc: null, pickup_date: '2026-12-01', pickup_time: '09:00' })]),
      CONTACT,
      NOW,
      LINKS,
    )
    expect(res.upcoming).toHaveLength(1)
    expect(res.upcoming[0].pickupMs).toBe(Date.UTC(2026, 11, 1, 8, 0))
  })

  it('an unparseable row lands at the end of past', () => {
    const res = buildPanelResponse(
      rpcResult([
        row('bad', { pickup_utc: null, pickup_date: 'garbage', pickup_time: 'x' }),
        row('p1', { pickup_utc: past }),
        row('p2', { pickup_utc: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
      ]),
      CONTACT,
      NOW,
      LINKS,
    )
    expect(res.upcoming).toHaveLength(0)
    expect(res.past.map((b) => b.id)).toEqual(['p1', 'p2', 'bad'])
    expect(res.past[2].pickupMs).toBeNull()
  })

  it('a return leg is its own booking with isReturnLeg', () => {
    const res = buildPanelResponse(rpcResult([row('r', { leg: 'return', pickup_utc: future })]), CONTACT, NOW, LINKS)
    expect(res.upcoming).toHaveLength(1)
    expect(res.upcoming[0].isReturnLeg).toBe(true)
  })

  it('completed or cancelled bookings with a future pickup go to past', () => {
    const res = buildPanelResponse(
      rpcResult([
        row('c1', { status: 'completed', pickup_utc: future }),
        row('c2', { status: 'cancelled', pickup_utc: future }),
      ]),
      CONTACT,
      NOW,
      LINKS,
    )
    expect(res.upcoming).toHaveLength(0)
    expect(res.past).toHaveLength(2)
    expect(res.past.find((b) => b.id === 'c2')?.paymentState).toBe('cancelled')
  })

  it('keeps all 25 past rows (the iframe slices to 10) and flags truncation only when total exceeds rows', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row(`p${i}`, { status: 'completed', pickup_utc: new Date(NOW.getTime() - (i + 1) * DAY).toISOString() }),
    )
    expect(buildPanelResponse(rpcResult(rows, { total: 25 }), CONTACT, NOW, LINKS).past).toHaveLength(25)
    expect(buildPanelResponse(rpcResult(rows, { total: 230 }), CONTACT, NOW, LINKS).pastTruncated).toBe(true)
    expect(buildPanelResponse(rpcResult(rows.slice(0, 12), { total: 12 }), CONTACT, NOW, LINKS).pastTruncated).toBe(false)
  })

  it('payment link survives only for awaiting_payment on https buy.stripe.com (D-09)', () => {
    const unpaid = (url: string | null, over: Partial<PanelRpcRow> = {}) =>
      buildPanelResponse(
        rpcResult([row('u', { status: 'unpaid', payment_link_url: url, ...over })]),
        CONTACT,
        NOW,
        LINKS,
      ).upcoming[0].paymentLinkUrl
    expect(unpaid('https://buy.stripe.com/test_x')).toBe('https://buy.stripe.com/test_x')
    for (const bad of [
      'http://buy.stripe.com/x',
      'https://evil.example/x',
      'https://buy.stripe.com.evil.example/x',
      'https://user:pw@buy.stripe.com/x',
      'https://buy.stripe.com:8443/x',
      'javascript:alert(1)',
      '',
      'not a url',
    ]) {
      expect(unpaid(bad), bad).toBeNull()
    }
    expect(unpaid(null)).toBeNull()
    // paid and quote bookings never expose the link, even a valid one
    expect(unpaid('https://buy.stripe.com/test_x', { status: 'confirmed', paid_at: '2026-01-01T00:00:00Z' })).toBeNull()
    expect(unpaid('https://buy.stripe.com/test_x', { status: 'pending' })).toBeNull()
  })

  it('leadUrl needs an https base and a 17-hex id', () => {
    const id = 'aaaaaaaaaaaaaaaaa'
    const url = (base: string | null, lead: string | null) =>
      buildPanelResponse(rpcResult([], { espo_lead_id: lead }), CONTACT, NOW, { espoBaseUrl: base }).leadUrl
    expect(url('https://crm.example.test/', id)).toBe('https://crm.example.test/#Lead/view/aaaaaaaaaaaaaaaaa')
    expect(url('https://crm.example.test', id)).toBe('https://crm.example.test/#Lead/view/aaaaaaaaaaaaaaaaa')
    expect(url('http://crm.example.test', id)).toBeNull()
    expect(url('https://crm.example.test', 'AAAAAAAAAAAAAAAAA')).toBeNull()
    expect(url('https://crm.example.test', 'abc')).toBeNull()
    expect(url('https://crm.example.test', null)).toBeNull()
    expect(url(null, id)).toBeNull()
    expect(url('javascript:alert(1)', id)).toBeNull()
  })

  it('phone_mismatch from the RPC reaches contact.phoneMismatch', () => {
    const res = buildPanelResponse(rpcResult([row('a')], { phone_mismatch: true }), CONTACT, NOW, LINKS)
    expect(res.contact.phoneMismatch).toBe(true)
  })

  it('an unknown status is paid and passes through unchanged', () => {
    const res = buildPanelResponse(rpcResult([row('a', { status: 'weird' })]), CONTACT, NOW, LINKS)
    expect(res.upcoming[0].paymentState).toBe('paid')
    expect(res.upcoming[0].status).toBe('weird')
  })

  it('identity_found false gives empty lists with the Lead pointer kept', () => {
    const res = buildPanelResponse(
      rpcResult([], { identity_found: false, espo_lead_id: 'bbbbbbbbbbbbbbbbb' }),
      CONTACT,
      NOW,
      LINKS,
    )
    expect(res.upcoming).toEqual([])
    expect(res.leadUrl).toBe('https://crm.example.test/#Lead/view/bbbbbbbbbbbbbbbbb')
  })
})

describe('buildNoContactResponse', () => {
  it('has no rows and zero counters', () => {
    const res = buildNoContactResponse({ email: null, phone: null, verified: false }, NOW)
    expect(res.state).toBe('no_contact')
    expect(res.upcoming).toEqual([])
    expect(res.past).toEqual([])
    expect(res.counters).toEqual({ trips: 0, totalSpentEur: 0 })
    expect(res.leadUrl).toBeNull()
  })
})
