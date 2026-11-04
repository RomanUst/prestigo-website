import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import PaymentPanel from '@/components/admin/PaymentPanel'
import { PaymentStateBadge, PAYMENT_STATE_BADGE, RefundFailedBadge } from '@/components/admin/PaymentStateBadge'
import { StatusBadge } from '@/components/admin/StatusBadge'

// ── fixtures ─────────────────────────────────────────────────────────────────

type PaymentOverrides = Record<string, unknown>

function makePayment(over: PaymentOverrides = {}) {
  return {
    mode: 'card_hold',
    state: 'authorized',
    currency: 'eur',
    amount_minor: 12000,
    hold_amount_minor: 12000,
    captured_amount_minor: 0,
    hold_at: null,
    capture_before: '2026-11-12T13:05:00Z',
    card_saved: true,
    last_payment_error: null,
    payment_retry_at: null,
    payment_retry_count: 0,
    recovery_link_url: null,
    pickup_at: '2026-11-20T09:00:00Z',
    status: 'confirmed',
    completed: false,
    booking_reference: 'PRE-CARD1',
    client_email: 'client@example.com',
    ...over,
  }
}

type EventRow = {
  id: number
  created_at: string
  kind: string
  amount_minor: number | null
  currency: string | null
  actor_type: 'system' | 'webhook' | 'admin'
  actor_id: string | null
  error_code: string | null
}

function makeEvent(id: number, over: Partial<EventRow> = {}): EventRow {
  return {
    id,
    created_at: '2026-11-01T10:00:00Z',
    kind: 'hold_authorized',
    amount_minor: 12000,
    currency: 'eur',
    actor_type: 'system',
    actor_id: null,
    error_code: null,
    ...over,
  }
}

function makeBody(over: { payment?: PaymentOverrides; events?: EventRow[]; allowed?: string[]; refund_failed?: boolean; events_total?: number } = {}) {
  const events = over.events ?? []
  return {
    payment: makePayment(over.payment),
    allowed_actions: over.allowed ?? [],
    refund_failed: over.refund_failed ?? false,
    events,
    events_total: over.events_total ?? events.length,
  }
}

function okResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }
}

function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okResponse(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ── Task 1: tracer, badge, facts, history ────────────────────────────────────

describe('PaymentPanel tracer (HOLD-07, PAYF-01)', () => {
  it('fetches the payment GET and renders the heading, the Hold active badge and the Prague-time expiry', async () => {
    const fetchMock = stubFetch(makeBody({ events: [makeEvent(1)] }))
    render(<PaymentPanel bookingId="b-1" />)

    expect(await screen.findByText('Hold active')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Payment' })).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/bookings/b-1/payment')

    expect(screen.getByText('Hold expires')).toBeDefined()
    expect(screen.getByText('Thu 12 Nov, 14:05 (Prague time)')).toBeDefined()
    expect(screen.queryByText('Hold planned for')).toBeNull()
    expect(screen.getByTestId('payment-panel')).toBeDefined()
  })

  it('refetches when refreshKey changes and does not poll', async () => {
    const fetchMock = stubFetch(makeBody())
    const { rerender } = render(<PaymentPanel bookingId="b-1" refreshKey={0} />)
    await screen.findByText('Hold active')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    rerender(<PaymentPanel bookingId="b-1" refreshKey={1} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('renders the UI-SPEC label for each of the 11 states and the raw value for an unknown one', () => {
    const expected: Record<string, string> = {
      none: 'No payment',
      checkout_pending: 'Awaiting card',
      card_saved: 'Card saved',
      placing_hold: 'Placing hold',
      authorized: 'Hold active',
      capturing: 'Capturing',
      captured: 'Captured',
      balance_due: 'Balance due',
      failed: 'Payment failed',
      expired: 'Hold expired',
      released: 'Released',
    }
    expect(Object.keys(PAYMENT_STATE_BADGE).sort()).toEqual(Object.keys(expected).sort())
    for (const [state, label] of Object.entries(expected)) {
      const { unmount } = render(<PaymentStateBadge state={state} />)
      expect(screen.getByText(label)).toBeDefined()
      unmount()
    }
    render(<PaymentStateBadge state="weird_state" />)
    expect(screen.getByText('weird_state')).toBeDefined()
  })

  it('maps the danger states to the danger family and the neutral states to the neutral family', () => {
    expect(PAYMENT_STATE_BADGE.failed.family).toBe('danger')
    expect(PAYMENT_STATE_BADGE.balance_due.family).toBe('danger')
    expect(PAYMENT_STATE_BADGE.none.family).toBe('neutral')
    expect(PAYMENT_STATE_BADGE.released.family).toBe('neutral')
    render(<RefundFailedBadge />)
    expect(screen.getByText('Refund failed')).toBeDefined()
  })

  it('does not render a fact whose value is null (card_saved without capture shows no Captured caption)', async () => {
    stubFetch(makeBody({
      payment: {
        state: 'card_saved', hold_amount_minor: null, capture_before: null,
        hold_at: '2026-11-17T09:00:00Z', captured_amount_minor: 0,
      },
    }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Card saved')
    expect(screen.queryByText('Captured')).toBeNull()
    expect(screen.queryByText('Held amount')).toBeNull()
    expect(screen.queryByText('Hold expires')).toBeNull()
    expect(screen.getByText('Hold planned for')).toBeDefined()
    expect(screen.getByText('Tue 17 Nov, 10:00')).toBeDefined()
    expect(screen.getByText('Card on file')).toBeDefined()
    expect(screen.getByText('Saved')).toBeDefined()
    expect(screen.getByText('Booked amount')).toBeDefined()
  })

  it('shows the captured, balance due, last error and automatic retry facts when they apply', async () => {
    stubFetch(makeBody({
      payment: {
        state: 'failed', captured_amount_minor: 0, last_payment_error: 'card_declined',
        payment_retry_at: '2026-11-12T13:05:00Z', payment_retry_count: 0,
      },
    }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findAllByText('Payment failed')
    expect(screen.getByText('Balance due')).toBeDefined()
    expect(screen.getByText('Last error')).toBeDefined()
    expect(screen.getByText(/Card declined/)).toBeDefined()
    expect(screen.getByText(/\(card_declined\)/)).toBeDefined()
    expect(screen.getByText('Automatic retry')).toBeDefined()
    expect(screen.getByText('Once, at Thu 12 Nov, 14:05')).toBeDefined()
  })

  it('says there are no more automatic retries when none is scheduled and falls back to Payment error for an unknown code', async () => {
    stubFetch(makeBody({
      payment: { state: 'failed', last_payment_error: 'some_new_code', payment_retry_at: null, payment_retry_count: 1 },
    }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findAllByText('Payment failed')
    expect(screen.getByText('No more automatic retries')).toBeDefined()
    expect(screen.getByText(/Payment error/)).toBeDefined()
    expect(screen.getByText(/\(some_new_code\)/)).toBeDefined()
  })

  it('shows the Captured fact once something was captured', async () => {
    stubFetch(makeBody({ payment: { state: 'captured', captured_amount_minor: 12000, completed: true } }))
    render(<PaymentPanel bookingId="b-1" />)
    // badge label + fact caption
    expect((await screen.findAllByText('Captured')).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('Balance due')).toBeNull()
  })

  it('shows 5 events newest first with Show all 7, then all 7 with Show fewer', async () => {
    const events = [7, 6, 5, 4, 3, 2, 1].map(id => makeEvent(id, {
      kind: id === 7 ? 'x_kind' : id === 6 ? 'admin_action' : 'hold_authorized',
      actor_type: id === 6 ? 'admin' : 'system',
      actor_id: id === 6 ? 'admin-user-1' : null,
      error_code: id === 5 ? 'card_declined' : null,
    }))
    stubFetch(makeBody({ events }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Payment history')

    const list = screen.getByRole('list', { name: 'Payment history' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('x_kind')
    expect(within(list).getAllByRole('listitem')[1].textContent).toContain('Operator action')
    expect(within(list).getAllByRole('listitem')[1].textContent).toContain('Admin')
    expect(within(list).getAllByRole('listitem')[1].textContent).toContain('admin-user-1')
    expect(within(list).getAllByRole('listitem')[2].textContent).toContain('card_declined')
    expect(screen.getByText('Append-only. Entries cannot be edited.')).toBeDefined()

    const toggle = screen.getByRole('button', { name: 'Show all 7' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(within(list).getAllByRole('listitem')).toHaveLength(7)
    const fewer = screen.getByRole('button', { name: 'Show fewer' })
    expect(fewer.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(fewer)
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
  })

  it('labels known kinds (Hold placed, Card setup failed) and shows System / Stripe actors with Prague time', async () => {
    stubFetch(makeBody({
      events: [
        makeEvent(2, { kind: 'setup_failed', actor_type: 'webhook', amount_minor: null, created_at: '2026-11-12T13:05:00Z' }),
        makeEvent(1, { kind: 'hold_authorized', actor_type: 'system' }),
      ],
    }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Card setup failed')
    expect(screen.getByText('Hold placed')).toBeDefined()
    expect(screen.getByText('Stripe')).toBeDefined()
    expect(screen.getByText('System')).toBeDefined()
    expect(screen.getByText('12 Nov, 14:05')).toBeDefined()
    // No Show all button for two rows
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('shows "Show all {n}" using events_total when the server holds more rows than were sent', async () => {
    const events = [5, 4, 3, 2, 1, 0].map(id => makeEvent(id))
    stubFetch(makeBody({ events, events_total: 6 }))
    render(<PaymentPanel bookingId="b-1" />)
    expect(await screen.findByRole('button', { name: 'Show all 6' })).toBeDefined()
  })

  it('shows "No payment events yet." for an empty ledger', async () => {
    stubFetch(makeBody({ events: [] }))
    render(<PaymentPanel bookingId="b-1" />)
    expect(await screen.findByText('No payment events yet.')).toBeDefined()
  })

  it('shows three skeleton rows while loading', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))
    render(<PaymentPanel bookingId="b-1" />)
    expect(screen.getAllByTestId('payment-skeleton-row')).toHaveLength(3)
  })

  it('shows the load error with a Reload button that refetches', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(okResponse({ error: 'boom' }, 500)))
      .mockImplementation(() => Promise.resolve(okResponse(makeBody())))
    vi.stubGlobal('fetch', fetchMock)
    render(<PaymentPanel bookingId="b-1" />)

    expect(await screen.findByText('Could not load payment details.')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Reload payment details' }))
    expect(await screen.findByText('Hold active')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Could not load payment details.')).toBeNull()
  })

  it('shows the load error when the request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    render(<PaymentPanel bookingId="b-1" />)
    expect(await screen.findByText('Could not load payment details.')).toBeDefined()
  })

  it('renders nothing for a pay_now booking without refund_failed', async () => {
    const fetchMock = stubFetch(makeBody({ payment: { mode: 'pay_now', state: 'none' } }))
    const { container } = render(<PaymentPanel bookingId="b-1" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('payment-skeleton-row')).toBeNull())
    expect(container.textContent).toBe('')
  })

  it('stays silent for a known non-card booking when the payment endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(okResponse({ error: 'x' }, 404))))
    const { container } = render(<PaymentPanel bookingId="b-1" paymentMode="pay_now" />)
    await waitFor(() => expect((fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 0))
    expect(container.textContent).toBe('')
  })
})

describe('StatusBadge after the BadgeShell extraction', () => {
  it('renders the same label and family tokens as before for every variant', () => {
    const cases: Array<[Parameters<typeof StatusBadge>[0]['variant'], string]> = [
      ['active', 'ok'], ['completed', 'ok'], ['cancelled', 'danger'], ['pending', 'warn'],
      ['confirmed', 'info'], ['assigned', 'teal'], ['en_route', 'violet'], ['on_location', 'amber'],
    ]
    for (const [variant, family] of cases) {
      const { container, unmount } = render(<StatusBadge variant={variant} label={`L-${variant}`} />)
      const shell = container.firstElementChild as HTMLElement
      expect(shell.textContent).toBe(`L-${variant}`)
      expect(shell.style.color).toBe(`var(--status-${family}-fg)`)
      expect(shell.style.backgroundColor).toBe(`var(--status-${family}-bg)`)
      unmount()
    }
  })
})
