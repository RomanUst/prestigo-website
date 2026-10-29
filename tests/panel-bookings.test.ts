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
