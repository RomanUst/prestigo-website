// Phase 90 plan 09 (DISP-01, DISP-03, DISP-04): the bookings workspace. One page, three tabs (List, Board, Calendar),
// one side panel, shared filters, a remembered view in a cookie and in the URL. The server page is tested first (it
// only resolves the first view), then the client workspace under jsdom with a URL-routing fetch stub.
import type React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react'
import BookingsWorkspace from '@/components/admin/BookingsWorkspace'
import BookingsTable from '@/components/admin/BookingsTable'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'
import type { AdminBooking } from '@/components/admin/bookingTypes'

// next/headers is a server-only module: the page reads the cookie jar through this mock.
const jar = vi.hoisted(() => ({ values: {} as Record<string, string> }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name in jar.values ? { name, value: jar.values[name] } : undefined),
  }),
}))

// The detail panel mounts AddressInput (a next-intl consumer) when the trip-edit form opens.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

// ManualBookingForm is out of scope: a stub that lets a test report a created booking.
vi.mock('@/components/admin/ManualBookingForm', () => ({
  ManualBookingForm: ({ onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) => (
    <button data-testid="mock-created" onClick={onCreated}>
      booking created
    </button>
  ),
}))

function makeBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: 'b1',
    booking_reference: 'PRE-DEFAULT',
    booking_source: 'online',
    pickup_date: '2027-10-31',
    pickup_time: '10:00',
    pickup_utc: '2027-10-31T08:00:00Z',
    client_first_name: 'Ivan',
    client_last_name: 'Petrov',
    client_email: 'ivan@example.com',
    client_phone: '+420111222333',
    trip_type: 'transfer',
    vehicle_class: 'business',
    amount_czk: 5000,
    driver_price_czk: null,
    origin_address: 'Prague Airport',
    destination_address: 'Old Town Square',
    origin_lat: 50.1,
    origin_lng: 14.26,
    destination_lat: 50.087,
    destination_lng: 14.421,
    passengers: 2,
    luggage: 2,
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    flight_number: null,
    terminal: null,
    hours: null,
    return_date: null,
    special_requests: null,
    payment_intent_id: null,
    payment_link_url: null,
    payment_link_id: null,
    status: 'confirmed',
    operator_notes: null,
    created_at: '2027-10-01T10:00:00Z',
    leg: null,
    linked_booking_id: null,
    outbound_amount_czk: null,
    return_amount_czk: null,
    linked_booking: null,
    flight_iata: null,
    flight_status: null,
    flight_estimated_arrival: null,
    flight_delay_minutes: null,
    flight_departure_airport: null,
    flight_arrival_airport: null,
    flight_terminal: null,
    ...overrides,
  }
}

// ── The server page ─────────────────────────────────────────────────────────

describe('BookingsPage (server): first view at first paint', () => {
  beforeEach(() => {
    jar.values = {}
  })

  async function renderPage(
    searchParams: Record<string, string | string[] | undefined>,
    cookie: Record<string, string> = {},
  ) {
    jar.values = cookie
    const { default: BookingsPage } = await import('@/app/(internal)/admin/(dashboard)/bookings/page')
    const el = (await BookingsPage({ searchParams: Promise.resolve(searchParams) })) as React.ReactElement<{
      initialView: string
      initialCalendarView: string
    }>
    return el
  }

  it('a valid ?view= wins over the cookie', async () => {
    const el = await renderPage({ view: 'board' }, { admin_bookings_view: 'calendar' })
    expect(el.type).toBe(BookingsWorkspace)
    expect(el.props.initialView).toBe('board')
  })

  it('a ?search= deep link opens the list, whatever the cookie says', async () => {
    const el = await renderPage({ search: 'PRG-20260928-D8E6DC' }, { admin_bookings_view: 'board' })
    expect(el.props.initialView).toBe('list')
  })

  it('the cookie decides when there is no parameter', async () => {
    const el = await renderPage({}, { admin_bookings_view: 'calendar' })
    expect(el.props.initialView).toBe('calendar')
  })

  it('a hostile cookie value falls back to the list', async () => {
    expect((await renderPage({}, { admin_bookings_view: 'BOARD' })).props.initialView).toBe('list')
    expect((await renderPage({}, { admin_bookings_view: '"><script>' })).props.initialView).toBe('list')
    expect((await renderPage({ view: 'kanban' }, {})).props.initialView).toBe('list')
  })

  it('takes the first value of an array parameter', async () => {
    const el = await renderPage({ view: ['calendar', 'board'] }, {})
    expect(el.props.initialView).toBe('calendar')
  })

  it('initialCalendarView follows admin_calendar_view and defaults to week', async () => {
    expect((await renderPage({}, { admin_calendar_view: 'month' })).props.initialCalendarView).toBe('month')
    expect((await renderPage({}, {})).props.initialCalendarView).toBe('week')
    expect((await renderPage({}, { admin_calendar_view: 'WEEK' })).props.initialCalendarView).toBe('week')
  })
})

// ── The client workspace ────────────────────────────────────────────────────

interface Stub {
  calls: string[]
  listCalls: () => string[]
  dispatchCalls: () => string[]
  kpiCalls: () => string[]
  setList: (rows: AdminBooking[]) => void
  setDispatch: (rows: AdminBooking[]) => void
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function installFetch(): Stub {
  let listRows: AdminBooking[] = []
  let dispatchRows: AdminBooking[] = []
  const stub: Stub = {
    calls: [],
    listCalls: () => stub.calls.filter(u => u.startsWith('/api/admin/bookings?page=')),
    dispatchCalls: () => stub.calls.filter(u => u.startsWith('/api/admin/bookings/dispatch')),
    kpiCalls: () => stub.calls.filter(u => u.endsWith('&limit=1') || u.endsWith('&limit=100')),
    setList: rows => {
      listRows = rows
    },
    setDispatch: rows => {
      dispatchRows = rows
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      stub.calls.push(url)
      if (url.startsWith('/api/admin/settings')) {
        return jsonResponse({ dispatch_default_horizon: 'future', dispatch_horizon_days: 7 })
      }
      if (url.startsWith('/api/admin/bookings/dispatch')) {
        return jsonResponse({ bookings: dispatchRows, truncated: false })
      }
      if (url.endsWith('&limit=1')) return jsonResponse({ total: 5, bookings: [] })
      if (url.endsWith('&limit=100')) return jsonResponse({ total: 0, bookings: [] })
      if (url.startsWith('/api/admin/bookings?page=')) {
        return jsonResponse({ bookings: listRows, total: listRows.length })
      }
      if (url.startsWith('/api/admin/drivers')) return jsonResponse({ data: [] })
      return jsonResponse({})
    }),
  )
  return stub
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })

async function renderWorkspace(
  props: { initialView?: 'list' | 'board' | 'calendar'; initialCalendarView?: 'day' | 'week' | 'month' } = {},
  rows: { list?: AdminBooking[]; dispatch?: AdminBooking[] } = {},
) {
  const stub = installFetch()
  stub.setList(rows.list ?? [])
  stub.setDispatch(rows.dispatch ?? [])
  render(<BookingsWorkspace initialView={props.initialView ?? 'list'} initialCalendarView={props.initialCalendarView ?? 'week'} />)
  await flush()
  await flush()
  await flush()
  return stub
}

function tab(name: 'List' | 'Board' | 'Calendar') {
  return screen.getByRole('tab', { name })
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/admin; Max-Age=0`
  document.cookie = `${name}=; Path=/; Max-Age=0`
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2027-10-30T22:30:00Z'))
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true, configurable: true })
  window.history.replaceState({ marker: 'router' }, '', '/admin/bookings')
  clearCookie('admin_bookings_view')
  clearCookie('admin_calendar_view')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('BookingsWorkspace - tabs', () => {
  it('shows a tablist with List, Board and Calendar and marks the initial one selected', async () => {
    await renderWorkspace({ initialView: 'list' })
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['List', 'Board', 'Calendar'])
    expect(tab('List').getAttribute('aria-selected')).toBe('true')
    expect(tab('Board').getAttribute('aria-selected')).toBe('false')
    expect(tab('Calendar').getAttribute('aria-selected')).toBe('false')
    expect(screen.getByTestId('desktop-table')).toBeTruthy()
    expect(screen.queryByTestId('board-column-unpaid')).toBeNull()
  })

  it('clicking Board mounts the board and writes the cookie and the URL without touching history.state', async () => {
    await renderWorkspace({ initialView: 'list' })
    const stateBefore = window.history.state
    fireEvent.click(tab('Board'))
    await flush()
    await flush()

    expect(tab('Board').getAttribute('aria-selected')).toBe('true')
    expect(tab('List').getAttribute('aria-selected')).toBe('false')
    expect(screen.getByTestId('board-column-unpaid')).toBeTruthy()
    expect(screen.queryByTestId('desktop-table')).toBeNull()
    expect(document.cookie).toContain('admin_bookings_view=board')
    expect(window.location.search).toContain('view=board')
    expect(window.history.state).toBe(stateBefore)
  })

  it('the cookie is serialised with Path=/admin and a one year Max-Age', async () => {
    await renderWorkspace({ initialView: 'list' })
    const writes: string[] = []
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => desc?.get?.call(document) ?? '',
      set: (v: string) => {
        writes.push(v)
        desc?.set?.call(document, v)
      },
    })
    try {
      fireEvent.click(tab('Board'))
      await flush()
    } finally {
      delete (document as unknown as Record<string, unknown>).cookie
    }
    const write = writes.find(w => w.startsWith('admin_bookings_view='))
    expect(write).toBeTruthy()
    expect(write!.startsWith('admin_bookings_view=board; Path=/admin')).toBe(true)
    expect(write).toContain('Max-Age=31536000')
    expect(write).toContain('SameSite=Lax')
  })

  it('keeps every other query parameter when it replaces view', async () => {
    window.history.replaceState({ marker: 'router' }, '', '/admin/bookings?foo=bar&view=list#x')
    await renderWorkspace({ initialView: 'list' })
    fireEvent.click(tab('Calendar'))
    await flush()
    const params = new URLSearchParams(window.location.search)
    expect(params.get('view')).toBe('calendar')
    expect(params.get('foo')).toBe('bar')
    expect(window.location.hash).toBe('#x')
    expect(document.cookie).toContain('admin_bookings_view=calendar')
  })

  it('clicking Calendar renders the calendar grid', async () => {
    await renderWorkspace({ initialView: 'list' })
    fireEvent.click(tab('Calendar'))
    await flush()
    await flush()
    expect(tab('Calendar').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Week' })).toBeTruthy()
    expect(screen.queryByTestId('desktop-table')).toBeNull()
  })

  it('initialView board renders the board first and never fetches the list', async () => {
    const stub = await renderWorkspace({ initialView: 'board' })
    expect(tab('Board').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('board-column-unpaid')).toBeTruthy()
    expect(stub.listCalls()).toHaveLength(0)
    expect(stub.dispatchCalls().length).toBeGreaterThan(0)
  })

  it('arrow keys move between tabs', async () => {
    await renderWorkspace({ initialView: 'list' })
    fireEvent.keyDown(tab('List'), { key: 'ArrowRight' })
    await flush()
    expect(tab('Board').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('Board'), { key: 'ArrowLeft' })
    await flush()
    expect(tab('List').getAttribute('aria-selected')).toBe('true')
  })

  it('the calendar tab opens on the remembered calendar view, also after switching away and back', async () => {
    await renderWorkspace({ initialView: 'calendar', initialCalendarView: 'month' })
    // The month view has no hour axis; its Month tab is the selected one.
    expect(screen.getByRole('tab', { name: 'Month' }).getAttribute('aria-selected')).toBe('true')

    // The operator switches the calendar to Day (the calendar writes admin_calendar_view), goes to List and back.
    fireEvent.click(screen.getByRole('tab', { name: 'Day' }))
    await flush()
    expect(document.cookie).toContain('admin_calendar_view=day')
    fireEvent.click(tab('List'))
    await flush()
    fireEvent.click(tab('Calendar'))
    await flush()
    expect(screen.getByRole('tab', { name: 'Day' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('BookingsWorkspace - KPI counters', () => {
  it('fetches the two KPI counters once and tab switches do not refetch them', async () => {
    const stub = await renderWorkspace({ initialView: 'list' })
    expect(stub.kpiCalls()).toHaveLength(2)
    fireEvent.click(tab('Board'))
    await flush()
    fireEvent.click(tab('Calendar'))
    await flush()
    fireEvent.click(tab('List'))
    await flush()
    await flush()
    expect(stub.kpiCalls()).toHaveLength(2)
  })
})

// Only the mounted view may poll (D-16): a hidden view must not keep fetching.
describe('BookingsWorkspace - polling', () => {
  it('only the active view polls the dispatch route', async () => {
    const stub = await renderWorkspace({ initialView: 'board' })
    const afterMount = stub.dispatchCalls().length
    fireEvent.click(tab('List'))
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000)
    })
    expect(stub.dispatchCalls().length).toBe(afterMount)
  })
})

// ── Task 2: shared filters, the deep link, selection across tabs, New Booking refresh ──

function searchBox() {
  return screen.getByPlaceholderText('Search client or reference...') as HTMLInputElement
}

function chip(name: string) {
  return screen.getByRole('button', { name })
}

describe('BookingsWorkspace - shared filters', () => {
  it('a search typed on the board refetches the dispatch URL and becomes the list search', async () => {
    const stub = await renderWorkspace({ initialView: 'board' })
    fireEvent.change(searchBox(), { target: { value: 'PRE-9' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320)
    })
    await flush()
    expect(stub.dispatchCalls().some(u => u.includes('search=PRE-9'))).toBe(true)

    fireEvent.click(tab('List'))
    await flush()
    await flush()
    expect(searchBox().value).toBe('PRE-9')
    expect(stub.listCalls().some(u => u.includes('search=PRE-9'))).toBe(true)
  })

  it('a trip type chosen in the list is the calendar filter', async () => {
    const stub = await renderWorkspace({ initialView: 'list' })
    fireEvent.click(chip('Daily'))
    await flush()
    fireEvent.click(tab('Calendar'))
    await flush()
    await flush()
    expect(stub.dispatchCalls().some(u => u.includes('tripType=daily'))).toBe(true)
    expect(chip('Daily').getAttribute('aria-pressed')).toBe('true')
  })

  it('a trip type chosen on the board is the list starting filter', async () => {
    const stub = await renderWorkspace({ initialView: 'board' })
    fireEvent.click(chip('Hourly'))
    await flush()
    await flush()
    expect(stub.dispatchCalls().some(u => u.includes('tripType=hourly'))).toBe(true)
    fireEvent.click(tab('List'))
    await flush()
    await flush()
    expect(stub.listCalls().some(u => u.includes('tripType=hourly'))).toBe(true)
  })

  it('the ?search= deep link opens the list with horizon all, strips search, keeps view, and the board then uses it', async () => {
    window.history.replaceState({ marker: 'router' }, '', '/admin/bookings?search=PRG-20260928-D8E6DC&view=list')
    const stub = await renderWorkspace({ initialView: 'list' })
    expect(stub.listCalls()[0]).toContain('search=PRG-20260928-D8E6DC')
    expect(stub.listCalls()[0]).toContain('horizon=all')
    const params = new URLSearchParams(window.location.search)
    expect(params.has('search')).toBe(false)
    expect(params.get('view')).toBe('list')

    fireEvent.click(tab('Board'))
    await flush()
    await flush()
    expect(stub.dispatchCalls().some(u => u.includes('search=PRG-20260928-D8E6DC'))).toBe(true)
    expect(searchBox().value).toBe('PRG-20260928-D8E6DC')
  })
})

describe('BookingsWorkspace - one side panel', () => {
  it('a booking opened from the list stays open after switching to Board and Calendar', async () => {
    const row = makeBooking({ id: 'r1', booking_reference: 'PRE-OPEN1', status: 'confirmed' })
    await renderWorkspace({ initialView: 'list' }, { list: [row], dispatch: [row] })
    fireEvent.click(screen.getAllByText('PRE-OPEN1')[0])
    await flush()
    expect(screen.getByTestId('booking-panel')).toBeTruthy()

    fireEvent.click(tab('Board'))
    await flush()
    await flush()
    expect(within(screen.getByTestId('booking-panel')).getAllByText(/PRE-OPEN1/).length).toBeGreaterThan(0)

    fireEvent.click(tab('Calendar'))
    await flush()
    await flush()
    expect(within(screen.getByTestId('booking-panel')).getAllByText(/PRE-OPEN1/).length).toBeGreaterThan(0)
    // One panel, whatever the view.
    expect(screen.getAllByTestId('booking-panel')).toHaveLength(1)
  })

  it('a card opened on the board opens the same panel', async () => {
    const row = makeBooking({ id: 'r2', booking_reference: 'PRE-CARD1', status: 'confirmed' })
    await renderWorkspace({ initialView: 'board' }, { dispatch: [row] })
    fireEvent.click(screen.getByTestId('board-card'))
    await flush()
    expect(within(screen.getByTestId('booking-panel')).getAllByText(/PRE-CARD1/).length).toBeGreaterThan(0)
  })
})

describe('BookingsWorkspace - New Booking refresh', () => {
  it('a created booking remounts the list, which refetches', async () => {
    const stub = await renderWorkspace({ initialView: 'list' })
    const before = stub.listCalls().length
    fireEvent.click(screen.getByTestId('mock-created'))
    await flush()
    await flush()
    expect(stub.listCalls().length).toBe(before + 1)
  })

  it('a created booking makes the board fetch its window again', async () => {
    const stub = await renderWorkspace({ initialView: 'board' })
    const before = stub.dispatchCalls().length
    fireEvent.click(screen.getByTestId('mock-created'))
    await flush()
    await flush()
    expect(stub.dispatchCalls().length).toBe(before + 1)
  })

  it('a created booking makes the calendar fetch its window again', async () => {
    const stub = await renderWorkspace({ initialView: 'calendar' })
    const before = stub.dispatchCalls().length
    fireEvent.click(screen.getByTestId('mock-created'))
    await flush()
    await flush()
    expect(stub.dispatchCalls().length).toBe(before + 1)
  })
})

// ── BookingsTable filter props (kept here: tests/BookingsTable.test.tsx stays untouched by this plan) ──

describe('BookingsTable - shared filter props', () => {
  async function renderTable(props: React.ComponentProps<typeof BookingsTable>) {
    const stub = installFetch()
    render(
      <BookingPanelProvider>
        <BookingsTable {...props} />
      </BookingPanelProvider>,
    )
    await flush()
    await flush()
    return stub
  }

  it('initialSearch seeds the search box and the first list fetch', async () => {
    const stub = await renderTable({ initialSearch: 'Novak' })
    expect(searchBox().value).toBe('Novak')
    expect(stub.listCalls()[0]).toContain('search=Novak')
  })

  it('a ?search= deep link wins over initialSearch and still sets horizon all', async () => {
    window.history.replaceState({ marker: 'router' }, '', '/admin/bookings?search=PRG-20260928-D8E6DC')
    const stub = await renderTable({ initialSearch: 'Novak' })
    expect(searchBox().value).toBe('PRG-20260928-D8E6DC')
    expect(stub.listCalls()[0]).toContain('search=PRG-20260928-D8E6DC')
    expect(stub.listCalls()[0]).toContain('horizon=all')
  })

  it('initialTripType marks its chip and is sent to the list route', async () => {
    const stub = await renderTable({ initialTripType: 'hourly' })
    expect(chip('Hourly').getAttribute('style')).toContain('var(--copper)')
    expect(stub.listCalls()[0]).toContain('tripType=hourly')
  })

  it('onFiltersChange fires once after mount and again after each change with the debounced search', async () => {
    const onFiltersChange = vi.fn()
    await renderTable({ onFiltersChange })
    expect(onFiltersChange).toHaveBeenCalledTimes(1)
    expect(onFiltersChange).toHaveBeenLastCalledWith({ search: '', tripType: 'all' })

    fireEvent.click(chip('Daily'))
    await flush()
    expect(onFiltersChange).toHaveBeenLastCalledWith({ search: '', tripType: 'daily' })

    fireEvent.change(searchBox(), { target: { value: 'Ivan' } })
    // Not reported before the debounce settles.
    expect(onFiltersChange).toHaveBeenLastCalledWith({ search: '', tripType: 'daily' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320)
    })
    expect(onFiltersChange).toHaveBeenLastCalledWith({ search: 'Ivan', tripType: 'daily' })
  })
})
