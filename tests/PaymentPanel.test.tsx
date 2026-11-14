import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { formatMinor } from '@/lib/payments/money'
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

  it('renders the UI-SPEC label for each of the 12 states and the raw value for an unknown one', () => {
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
      cash_settled: 'Paid in cash',
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

// ── Task 2: server-driven actions, confirm modals, result lines, banners ─────

const eur = (minor: number) => formatMinor(minor, 'eur')

function stubRouted(getBody: unknown, post?: () => Promise<unknown>) {
  const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return post ? post() : Promise.resolve(okResponse({ outcome: 'ok' }))
    return Promise.resolve(okResponse(getBody))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const posts = (m: ReturnType<typeof vi.fn>) => m.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
const gets = (m: ReturnType<typeof vi.fn>) => m.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== 'POST')

async function openAction(name: string | RegExp) {
  const btn = await screen.findByRole('button', { name })
  fireEvent.click(btn)
  return screen.findByRole('dialog')
}

describe('PaymentPanel actions come from allowed_actions only (HOLD-07)', () => {
  it('renders exactly the allowed actions, with the retry label depending on completion', async () => {
    stubFetch(makeBody({ allowed: ['capture', 'retry', 'send_link', 'release', 'waive'], payment: { completed: false } }))
    const { unmount } = render(<PaymentPanel bookingId="b-1" />)
    expect(await screen.findByRole('button', { name: 'Capture' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Place hold now' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Send payment link' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Release hold' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Waive balance' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Retry charge' })).toBeNull()
    unmount()

    stubFetch(makeBody({ allowed: ['retry'], payment: { completed: true, state: 'failed' } }))
    render(<PaymentPanel bookingId="b-1" />)
    expect(await screen.findByRole('button', { name: 'Retry charge' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Capture' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Release hold' })).toBeNull()
  })

  it('shows "No actions available in this state." when the list is empty', async () => {
    stubFetch(makeBody({ allowed: [] }))
    render(<PaymentPanel bookingId="b-1" />)
    expect(await screen.findByText('No actions available in this state.')).toBeDefined()
  })

  it('capture: nothing is sent on the first click; the modal focuses the dismiss button; confirm POSTs { action } only', async () => {
    const fetchMock = stubRouted(makeBody({ allowed: ['capture'], payment: { completed: true, state: 'authorized' } }))
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Capture')

    expect(posts(fetchMock)).toHaveLength(0)
    expect(within(dialog).getByRole('heading', { name: 'Capture payment' })).toBeDefined()
    expect(within(dialog).getByText(/PRE-CARD1/)).toBeDefined()
    const dismiss = within(dialog).getByRole('button', { name: "Don't capture" })
    await waitFor(() => expect(document.activeElement).toBe(dismiss))
    const primary = within(dialog).getByRole('button', { name: `Capture ${eur(12000)}` })
    expect(primary.getAttribute('style') ?? '').toContain('--admin-accent')
    expect(primary.getAttribute('style') ?? '').not.toContain('--admin-danger-solid')

    fireEvent.click(primary)
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    const [url, init] = posts(fetchMock)[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/bookings/b-1/payment')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'capture' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const status = await screen.findByText('Done. The payment history is updated.')
    expect(status.getAttribute('role')).toBe('status')
    expect(gets(fetchMock).length).toBeGreaterThanOrEqual(2)
  })

  it('dismissing the modal sends nothing', async () => {
    const fetchMock = stubRouted(makeBody({ allowed: ['capture'], payment: { completed: true } }))
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Capture')
    fireEvent.click(within(dialog).getByRole('button', { name: "Don't capture" }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts(fetchMock)).toHaveLength(0)
  })

  it('place hold now (before completion) and retry charge (after completion) use their own copy', async () => {
    stubRouted(makeBody({ allowed: ['retry'], payment: { completed: false, state: 'card_saved' } }))
    const first = render(<PaymentPanel bookingId="b-1" />)
    let dialog = await openAction('Place hold now')
    expect(within(dialog).getByRole('heading', { name: 'Place hold now' })).toBeDefined()
    expect(within(dialog).getByRole('button', { name: 'Place hold' })).toBeDefined()
    expect(within(dialog).getByRole('button', { name: "Don't place hold" })).toBeDefined()
    first.unmount()

    stubRouted(makeBody({ allowed: ['retry'], payment: { completed: true, state: 'failed' } }))
    render(<PaymentPanel bookingId="b-1" />)
    dialog = await openAction('Retry charge')
    expect(within(dialog).getByRole('heading', { name: 'Retry charge' })).toBeDefined()
    expect(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` })).toBeDefined()
    expect(within(dialog).getByRole('button', { name: "Don't charge" })).toBeDefined()
  })

  it('release and waive confirm buttons are the only danger-styled ones', async () => {
    stubRouted(makeBody({ allowed: ['release', 'waive', 'send_link'], payment: { state: 'balance_due', captured_amount_minor: 9000 } }))
    render(<PaymentPanel bookingId="b-1" />)

    let dialog = await openAction('Release hold')
    let primary = within(dialog).getByRole('button', { name: 'Release hold' })
    expect(primary.getAttribute('style') ?? '').toContain('--admin-danger-solid')
    expect(primary.getAttribute('style') ?? '').toContain('--admin-on-danger')
    const keep = within(dialog).getByRole('button', { name: 'Keep hold' })
    await waitFor(() => expect(document.activeElement).toBe(keep))
    fireEvent.click(keep)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openAction('Waive balance')
    expect(within(dialog).getByText(new RegExp(`unpaid \\${eur(3000)}`))).toBeDefined()
    primary = within(dialog).getByRole('button', { name: 'Waive balance' })
    expect(primary.getAttribute('style') ?? '').toContain('--admin-danger-solid')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep balance' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openAction('Send payment link')
    expect(within(dialog).getByText(/client@example\.com/)).toBeDefined()
    primary = within(dialog).getByRole('button', { name: 'Send link' })
    expect(primary.getAttribute('style') ?? '').not.toContain('--admin-danger-solid')
    expect(within(dialog).getByRole('button', { name: "Don't send link" })).toBeDefined()
  })

  it('a declined outcome shows the danger result line and refetches', async () => {
    const fetchMock = stubRouted(
      makeBody({ allowed: ['capture'], payment: { completed: true } }),
      () => Promise.resolve(okResponse({ outcome: 'declined' })),
    )
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Capture')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Capture / }))
    const line = await screen.findByText('The card was declined. The client was emailed a payment link.')
    expect(line.getAttribute('style') ?? '').toContain('--status-danger-fg')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(gets(fetchMock).length).toBeGreaterThanOrEqual(2)
  })

  it('409 payment_busy keeps the modal open with the busy line', async () => {
    stubRouted(makeBody({ allowed: ['capture'], payment: { completed: true } }), () => Promise.resolve(okResponse({ error: 'payment_busy' }, 409)))
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Capture')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Capture / }))
    expect(await within(dialog).findByText('Payment is being processed. Wait a moment and try again.')).toBeDefined()
    expect(screen.getByRole('dialog')).toBeDefined()
    // buttons are usable again
    expect((within(dialog).getByRole('button', { name: "Don't capture" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('422 closes the modal, refetches and shows the no-longer-available line', async () => {
    const fetchMock = stubRouted(makeBody({ allowed: ['capture'], payment: { completed: true } }), () => Promise.resolve(okResponse({ error: 'action_not_allowed' }, 422)))
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Capture')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Capture / }))
    expect(await screen.findByText('That action is no longer available. The panel shows the current state.')).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(gets(fetchMock).length).toBeGreaterThanOrEqual(2)
  })

  it('401 / 403 show the session-ended line', async () => {
    for (const status of [401, 403]) {
      stubRouted(makeBody({ allowed: ['capture'], payment: { completed: true } }), () => Promise.resolve(okResponse({ error: 'unauthorized' }, status)))
      const { unmount } = render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openAction('Capture')
      fireEvent.click(within(dialog).getByRole('button', { name: /^Capture / }))
      expect(await screen.findByText('Your session has ended. Sign in again.')).toBeDefined()
      unmount()
    }
  })

  it('88-REVIEW C-WR-04: a network failure keeps the modal open, never claims nothing changed, and refetches', async () => {
    const fetchMock = stubRouted(makeBody({ allowed: ['capture'], payment: { completed: true } }), () => Promise.reject(new Error('offline')))
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Capture')
    const before = gets(fetchMock).length
    fireEvent.click(within(dialog).getByRole('button', { name: /^Capture / }))
    expect(await within(dialog).findByText('The action may have partly completed. The panel now shows the current state.')).toBeDefined()
    expect(screen.getByRole('dialog')).toBeDefined()
    await waitFor(() => expect(gets(fetchMock).length).toBeGreaterThan(before))
  })

  it('88-REVIEW C-WR-04: send_link 502 email_failed refetches, so the copy link is the new one, not the deactivated one', async () => {
    let link = 'https://buy.stripe.test/plink_old'
    const body = () => makeBody({ allowed: ['send_link'], payment: { state: 'failed', recovery_link_url: link } })
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        link = 'https://buy.stripe.test/plink_new'
        return Promise.resolve(okResponse({ error: 'email_failed' }, 502))
      }
      return Promise.resolve(okResponse(body()))
    })
    vi.stubGlobal('fetch', fetchMock)
    const states: string[] = []
    render(<PaymentPanel bookingId="b-1" onPaymentState={(s) => states.push(s)} />)
    const dialog = await openAction('Send payment link')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send link' }))
    expect(await within(dialog).findByText('The action may have partly completed. The panel now shows the current state.')).toBeDefined()
    await waitFor(() => expect(gets(fetchMock).length).toBe(2))
    expect(states).toContain('failed')
  })

  it('while submitting both modal buttons and every panel button are disabled, the primary shows Working…, Escape does not close', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise(resolve => { release = resolve })
    stubRouted(makeBody({ allowed: ['capture', 'release'], payment: { completed: false } }), () => pending)
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Release hold')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Release hold' }))

    const working = await within(dialog).findByRole('button', { name: /Working…/ })
    expect((working as HTMLButtonElement).disabled).toBe(true)
    expect((within(dialog).getByRole('button', { name: 'Keep hold' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Capture' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeDefined()

    release(okResponse({ outcome: 'ok' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the result line clears after 8 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubRouted(makeBody({ allowed: ['capture'], payment: { completed: true } }))
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openAction('Capture')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Capture / }))
    expect(await screen.findByText('Done. The payment history is updated.')).toBeDefined()
    // let React flush the passive effect that starts the 8 s timer before moving the clock
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(8100) })
    expect(screen.queryByText('Done. The payment history is updated.')).toBeNull()
  })
})

describe('PaymentPanel alert banners (D-14, HOLD-05)', () => {
  const soon = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString()

  it('refund_failed wins over every other rule and is a role=alert danger banner', async () => {
    stubFetch(makeBody({ refund_failed: true, payment: { state: 'failed' } }))
    render(<PaymentPanel bookingId="b-1" />)
    const title = await screen.findByText('Refund failed', { selector: 'strong' })
    expect(title).toBeDefined()
    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain('Booking PRE-CARD1 was cancelled, but the refund of')
    expect(banner.textContent).toContain(eur(12000))
    expect(banner.textContent).toContain('Refund it manually in the Stripe Dashboard. The operator alert was emailed to you.')
    expect(screen.queryByText('Payment failed', { selector: 'strong' })).toBeNull()
    // the second badge sits next to the state badge
    expect(screen.getAllByText('Refund failed').length).toBeGreaterThanOrEqual(2)
  })

  it('88-REVIEW C-WR-05: Mark refund resolved asks first, posts resolve_refund and refetches', async () => {
    let getBody = makeBody({ refund_failed: true, payment: { state: 'released' } })
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        getBody = makeBody({ refund_failed: false, payment: { state: 'released' } })
        return Promise.resolve(okResponse({ outcome: 'ok' }))
      }
      return Promise.resolve(okResponse(getBody))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<PaymentPanel bookingId="b-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark refund resolved' }))
    expect(posts(fetchMock)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, it is resolved' }))
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    expect(JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body))).toEqual({ action: 'resolve_refund' })
    await waitFor(() => expect(screen.queryByText('Refund failed', { selector: 'strong' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Mark refund resolved' })).toBeNull()
  })

  it('88-REVIEW C-WR-05: a pay-now booking with a refund failure can be resolved too', async () => {
    stubRouted(makeBody({ refund_failed: true, payment: { mode: 'pay_now', state: 'none' } }))
    render(<PaymentPanel bookingId="b-1" paymentMode="pay_now" />)
    expect(await screen.findByRole('button', { name: 'Mark refund resolved' })).toBeDefined()
  })

  it('failed: shows the retry time when one is scheduled, else the no-retries sentence', async () => {
    stubFetch(makeBody({ payment: { state: 'failed', payment_retry_at: '2026-11-12T13:05:00Z', payment_retry_count: 0 } }))
    const first = render(<PaymentPanel bookingId="b-1" />)
    const title = await screen.findByText('Payment failed', { selector: 'strong' })
    expect(title).toBeDefined()
    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain('The client was emailed a payment link.')
    expect(banner.textContent).toContain('Automatic retry at Thu 12 Nov, 14:05, once.')
    first.unmount()

    stubFetch(makeBody({ payment: { state: 'failed', payment_retry_at: null, payment_retry_count: 1 } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Payment failed', { selector: 'strong' })
    expect(screen.getByRole('alert').textContent).toContain('No automatic retries are left. Use Retry or Send payment link.')
  })

  it('balance_due: Balance unpaid with the declined difference', async () => {
    stubFetch(makeBody({ payment: { state: 'balance_due', captured_amount_minor: 9000, completed: true } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Balance unpaid', { selector: 'strong' })
    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain(`The trip amount was captured, but ${eur(3000)} was declined.`)
  })

  it('expired and not completed: amber Hold expired (role status)', async () => {
    stubFetch(makeBody({ payment: { state: 'expired', completed: false, capture_before: null } }))
    render(<PaymentPanel bookingId="b-1" />)
    const title = await screen.findByText('Hold expired', { selector: 'strong' })
    expect(title.closest('[role]')?.getAttribute('role')).toBe('status')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a cancelled booking shows no hold or payment banner (88-REVIEW T2)', async () => {
    stubFetch(makeBody({ payment: { state: 'failed', status: 'cancelled', payment_retry_at: null, payment_retry_count: 1 } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Payment failed')
    expect(screen.queryByText('Payment failed', { selector: 'strong' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('expired but completed: no Hold expired banner', async () => {
    stubFetch(makeBody({ payment: { state: 'expired', completed: true, capture_before: null } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Hold expired')
    expect(screen.queryByText('Hold expired', { selector: 'strong' })).toBeNull()
  })

  it('authorized with capture_before within 12 h: Hold expires soon; 13 h away: none', async () => {
    stubFetch(makeBody({ payment: { state: 'authorized', capture_before: soon(5), pickup_at: soon(100) } }))
    const first = render(<PaymentPanel bookingId="b-1" />)
    const title = await screen.findByText('Hold expires soon', { selector: 'strong' })
    expect(title.closest('[role]')?.getAttribute('role')).toBe('status')
    first.unmount()

    stubFetch(makeBody({ payment: { state: 'authorized', capture_before: soon(13), pickup_at: soon(100) } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Hold active')
    expect(screen.queryByText('Hold expires soon', { selector: 'strong' })).toBeNull()
  })

  it('pickup within 24 h and no valid hold: warn No valid hold', async () => {
    for (const state of ['card_saved', 'expired', 'placing_hold', 'checkout_pending']) {
      stubFetch(makeBody({ payment: { state, pickup_at: soon(10), capture_before: null, completed: false } }))
      const { unmount } = render(<PaymentPanel bookingId="b-1" />)
      // an expired hold matches the earlier "Hold expired" rule first
      const expected = state === 'expired' ? 'Hold expired' : 'No valid hold'
      expect(await screen.findByText(expected, { selector: 'strong' })).toBeDefined()
      unmount()
    }
    stubFetch(makeBody({ payment: { state: 'card_saved', pickup_at: soon(48), capture_before: null } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Card saved')
    expect(screen.queryByText('No valid hold', { selector: 'strong' })).toBeNull()
  })

  it('authorized with a far capture_before and a distant pickup shows no banner', async () => {
    stubFetch(makeBody({ payment: { state: 'authorized', capture_before: soon(24 * 6), pickup_at: soon(24 * 8) } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Hold active')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('PaymentPanel Copy link (HOLD-07)', () => {
  it('copies recovery_link_url and shows Copied for 2 seconds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubFetch(makeBody({ payment: { state: 'failed', recovery_link_url: 'https://pay.example/abc' } }))
    render(<PaymentPanel bookingId="b-1" />)

    expect(await screen.findByText('Payment link')).toBeDefined()
    expect(screen.getByText('Sent')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /Copy link/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://pay.example/abc'))
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeDefined()
    await act(async () => { vi.advanceTimersByTime(2100) })
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeDefined()
  })

  it('does not render the Payment link fact without a link', async () => {
    stubFetch(makeBody({ payment: { recovery_link_url: null } }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Hold active')
    expect(screen.queryByText('Payment link')).toBeNull()
  })
})

// ── Phase 91-11 (EXTRA-01): the extra charge action, dialog and list ─────────

describe('PaymentPanel extra charge (91-11)', () => {
  const eur = (minor: number) => formatMinor(minor, 'eur')
  const completed = { state: 'captured', status: 'completed', completed: true }
  const noExtra = { eligible: false, reason: 'payment_mode', in_flight: null, charges: [] }

  function extraBody(allowed: string[], extra: Record<string, unknown>) {
    return { ...makeBody({ payment: completed, allowed }), extra }
  }

  /** GET /payment returns the body each time; POST /extra is answered and recorded. */
  function stubPanelFetch(get: () => unknown, post?: { status: number; body: unknown }) {
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    const fetchMock = vi.fn().mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET'
      calls.push({ url: String(url), method, body: init?.body ? JSON.parse(init.body) : undefined })
      const answer = method === 'GET' ? { status: 200, body: get() } : (post ?? { status: 200, body: { outcome: 'ok' } })
      return Promise.resolve({ ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: () => Promise.resolve(answer.body) })
    })
    vi.stubGlobal('fetch', fetchMock)
    return { calls, posts: () => calls.filter(c => c.method === 'POST'), gets: () => calls.filter(c => c.method === 'GET') }
  }

  it('shows "Add extra charge…" only when allowed_actions has charge_extra', async () => {
    stubPanelFetch(() => extraBody(['charge_extra'], { ...noExtra, eligible: true, reason: null }))
    const { unmount } = render(<PaymentPanel bookingId="b-1" />)
    expect(await screen.findByRole('button', { name: 'Add extra charge…' })).toBeDefined()
    unmount()

    stubPanelFetch(() => extraBody([], noExtra))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Captured')
    expect(screen.queryByRole('button', { name: 'Add extra charge…' })).toBeNull()
  })

  it('an older server answer without the extra object still renders and offers nothing', async () => {
    stubPanelFetch(() => makeBody({ payment: completed, allowed: [] }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByText('Captured')
    expect(screen.queryByRole('button', { name: /extra charge/i })).toBeNull()
    expect(screen.queryByTestId('extra-charges')).toBeNull()
  })

  it('opens the dialog, charges an "other" extra once and shows the result line; the panel refetches', async () => {
    const net = stubPanelFetch(
      () => extraBody(['charge_extra'], { ...noExtra, eligible: true, reason: null }),
      { status: 200, body: { outcome: 'charged', charge_id: 'c-1', amount_minor: 1500, currency: 'eur' } },
    )
    render(<PaymentPanel bookingId="b-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add extra charge…' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Add extra charge')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Shown to the client in the receipt'), { target: { value: 'Airport parking' } })
    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '15.00' } })
    fireEvent.click(screen.getByRole('button', { name: `Charge ${eur(1500)} to the saved card` }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(net.posts()).toHaveLength(1)
    expect(net.posts()[0].url).toBe('/api/admin/bookings/b-1/extra')
    expect(net.posts()[0].body).toEqual({ kind: 'other', description: 'Airport parking', amount_minor: 1500 })
    expect(await screen.findByText(`${eur(1500)} was charged to the saved card and the client was emailed a receipt.`)).toBeDefined()
    await waitFor(() => expect(net.gets().length).toBeGreaterThanOrEqual(2))
  })

  it('lists the extra charges with kind, amount, status and date', async () => {
    stubPanelFetch(() => extraBody([], {
      ...noExtra,
      charges: [
        {
          id: 'c-1', kind: 'other', status: 'charged', amount_minor: 1500, currency: 'eur', minutes: null,
          description: 'Airport parking', requested_at: '2026-11-02T10:00:00Z', charged_at: '2026-11-02T10:00:05Z', last_error_code: null,
        },
        {
          id: 'c-2', kind: 'waiting', status: 'failed', amount_minor: 3000, currency: 'eur', minutes: 45,
          description: null, requested_at: '2026-11-03T10:00:00Z', charged_at: null, last_error_code: 'card_declined',
        },
      ],
    }))
    render(<PaymentPanel bookingId="b-1" />)
    const list = await screen.findByTestId('extra-charges')
    expect(within(list).getByText('Extra charges', { selector: 'h4' })).toBeDefined()
    expect(within(list).getByText('Airport parking')).toBeDefined()
    expect(within(list).getByText(eur(1500))).toBeDefined()
    expect(within(list).getByText('Charged')).toBeDefined()
    expect(within(list).getByText('2 Nov, 11:00')).toBeDefined()
    expect(within(list).getByText('Waiting, 45 min')).toBeDefined()
    expect(within(list).getByText(eur(3000))).toBeDefined()
    expect(within(list).getByText('Declined')).toBeDefined()
    expect(within(list).getByText('(card_declined)')).toBeDefined()
  })

  it('a pending charge keeps a way in: "Pending extra charge…" opens the resume view', async () => {
    const net = stubPanelFetch(
      () => extraBody([], {
        eligible: false,
        reason: 'in_flight',
        in_flight: { id: '22222222-2222-4222-8222-222222222222', kind: 'other', amount_minor: 900, currency: 'eur', requested_at: '2026-11-11T09:00:00Z', resumable: true },
        charges: [],
      }),
      { status: 200, body: { outcome: 'charged', charge_id: '22222222-2222-4222-8222-222222222222', amount_minor: 900, currency: 'eur' } },
    )
    render(<PaymentPanel bookingId="b-1" />)
    expect(screen.queryByRole('button', { name: 'Add extra charge…' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Pending extra charge…' }))
    fireEvent.click(await screen.findByRole('button', { name: `Retry the pending charge of ${eur(900)}` }))
    await waitFor(() => expect(net.posts()).toHaveLength(1))
    expect(net.posts()[0].body).toEqual({ kind: 'resume', charge_id: '22222222-2222-4222-8222-222222222222' })
  })
})
