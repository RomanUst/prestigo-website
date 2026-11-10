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
