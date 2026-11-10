// Phase 90 plan 07 (DISP-01, DISP-02, DISP-04, DISP-05): the kanban board.
// Pointer gestures are not driven in jsdom (RESEARCH Pitfall 10); the decision logic, the card menu and the
// DndContext handlers are tested instead, and the drag feel is checked by the owner on the deployed admin.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, cleanup } from '@testing-library/react'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'
import { DispatchBoard } from '@/components/admin/dispatch/DispatchBoard'
import { BOARD_COLUMNS, groupByColumn } from '@/components/admin/dispatch/boardModel'
import type { AdminBooking } from '@/components/admin/bookingTypes'

// TripEditPanel (inside the panel) mounts AddressInput, a next-intl consumer.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

const DISPATCH_TODAY = '/api/admin/bookings/dispatch?startDate=2027-10-31&endDate=2027-10-31'

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

interface FetchCall {
  url: string
  method: string
  body: unknown
}

interface FetchStub {
  calls: FetchCall[]
  dispatchCalls: () => FetchCall[]
  patchCalls: () => FetchCall[]
  setRows: (rows: AdminBooking[]) => void
  /** The next PATCH answers with this (held until `release` is called when `hold` is true). */
  patchAnswer: { status: number; body: unknown }
  holdPatch: () => () => void
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

function installFetch(initialRows: AdminBooking[], opts: { truncated?: boolean; drivers?: unknown[] } = {}): FetchStub {
  let rows = initialRows
  let release: (() => void) | null = null
  let gate: Promise<void> | null = null
  const stub: FetchStub = {
    calls: [],
    dispatchCalls: () => stub.calls.filter(c => c.url.startsWith('/api/admin/bookings/dispatch')),
    patchCalls: () => stub.calls.filter(c => c.url === '/api/admin/bookings' && c.method === 'PATCH'),
    setRows: next => {
      rows = next
    },
    patchAnswer: { status: 200, body: { ok: true } },
    holdPatch: () => {
      gate = new Promise<void>(resolve => {
        release = resolve
      })
      return () => release?.()
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      stub.calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.startsWith('/api/admin/bookings/dispatch')) {
        return jsonResponse(200, { bookings: rows, truncated: opts.truncated ?? false })
      }
      if (url === '/api/admin/bookings' && method === 'PATCH') {
        if (gate) await gate
        return jsonResponse(stub.patchAnswer.status, stub.patchAnswer.body)
      }
      if (url.startsWith('/api/admin/drivers')) {
        return jsonResponse(200, { data: opts.drivers ?? [] })
      }
      return jsonResponse(200, {})
    }),
  )
  return stub
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })

async function renderBoard(rows: AdminBooking[], opts: { truncated?: boolean; drivers?: unknown[] } = {}) {
  const stub = installFetch(rows, opts)
  render(
    <BookingPanelProvider>
      <DispatchBoard search="" tripType="all" />
    </BookingPanelProvider>,
  )
  await flush()
  await flush()
  return stub
}

function columnRefs(status: string): string[] {
  const col = screen.getByTestId(`board-column-${status}`)
  return within(col)
    .queryAllByTestId('board-card')
    .map(card => card.getAttribute('data-reference') ?? '')
}

beforeEach(() => {
  vi.useFakeTimers()
  // 2027-10-30T22:30Z is 00:30 on 31 October in Prague (CEST): "today" in Prague is already the 31st.
  vi.setSystemTime(new Date('2027-10-30T22:30:00Z'))
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('DispatchBoard - tracer', () => {
  it('first fetch is today in Prague and ten columns appear in the D-05 order', async () => {
    const stub = await renderBoard([])
    expect(stub.dispatchCalls()[0].url).toBe(DISPATCH_TODAY)
    const ids = screen.getAllByTestId(/^board-column-/).map(el => el.getAttribute('data-testid'))
    expect(ids).toEqual([
      'board-column-unpaid',
      'board-column-pending',
      'board-column-confirmed',
      'board-column-assigned',
      'board-column-en_route',
      'board-column-on_location',
      'board-column-on_board',
      'board-column-completed',
      'board-column-cancelled',
      'board-column-no_show',
    ])
  })

  it('sorts a column by pickup instant with the reference as tie-break', async () => {
    await renderBoard([
      makeBooking({ id: 'x1', booking_reference: 'PRE-B', status: 'en_route', pickup_utc: '2027-10-31T10:00:00Z' }),
      makeBooking({ id: 'x2', booking_reference: 'PRE-C', status: 'en_route', pickup_utc: '2027-10-31T08:00:00Z' }),
      makeBooking({ id: 'x3', booking_reference: 'PRE-A', status: 'en_route', pickup_utc: '2027-10-31T08:00:00Z' }),
    ])
    expect(columnRefs('en_route')).toEqual(['PRE-A', 'PRE-C', 'PRE-B'])
  })

  it('the menu of an en_route card lists Open and the UI_TRANSITIONS targets and nothing else', async () => {
    await renderBoard([makeBooking({ id: 'x1', booking_reference: 'PRE-A', status: 'en_route' })])
    fireEvent.click(screen.getByRole('button', { name: 'Actions for PRE-A' }))
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem').map(el => el.textContent)
    expect(items).toEqual(['Open', 'Move to On Location', 'Move to Cancelled', 'Move to Completed'])
  })

  it('Move to On Location sends the PATCH with expected_status and the card moves only after the answer', async () => {
    const stub = await renderBoard([makeBooking({ id: 'x1', booking_reference: 'PRE-A', status: 'en_route' })])
    const releasePatch = stub.holdPatch()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for PRE-A' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to On Location' }))
    await flush()

    expect(stub.patchCalls()).toHaveLength(1)
    expect(stub.patchCalls()[0].body).toEqual({ id: 'x1', status: 'on_location', expected_status: 'en_route' })
    // pending: no optimistic move
    expect(columnRefs('en_route')).toEqual(['PRE-A'])
    expect(columnRefs('on_location')).toEqual([])

    releasePatch()
    await flush()
    expect(columnRefs('en_route')).toEqual([])
    expect(columnRefs('on_location')).toEqual(['PRE-A'])
    expect(screen.getByTestId('move-toast').textContent).toContain('PRE-A moved to On Location')
  })

  it('a 409 status_conflict keeps the card where it is, shows the conflict line and refetches at once', async () => {
    const stub = await renderBoard([makeBooking({ id: 'x1', booking_reference: 'PRE-A', status: 'en_route' })])
    stub.patchAnswer = { status: 409, body: { error: 'status_conflict', currentStatus: 'on_location' } }
    const before = stub.dispatchCalls().length
    fireEvent.click(screen.getByRole('button', { name: 'Actions for PRE-A' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to On Location' }))
    await flush()
    await flush()

    expect(columnRefs('en_route')).toEqual(['PRE-A'])
    const card = within(screen.getByTestId('board-column-en_route')).getByTestId('board-card')
    expect(card.textContent).toContain('This booking was just changed to On Location by the driver')
    expect(stub.dispatchCalls().length).toBe(before + 1)
    expect(stub.dispatchCalls().at(-1)?.url).toBe(DISPATCH_TODAY)
  })

  it('a click on the card body opens the shared side panel for that booking', async () => {
    await renderBoard([makeBooking({ id: 'x1', booking_reference: 'PRE-A', status: 'en_route' })])
    fireEvent.click(screen.getByTestId('board-card'))
    await flush()
    const panel = screen.getByTestId('booking-panel')
    expect(panel.getAttribute('aria-label')).toBe('Booking PRE-A')
  })
})

describe('boardModel - grouping', () => {
  it('has the ten D-05 columns in flow order', () => {
    expect([...BOARD_COLUMNS]).toEqual([
      'unpaid',
      'pending',
      'confirmed',
      'assigned',
      'en_route',
      'on_location',
      'on_board',
      'completed',
      'cancelled',
      'no_show',
    ])
  })

  it('puts two bookings with the same pickup instant in the same column ordered by reference', () => {
    const grouped = groupByColumn([
      makeBooking({ id: '1', booking_reference: 'PRE-2', status: 'confirmed', pickup_utc: '2027-10-31T08:00:00Z' }),
      makeBooking({ id: '2', booking_reference: 'PRE-1', status: 'confirmed', pickup_utc: '2027-10-31T08:00:00Z' }),
    ])
    expect(grouped.confirmed.map(b => b.booking_reference)).toEqual(['PRE-1', 'PRE-2'])
  })

  it('gives the same order for the same data after every poll', () => {
    const rows = [
      makeBooking({ id: '1', booking_reference: 'PRE-3', status: 'pending', pickup_utc: '2027-10-31T09:00:00Z' }),
      makeBooking({ id: '2', booking_reference: 'PRE-1', status: 'pending', pickup_utc: '2027-10-31T07:00:00Z' }),
      makeBooking({ id: '3', booking_reference: 'PRE-2', status: 'pending', pickup_utc: '2027-10-31T07:00:00Z' }),
    ]
    const first = groupByColumn(rows).pending.map(b => b.id)
    const second = groupByColumn([...rows].reverse()).pending.map(b => b.id)
    expect(second).toEqual(first)
  })
})
