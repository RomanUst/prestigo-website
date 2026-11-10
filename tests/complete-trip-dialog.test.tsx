// Phase 90 plan 04 (D-12): the effect-stating confirmation in front of completing a trip.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CompleteTripDialog } from '@/components/admin/CompleteTripDialog'
import { statusConflictMessage } from '@/components/admin/statusConflict'
import { formatMinor } from '@/lib/payments/money'
import type { CompleteEffect } from '@/components/admin/bookingMoves'

type Reply = { ok: boolean; status?: number; body?: unknown }

function stubFetch(reply: Reply | Promise<Reply> | 'reject' = { ok: true, status: 200, body: { ok: true } }) {
  const fetchMock = vi.fn().mockImplementation(() => {
    if (reply === 'reject') return Promise.reject(new Error('network'))
    return Promise.resolve(reply).then(r => ({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: () => Promise.resolve(r.body ?? {}),
    }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const BOOKING = { id: 'b-1', booking_reference: 'PRG-1', status: 'on_board' }
const CAPTURE: CompleteEffect = { kind: 'capture', amountMinor: 8500, currency: 'eur' }

function setup(effect: CompleteEffect | null = CAPTURE, booking: typeof BOOKING | null = BOOKING) {
  const onClose = vi.fn()
  const onCompleted = vi.fn()
  const onConflict = vi.fn()
  const view = render(
    <CompleteTripDialog booking={booking} effect={effect} onClose={onClose} onCompleted={onCompleted} onConflict={onConflict} />,
  )
  return { onClose, onCompleted, onConflict, ...view }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CompleteTripDialog copy', () => {
  it('capture: names the booking and the amount from formatMinor', () => {
    setup()
    expect(screen.getByText('Complete trip PRG-1?')).toBeDefined()
    const sentence = screen.getByText(new RegExp(`${formatMinor(8500, 'eur').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*from the client's card`))
    expect(sentence).toBeDefined()
  })

  it('capture without an amount: says the held amount is captured, no number', () => {
    setup({ kind: 'capture', amountMinor: null, currency: null })
    expect(screen.getByText("Completing captures the held amount from the client's card.")).toBeDefined()
  })

  it('cash: no card is charged and the driver collects cash', () => {
    setup({ kind: 'cash' })
    expect(screen.getByText('No card is charged. The driver collects cash; confirm it in the payment panel.')).toBeDefined()
  })

  it('renders nothing without a booking or an effect', () => {
    const a = setup(CAPTURE, null)
    expect(a.container.innerHTML).toBe('')
    a.unmount()
    const b = setup(null)
    expect(b.container.innerHTML).toBe('')
  })
})

describe('CompleteTripDialog actions', () => {
  it('sends one PATCH with expected_status and calls onCompleted once on success', async () => {
    const fetchMock = stubFetch()
    const { onCompleted, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }))
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1))
    expect(onCompleted).toHaveBeenCalledWith('b-1')
    expect(onClose).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/bookings')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ id: 'b-1', status: 'completed', expected_status: 'on_board' })
  })

  it('a second click while in flight sends nothing', async () => {
    let release!: (r: Reply) => void
    const gate = new Promise<Reply>(res => { release = res })
    const fetchMock = stubFetch(gate)
    const { onCompleted } = setup()
    const primary = screen.getByRole('button', { name: 'Complete trip' })
    fireEvent.click(primary)
    fireEvent.click(primary)
    fireEvent.click(screen.getByRole('button', { name: 'Completing…' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release({ ok: true, status: 200, body: {} })
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('409 status_conflict shows the shared conflict copy, calls onConflict and never onCompleted', async () => {
    stubFetch({ ok: false, status: 409, body: { error: 'status_conflict', currentStatus: 'on_board' } })
    const { onCompleted, onConflict } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(statusConflictMessage('on_board'))
    expect(onConflict).toHaveBeenCalledWith('b-1')
    expect(onCompleted).not.toHaveBeenCalled()
  })

  it('another failure shows the generic line and keeps the dialog open', async () => {
    stubFetch({ ok: false, status: 500, body: { error: 'boom' } })
    const { onCompleted, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not complete the trip. Reload and try again.')
    expect(screen.getByText('Complete trip PRG-1?')).toBeDefined()
    expect(onCompleted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a network failure shows the generic line', async () => {
    stubFetch('reject')
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not complete the trip. Reload and try again.')
  })

  it('"Keep open" calls onClose and sends nothing', () => {
    const fetchMock = stubFetch()
    const { onClose, onCompleted } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep open' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCompleted).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
