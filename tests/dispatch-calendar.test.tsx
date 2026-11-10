import type React from 'react'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'
import { DispatchCalendar } from '@/components/admin/dispatch/DispatchCalendar'
import { toCalendarItems, itemsByDay, monthCells, shiftIsoMonth } from '@/components/admin/dispatch/calendarModel'
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

describe('calendarModel.monthCells and shiftIsoMonth', () => {
  it('monthCells keeps the three earliest per day, counts the rest as more, and gives empty days an entry', () => {
    const rows = [5, 3, 1, 4, 2].map(h => at(`2027-10-12T${String(h + 5).padStart(2, '0')}:00:00Z`, { booking_reference: `PRE-${h}` }))
    const cells = monthCells(toCalendarItems(rows, { showAll: false }), ['2027-10-11', '2027-10-12'])
    expect(cells['2027-10-11']).toEqual({ shown: [], more: 0 })
    expect(cells['2027-10-12'].shown.map(i => i.item.booking_reference)).toEqual(['PRE-1', 'PRE-2', 'PRE-3'])
    expect(cells['2027-10-12'].more).toBe(2)
  })

  it('shiftIsoMonth moves by calendar months and clamps the day (31 Jan + 1 = 28 Feb 2027, across years)', () => {
    expect(shiftIsoMonth('2027-10-15', -1)).toBe('2027-09-15')
    expect(shiftIsoMonth('2027-01-31', 1)).toBe('2027-02-28')
    expect(shiftIsoMonth('2028-01-31', 1)).toBe('2028-02-29')
    expect(shiftIsoMonth('2027-12-10', 1)).toBe('2028-01-10')
    expect(shiftIsoMonth('2027-01-10', -1)).toBe('2026-12-10')
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
    const block = await within(sunday).findByTestId(`calendar-block-${b.id}`)
    expect(block.textContent).toContain('02:30')
    expect(block.textContent).toContain('PRE-MIDNIGHT')
    expect(block.textContent).toContain('Confirmed')
    // the Saturday column does not have it
    expect(within(screen.getByTestId('calendar-day-2027-10-30')).queryByTestId(`calendar-block-${b.id}`)).toBeNull()
  })

  it('puts a 2027-10-31T23:30Z booking on Monday 2027-11-01 (next week), not on Sunday', async () => {
    const b = at('2027-10-31T23:30:00Z', { booking_reference: 'PRE-LATE' })
    const sentinel = at('2027-10-28T08:00:00Z', { booking_reference: 'PRE-SENTINEL' })
    stubDispatch([b, sentinel])
    mount()
    // wait until the rows are drawn, then look for the late one
    await screen.findByTestId(`calendar-block-${sentinel.id}`)
    // 23:30Z on 31 Oct is 00:30 CET on 1 Nov: Sunday's column stays empty, and so does the whole week
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

// ── Task 2: day and month views, navigation, remembered view ───────────────

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso))
}

// The cookie is scoped to Path=/admin, so jsdom (at /) never reads it back: capture what the component writes.
let cookieWrites: string[] = []
function cookieView(): string | null {
  const last = [...cookieWrites].reverse().find(w => w.startsWith('admin_calendar_view='))
  return last ? last.slice('admin_calendar_view='.length).split(';')[0] : null
}

describe('DispatchCalendar view switch and navigation', () => {
  beforeEach(() => {
    cookieWrites = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation(v => {
      cookieWrites.push(v)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('switches to the day view, fetches that one day and remembers the choice in the admin_calendar_view cookie', async () => {
    const fetchMock = stubDispatch([])
    mount()
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    fireEvent.click(screen.getByRole('tab', { name: 'Day' }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(2))
    expect(dispatchCalls(fetchMock)[1]).toBe('/api/admin/bookings/dispatch?startDate=2027-10-28&endDate=2027-10-28')
    expect(screen.getByTestId('calendar-day-2027-10-28')).toBeDefined()
    expect(screen.queryByTestId('calendar-day-2027-10-27')).toBeNull()
    expect(cookieView()).toBe('day')
    expect(cookieWrites.at(-1)).toContain('Path=/admin')
    expect(screen.getByRole('tab', { name: 'Day' }).getAttribute('aria-selected')).toBe('true')
  })

  it('opens in the view it was given (month) without writing the cookie until the operator switches', async () => {
    stubDispatch([])
    mount({ initialView: 'month' })
    await screen.findByTestId('calendar-cell-2027-10-15')
    expect(cookieView()).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))
    expect(cookieView()).toBe('week')
  })

  it('day view draws blocks with the same placement rules as the week view', async () => {
    const b = at('2027-10-28T08:00:00Z', { booking_reference: 'PRE-DAY' })
    stubDispatch([b])
    mount({ initialView: 'day' })
    const col = await screen.findByTestId('calendar-day-2027-10-28')
    const block = await within(col).findByTestId(`calendar-block-${b.id}`)
    expect(block.textContent).toContain('10:00')
    expect(block.textContent).toContain('PRE-DAY')
  })

  it('Next from the week of 2027-10-25 loads 2027-11-01..2027-11-07 once; Prev goes back; Today returns', async () => {
    const fetchMock = stubDispatch([])
    mount()
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(2))
    expect(dispatchCalls(fetchMock)[1]).toBe('/api/admin/bookings/dispatch?startDate=2027-11-01&endDate=2027-11-07')
    expect(screen.getByTestId('calendar-day-2027-11-01')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^Previous/ }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(3))
    expect(dispatchCalls(fetchMock)[2]).toBe('/api/admin/bookings/dispatch?startDate=2027-10-25&endDate=2027-10-31')

    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(4))
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(5))
    expect(dispatchCalls(fetchMock)[4]).toBe('/api/admin/bookings/dispatch?startDate=2027-11-08&endDate=2027-11-14')
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(6))
    expect(dispatchCalls(fetchMock)[5]).toBe('/api/admin/bookings/dispatch?startDate=2027-10-25&endDate=2027-10-31')
  })

  it('Previous in the day view steps one Prague day', async () => {
    const fetchMock = stubDispatch([])
    mount({ initialView: 'day' })
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: /^Previous/ }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(2))
    expect(dispatchCalls(fetchMock)[1]).toBe('/api/admin/bookings/dispatch?startDate=2027-10-27&endDate=2027-10-27')
  })
})

describe('DispatchCalendar month view', () => {
  it('month: fetches the Monday-first grid 2027-09-27..2027-10-31 and draws 35 cells, dimming those outside October', async () => {
    setNow('2027-10-15T10:00:00Z')
    const fetchMock = stubDispatch([])
    mount({ initialView: 'month' })
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    expect(dispatchCalls(fetchMock)[0]).toBe('/api/admin/bookings/dispatch?startDate=2027-09-27&endDate=2027-10-31')
    expect(document.querySelectorAll('[data-testid^="calendar-cell-"]')).toHaveLength(35)
    expect(screen.getByTestId('calendar-cell-2027-09-27').getAttribute('data-outside-month')).toBe('true')
    expect(screen.getByTestId('calendar-cell-2027-10-01').getAttribute('data-outside-month')).toBeNull()
    expect(screen.getByTestId('calendar-cell-2027-10-15').getAttribute('aria-current')).toBe('date')
  })

  it('month: Previous from October 2027 loads September (grid 2027-08-30..2027-10-03)', async () => {
    setNow('2027-10-15T10:00:00Z')
    const fetchMock = stubDispatch([])
    mount({ initialView: 'month' })
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: /^Previous/ }))
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(2))
    expect(dispatchCalls(fetchMock)[1]).toBe('/api/admin/bookings/dispatch?startDate=2027-08-30&endDate=2027-10-03')
  })

  it('month: shows the three earliest bookings of a day and a +2 button that drills into the day view', async () => {
    setNow('2027-10-15T10:00:00Z')
    // five bookings on 2027-10-12 (summer time): pickups 08:00Z..12:00Z = 10:00..14:00 Prague
    const five = [4, 2, 0, 3, 1].map(offset =>
      at(`2027-10-12T${String(8 + offset).padStart(2, '0')}:00:00Z`, { booking_reference: `PRE-M${offset}` }),
    )
    const fetchMock = stubDispatch(five)
    mount({ initialView: 'month' })
    const cell = await screen.findByTestId('calendar-cell-2027-10-12')
    const itemTexts = (await within(cell).findAllByTestId(/^calendar-item-/)).map(el => el.textContent ?? '')
    expect(itemTexts).toHaveLength(3)
    expect(itemTexts[0]).toContain('10:00 PRE-M0')
    expect(itemTexts[1]).toContain('11:00 PRE-M1')
    expect(itemTexts[2]).toContain('12:00 PRE-M2')
    const more = within(cell).getByRole('button', { name: /^\+2/ })
    expect(more.textContent).toBe('+2')

    fetchMock.mockClear()
    fireEvent.click(more)
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    expect(dispatchCalls(fetchMock)[0]).toBe('/api/admin/bookings/dispatch?startDate=2027-10-12&endDate=2027-10-12')
    const dayCol = await screen.findByTestId('calendar-day-2027-10-12')
    await waitFor(() => expect(within(dayCol).getAllByTestId(/^calendar-block-/)).toHaveLength(5))
    expect(screen.queryByTestId('calendar-cell-2027-10-12')).toBeNull()
  })

  it('month: a day item opens the shared side panel', async () => {
    setNow('2027-10-15T10:00:00Z')
    const b = at('2027-10-12T08:00:00Z', { booking_reference: 'PRE-MONTH' })
    stubDispatch([b])
    mount({ initialView: 'month' })
    fireEvent.click(await screen.findByTestId(`calendar-item-${b.id}`))
    expect((await screen.findByTestId('booking-panel')).getAttribute('aria-label')).toBe('Booking PRE-MONTH')
  })

  it('month: a booking at 2027-10-31T23:30Z is in the 1 November cell, not on 31 October', async () => {
    setNow('2027-10-28T10:00:00Z')
    const b = at('2027-10-31T23:30:00Z', { booking_reference: 'PRE-NOV1' })
    const fetchMock = stubDispatch([b])
    mount({ initialView: 'month' })
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    // the October grid ends on Sunday 31 October: the booking belongs to 1 November, which is not in it
    const oct31 = await screen.findByTestId('calendar-cell-2027-10-31')
    expect(within(oct31).queryByTestId(`calendar-item-${b.id}`)).toBeNull()
    expect(screen.queryByTestId(`calendar-item-${b.id}`)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    const nov1 = await screen.findByTestId('calendar-cell-2027-11-01')
    await waitFor(() => expect(within(nov1).getByTestId(`calendar-item-${b.id}`)).toBeDefined())
  })
})

describe('DispatchCalendar DST weeks', () => {
  it('2027-03-28: a 01:00Z booking sits in that day at 03:00 and nothing is drawn in the 02:00 row', async () => {
    setNow('2027-03-24T10:00:00Z')
    const b = at('2027-03-28T01:00:00Z', { booking_reference: 'PRE-SPRING' })
    const fetchMock = stubDispatch([b])
    mount()
    await waitFor(() => expect(dispatchCalls(fetchMock)).toHaveLength(1))
    expect(dispatchCalls(fetchMock)[0]).toBe('/api/admin/bookings/dispatch?startDate=2027-03-22&endDate=2027-03-28')
    const sunday = await screen.findByTestId('calendar-day-2027-03-28')
    const block = await within(sunday).findByTestId(`calendar-block-${b.id}`)
    expect(block.textContent).toContain('03:00')
    expect(block.getAttribute('data-start-min')).toBe('180')
    // every block of that day starts before 02:00 or at 03:00 and later, none inside the missing hour
    const starts = within(sunday).getAllByTestId(/^calendar-block-/).map(el => Number(el.getAttribute('data-start-min')))
    expect(starts.every(s => s < 120 || s >= 180)).toBe(true)
  })

  it('2027-10-31: both 02:30 pickups (00:30Z and 01:30Z) show 02:30 on the 25-hour day', async () => {
    const a = at('2027-10-31T00:30:00Z', { booking_reference: 'PRE-FALL-A' })
    const b = at('2027-10-31T01:30:00Z', { booking_reference: 'PRE-FALL-B' })
    stubDispatch([a, b])
    mount()
    const sunday = await screen.findByTestId('calendar-day-2027-10-31')
    const blockA = await within(sunday).findByTestId(`calendar-block-${a.id}`)
    const blockB = await within(sunday).findByTestId(`calendar-block-${b.id}`)
    expect(blockA.textContent).toContain('02:30')
    expect(blockB.textContent).toContain('02:30')
  })
})
