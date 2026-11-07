import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import { formatMinor } from '@/lib/payments/money'
import { formatPragueFull } from '@/components/admin/PaymentPanel'
import { FeeCaseBadge, CashChip, hasPendingFeeCase } from '@/components/admin/FeeCaseBadge'
import {
  CancelBookingDialog,
  outcomeFor,
  situationOf,
  hoursBeforePickupLabel,
  type CancelDialogBooking,
} from '@/components/admin/CancelBookingDialog'

// Phase 89 plan 16: the admin cancel dialog (UI-SPEC Surface 3; D-20). Nothing is preselected, the outcome line
// is computed locally from the stored policy, and the request carries cancelled_by.

const NOW = new Date('2026-11-06T10:00:00Z')
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

// 12 h free window for a long trip, 50% proposed fee.
const POLICY_12H = {
  version: '2026-11-1',
  kmThreshold: 100,
  freeHoursShort: 1,
  freeHoursLong: 12,
  freeHoursHourly: 12,
  feePercent: 50,
}

function makeBooking(over: Partial<CancelDialogBooking> = {}): CancelDialogBooking {
  return {
    id: 'b1',
    booking_reference: 'PRE-CXL',
    booking_source: 'online',
    pickup_date: '2026-11-12',
    pickup_time: '10:00',
    pickup_utc: hoursFromNow(96),
    trip_type: 'transfer',
    distance_km: 150,
    cancel_policy: POLICY_12H,
    payment_intent_id: null,
    payment_mode: 'card_hold',
    payment_state: 'authorized',
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    capture_before: '2026-11-13T13:05:00Z',
    stripe_payment_method_id: 'pm_1',
    hold_payment_intent_id: 'pi_hold',
    amount_eur: 120,
    leg: null,
    linked_booking_id: null,
    outbound_amount_czk: null,
    return_amount_czk: null,
    linked_booking: null,
    ...over,
  }
}

const IN_TIME = { pickup_utc: hoursFromNow(96) }
const LATE = { pickup_utc: hoursFromNow(6) }

function reply(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

function renderDialog(booking: CancelDialogBooking | null) {
  const props = {
    onClose: vi.fn(),
    onCancelled: vi.fn(),
    onRefundFailed: vi.fn(),
    onCancelledWithoutCase: vi.fn(),
  }
  const view = render(<CancelBookingDialog booking={booking} {...props} />)
  return { ...view, props }
}

const choose = (name: 'The client' | 'Prestigo') => fireEvent.click(screen.getByRole('radio', { name: new RegExp(name) }))
const primary = () => screen.getAllByRole('button').filter(b => b.textContent !== 'Keep booking' && b.textContent !== 'Close' && b.getAttribute('aria-label') !== 'Close' && b.getAttribute('role') !== 'radio')[0]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CancelBookingDialog: nothing preselected (D-20, tracer)', () => {
  it('on open neither tile is selected, the primary is disabled and focus is on the first tile', () => {
    renderDialog(makeBooking())
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    for (const r of radios) expect(r.getAttribute('aria-checked')).not.toBe('true')
    expect(radios.every(r => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect((primary() as HTMLButtonElement).disabled).toBe(true)
    expect(document.activeElement).toBe(radios[0])
    const group = screen.getByRole('radiogroup')
    expect(group.getAttribute('aria-required')).toBe('true')
    // no outcome line before a choice
    expect(screen.queryByTestId('cancel-outcome')).toBeNull()
  })

  it('shows the heading, the Prague pickup line and the hours before pickup', () => {
    renderDialog(makeBooking({ pickup_utc: hoursFromNow(30) }))
    expect(screen.getByRole('heading', { name: 'Cancel booking PRE-CXL' })).toBeDefined()
    expect(screen.getByText(new RegExp(`Pickup ${formatPragueFull(hoursFromNow(30))}`))).toBeDefined()
    expect(screen.getByText(/30 h before pickup/)).toBeDefined()
    expect(screen.getByText('The client and the assigned driver are emailed.')).toBeDefined()
  })

  it('roving tabindex: only the first tile is tabbable until a choice, then only the selected one; arrows select', () => {
    renderDialog(makeBooking())
    const [first, second] = screen.getAllByRole('radio')
    expect(first.getAttribute('tabindex')).toBe('0')
    expect(second.getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(second.getAttribute('aria-checked')).toBe('true')
    expect(second.getAttribute('tabindex')).toBe('0')
    expect(first.getAttribute('tabindex')).toBe('-1')
    expect((primary() as HTMLButtonElement).disabled).toBe(false)
  })

  it('choosing a tile enables the primary and selects exactly one tile', () => {
    renderDialog(makeBooking())
    choose('The client')
    expect(screen.getByRole('radio', { name: /The client/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Prestigo/ }).getAttribute('aria-checked')).toBe('false')
    expect((primary() as HTMLButtonElement).disabled).toBe(false)
  })

  it('the primary does nothing and posts nothing while no choice is made', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderDialog(makeBooking())
    fireEvent.click(primary())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('CancelBookingDialog: the outcome table renders exactly one row', () => {
  it('the client, in time, authorized card: free, hold released', () => {
    renderDialog(makeBooking(IN_TIME))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Free. The hold is released and nothing is charged.')
    expect(primary().textContent).toBe('Cancel and release hold')
  })

  it('the client, late, authorized card: late sentence with captureBefore and the proposed fee', () => {
    renderDialog(makeBooking(LATE))
    choose('The client')
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain('Late. The booking is cancelled now. The hold stays in place')
    expect(text).toContain(`until ${formatPragueFull('2026-11-13T13:05:00Z')}`)
    expect(text).toContain(`(proposed ${formatMinor(6000, 'eur')})`)
    expect(primary().textContent).toBe('Cancel and decide the fee')
  })

  it('Prestigo on a late booking: the free row', () => {
    renderDialog(makeBooking(LATE))
    choose('Prestigo')
    expect(screen.getByRole('status').textContent).toContain('Free. The hold is released and nothing is charged.')
    expect(screen.getByRole('status').textContent).not.toContain('Late.')
    expect(primary().textContent).toBe('Cancel and release hold')
  })

  it('pay-now, paid: free refunds the full amount; late keeps it until the decision', () => {
    const base = { payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi_1', payment_amount_minor: null, amount_eur: 80 }
    const { unmount } = renderDialog(makeBooking({ ...base, ...IN_TIME }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain(`Free. The full ${formatMinor(8000, 'eur')} is refunded to the client.`)
    expect(primary().textContent).toBe(`Cancel and refund ${formatMinor(8000, 'eur')}`)
    unmount()

    renderDialog(makeBooking({ ...base, ...LATE }))
    choose('The client')
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain(`The ${formatMinor(8000, 'eur')} paid stays with Prestigo until you decide in the booking (proposed ${formatMinor(4000, 'eur')}). Waiving refunds it.`)
    expect(primary().textContent).toBe('Cancel and decide the fee')
  })

  it('cash booking with a saved card: free releases the card; late offers the charge up to the amount', () => {
    const base = { payment_mode: 'cash_guarantee', payment_state: 'card_saved', hold_payment_intent_id: null }
    const { unmount } = renderDialog(makeBooking({ ...base, ...IN_TIME }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Free. The saved card is released and nothing is charged.')
    expect(primary().textContent).toBe('Cancel booking')
    unmount()

    renderDialog(makeBooking({ ...base, ...LATE }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain(`You can charge the saved card up to ${formatMinor(12000, 'eur')} in the booking, or waive.`)
    expect(primary().textContent).toBe('Cancel and decide the fee')
  })

  it('no money collected (manual, partner): the status-only row, late or not', () => {
    const none = { payment_mode: null, payment_state: null, payment_intent_id: null }
    const { unmount } = renderDialog(makeBooking({ ...none, booking_source: 'manual', ...LATE }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Nothing was collected. Only the status changes.')
    expect(primary().textContent).toBe('Cancel booking')
    unmount()

    renderDialog(makeBooking({ booking_source: 'gnet', payment_intent_id: 'pi_gnet', payment_mode: null, ...LATE }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Nothing was collected. Only the status changes.')
  })

  it('card booking already captured: free refunds the captured amount; late keeps it', () => {
    const base = { payment_state: 'captured', payment_amount_minor: 9000 }
    const { unmount } = renderDialog(makeBooking({ ...base, ...IN_TIME }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain(`Free. ${formatMinor(9000, 'eur')} is refunded.`)
    expect(primary().textContent).toBe(`Cancel and refund ${formatMinor(9000, 'eur')}`)
    unmount()

    renderDialog(makeBooking({ ...base, ...LATE }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain(`Late. The booking is cancelled now. ${formatMinor(9000, 'eur')} stays until you decide.`)
    expect(primary().textContent).toBe('Cancel and decide the fee')
  })

  it('switching the choice swaps the single row (never two sentences at once)', () => {
    renderDialog(makeBooking(LATE))
    choose('The client')
    expect(screen.getAllByTestId('cancel-outcome')).toHaveLength(1)
    choose('Prestigo')
    expect(screen.getAllByTestId('cancel-outcome')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toContain('Free.')
  })

  it('a card row with no card on file (released, nothing saved) is the status-only row, not a fee', () => {
    renderDialog(makeBooking({ payment_state: 'released', ...LATE }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Nothing was collected. Only the status changes.')
  })

  it('a round-trip leg keeps the per-leg refund and paired-booking sentences', () => {
    renderDialog(makeBooking({
      payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi_rt', amount_eur: 200,
      leg: 'return', trip_type: 'round_trip', linked_booking_id: null, outbound_amount_czk: 5000, return_amount_czk: 4500,
      linked_booking: { booking_reference: 'PRE-OUT' }, ...IN_TIME,
    }))
    expect(screen.getByText(/The paired outbound booking PRE-OUT will NOT be affected and remains active\./)).toBeDefined()
    choose('The client')
    expect(screen.getByText(/Refund: about 4500 CZK for this leg only/)).toBeDefined()
  })
})

describe('CancelBookingDialog: legacy booking with no stored policy (D-18)', () => {
  it('uses the legacy rule: free up to one hour before pickup, whatever the distance', () => {
    const legacy = { cancel_policy: null }
    const { unmount } = renderDialog(makeBooking({ ...legacy, pickup_utc: hoursFromNow(2) }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Free.')
    unmount()

    renderDialog(makeBooking({ ...legacy, pickup_utc: hoursFromNow(0.5) }))
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Late.')
  })

  it('after the pickup time an operator cancel for the client counts as late, and the hours line says so', () => {
    renderDialog(makeBooking({ pickup_utc: hoursFromNow(-3) }))
    expect(screen.getByText(/pickup time passed/)).toBeDefined()
    choose('The client')
    expect(screen.getByRole('status').textContent).toContain('Late.')
  })
})

describe('CancelBookingDialog: pure helpers', () => {
  it('outcomeFor is Prestigo-free and situationOf maps each payment situation', () => {
    expect(outcomeFor(makeBooking(LATE), 'prestigo', NOW.getTime()).late).toBe(false)
    expect(outcomeFor(makeBooking(LATE), 'client', NOW.getTime()).late).toBe(true)
    expect(situationOf(makeBooking()).situation).toBe('card')
    expect(situationOf(makeBooking({ payment_mode: 'cash_guarantee' })).situation).toBe('cash')
    expect(situationOf(makeBooking({ payment_state: 'balance_due' })).situation).toBe('card_collected')
    expect(situationOf(makeBooking({ payment_mode: 'pay_now', payment_intent_id: 'pi' })).situation).toBe('pay_now')
    expect(situationOf(makeBooking({ payment_mode: null, payment_intent_id: null })).situation).toBe('none')
  })

  it('hoursBeforePickupLabel', () => {
    expect(hoursBeforePickupLabel(null, 0)).toBeNull()
    expect(hoursBeforePickupLabel(1000, 2000)).toBe('pickup time passed')
    expect(hoursBeforePickupLabel(1_800_000, 0)).toBe('less than 1 h before pickup')
    expect(hoursBeforePickupLabel(5 * 3_600_000 + 10, 0)).toBe('5 h before pickup')
  })
})

describe('CancelBookingDialog: submit and errors', () => {
  it('posts { id, cancelled_by } and reports the answer', async () => {
    const fetchMock = vi.fn().mockImplementation(() => reply(200, { ok: true, released: true }))
    vi.stubGlobal('fetch', fetchMock)
    const booking = makeBooking(IN_TIME)
    const { props } = renderDialog(booking)
    choose('Prestigo')
    fireEvent.click(primary())
    await waitFor(() => expect(props.onCancelled).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/bookings/cancel')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ id: 'b1', cancelled_by: 'prestigo' })
    expect(props.onCancelled).toHaveBeenCalledWith(booking, { released: true, late: false })
  })

  it('a round-trip leg is posted without a leg (the server derives it) and the late answer is reported', async () => {
    const fetchMock = vi.fn().mockImplementation(() => reply(200, { ok: true, late: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { props } = renderDialog(makeBooking({
      payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi', leg: 'outbound', trip_type: 'round_trip',
      linked_booking_id: null, outbound_amount_czk: 3000, return_amount_czk: 3000, ...LATE,
    }))
    choose('The client')
    fireEvent.click(primary())
    await waitFor(() => expect(props.onCancelled).toHaveBeenCalled())
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      id: 'b1', cancelled_by: 'client',
    })
    expect(props.onCancelled.mock.calls[0][1]).toEqual({ released: false, late: true })
  })

  it('while the request runs the button reads Cancelling… and the dialog cannot be dismissed', async () => {
    let resolve!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(r => { resolve = r })))
    const { props } = renderDialog(makeBooking(IN_TIME))
    choose('The client')
    fireEvent.click(primary())
    expect(await screen.findByRole('button', { name: /Cancelling…/ })).toBeDefined()
    expect((screen.getByRole('button', { name: /Cancelling…/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Keep booking' }))
    expect(props.onClose).not.toHaveBeenCalled()
    resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
    await waitFor(() => expect(props.onCancelled).toHaveBeenCalled())
  })

  it.each([
    [409, { error: 'payment_busy' }, 'Payment is being processed. Wait a moment and try again.'],
    [409, { error: 'status_conflict', currentStatus: 'completed' }, 'This booking was just changed to Completed by the driver. Reload to see the latest state.'],
    [401, { error: 'Unauthorized' }, 'Your session has ended. Sign in again.'],
    [403, { error: 'Forbidden' }, 'Your session has ended. Sign in again.'],
    [500, { error: 'DB update failed' }, 'Could not cancel the booking. Nothing was changed. Try again.'],
    [422, { error: "Cannot cancel a booking with status 'completed'" }, 'Could not cancel the booking. Nothing was changed. Try again.'],
  ])('answer %s shows its line and keeps the dialog open', async (status, body, line) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => reply(status, body)))
    const { props } = renderDialog(makeBooking(IN_TIME))
    choose('The client')
    fireEvent.click(primary())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(line)
    expect(props.onCancelled).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
    // retry is possible
    expect((primary() as HTMLButtonElement).disabled).toBe(false)
  })

  it('a network failure shows the generic line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderDialog(makeBooking(IN_TIME))
    choose('The client')
    fireEvent.click(primary())
    expect((await screen.findByRole('alert')).textContent).toContain('Could not cancel the booking. Nothing was changed.')
  })

  it('502 refund_failed with cancelled: true hands over to the row banner and shows no error line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => reply(502, { error: 'refund_failed', cancelled: true, amount_minor: 12000, currency: 'eur' })))
    const booking = makeBooking({ payment_mode: 'pay_now', payment_state: 'none', payment_intent_id: 'pi', ...IN_TIME })
    const { props } = renderDialog(booking)
    choose('Prestigo')
    fireEvent.click(primary())
    await waitFor(() => expect(props.onRefundFailed).toHaveBeenCalledWith(booking))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(props.onCancelled).not.toHaveBeenCalled()
  })

  it('500 with cancelled: true says the booking was cancelled, reports it and blocks a second cancel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => reply(500, { error: 'DB update failed', cancelled: true })))
    const booking = makeBooking(LATE)
    const { props } = renderDialog(booking)
    choose('The client')
    fireEvent.click(primary())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The booking was cancelled')
    expect(props.onCancelledWithoutCase).toHaveBeenCalledWith(booking)
    expect((primary() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2)
  })

  it('reopening starts clean: no choice carried over from the last booking', () => {
    const { rerender, props } = renderDialog(makeBooking())
    choose('Prestigo')
    rerender(<CancelBookingDialog booking={null} {...props} />)
    rerender(<CancelBookingDialog booking={makeBooking({ id: 'b2' })} {...props} />)
    for (const r of screen.getAllByRole('radio')) expect(r.getAttribute('aria-checked')).toBe('false')
    expect((primary() as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('FeeCaseBadge and CashChip', () => {
  it('Fee decision is a danger-family badge with text and dot, no age', () => {
    const { container } = render(<FeeCaseBadge />)
    expect(screen.getByText('Fee decision')).toBeDefined()
    const style = (container.firstElementChild as HTMLElement).getAttribute('style') ?? ''
    expect(style).toContain('var(--status-danger-bg)')
    expect(style).toContain('var(--status-danger-border)')
    expect(container.textContent).toBe('Fee decision')
  })

  it('Cash is a neutral chip', () => {
    const { container } = render(<CashChip />)
    expect(container.textContent).toBe('Cash')
    expect((container.firstElementChild as HTMLElement).getAttribute('style') ?? '').toContain('var(--status-neutral-bg)')
  })

  it('only a pending case of a non-partner booking shows the badge', () => {
    expect(hasPendingFeeCase({ fee_case_status: 'pending', booking_source: 'online' })).toBe(true)
    expect(hasPendingFeeCase({ fee_case_status: 'pending' })).toBe(true)
    expect(hasPendingFeeCase({ fee_case_status: 'pending', booking_source: 'gnet' })).toBe(false)
    for (const status of ['charged', 'waived', null, undefined]) {
      expect(hasPendingFeeCase({ fee_case_status: status, booking_source: 'online' })).toBe(false)
    }
  })

  it('FeeCaseBadge is built on BadgeShell', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/admin/FeeCaseBadge.tsx'), 'utf8')
    expect(src).toContain('BadgeShell')
  })
})

describe('CancelBookingDialog: source rules', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/admin/CancelBookingDialog.tsx'), 'utf8')

  it('types no euro sign (amounts go through formatMinor)', () => {
    expect(src.split('€').length - 1).toBe(0)
  })

  it('has no default value for who cancelled', () => {
    expect(src).toMatch(/useState<CancelledBy \| null>\(null\)/)
  })
})
