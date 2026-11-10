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
