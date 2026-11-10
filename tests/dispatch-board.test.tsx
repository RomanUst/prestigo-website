// Phase 90 plan 07 (DISP-01, DISP-02, DISP-04, DISP-05): the kanban board.
// Pointer gestures are not driven in jsdom (RESEARCH Pitfall 10); the decision logic, the card menu and the
// DndContext handlers are tested instead, and the drag feel is checked by the owner on the deployed admin.
import type React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, cleanup } from '@testing-library/react'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'
import { DispatchBoard } from '@/components/admin/dispatch/DispatchBoard'
import {
  BOARD_COLUMNS,
  columnDropState,
  groupByColumn,
  resolveDrop,
} from '@/components/admin/dispatch/boardModel'
import type { AdminBooking } from '@/components/admin/bookingTypes'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import { FlagRow, type CardFlag } from '@/components/admin/dispatch/BoardCard'

interface BoardOpts {
  truncated?: boolean
  drivers?: unknown[]
  /** A non-200 answer for every dispatch request. */
  dispatchStatus?: number
}

// TripEditPanel (inside the panel) mounts AddressInput, a next-intl consumer.
vi.mock('@/components/booking/AddressInput', () => ({
  default: () => null,
}))

// Pointer gestures are not driven in jsdom (Pitfall 10). DndContext and useDroppable are wrapped (real behaviour kept)
// so a test can read the props the board gave them and call its drag handlers directly.
interface DndProps {
  onDragStart: (e: { active: { id: string } }) => void
  onDragEnd: (e: { active: { id: string }; over: { id: string } | null }) => void
  onDragCancel: () => void
  sensors: { sensor: { name?: string }; options: { activationConstraint?: Record<string, number> } }[]
}
const dnd = vi.hoisted(() => ({
  props: null as null | DndProps,
  droppables: new Map<string, { id: string; disabled?: boolean }>(),
  draggables: new Map<string, { id: string; disabled?: boolean }>(),
  // DragOverlay shows its children only for dnd-kit's own active drag, which these tests do not start: capture them.
  overlayMounted: false,
  overlayChildren: undefined as unknown,
}))
vi.mock('@dnd-kit/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  const React = await import('react')
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      dnd.props = props as unknown as DndProps
      return React.createElement(actual.DndContext, props)
    },
    DragOverlay: (props: React.ComponentProps<typeof actual.DragOverlay>) => {
      dnd.overlayMounted = true
      dnd.overlayChildren = props.children
      return React.createElement(actual.DragOverlay, props)
    },
    useDroppable: (args: Parameters<typeof actual.useDroppable>[0]) => {
      dnd.droppables.set(String(args.id), { id: String(args.id), disabled: args.disabled })
      return actual.useDroppable(args)
    },
    useDraggable: (args: Parameters<typeof actual.useDraggable>[0]) => {
      dnd.draggables.set(String(args.id), { id: String(args.id), disabled: args.disabled })
      return actual.useDraggable(args)
    },
  }
})

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

function installFetch(initialRows: AdminBooking[], opts: BoardOpts = {}): FetchStub {
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
        if (opts.dispatchStatus && opts.dispatchStatus !== 200) return jsonResponse(opts.dispatchStatus, { error: 'x' })
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

async function renderBoard(rows: AdminBooking[], opts: BoardOpts = {}) {
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

describe('boardModel - drop decision', () => {
  const statuses = BOARD_COLUMNS as readonly string[]

  it('resolveDrop equals the column exactly when UI_TRANSITIONS allows it, for every status and every column', () => {
    for (const s of statuses) {
      for (const c of statuses) {
        const allowed = (UI_TRANSITIONS[s] ?? []).includes(c)
        expect(resolveDrop({ status: s }, c), `${s} -> ${c}`).toBe(allowed ? c : null)
      }
    }
  })

  it("resolveDrop is null for no target and for the card's own column", () => {
    expect(resolveDrop({ status: 'en_route' }, null)).toBeNull()
    expect(resolveDrop({ status: 'en_route' }, undefined)).toBeNull()
    expect(resolveDrop({ status: 'en_route' }, 'en_route')).toBeNull()
  })

  it('columnDropState is idle without a drag, allowed for a UI_TRANSITIONS target and blocked otherwise', () => {
    expect(columnDropState('confirmed', null)).toBe('idle')
    expect(columnDropState('on_location', 'en_route')).toBe('allowed')
    expect(columnDropState('confirmed', 'en_route')).toBe('blocked')
    // confirmed -> completed is hidden from the UI even though the server would allow it
    expect(columnDropState('completed', 'confirmed')).toBe('blocked')
  })
})

describe('DispatchBoard - drag and drop', () => {
  const enRoute = () => makeBooking({ id: 'x1', booking_reference: 'PRE-A', status: 'en_route' })

  beforeEach(() => {
    dnd.props = null
    dnd.droppables.clear()
  })

  it('uses PointerSensor distance 6 and TouchSensor delay 250 tolerance 8, and no keyboard sensor', async () => {
    await renderBoard([enRoute()])
    const sensors = dnd.props?.sensors ?? []
    expect(sensors).toHaveLength(2)
    expect(sensors[0].options.activationConstraint).toEqual({ distance: 6 })
    expect(sensors[1].options.activationConstraint).toEqual({ delay: 250, tolerance: 8 })
  })

  it('marks only the UI_TRANSITIONS columns allowed while a card is dragged, and disables every other droppable', async () => {
    await renderBoard([enRoute()])
    act(() => dnd.props?.onDragStart({ active: { id: 'x1' } }))
    const allowed = ['on_location', 'cancelled', 'completed']
    for (const status of BOARD_COLUMNS) {
      const col = screen.getByTestId(`board-column-${status}`)
      const expected = allowed.includes(status) ? 'allowed' : 'blocked'
      expect(col.getAttribute('data-drop'), status).toBe(expected)
      expect(dnd.droppables.get(status)?.disabled, status).toBe(expected === 'blocked')
    }
  })

  it('shows a drag overlay copy while dragging and removes it on cancel', async () => {
    await renderBoard([enRoute()])
    // permanently mounted: present (empty) before any drag
    expect(dnd.overlayMounted).toBe(true)
    expect(dnd.overlayChildren).toBeNull()
    act(() => dnd.props?.onDragStart({ active: { id: 'x1' } }))
    const copy = dnd.overlayChildren as React.ReactElement<{ booking: { booking_reference: string } }>
    expect(copy.props.booking.booking_reference).toBe('PRE-A')
    act(() => dnd.props?.onDragCancel())
    expect(dnd.overlayChildren).toBeNull()
  })

  it('does not poll while a card is dragged', async () => {
    const stub = await renderBoard([enRoute()])
    const before = stub.dispatchCalls().length
    act(() => dnd.props?.onDragStart({ active: { id: 'x1' } }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(stub.dispatchCalls().length).toBe(before)
  })

  it('a cancelled drag clears the state and polling resumes with one catch-up fetch', async () => {
    const stub = await renderBoard([enRoute()])
    const before = stub.dispatchCalls().length
    act(() => dnd.props?.onDragStart({ active: { id: 'x1' } }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    act(() => dnd.props?.onDragCancel())
    await flush()
    expect(stub.dispatchCalls().length).toBe(before + 1)
    expect(screen.getByTestId('board-column-on_location').getAttribute('data-drop')).toBe('idle')
  })

  it('a drop on an allowed column sends one PATCH with expected_status and clears the drag', async () => {
    const stub = await renderBoard([enRoute()])
    act(() => dnd.props?.onDragStart({ active: { id: 'x1' } }))
    act(() => dnd.props?.onDragEnd({ active: { id: 'x1' }, over: { id: 'on_location' } }))
    await flush()
    expect(stub.patchCalls()).toHaveLength(1)
    expect(stub.patchCalls()[0].body).toEqual({ id: 'x1', status: 'on_location', expected_status: 'en_route' })
    expect(screen.getByTestId('board-column-on_location').getAttribute('data-drop')).toBe('idle')
    expect(columnRefs('on_location')).toEqual(['PRE-A'])
  })

  it('a drop on a blocked column, on no column or on the own column sends nothing', async () => {
    const stub = await renderBoard([enRoute()])
    for (const over of [{ id: 'confirmed' }, null, { id: 'en_route' }]) {
      act(() => dnd.props?.onDragStart({ active: { id: 'x1' } }))
      act(() => dnd.props?.onDragEnd({ active: { id: 'x1' }, over }))
      await flush()
    }
    expect(stub.patchCalls()).toHaveLength(0)
    expect(columnRefs('en_route')).toEqual(['PRE-A'])
  })

  it('a drop on cancelled opens the cancel dialog instead of sending a status change', async () => {
    const stub = await renderBoard([enRoute()])
    act(() => dnd.props?.onDragStart({ active: { id: 'x1' } }))
    act(() => dnd.props?.onDragEnd({ active: { id: 'x1' }, over: { id: 'cancelled' } }))
    await flush()
    expect(stub.patchCalls()).toHaveLength(0)
    expect(screen.getByRole('radiogroup')).toBeDefined()
    expect(columnRefs('en_route')).toEqual(['PRE-A'])
  })
})

describe('DispatchBoard - terminal rails', () => {
  const onBoard = () => makeBooking({ id: 'x9', booking_reference: 'PRE-Z', status: 'on_board' })
  const done = () => makeBooking({ id: 'x8', booking_reference: 'PRE-DONE', status: 'completed' })

  beforeEach(() => {
    dnd.props = null
    dnd.droppables.clear()
  })

  it('completed, cancelled and no_show start collapsed with their counts and expand on click', async () => {
    await renderBoard([done(), onBoard()])
    for (const status of ['completed', 'cancelled', 'no_show']) {
      const rail = screen.getByTestId(`board-column-${status}`)
      expect(within(rail).getByRole('button').getAttribute('aria-expanded')).toBe('false')
    }
    expect(screen.getByTestId('board-count-completed').textContent).toBe('1')
    expect(screen.getByTestId('board-count-cancelled').textContent).toBe('0')
    expect(columnRefs('completed')).toEqual([])

    fireEvent.click(within(screen.getByTestId('board-column-completed')).getByRole('button'))
    expect(within(screen.getByTestId('board-column-completed')).getByRole('button', { expanded: true })).toBeDefined()
    expect(columnRefs('completed')).toEqual(['PRE-DONE'])
  })

  it('a collapsed rail is marked allowed during a drag of an on_board card and accepts the drop', async () => {
    const stub = await renderBoard([onBoard()])
    act(() => dnd.props?.onDragStart({ active: { id: 'x9' } }))
    expect(screen.getByTestId('board-column-completed').getAttribute('data-drop')).toBe('allowed')
    expect(screen.getByTestId('board-column-cancelled').getAttribute('data-drop')).toBe('allowed')
    expect(screen.getByTestId('board-column-no_show').getAttribute('data-drop')).toBe('blocked')
    expect(dnd.droppables.get('completed')?.disabled).toBe(false)
    expect(within(screen.getByTestId('board-column-completed')).getByRole('button').getAttribute('aria-expanded')).toBe('false')

    act(() => dnd.props?.onDragEnd({ active: { id: 'x9' }, over: { id: 'completed' } }))
    await flush()
    expect(stub.patchCalls()).toHaveLength(1)
    expect(stub.patchCalls()[0].body).toEqual({ id: 'x9', status: 'completed', expected_status: 'on_board' })
  })
})

describe('DispatchBoard - card content (D-06)', () => {
  const card = (reference: string) => {
    const found = screen.getAllByTestId('board-card').find(el => el.getAttribute('data-reference') === reference)
    if (!found) throw new Error(`no card ${reference}`)
    return found
  }

  it('shows the driver name, vehicle label, payment badge, client and the amount from amount_czk', async () => {
    await renderBoard(
      [
        makeBooking({
          id: 'c1',
          booking_reference: 'PRE-C1',
          status: 'assigned',
          driver_id: 'd1',
          payment_mode: 'card_hold',
          payment_state: 'authorized',
          amount_czk: 5000,
        }),
      ],
      { drivers: [{ id: 'd1', name: 'Jan Novak' }] },
    )
    const c = card('PRE-C1')
    expect(c.textContent).toContain('Jan Novak')
    expect(c.textContent).toContain('Business')
    expect(c.textContent).toContain('Hold active')
    expect(c.textContent).toContain('Ivan Petrov')
    expect(within(c).getByTestId('board-amount').textContent).toBe(`${new Intl.NumberFormat('cs-CZ').format(5000)} CZK`)
    expect(c.textContent).toContain('Prague Airport to Old Town Square')
  })

  it('shows the Prague time of the pickup instant and never the raw pickup_time text', async () => {
    // 08:00Z on 31 October 2027 is 09:00 in Prague (summer time ended at 01:00Z that night); pickup_time says 10:00.
    await renderBoard([
      makeBooking({ id: 'c1', booking_reference: 'PRE-T', status: 'confirmed', pickup_utc: '2027-10-31T08:00:00Z', pickup_time: '10:00' }),
    ])
    const c = card('PRE-T')
    expect(c.textContent).toContain('09:00')
    expect(c.textContent).not.toContain('10:00')
  })

  it('says Not assigned without a driver and Assigned driver for an unknown driver id', async () => {
    await renderBoard(
      [
        makeBooking({ id: 'c1', booking_reference: 'PRE-N', status: 'confirmed', driver_id: null }),
        makeBooking({ id: 'c2', booking_reference: 'PRE-U', status: 'assigned', driver_id: 'unknown' }),
      ],
      { drivers: [{ id: 'd1', name: 'Jan Novak' }] },
    )
    expect(card('PRE-N').textContent).toContain('Not assigned')
    expect(card('PRE-U').textContent).toContain('Assigned driver')
  })

  it('shows the no-show chip on an on_location card with an open request', async () => {
    await renderBoard([
      makeBooking({ id: 'c1', booking_reference: 'PRE-NS', status: 'on_location', no_show_requested_at: '2027-10-31T07:00:00Z' }),
    ])
    expect(within(card('PRE-NS')).getByTestId('no-show-chip')).toBeDefined()
  })

  it('shows the Fee decision badge for a pending fee case', async () => {
    await renderBoard([makeBooking({ id: 'c1', booking_reference: 'PRE-F', status: 'cancelled', fee_case_status: 'pending' })])
    fireEvent.click(within(screen.getByTestId('board-column-cancelled')).getByRole('button'))
    expect(within(card('PRE-F')).getByText('Fee decision')).toBeDefined()
  })

  it('shows the Cash chip while cash is not confirmed and not after cash_settled', async () => {
    await renderBoard([
      makeBooking({ id: 'c1', booking_reference: 'PRE-CASH', status: 'assigned', payment_mode: 'cash_guarantee', payment_state: 'card_saved' }),
      makeBooking({ id: 'c2', booking_reference: 'PRE-PAID', status: 'assigned', payment_mode: 'cash_guarantee', payment_state: 'cash_settled' }),
    ])
    expect(within(card('PRE-CASH')).getByText('Cash')).toBeDefined()
    expect(within(card('PRE-PAID')).queryByText('Cash')).toBeNull()
    expect(within(card('PRE-PAID')).getByText('Paid in cash')).toBeDefined()
  })

  it('shows a GNet chip and no Fee decision badge for a partner booking', async () => {
    await renderBoard([
      makeBooking({ id: 'c1', booking_reference: 'PRE-G', status: 'assigned', booking_source: 'gnet', fee_case_status: 'pending' }),
    ])
    expect(within(card('PRE-G')).getByTestId('board-gnet-c1')).toBeDefined()
    expect(within(card('PRE-G')).queryByText('Fee decision')).toBeNull()
  })

  it('collapses more than three flags into a +N chip whose title lists the hidden ones', () => {
    const flags: CardFlag[] = ['A', 'B', 'C', 'D'].map(l => ({ key: l, label: `Flag ${l}`, node: <span>{`Flag ${l}`}</span> }))
    render(<FlagRow flags={flags} />)
    expect(screen.queryByText('Flag D')).toBeNull()
    expect(screen.getByText('Flag C')).toBeDefined()
    const more = screen.getByTestId('board-flag-more')
    expect(more.textContent).toBe('+1')
    expect(more.getAttribute('title')).toBe('Flag D')
  })

  it('shows three flags without a +N chip', async () => {
    await renderBoard([
      makeBooking({
        id: 'c1',
        booking_reference: 'PRE-3',
        status: 'on_location',
        booking_source: 'gnet',
        no_show_requested_at: '2027-10-31T07:00:00Z',
        payment_mode: 'cash_guarantee',
        payment_state: 'card_saved',
      }),
    ])
    const c = card('PRE-3')
    expect(within(c).getByTestId('no-show-chip')).toBeDefined()
    expect(within(c).getByTestId('board-gnet-c1')).toBeDefined()
    expect(within(c).queryByTestId('board-flag-more')).toBeNull()
  })
})

describe('DispatchBoard - range bar (D-07)', () => {
  it('Tomorrow refetches with tomorrow in Prague and 7 days with a seven day window', async () => {
    const stub = await renderBoard([])
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    await flush()
    expect(stub.dispatchCalls().at(-1)?.url).toBe('/api/admin/bookings/dispatch?startDate=2027-11-01&endDate=2027-11-01')
    expect(screen.getByRole('button', { name: 'Tomorrow' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await flush()
    expect(stub.dispatchCalls().at(-1)?.url).toBe('/api/admin/bookings/dispatch?startDate=2027-10-31&endDate=2027-11-06')
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await flush()
    expect(stub.dispatchCalls().at(-1)?.url).toBe(DISPATCH_TODAY)
  })

  it('a custom range over 62 days shows the error and does not fetch; a valid one fetches', async () => {
    const stub = await renderBoard([])
    const before = stub.dispatchCalls().length
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-10-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-12-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await flush()
    expect(screen.getByText('Choose a range of up to 62 days.')).toBeDefined()
    expect(stub.dispatchCalls().length).toBe(before)

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-10-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await flush()
    expect(screen.queryByText('Choose a range of up to 62 days.')).toBeNull()
    expect(stub.dispatchCalls().at(-1)?.url).toBe('/api/admin/bookings/dispatch?startDate=2027-10-01&endDate=2027-10-15')
  })

  it('shows the Prague day before the time when the range covers several days', async () => {
    await renderBoard([
      makeBooking({ id: 'c1', booking_reference: 'PRE-D', status: 'confirmed', pickup_utc: '2027-11-02T08:00:00Z' }),
    ])
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await flush()
    expect(screen.getByTestId('board-card').textContent).toContain('2 Nov 09:00')
  })
})

describe('DispatchBoard - states', () => {
  it('an expired session shows the sign-in line with a link to /admin/login', async () => {
    await renderBoard([], { dispatchStatus: 401 })
    expect(screen.getByText(/Your admin session has ended\./).textContent).toBe('Your admin session has ended. Sign in again.')
    expect(screen.getByRole('link', { name: 'Sign in again.' }).getAttribute('href')).toBe('/admin/login')
    expect(screen.queryByText('No bookings in this range.')).toBeNull()
  })

  it('a failed load says it keeps retrying', async () => {
    await renderBoard([], { dispatchStatus: 500 })
    expect(screen.getByText('Could not load bookings. Retrying every 30 seconds.')).toBeDefined()
  })

  it('a truncated answer says only the first 500 bookings are shown', async () => {
    await renderBoard([makeBooking({ status: 'confirmed' })], { truncated: true })
    expect(screen.getByText('Showing the first 500 bookings in this range. Narrow the range to see all.')).toBeDefined()
  })

  it('an empty range shows one line and all ten columns with count 0', async () => {
    await renderBoard([])
    expect(screen.getAllByText('No bookings in this range.')).toHaveLength(1)
    expect(screen.getAllByTestId(/^board-column-/)).toHaveLength(10)
    for (const status of BOARD_COLUMNS) {
      expect(screen.getByTestId(`board-count-${status}`).textContent).toBe('0')
    }
  })

  it('shows a loading line while the first load runs', () => {
    installFetch([])
    render(
      <BookingPanelProvider>
        <DispatchBoard search="" tripType="all" />
      </BookingPanelProvider>,
    )
    expect(screen.getByText('Loading bookings…')).toBeDefined()
    expect(screen.queryByText('No bookings in this range.')).toBeNull()
  })
})

describe('DispatchBoard - phone layout', () => {
  beforeEach(() => {
    dnd.draggables.clear()
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true })
  })

  it('shows one column at a time with a Column picker listing every status with its count', async () => {
    await renderBoard([
      makeBooking({ id: 'm1', booking_reference: 'PRE-M1', status: 'confirmed' }),
      makeBooking({ id: 'm2', booking_reference: 'PRE-M2', status: 'en_route' }),
    ])
    const picker = screen.getByLabelText('Column') as HTMLSelectElement
    const options = Array.from(picker.options).map(o => o.textContent)
    expect(options).toHaveLength(10)
    expect(options).toContain('Confirmed (1)')
    expect(options).toContain('En Route (1)')
    expect(options).toContain('Cancelled (0)')
    expect(screen.getAllByTestId(/^board-column-/)).toHaveLength(1)
    expect(columnRefs('confirmed')).toEqual(['PRE-M1'])

    fireEvent.change(picker, { target: { value: 'en_route' } })
    expect(screen.getAllByTestId(/^board-column-/)).toHaveLength(1)
    expect(columnRefs('en_route')).toEqual(['PRE-M2'])
  })

  it('cards are not draggable on a phone, and the menu still moves them', async () => {
    const stub = await renderBoard([makeBooking({ id: 'm2', booking_reference: 'PRE-M2', status: 'en_route' })])
    fireEvent.change(screen.getByLabelText('Column'), { target: { value: 'en_route' } })
    expect(dnd.draggables.get('m2')?.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Actions for PRE-M2' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to On Location' }))
    await flush()
    expect(stub.patchCalls()).toHaveLength(1)
    expect(stub.patchCalls()[0].body).toEqual({ id: 'm2', status: 'on_location', expected_status: 'en_route' })
  })

  it('cards are draggable on a wide screen', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true, configurable: true })
    await renderBoard([makeBooking({ id: 'm2', booking_reference: 'PRE-M2', status: 'en_route' })])
    expect(dnd.draggables.get('m2')?.disabled).toBe(false)
    expect(screen.queryByLabelText('Column')).toBeNull()
  })
})
