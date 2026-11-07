import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { formatMinor } from '@/lib/payments/money'
import PaymentPanel from '@/components/admin/PaymentPanel'
import { PaymentStateBadge, CashChip } from '@/components/admin/PaymentStateBadge'

// Phase 89-17 (UI-SPEC Surface 5): the cash vocabulary, banners and the three cash dialogs. Amounts in expectations come
// from formatMinor, never typed.

const eur = (minor: number) => formatMinor(minor, 'eur')

function makePayment(over: Record<string, unknown> = {}) {
  return {
    mode: 'cash_guarantee',
    state: 'card_saved',
    currency: 'eur',
    amount_minor: 12000,
    hold_amount_minor: null,
    captured_amount_minor: 0,
    hold_at: null,
    capture_before: null,
    card_saved: true,
    last_payment_error: null,
    payment_retry_at: null,
    payment_retry_count: 0,
    recovery_link_url: null,
    pickup_at: '2026-11-20T09:00:00Z',
    status: 'on_board',
    completed: false,
    booking_reference: 'PRE-CASH1',
    client_email: 'client@example.com',
    ...over,
  }
}

function makeCash(over: Record<string, unknown> = {}) {
  return { unconfirmed: false, confirmed_by: null, confirmed_at: null, notes: [], ...over }
}

function makeBody(over: { payment?: Record<string, unknown>; allowed?: string[]; cash?: unknown; events?: unknown[] } = {}) {
  const events = over.events ?? []
  return {
    payment: makePayment(over.payment),
    allowed_actions: over.allowed ?? ['charge_saved_card', 'mark_cash_settled'],
    refund_failed: false,
    events,
    events_total: events.length,
    fee_case: null,
    cash: over.cash === undefined ? makeCash() : over.cash,
  }
}

interface Answer { status: number; body: unknown }

function stubFetch(get: () => unknown, post?: Answer) {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const fetchMock = vi.fn().mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(init.body) : undefined })
    if (method === 'GET') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(get()) })
    const a = post ?? { status: 200, body: { outcome: 'ok' } }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls, posts: () => calls.filter(c => c.method === 'POST'), gets: () => calls.filter(c => c.method === 'GET') }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** The panel root also exists while loading (skeleton): wait until the skeleton is gone. */
async function loadedPanel() {
  await waitFor(() => expect(screen.queryByTestId('payment-skeleton-row')).toBeNull())
  return screen.getByTestId('payment-panel')
}

async function openAction(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

// ── 5.1 badges ───────────────────────────────────────────────────────────────

describe('PaymentStateBadge cash vocabulary (E17 populated)', () => {
  const cases: Array<[string, boolean, string]> = [
    ['checkout_pending', false, 'Awaiting card'],
    ['card_saved', false, 'Cash on trip'],
    ['card_saved', true, 'Cash unconfirmed'],
    ['cash_settled', true, 'Paid in cash'],
    ['captured', true, 'Card charged'],
    ['failed', false, 'Payment failed'],
    ['released', false, 'Released'],
  ]
  for (const [state, completed, label] of cases) {
    it(`${state} (completed ${completed}) reads "${label}" for a cash booking`, () => {
      render(<PaymentStateBadge state={state} mode="cash_guarantee" completed={completed} />)
      expect(screen.getByText(label)).toBeDefined()
      cleanup()
    })
  }

  it('card labels are unchanged', () => {
    render(<PaymentStateBadge state="card_saved" />)
    expect(screen.getByText('Card saved')).toBeDefined()
    cleanup()
    render(<PaymentStateBadge state="captured" mode="card_hold" />)
    expect(screen.getByText('Captured')).toBeDefined()
  })

  it('Cash unconfirmed uses the info family and Cash on trip the neutral one, never danger', () => {
    const unconfirmed = render(<PaymentStateBadge state="card_saved" mode="cash_guarantee" completed />)
    expect(unconfirmed.container.innerHTML).toContain('--status-info-')
    expect(unconfirmed.container.innerHTML).not.toContain('--status-danger-')
    unconfirmed.unmount()
    const onTrip = render(<PaymentStateBadge state="card_saved" mode="cash_guarantee" />)
    expect(onTrip.container.innerHTML).toContain('--status-neutral-')
  })

  it('the Cash chip is neutral', () => {
    const { container } = render(<CashChip />)
    expect(container.textContent).toBe('Cash')
    expect(container.innerHTML).toContain('--status-neutral-')
  })
})

// ── 5.2 facts and banners ────────────────────────────────────────────────────

describe('PaymentPanel for a cash booking', () => {
  it('renders the panel with the Cash chip, Cash on trip, Cash to collect and no hold facts', async () => {
    stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(within(panel).getByText('Cash')).toBeDefined()
    expect(within(panel).getByText('Cash on trip')).toBeDefined()
    expect(within(panel).getByText('Cash to collect')).toBeDefined()
    expect(panel.textContent).toContain(eur(12000))
    expect(within(panel).getByText('Card on file')).toBeDefined()
    expect(within(panel).queryByText('Hold planned for')).toBeNull()
    expect(within(panel).queryByText('Hold expires')).toBeNull()
    expect(within(panel).queryByText('Held amount')).toBeNull()
    // trip is on: no banner
    expect(within(panel).queryByRole('status')).toBeNull()
  })

  it('shows Cash confirmed by the driver with the Prague time when settled, and the Paid in cash banner', async () => {
    stubFetch(() => makeBody({
      payment: { state: 'cash_settled', status: 'completed', completed: true },
      allowed: ['reopen_cash'],
      cash: makeCash({ confirmed_by: 'driver', confirmed_at: '2026-11-12T13:05:00Z' }),
    }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(within(panel).getByText('Cash confirmed')).toBeDefined()
    expect(within(panel).getByText('By driver, Thu 12 Nov, 14:05')).toBeDefined()
    expect(within(panel).queryByText('Cash to collect')).toBeNull()
    const banner = within(panel).getByRole('status')
    expect(banner.textContent).toContain('Paid in cash')
    expect(banner.textContent).toContain(`${eur(12000)} was confirmed in cash by the driver on Thu 12 Nov, 14:05. If this is wrong, you can reopen it.`)
  })

  it('names the operator when an admin confirmed', async () => {
    stubFetch(() => makeBody({
      payment: { state: 'cash_settled', status: 'completed', completed: true },
      allowed: ['reopen_cash'],
      cash: makeCash({ confirmed_by: 'admin', confirmed_at: '2026-11-12T13:05:00Z' }),
    }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(within(panel).getByText('By admin, Thu 12 Nov, 14:05')).toBeDefined()
    expect(within(panel).getByRole('status').textContent).toContain('by the operator')
  })

  it('unconfirmed cash is information: info banner, no danger family element anywhere, no alert role', async () => {
    stubFetch(() => makeBody({
      payment: { status: 'completed', completed: true },
      cash: makeCash({ unconfirmed: true }),
    }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(within(panel).getAllByText('Cash unconfirmed').length).toBeGreaterThan(0)
    const banner = within(panel).getByRole('status')
    expect(banner.textContent).toContain('Cash not confirmed')
    expect(banner.textContent).toContain(`The driver has not confirmed receiving ${eur(12000)} in cash. Nothing happens automatically. Mark it paid in cash, or charge the saved card.`)
    expect(panel.innerHTML).not.toContain('--status-danger')
    expect(panel.innerHTML).not.toContain('--admin-danger')
    expect(within(panel).queryByRole('alert')).toBeNull()
  })

  it('adds no count and no filter for unconfirmed cash (D-21)', async () => {
    stubFetch(() => makeBody({ payment: { status: 'completed', completed: true }, cash: makeCash({ unconfirmed: true }) }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(panel.textContent).not.toMatch(/unconfirmed cash|\d+ unconfirmed|filter/i)
    expect(within(panel).queryByRole('combobox')).toBeNull()
  })

  it('failed during a trip tells the operator to have the driver take cash and promises no client email', async () => {
    stubFetch(() => makeBody({ payment: { state: 'failed', last_payment_error: 'card_declined' }, allowed: ['charge_saved_card', 'mark_cash_settled'] }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    const banner = within(panel).getByRole('alert')
    expect(banner.textContent).toContain('Payment failed')
    expect(banner.textContent).toContain(`The card was declined. Tell the driver to take ${eur(12000)} in cash.`)
    expect(banner.textContent).not.toContain('payment link')
  })

  it('failed after the trip says the client was emailed a payment link', async () => {
    stubFetch(() => makeBody({
      payment: { state: 'failed', status: 'completed', completed: true, last_payment_error: 'card_declined' },
      allowed: ['send_link'],
    }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(within(panel).getByRole('alert').textContent).toContain('The card was declined. The client was emailed a payment link.')
  })

  it('does not build the driver-reports-unpaid row', async () => {
    stubFetch(() => makeBody({ payment: { status: 'completed', completed: true }, cash: makeCash({ unconfirmed: true }) }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(panel.textContent).not.toContain('Driver reports cash not received')
  })

  it('shows the operator notes in the facts and never in the history list', async () => {
    stubFetch(() => makeBody({
      cash: makeCash({
        notes: [{ kind: 'cash_card_charge', note: 'Client asked to pay by card', created_by: 'op', created_at: '2026-11-12T13:05:00Z' }],
      }),
      events: [{
        id: 1, created_at: '2026-11-12T13:05:00Z', kind: 'admin_action', amount_minor: null, currency: null,
        actor_type: 'admin', actor_id: 'op', error_code: 'cash_card_charge',
      }],
    }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const panel = await loadedPanel()
    expect(within(panel).getByRole('list', { name: 'Cash notes' }).textContent).toContain('Client asked to pay by card')
    expect(within(panel).getByRole('list', { name: 'Payment history' }).textContent).not.toContain('Client asked to pay by card')
  })

  it('renders buttons only from allowed_actions with the cash labels', async () => {
    stubFetch(() => makeBody({ allowed: ['charge_saved_card', 'mark_cash_settled', 'release'] }))
    const first = render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    await screen.findByRole('button', { name: 'Charge saved card…' })
    expect(screen.getByRole('button', { name: 'Mark paid in cash…' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Release saved card' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Reopen as unpaid…' })).toBeNull()
    first.unmount()

    stubFetch(() => makeBody({ payment: { state: 'cash_settled', completed: true, status: 'completed' }, allowed: ['reopen_cash'], cash: makeCash({ confirmed_by: 'driver', confirmed_at: '2026-11-12T13:05:00Z' }) }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    await screen.findByRole('button', { name: 'Reopen as unpaid…' })
    expect(screen.queryByRole('button', { name: 'Charge saved card…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark paid in cash…' })).toBeNull()
  })

  it('a card booking is unchanged: no Cash chip, hold facts still shown', async () => {
    stubFetch(() => ({
      ...makeBody({ payment: { mode: 'card_hold', state: 'authorized', hold_amount_minor: 12000, capture_before: '2026-11-12T13:05:00Z' }, allowed: [], cash: null }),
    }))
    render(<PaymentPanel bookingId="b-1" paymentMode="card_hold" />)
    const panel = await loadedPanel()
    expect(within(panel).queryByText('Cash')).toBeNull()
    expect(within(panel).getByText('Hold expires')).toBeDefined()
    expect(within(panel).getByText('Hold active')).toBeDefined()
  })
})

// ── 5.4 charge saved card ────────────────────────────────────────────────────

describe('CashCardChargeModal', () => {
  it('opens with focus on the note, the fixed amount and no amount field; the note is required', async () => {
    const { posts } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Charge saved card…')
    expect(within(dialog).getByText('Charge saved card')).toBeDefined()
    expect(dialog.textContent).toContain(`Charge ${eur(12000)} to the client's saved card for booking PRE-CASH1?`)
    expect(within(dialog).queryByRole('textbox', { name: /amount/i })).toBeNull()
    const note = within(dialog).getByLabelText('Why are you charging the card?') as HTMLTextAreaElement
    await waitFor(() => expect(document.activeElement).toBe(note))
    const primary = within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }) as HTMLButtonElement
    expect(primary.disabled).toBe(true)
    fireEvent.click(primary)
    expect(posts()).toHaveLength(0)
    fireEvent.change(note, { target: { value: '   ' } })
    expect(primary.disabled).toBe(true)
    fireEvent.change(note, { target: { value: 'Client chose to pay by card' } })
    expect(primary.disabled).toBe(false)
  })

  it('during a trip the impact line says nothing is sent', async () => {
    stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Charge saved card…')
    expect(dialog.textContent).toContain('If the card is declined, nothing is sent and the driver takes cash.')
  })

  it('after the trip the impact line says the client gets a payment link', async () => {
    stubFetch(() => makeBody({ payment: { status: 'completed', completed: true } }))
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Charge saved card…')
    expect(dialog.textContent).toContain('If the card is declined, the client gets a payment link.')
  })

  it('posts the trimmed note, closes, refetches and shows Done', async () => {
    const { posts, gets } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Charge saved card…')
    fireEvent.change(within(dialog).getByLabelText('Why are you charging the card?'), { target: { value: ' Client chose to pay by card ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }))
    expect(await screen.findByText(`Done. ${eur(12000)} was charged.`)).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts()[0].url).toBe('/api/admin/bookings/b-1/fee')
    expect(posts()[0].body).toEqual({ action: 'charge_saved_card', note: 'Client chose to pay by card' })
    await waitFor(() => expect(gets()).toHaveLength(2))
  })

  it('declined during the trip: tell the driver to take cash', async () => {
    stubFetch(() => makeBody(), { status: 200, body: { outcome: 'declined' } })
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Charge saved card…')
    fireEvent.change(within(dialog).getByLabelText('Why are you charging the card?'), { target: { value: 'Client chose card' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }))
    const line = await screen.findByText(`The card was declined. Tell the driver to take ${eur(12000)} in cash.`)
    expect(line.getAttribute('style')).toContain('--status-danger-fg')
  })

  it('declined after the trip: the payment link line', async () => {
    stubFetch(() => makeBody({ payment: { status: 'completed', completed: true } }), { status: 200, body: { outcome: 'declined' } })
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Charge saved card…')
    fireEvent.change(within(dialog).getByLabelText('Why are you charging the card?'), { target: { value: 'Did not pay the driver' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }))
    expect(await screen.findByText('The card was declined. The client was emailed a payment link.')).toBeDefined()
  })

  it('busy and session errors keep the dialog open; 422 closes with the gone line', async () => {
    stubFetch(() => makeBody(), { status: 409, body: { error: 'payment_busy' } })
    const busy = render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    let dialog = await openAction('Charge saved card…')
    fireEvent.change(within(dialog).getByLabelText('Why are you charging the card?'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }))
    // Money review 2, CR-01: an unconfirmed cash card charge has its own line: the charge may still go through.
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Not confirmed. Do not take cash until the panel shows the outcome, or take cash and watch for an alert that the card went through after all (then refund the card).',
    )
    busy.unmount()

    stubFetch(() => makeBody(), { status: 403, body: { error: 'Forbidden' } })
    const session = render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    dialog = await openAction('Charge saved card…')
    fireEvent.change(within(dialog).getByLabelText('Why are you charging the card?'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Your session has ended. Sign in again.')
    session.unmount()

    stubFetch(() => makeBody(), { status: 422, body: { error: 'action_not_allowed' } })
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    dialog = await openAction('Charge saved card…')
    fireEvent.change(within(dialog).getByLabelText('Why are you charging the card?'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }))
    expect(await screen.findByText('That decision is no longer available. The panel shows the current state.')).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('E17 loading: buttons disabled, the primary shows Working… and the dialog can not be dismissed', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise(resolve => { release = resolve })
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(makeBody()) })
      return pending.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({ outcome: 'ok' }) }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Charge saved card…')
    fireEvent.change(within(dialog).getByLabelText('Why are you charging the card?'), { target: { value: 'Client chose card' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(12000)}` }))

    const working = await within(dialog).findByRole('button', { name: 'Working…' }) as HTMLButtonElement
    expect(working.disabled).toBe(true)
    expect((within(dialog).getByRole('button', { name: "Don't charge" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeNull()
    release(null)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

// ── 5.5 mark paid in cash ────────────────────────────────────────────────────

describe('MarkCashModal', () => {
  it('opens with focus on the safe choice and states the saved card is not charged', async () => {
    stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Mark paid in cash…')
    expect(dialog.textContent).toContain(`Mark ${eur(12000)} as paid in cash for booking PRE-CASH1? The saved card will not be charged.`)
    const notYet = within(dialog).getByRole('button', { name: 'Not yet' })
    await waitFor(() => expect(document.activeElement).toBe(notYet))
  })

  it('posts the bare action, closes, refetches and shows Done', async () => {
    const { posts, gets } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Mark paid in cash…')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark paid in cash' }))
    expect(await screen.findByText('Done. Marked as paid in cash.')).toBeDefined()
    expect(posts()[0].body).toEqual({ action: 'mark_cash_settled' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(gets()).toHaveLength(2))
  })

  it('"Not yet" closes without a request', async () => {
    const { posts } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Mark paid in cash…')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not yet' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts()).toHaveLength(0)
  })

  it('a busy answer keeps the dialog open', async () => {
    stubFetch(() => makeBody(), { status: 409, body: { error: 'payment_busy' } })
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Mark paid in cash…')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark paid in cash' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Payment is being processed. Wait a moment and try again.')
  })
})

// ── 5.6 reopen ───────────────────────────────────────────────────────────────

describe('ReopenCashModal', () => {
  const settled = () => makeBody({
    payment: { state: 'cash_settled', status: 'completed', completed: true },
    allowed: ['reopen_cash'],
    cash: makeCash({ confirmed_by: 'driver', confirmed_at: '2026-11-12T13:05:00Z' }),
  })

  it('requires a note, is accent not danger, and focuses the note', async () => {
    const { posts } = stubFetch(settled)
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Reopen as unpaid…')
    expect(dialog.textContent).toContain('The cash confirmation will be removed and the booking is unpaid again. Both entries stay in the payment history.')
    const note = within(dialog).getByLabelText('Why is the confirmation wrong?') as HTMLTextAreaElement
    await waitFor(() => expect(document.activeElement).toBe(note))
    const primary = within(dialog).getByRole('button', { name: 'Reopen as unpaid' }) as HTMLButtonElement
    expect(primary.disabled).toBe(true)
    expect(primary.getAttribute('style')).toContain('--admin-accent')
    expect(primary.getAttribute('style')).not.toContain('danger')
    fireEvent.click(primary)
    expect(posts()).toHaveLength(0)
  })

  it('posts the note, closes, refetches and shows the ok line', async () => {
    const { posts, gets } = stubFetch(settled)
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Reopen as unpaid…')
    fireEvent.change(within(dialog).getByLabelText('Why is the confirmation wrong?'), { target: { value: ' Driver tapped by mistake ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen as unpaid' }))
    expect(await screen.findByText('Done. The booking is unpaid again.')).toBeDefined()
    expect(posts()[0].body).toEqual({ action: 'reopen_cash', note: 'Driver tapped by mistake' })
    await waitFor(() => expect(gets()).toHaveLength(2))
  })

  it('Keep as paid closes without a request', async () => {
    const { posts } = stubFetch(settled)
    render(<PaymentPanel bookingId="b-1" paymentMode="cash_guarantee" />)
    const dialog = await openAction('Reopen as unpaid…')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep as paid' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts()).toHaveLength(0)
  })
})

// ── source guards ────────────────────────────────────────────────────────────

describe('cash components source', () => {
  it('has no hard-coded currency symbol', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    for (const f of ['CashCardChargeModal.tsx', 'MarkCashModal.tsx', 'ReopenCashModal.tsx', 'PaymentStateBadge.tsx']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/admin', f), 'utf8')
      expect(src.includes('€'), f).toBe(false)
    }
  })
})
