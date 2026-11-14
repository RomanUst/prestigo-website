// Phase 90 plan 06 (DISP-02): useBookingMoves.requestMove turns planMove outcomes into behaviour.
import { useEffect } from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { useBookingMoves, type BookingMovesApi } from '@/components/admin/useBookingMoves'
import { statusConflictMessage } from '@/components/admin/statusConflict'
import type { AdminBooking } from '@/components/admin/bookingTypes'

// DriverAssignmentSection talks to three endpoints; stub it so the picker tests control onAssigned directly.
vi.mock('@/components/admin/DriverAssignmentSection', () => ({
  DriverAssignmentSection: (props: { bookingId: string; bookingStatus: string; onAssigned?: (s: 'assigned') => void }) => (
    <div data-testid="driver-section" data-booking={props.bookingId} data-status={props.bookingStatus}>
      <button type="button" onClick={() => props.onAssigned?.('assigned')}>mock-assign</button>
    </div>
  ),
}))

type Reply = { ok: boolean; status?: number; body?: unknown }

interface Deferred {
  resolve: (r?: Reply) => void
}

// A fetch stub whose answers the test releases by hand, so "before the answer" can be asserted.
function stubFetchDeferred() {
  const pending: Deferred[] = []
  const fetchMock = vi.fn().mockImplementation(() => {
    return new Promise(resolve => {
      pending.push({
        resolve: (r: Reply = { ok: true, status: 200, body: { ok: true } }) =>
          resolve({
            ok: r.ok,
            status: r.status ?? (r.ok ? 200 : 500),
            json: () => Promise.resolve(r.body ?? {}),
          }),
      })
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, pending }
}

function stubFetchNow(reply: Reply = { ok: true, status: 200, body: { ok: true } }) {
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: reply.ok,
      status: reply.status ?? (reply.ok ? 200 : 500),
      json: () => Promise.resolve(reply.body ?? {}),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function booking(over: Partial<AdminBooking>): AdminBooking {
  return {
    id: 'b-1',
    booking_reference: 'PRE-1',
    booking_source: 'online',
    status: 'en_route',
    payment_mode: null,
    payment_intent_id: null,
    payment_amount_minor: null,
    payment_currency: null,
    ...over,
  } as AdminBooking
}

const CARD_HOLD_EN_ROUTE = booking({
  id: 'b-1',
  booking_reference: 'PRE-1',
  status: 'en_route',
  payment_mode: 'card_hold',
  payment_amount_minor: 8500,
  payment_currency: 'eur',
})
const EN_ROUTE = booking({ id: 'b-2', booking_reference: 'PRE-2', status: 'en_route' })
const CONFIRMED = booking({ id: 'b-3', booking_reference: 'PRE-3', status: 'confirmed' })
const GNET_ON_BOARD = booking({ id: 'b-4', booking_reference: 'GN-4', status: 'on_board', booking_source: 'gnet', payment_mode: 'card_hold' })
const ON_LOCATION = booking({ id: 'b-5', booking_reference: 'PRE-5', status: 'on_location' })

interface Harness {
  api: () => BookingMovesApi
  onPatched: ReturnType<typeof vi.fn>
  onStale: ReturnType<typeof vi.fn>
  anyOpen: () => boolean
}

function Probe({ onPatched, onStale, onApi }: {
  onPatched: (id: string, patch: Partial<AdminBooking>) => void
  onStale: (id: string) => void
  onApi: (api: BookingMovesApi) => void
}) {
  const api = useBookingMoves({ onPatched, onStale })
  // the hook returns a fresh object every render: hand over the latest one after each commit
  useEffect(() => { onApi(api) })
  return <div data-testid="probe" data-any-open={String(api.anyDialogOpen)}>{api.dialogs}</div>
}

function setup(): Harness {
  const onPatched = vi.fn()
  const onStale = vi.fn()
  let latest: BookingMovesApi | null = null
  render(<Probe onPatched={onPatched} onStale={onStale} onApi={a => { latest = a }} />)
  return {
    api: () => latest as unknown as BookingMovesApi,
    onPatched,
    onStale,
    anyOpen: () => screen.getByTestId('probe').getAttribute('data-any-open') === 'true',
  }
}

let alertSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  alertSpy.mockRestore()
})

function patchBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(c => (c[1] as RequestInit | undefined)?.method === 'PATCH')
    .map(c => JSON.parse((c[1] as RequestInit).body as string))
}

describe('requestMove: completion of a card_hold booking (tracer)', () => {
  it('opens the capture dialog, sends nothing yet, and completes only from its primary button', async () => {
    const { fetchMock, pending } = stubFetchDeferred()
    const h = setup()

    act(() => h.api().requestMove(CARD_HOLD_EN_ROUTE, 'completed', 'board'))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('Complete trip PRE-1?')).toBeDefined()
    expect(h.anyOpen()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(patchBodies(fetchMock)).toEqual([{ id: 'b-1', status: 'completed', expected_status: 'en_route' }])

    // onPatched only fires after the server answered
    expect(h.onPatched).not.toHaveBeenCalled()
    await act(async () => { pending[0].resolve() })
    await waitFor(() => expect(h.onPatched).toHaveBeenCalledWith('b-1', { status: 'completed' }))
    expect(h.onPatched).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Complete trip PRE-1?')).toBeNull()
    expect(h.anyOpen()).toBe(false)
  })

  it('bumps the payment refresh counter once the capture is accepted, not before (WR-04)', async () => {
    const { pending } = stubFetchDeferred()
    const h = setup()
    expect(h.api().paymentBumpFor('b-1')).toBe(0)
    act(() => h.api().requestMove(CARD_HOLD_EN_ROUTE, 'completed', 'board'))
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }))
    await waitFor(() => expect(pending.length).toBe(1))
    expect(h.api().paymentBumpFor('b-1')).toBe(0)
    await act(async () => { pending[0].resolve() })
    await waitFor(() => expect(h.onPatched).toHaveBeenCalled())
    expect(h.api().paymentBumpFor('b-1')).toBe(1)
  })

  it('closing the complete dialog with "Keep open" sends nothing and changes nothing', () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestMove(CARD_HOLD_EN_ROUTE, 'completed', 'board'))
    fireEvent.click(screen.getByRole('button', { name: 'Keep open' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.onPatched).not.toHaveBeenCalled()
    expect(h.anyOpen()).toBe(false)
  })

  it('a 409 inside the complete dialog refetches the view through onStale and sets the conflict line', async () => {
    stubFetchNow({ ok: false, status: 409, body: { error: 'status_conflict', currentStatus: 'completed' } })
    const h = setup()
    act(() => h.api().requestMove(CARD_HOLD_EN_ROUTE, 'completed', 'board'))
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }))
    await waitFor(() => expect(h.onStale).toHaveBeenCalledWith('b-1'))
    expect(h.api().conflictFor('b-1')).toBe(statusConflictMessage('completed'))
    expect(h.onPatched).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })
})

describe('requestMove: moves without a money effect', () => {
  it('applies at once through one PATCH with expected_status, never optimistically, then toasts', async () => {
    const { fetchMock, pending } = stubFetchDeferred()
    const h = setup()

    act(() => h.api().requestMove(EN_ROUTE, 'on_location', 'board'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(patchBodies(fetchMock)).toEqual([{ id: 'b-2', status: 'on_location', expected_status: 'en_route' }])
    expect(h.onPatched).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()

    await act(async () => { pending[0].resolve() })
    await waitFor(() => expect(h.onPatched).toHaveBeenCalledWith('b-2', { status: 'on_location' }))
    const toast = screen.getByRole('status')
    expect(toast.getAttribute('data-testid')).toBe('move-toast')
    expect(toast.textContent).toBe('PRE-2 moved to On Location')
  })

  it('the toast mounts only while visible and is gone after about 4 seconds', async () => {
    vi.useFakeTimers()
    stubFetchNow()
    const h = setup()
    expect(screen.queryByRole('status')).toBeNull()

    act(() => h.api().requestMove(EN_ROUTE, 'on_location', 'board'))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status').textContent).toBe('PRE-2 moved to On Location')

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.queryByRole('status')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a 409 status_conflict shows the conflict line, refetches through onStale, applies nothing and never alerts', async () => {
    stubFetchNow({ ok: false, status: 409, body: { error: 'status_conflict', currentStatus: 'on_board' } })
    const h = setup()
    act(() => h.api().requestMove(EN_ROUTE, 'on_location', 'board'))
    await waitFor(() => expect(h.onStale).toHaveBeenCalledTimes(1))
    expect(h.onStale).toHaveBeenCalledWith('b-2')
    expect(h.api().conflictFor('b-2')).toBe(statusConflictMessage('on_board'))
    expect(h.onPatched).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a GNet partner booking completes directly: no dialog, one PATCH, toast', async () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestMove(GNET_ON_BOARD, 'completed', 'board'))
    expect(screen.queryByText(/Complete trip/)).toBeNull()
    expect(h.anyOpen()).toBe(false)
    await waitFor(() => expect(h.onPatched).toHaveBeenCalledWith('b-4', { status: 'completed' }))
    expect(patchBodies(fetchMock)).toEqual([{ id: 'b-4', status: 'completed', expected_status: 'on_board' }])
    expect(screen.getByRole('status').textContent).toBe('GN-4 moved to Completed')
  })

  it('a rejected move (confirmed -> completed) sends nothing and shows nothing', async () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestMove(CONFIRMED, 'completed', 'board'))
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.onPatched).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
    expect(h.anyOpen()).toBe(false)
  })
})

describe('requestMove: driver picker (D-11)', () => {
  it('a move to assigned opens the picker; assigning reports the row and a refetch, then closes', () => {
    const fetchMock = stubFetchNow()
    const h = setup()

    act(() => h.api().requestMove(CONFIRMED, 'assigned', 'board'))
    expect(screen.getByText('Assign a driver to PRE-3')).toBeDefined()
    const section = screen.getByTestId('driver-section')
    expect(section.getAttribute('data-booking')).toBe('b-3')
    expect(section.getAttribute('data-status')).toBe('confirmed')
    expect(h.anyOpen()).toBe(true)
    // choosing a driver is the assign route's job: the move itself sends no PATCH
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'mock-assign' }))
    expect(h.onPatched).toHaveBeenCalledWith('b-3', { status: 'assigned' })
    expect(h.onStale).toHaveBeenCalledWith('b-3')
    expect(screen.queryByText('Assign a driver to PRE-3')).toBeNull()
    expect(h.anyOpen()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('closing with Escape or the close button changes nothing and sends nothing', () => {
    const fetchMock = stubFetchNow()
    const h = setup()

    act(() => h.api().requestMove(CONFIRMED, 'assigned', 'board'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Assign a driver to PRE-3')).toBeNull()

    act(() => h.api().requestMove(CONFIRMED, 'assigned', 'board'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Assign a driver to PRE-3')).toBeNull()

    expect(h.onPatched).not.toHaveBeenCalled()
    expect(h.onStale).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the panel select reaches the picker too (requestStatusChange delegates to requestMove)', () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestStatusChange(CONFIRMED, 'assigned'))
    expect(screen.getByText('Assign a driver to PRE-3')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('requestMove: cancel and no-show routing', () => {
  const NO_MONEY_CONFIRMED = booking({ id: 'b-6', booking_reference: 'PRE-6', status: 'confirmed' })
  const CASH_CONFIRMED = booking({ id: 'b-7', booking_reference: 'PRE-7', status: 'confirmed', payment_mode: 'cash_guarantee' })
  const GNET_PLAIN = booking({ id: 'b-8', booking_reference: 'GN-8', status: 'assigned', booking_source: 'gnet' })

  it('the board always opens the cancel dialog, even without money, and sends no PATCH', () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestMove(NO_MONEY_CONFIRMED, 'cancelled', 'board'))
    expect(screen.getByRole('radiogroup')).toBeDefined()
    expect(h.anyOpen()).toBe(true)
    expect(patchBodies(fetchMock)).toEqual([])
  })

  it('the panel keeps the Phase 89 path: no money is one status PATCH', async () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestStatusChange(NO_MONEY_CONFIRMED, 'cancelled'))
    await waitFor(() => expect(h.onPatched).toHaveBeenCalledWith('b-6', { status: 'cancelled' }))
    expect(patchBodies(fetchMock)).toEqual([{ id: 'b-6', status: 'cancelled', expected_status: 'confirmed' }])
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('the panel opens the cancel dialog for a cash booking and sends no PATCH', () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestStatusChange(CASH_CONFIRMED, 'cancelled'))
    expect(screen.getByRole('radiogroup')).toBeDefined()
    expect(patchBodies(fetchMock)).toEqual([])
  })

  it('a GNet partner cancel goes through the dialog with the partner copy and no refund sentence', () => {
    stubFetchNow()
    const h = setup()
    act(() => h.api().requestMove(GNET_PLAIN, 'cancelled', 'board'))
    expect(screen.getByText(/received from a GNet partner/)).toBeDefined()
    expect(screen.queryByText(/refunded/i)).toBeNull()
    expect(screen.queryByText(/Cancel and refund/i)).toBeNull()
  })

  it('a move to no_show opens the confirmation modal and sends no PATCH', () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestMove(ON_LOCATION, 'no_show', 'board'))
    expect(screen.getByRole('heading', { name: 'Confirm no-show' })).toBeDefined()
    expect(h.anyOpen()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('requestMove: double submit and anyDialogOpen', () => {
  it('while the PATCH for a booking is in flight a second request for it sends nothing', async () => {
    const { fetchMock, pending } = stubFetchDeferred()
    const h = setup()

    act(() => h.api().requestMove(EN_ROUTE, 'on_location', 'board'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(h.api().isUpdating('b-2')).toBe(true)

    act(() => h.api().requestMove(EN_ROUTE, 'cancelled', 'board'))
    act(() => h.api().requestMove(EN_ROUTE, 'on_location', 'board'))
    act(() => h.api().requestStatusChange(EN_ROUTE, 'on_location'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('radiogroup')).toBeNull()

    await act(async () => { pending[0].resolve() })
    await waitFor(() => expect(h.onPatched).toHaveBeenCalledTimes(1))
    expect(h.api().isUpdating('b-2')).toBe(false)
  })

  it('two requests in the same tick send one PATCH', async () => {
    const { fetchMock, pending } = stubFetchDeferred()
    const h = setup()
    act(() => {
      h.api().requestMove(EN_ROUTE, 'on_location', 'board')
      h.api().requestMove(EN_ROUTE, 'on_location', 'board')
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => { pending[0].resolve() })
    await waitFor(() => expect(h.onPatched).toHaveBeenCalledTimes(1))
  })

  it('while the complete dialog for a booking is open, another move for it does nothing', () => {
    const fetchMock = stubFetchNow()
    const h = setup()
    act(() => h.api().requestMove(CARD_HOLD_EN_ROUTE, 'completed', 'board'))
    act(() => h.api().requestMove(CARD_HOLD_EN_ROUTE, 'cancelled', 'board'))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByText('Complete trip PRE-1?')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
    // a different booking is not blocked
    act(() => h.api().requestMove(CONFIRMED, 'assigned', 'board'))
    expect(screen.getByText('Assign a driver to PRE-3')).toBeDefined()
  })

  it('anyDialogOpen is true for each of the four dialogs and false after each closes', () => {
    stubFetchNow()
    const h = setup()
    const cases: Array<[AdminBooking, string, string]> = [
      [ON_LOCATION, 'no_show', 'Confirm no-show'],
      [booking({ id: 'b-9', booking_reference: 'PRE-9', status: 'confirmed' }), 'cancelled', 'Cancel booking PRE-9'],
      [CARD_HOLD_EN_ROUTE, 'completed', 'Complete trip PRE-1?'],
      [CONFIRMED, 'assigned', 'Assign a driver to PRE-3'],
    ]
    expect(h.anyOpen()).toBe(false)
    for (const [b, to, title] of cases) {
      act(() => h.api().requestMove(b, to, 'board'))
      expect(screen.getByRole('heading', { name: title })).toBeDefined()
      expect(h.anyOpen()).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('heading', { name: title })).toBeNull()
      expect(h.anyOpen()).toBe(false)
    }
  })
})
