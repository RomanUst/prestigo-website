import type React from 'react'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'
import { DispatchCalendar } from '@/components/admin/dispatch/DispatchCalendar'
import { toCalendarItems, itemsByDay } from '@/components/admin/dispatch/calendarModel'
import { pragueMinuteOfDay } from '@/lib/prague-calendar'
import type { AdminCalendarView } from '@/lib/admin-shell-prefs'

// AddressInput is a next-intl consumer; the trip-edit panel mounts it when edit mode opens.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

// Phase 90 plan 08 (DISP-03): placement is proven under a process timezone that is NOT Prague, so a
// regression to local Date getters shows up as a booking on the wrong day or minute.
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

interface Row {
  id: string
  booking_reference: string
  status: string
  pickup_utc: string | null
  pickup_date: string
  pickup_time: string
  hours: number | null
  distance_km: number | null
  trip_type: string
  origin_address: string
  destination_address: string
  client_first_name: string
  client_last_name: string
}

let seq = 0
function row(over: Partial<Row> = {}): Row {
  seq += 1
  return {
    id: `id-${seq}`,
    booking_reference: `PRE-${String(seq).padStart(3, '0')}`,
    status: 'confirmed',
    pickup_utc: null,
    pickup_date: '2027-10-28',
    pickup_time: '10:00',
    hours: null,
    distance_km: 20,
    trip_type: 'transfer',
    origin_address: 'Prague Airport',
    destination_address: 'Old Town Square',
    client_first_name: 'Ivan',
    client_last_name: 'Petrov',
    ...over,
  }
}

function at(iso: string, over: Partial<Row> = {}): Row {
  return row({ pickup_utc: iso, ...over })
}

describe('calendarModel.toCalendarItems', () => {
  it('places a booking on its Prague day and minute (02:30 on 2027-10-31, 60 minutes for 20 km)', () => {
    const [it0] = toCalendarItems([at('2027-10-31T00:30:00Z', { distance_km: 20 })], { showAll: false })
    expect(it0.dayIso).toBe('2027-10-31')
    expect(it0.startMin).toBe(150)
    expect(it0.endMin).toBe(210)
    expect(it0.continues).toBe(false)
  })

  it('uses the booked hours for an hourly booking (3 h = 180 minutes) at its Prague minute', () => {
    const iso = '2027-10-28T08:00:00Z'
    const [it0] = toCalendarItems([at(iso, { hours: 3, distance_km: null, trip_type: 'hourly' })], { showAll: false })
    const expectedStart = pragueMinuteOfDay(Date.parse(iso))
    expect(it0.dayIso).toBe('2027-10-28')
    expect(it0.startMin).toBe(expectedStart)
    expect(it0.endMin).toBe(expectedStart + 180)
  })

  it('clips a block that runs past Prague midnight at 24:00 and marks it as continuing', () => {
    const [it0] = toCalendarItems([at('2027-10-31T22:30:00Z', { hours: 2, distance_km: null })], { showAll: false })
    expect(it0.dayIso).toBe('2027-10-31')
    expect(it0.startMin).toBe(23 * 60 + 30)
    expect(it0.endMin).toBe(1440)
    expect(it0.continues).toBe(true)
  })

  it('does not call a block that ends exactly at midnight "continuing"', () => {
    // 23:00 Prague (CEST, 21:00Z on 2027-10-28) plus 60 minutes ends exactly at 24:00
    const [it0] = toCalendarItems([at('2027-10-28T21:00:00Z', { hours: 1, distance_km: null })], { showAll: false })
    expect(it0.startMin).toBe(23 * 60)
    expect(it0.endMin).toBe(1440)
    expect(it0.continues).toBe(false)
  })

  it('skips rows whose pickup does not parse', () => {
    const bad = row({ pickup_utc: null, pickup_date: 'soon', pickup_time: '??' })
    expect(toCalendarItems([bad], { showAll: true })).toEqual([])
  })

  it('hides unpaid, pending and cancelled by default and keeps no_show and completed', () => {
    const rows = ['unpaid', 'pending', 'cancelled', 'no_show', 'completed', 'confirmed'].map(s =>
      at('2027-10-28T08:00:00Z', { status: s }),
    )
    const shown = toCalendarItems(rows, { showAll: false })
    expect(shown.map(i => i.item.status).sort()).toEqual(['completed', 'confirmed', 'no_show'])
    expect(shown.every(i => !i.faded)).toBe(true)
  })

  it('shows everything with Show all and fades only the three hidden statuses', () => {
    const rows = ['unpaid', 'pending', 'cancelled', 'no_show', 'completed'].map(s =>
      at('2027-10-28T08:00:00Z', { status: s }),
    )
    const shown = toCalendarItems(rows, { showAll: true })
    expect(shown).toHaveLength(5)
    const faded = shown.filter(i => i.faded).map(i => i.item.status).sort()
    expect(faded).toEqual(['cancelled', 'pending', 'unpaid'])
  })
})

describe('calendarModel.itemsByDay', () => {
  function placeMinutes(blocks: [number, number][]) {
    // 2027-10-28 is on summer time (UTC+2): 09:00 Prague = 07:00Z
    const rows = blocks.map(([s, e], i) => {
      const startMs = Date.parse('2027-10-27T22:00:00Z') + s * 60_000 // Prague midnight of 28 Oct
      return at(new Date(startMs).toISOString(), {
        id: `blk-${i}`,
        booking_reference: `PRE-B${i}`,
        hours: (e - s) / 60,
        distance_km: null,
      })
    })
    return itemsByDay(toCalendarItems(rows, { showAll: false }))['2027-10-28']
  }

  it('gives blocks that merely touch (09:00-10:00, 10:00-11:00) one column each, the full width', () => {
    const placed = placeMinutes([[540, 600], [600, 660]])
    expect(placed.map(p => p.cols)).toEqual([1, 1])
    expect(placed.map(p => p.col)).toEqual([0, 0])
  })

  it('puts really overlapping blocks side by side (two columns)', () => {
    const placed = placeMinutes([[540, 660], [600, 720]])
    expect(placed.map(p => p.cols)).toEqual([2, 2])
    expect(placed.map(p => p.col)).toEqual([0, 1])
  })

  it('orders equal starts longer block first, then by reference, whatever the input order', () => {
    const a = at('2027-10-28T07:00:00Z', { id: 'short', booking_reference: 'PRE-A', hours: 1, distance_km: null })
    const b = at('2027-10-28T07:00:00Z', { id: 'long', booking_reference: 'PRE-B', hours: 3, distance_km: null })
    const forward = itemsByDay(toCalendarItems([a, b], { showAll: false }))['2027-10-28']
    const backward = itemsByDay(toCalendarItems([b, a], { showAll: false }))['2027-10-28']
    expect(forward.map(p => p.item.item.id)).toEqual(['long', 'short'])
    expect(backward.map(p => p.item.item.id)).toEqual(['long', 'short'])
    expect(forward.map(p => p.col)).toEqual([0, 1])
  })
})

// ── component ───────────────────────────────────────────────────────────────

const NOW = '2027-10-28T10:00:00Z'

function dispatchCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map(c => String(c[0]))
    .filter(u => u.includes('/api/admin/bookings/dispatch'))
}

function stubDispatch(bookings: Row[], extra: { truncated?: boolean } = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/admin/bookings/dispatch')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ bookings, truncated: extra.truncated ?? false }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mount(props: Partial<{ search: string; tripType: string; initialView: AdminCalendarView }> = {}) {
  const ui: React.ReactElement = (
    <BookingPanelProvider>
      <DispatchCalendar search="" tripType="all" initialView="week" {...props} />
    </BookingPanelProvider>
  )
  return render(ui)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DispatchCalendar week view (tracer)', () => {
  it('asks for the Monday-Sunday window of today and draws seven day columns', async () => {
    const fetchMock = stubDispatch([])
    mount()
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    expect(dispatchCalls(fetchMock)[0]).toBe(
      '/api/admin/bookings/dispatch?startDate=2027-10-25&endDate=2027-10-31',
    )
    for (const iso of ['2027-10-25', '2027-10-26', '2027-10-27', '2027-10-28', '2027-10-29', '2027-10-30', '2027-10-31']) {
      expect(screen.getByTestId(`calendar-day-${iso}`)).toBeDefined()
    }
    expect(screen.queryByTestId('calendar-day-2027-11-01')).toBeNull()
    expect(screen.queryByTestId('calendar-day-2027-10-24')).toBeNull()
  })

  it('puts the 2027-10-31T00:30Z booking in the Sunday column at 02:30 with reference and status text, under TZ America/Los_Angeles', async () => {
    expect(process.env.TZ).toBe('America/Los_Angeles')
    const b = at('2027-10-31T00:30:00Z', { booking_reference: 'PRE-MIDNIGHT', status: 'confirmed' })
    stubDispatch([b])
    mount()
    const sunday = await screen.findByTestId('calendar-day-2027-10-31')
    const block = within(sunday).getByTestId(`calendar-block-${b.id}`)
    expect(block.textContent).toContain('02:30')
    expect(block.textContent).toContain('PRE-MIDNIGHT')
    expect(block.textContent).toContain('Confirmed')
    // the Saturday column does not have it
    expect(within(screen.getByTestId('calendar-day-2027-10-30')).queryByTestId(`calendar-block-${b.id}`)).toBeNull()
  })

  it('puts a 2027-10-31T23:30Z booking on Monday 2027-11-01 (next week), not on Sunday', async () => {
    const b = at('2027-10-31T23:30:00Z', { booking_reference: 'PRE-LATE' })
    stubDispatch([b])
    mount()
    await screen.findByTestId('calendar-day-2027-10-31')
    // 23:30Z on 31 Oct is 00:30 CET on 1 Nov: Sunday's column stays empty
    expect(within(screen.getByTestId('calendar-day-2027-10-31')).queryByTestId(`calendar-block-${b.id}`)).toBeNull()
    expect(screen.queryByTestId(`calendar-block-${b.id}`)).toBeNull()
  })

  it('marks today (2027-10-28) with aria-current date and no other column', async () => {
    stubDispatch([])
    mount()
    const today = await screen.findByTestId('calendar-day-2027-10-28')
    expect(today.getAttribute('aria-current')).toBe('date')
    expect(screen.getByTestId('calendar-day-2027-10-27').getAttribute('aria-current')).toBeNull()
  })

  it('colours a block from the status tokens (no colour literal) and keeps the status in text', async () => {
    const b = at('2027-10-28T08:00:00Z', { status: 'en_route', booking_reference: 'PRE-ROUTE' })
    stubDispatch([b])
    mount()
    const block = await screen.findByTestId(`calendar-block-${b.id}`)
    const style = block.getAttribute('style') ?? ''
    expect(style).toContain('var(--status-violet-bg)')
    expect(style).toContain('var(--status-violet-fg)')
    expect(style).toContain('var(--status-violet-border)')
    expect(block.textContent).toContain('En Route')
  })

  it('colours a completed booking with the ok family tokens', async () => {
    const b = at('2027-10-28T08:00:00Z', { status: 'completed' })
    stubDispatch([b])
    mount()
    const block = await screen.findByTestId(`calendar-block-${b.id}`)
    expect(block.getAttribute('style') ?? '').toContain('var(--status-ok-bg)')
  })

  it('opens the shared side panel with that booking when a block is clicked', async () => {
    const b = at('2027-10-28T08:00:00Z', { booking_reference: 'PRE-CLICK' })
    stubDispatch([b])
    mount()
    const block = await screen.findByTestId(`calendar-block-${b.id}`)
    fireEvent.click(block)
    const panel = await screen.findByTestId('booking-panel')
    expect(panel.getAttribute('aria-label')).toBe('Booking PRE-CLICK')
  })

  it('positions a block by its Prague start minute and length (top = minute, height = length)', async () => {
    // 08:00Z on 28 Oct = 10:00 Prague = minute 600, 3 h = 180 minutes
    const b = at('2027-10-28T08:00:00Z', { hours: 3, distance_km: null })
    stubDispatch([b])
    mount()
    const block = await screen.findByTestId(`calendar-block-${b.id}`)
    expect(block.getAttribute('data-start-min')).toBe('600')
    expect(block.getAttribute('data-end-min')).toBe('780')
  })
})
