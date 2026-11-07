import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { formatMinor } from '@/lib/payments/money'
import PaymentPanel from '@/components/admin/PaymentPanel'
import { minorToInput, parseAmountToMinor, percentOf } from '@/components/admin/paymentShared'

// Phase 89-17 (UI-SPEC Surfaces 4.1 to 4.4): the fee decision in the booking panel. Amounts in expectations come from
// formatMinor, never typed, so the test follows the money formatting like the component does.

// ── fixtures ─────────────────────────────────────────────────────────────────

const eur = (minor: number) => formatMinor(minor, 'eur')

function makePayment(over: Record<string, unknown> = {}) {
  return {
    mode: 'card_hold',
    state: 'authorized',
    currency: 'eur',
    amount_minor: 10000,
    hold_amount_minor: 10000,
    captured_amount_minor: 0,
    hold_at: null,
    capture_before: '2026-11-12T13:05:00Z',
    card_saved: true,
    last_payment_error: null,
    payment_retry_at: null,
    payment_retry_count: 0,
    recovery_link_url: null,
    pickup_at: '2026-11-20T09:00:00Z',
    status: 'cancelled',
    completed: false,
    booking_reference: 'PRE-FEE1',
    client_email: 'client@example.com',
    ...over,
  }
}

function makeCase(over: Record<string, unknown> = {}) {
  return {
    kind: 'late_cancel',
    status: 'pending',
    currency: 'eur',
    proposed_minor: 10000,
    base_minor: 10000,
    charged_minor: null,
    charge_in_flight: false,
    free_until: '2026-11-20T08:00:00Z',
    opened_at: '2026-11-20T05:00:00Z',
    decided_by: null,
    decided_at: null,
    reason: null,
    contact_note: null,
    evidence: {},
    ...over,
  }
}

const NO_SHOW_EVIDENCE = {
  pickup_utc: '2026-11-20T09:00:00Z',
  on_location_at: '2026-11-20T09:05:00Z',
  requested_at: '2026-11-20T09:40:00Z',
  threshold_min: 30,
  airport: false,
}

function makeBody(over: Record<string, unknown> = {}) {
  return {
    payment: makePayment((over.payment as Record<string, unknown>) ?? {}),
    allowed_actions: over.allowed ?? ['charge_fee', 'waive_fee'],
    refund_failed: false,
    events: over.events ?? [],
    events_total: ((over.events as unknown[]) ?? []).length,
    fee_case: over.fee_case === undefined ? makeCase() : over.fee_case,
    cash: over.cash ?? null,
  }
}

interface Answer { status: number; body: unknown }

/** GET /payment returns `get()` each time; POST /fee returns `post` and is recorded. */
function stubFetch(get: () => unknown, post?: Answer | (() => Answer)) {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const fetchMock = vi.fn().mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(init.body) : undefined })
    if (method === 'GET') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(get()) })
    const a = typeof post === 'function' ? post() : (post ?? { status: 200, body: { outcome: 'ok' } })
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls, posts: () => calls.filter(c => c.method === 'POST') }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function openCharge() {
  fireEvent.click(await screen.findByRole('button', { name: 'Charge fee…' }))
  return screen.findByRole('dialog')
}

// ── the amount helper (T-89-57) ──────────────────────────────────────────────

describe('parseAmountToMinor', () => {
  it('turns "10.10" into 1010 by string handling and refuses "10.101"', () => {
    expect(parseAmountToMinor('10.10')).toEqual({ ok: true, minor: 1010 })
    expect(parseAmountToMinor('10.101')).toEqual({ ok: false, reason: 'decimals' })
  })

  it('has no float drift for the classic cases', () => {
    expect(parseAmountToMinor('0.29')).toEqual({ ok: true, minor: 29 })
    expect(parseAmountToMinor('1.15')).toEqual({ ok: true, minor: 115 })
    expect(parseAmountToMinor('19.99')).toEqual({ ok: true, minor: 1999 })
    expect(parseAmountToMinor('100')).toEqual({ ok: true, minor: 10000 })
    expect(parseAmountToMinor('10.5')).toEqual({ ok: true, minor: 1050 })
  })

  it('accepts a comma as the separator and refuses everything that is not a plain decimal', () => {
    expect(parseAmountToMinor('10,50')).toEqual({ ok: true, minor: 1050 })
    for (const bad of ['abc', '1e3', '-5', '1 000', '1.2.3', '.5', '10..5', '+5']) {
      expect(parseAmountToMinor(bad).ok, bad).toBe(false)
    }
    expect(parseAmountToMinor('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseAmountToMinor('0')).toEqual({ ok: false, reason: 'zero' })
    expect(parseAmountToMinor('0.00')).toEqual({ ok: false, reason: 'zero' })
  })

  it('prefills and reads back without drift', () => {
    expect(minorToInput(1010)).toBe('10.10')
    expect(minorToInput(5)).toBe('0.05')
    expect(minorToInput(10000)).toBe('100.00')
    expect(percentOf(4000, 10000)).toBe('40')
    expect(percentOf(3333, 10000)).toBe('33.3')
  })
})

// ── Surface 4.1: banner (E14) ────────────────────────────────────────────────

describe('FeeDecisionBanner in the panel (E14 populated)', () => {
  it('shows the late-cancel banner for a pending case with the hold sentence', async () => {
    stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" />)
    const banner = await screen.findByTestId('fee-decision-banner')
    expect(within(banner).getByRole('alert')).toBeDefined()
    expect(within(banner).getByText('Late cancellation: fee decision needed')).toBeDefined()
    // opened 4 h before pickup; proposed fee is the whole fare (100%)
    expect(banner.textContent).toContain('The client cancelled 4 h before pickup')
    expect(banner.textContent).toContain(`Proposed fee: ${eur(10000)} (100% of the fare).`)
    expect(banner.textContent).toContain('The hold ends on Thu 12 Nov, 14:05 (Prague time). After that the saved card is charged instead.')
  })

  it('shows the no-show banner with the wait and the evidence times', async () => {
    stubFetch(() => makeBody({ fee_case: makeCase({ kind: 'no_show', evidence: NO_SHOW_EVIDENCE }), payment: { state: 'card_saved' } }))
    render(<PaymentPanel bookingId="b-1" />)
    const banner = await screen.findByTestId('fee-decision-banner')
    expect(within(banner).getByText('No-show: fee decision needed')).toBeDefined()
    expect(banner.textContent).toContain('The driver waited 30 minutes at the pick-up point')
    expect(banner.textContent).toContain('arrived Fri 20 Nov, 10:05')
    expect(banner.textContent).toContain('no-show requested Fri 20 Nov, 10:40')
    expect(banner.textContent).toContain('No hold is on the card. The saved card is charged.')
  })

  it('says when the client already paid and waiving refunds it', async () => {
    stubFetch(() => makeBody({ payment: { mode: 'pay_now', state: 'none', hold_amount_minor: null } }))
    render(<PaymentPanel bookingId="b-1" />)
    const banner = await screen.findByTestId('fee-decision-banner')
    expect(banner.textContent).toContain(`The client paid ${eur(10000)}. Waiving refunds it.`)
  })

  it('shows no banner for a decided case', async () => {
    stubFetch(() => makeBody({
      allowed: [],
      fee_case: makeCase({ status: 'charged', charged_minor: 4000, decided_by: 'admin@example.com', decided_at: '2026-11-20T10:00:00Z' }),
    }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByTestId('fee-block')
    expect(screen.queryByTestId('fee-decision-banner')).toBeNull()
  })
})

// ── Surface 4.2: fee block ───────────────────────────────────────────────────

describe('Fee sub-block (UI-SPEC 4.2)', () => {
  it('lists the facts of a pending late cancel and leaves null facts out', async () => {
    stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" />)
    const block = await screen.findByTestId('fee-block')
    expect(within(block).getByText('Late cancellation')).toBeDefined()
    expect(within(block).getByText('Decision needed')).toBeDefined()
    expect(within(block).getByText('Proposed fee')).toBeDefined()
    expect(within(block).queryByText('Charged fee')).toBeNull()
    expect(within(block).queryByText('Reason')).toBeNull()
    expect(within(block).queryByText('Contact attempt')).toBeNull()
    expect(within(block).queryByText('Evidence')).toBeNull()
  })

  it('shows the evidence list on a no-show only, with the contact note and the reason', async () => {
    stubFetch(() => makeBody({
      fee_case: makeCase({
        kind: 'no_show', evidence: NO_SHOW_EVIDENCE, contact_note: 'Called twice, no answer', reason: 'Wait confirmed',
      }),
    }))
    render(<PaymentPanel bookingId="b-1" />)
    const block = await screen.findByTestId('fee-block')
    const evidence = within(block).getByRole('list', { name: 'Evidence' })
    expect(within(evidence).getByText('Pickup time')).toBeDefined()
    expect(within(evidence).getByText('Driver arrived')).toBeDefined()
    expect(within(evidence).getByText('No-show requested')).toBeDefined()
    expect(within(evidence).getByText('30 min (city)')).toBeDefined()
    expect(within(block).getByText('Called twice, no answer')).toBeDefined()
    expect(within(block).getByText('Wait confirmed')).toBeDefined()
  })

  it('offers neither button after a decision', async () => {
    stubFetch(() => makeBody({ allowed: [], fee_case: makeCase({ status: 'waived', reason: 'Flight cancelled' }) }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByTestId('fee-block')
    expect(screen.queryByRole('button', { name: 'Charge fee…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Waive fee…' })).toBeNull()
  })

  it('renders buttons only from allowed_actions', async () => {
    stubFetch(() => makeBody({ allowed: ['waive_fee'] }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByRole('button', { name: 'Waive fee…' })
    expect(screen.queryByRole('button', { name: 'Charge fee…' })).toBeNull()
  })

  it('hides the waive button while a charge holds the amount lock', async () => {
    stubFetch(() => makeBody({ fee_case: makeCase({ charge_in_flight: true }) }))
    render(<PaymentPanel bookingId="b-1" />)
    await screen.findByRole('button', { name: 'Charge fee…' })
    expect(screen.queryByRole('button', { name: 'Waive fee…' })).toBeNull()
    expect(screen.getByText(/A charge is in progress/)).toBeDefined()
  })
})

// ── Surface 4.3: charge dialog ───────────────────────────────────────────────

describe('FeeChargeModal (E15)', () => {
  it('opens prefilled with the proposal, focus on the amount, and a readout that follows the typed value', async () => {
    stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openCharge()
    expect(within(dialog).getByText('Charge cancellation fee')).toBeDefined()
    const amount = within(dialog).getByLabelText(/Amount to charge \(EUR\)/) as HTMLInputElement
    expect(amount.value).toBe('100.00')
    await waitFor(() => expect(document.activeElement).toBe(amount))
    expect(within(dialog).getByRole('status').textContent).toBe(`100% of the booking amount of ${eur(10000)}`)
    expect(dialog.textContent).toContain(`Up to ${eur(10000)}, which is 100% of the booking.`)
    expect(dialog.textContent).toContain('The fee is taken from the hold of')
    expect(dialog.textContent).toContain('the rest of the hold is released.')

    fireEvent.change(amount, { target: { value: '40' } })
    expect(within(dialog).getByRole('status').textContent).toBe(`40% of the booking amount of ${eur(10000)}`)
    expect(within(dialog).getByRole('button', { name: `Charge ${eur(4000)}` })).toBeDefined()
  })

  it('late cancel has no note field; no-show requires a note of 10 characters', async () => {
    stubFetch(() => makeBody())
    const first = render(<PaymentPanel bookingId="b-1" />)
    let dialog = await openCharge()
    expect(within(dialog).queryByLabelText('How did you try to reach the passenger?')).toBeNull()
    first.unmount()

    stubFetch(() => makeBody({ fee_case: makeCase({ kind: 'no_show', evidence: NO_SHOW_EVIDENCE }), payment: { state: 'card_saved' } }))
    render(<PaymentPanel bookingId="b-1" />)
    dialog = await openCharge()
    expect(within(dialog).getByText('Charge no-show fee')).toBeDefined()
    const note = within(dialog).getByLabelText('How did you try to reach the passenger?')
    const primary = () => within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }) as HTMLButtonElement
    expect(primary().disabled).toBe(true)
    fireEvent.change(note, { target: { value: 'too short' } })
    expect(primary().disabled).toBe(true)
    fireEvent.change(note, { target: { value: 'Called twice, no answer' } })
    expect(primary().disabled).toBe(false)
    expect(dialog.textContent).toContain('The saved card is charged.')
  })

  it('says the part above the fee is refunded when the client already paid', async () => {
    stubFetch(() => makeBody({ payment: { mode: 'pay_now', state: 'none', hold_amount_minor: null } }))
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openCharge()
    expect(dialog.textContent).toContain(`${eur(10000)} was paid; the part above the fee is refunded.`)
  })

  it('disables the primary for a bad amount and explains it, without sending anything', async () => {
    const { posts } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openCharge()
    const amount = within(dialog).getByLabelText(/Amount to charge/)
    const primary = () => within(dialog).getByRole('button', { name: /^Charge/ }) as HTMLButtonElement

    fireEvent.change(amount, { target: { value: '10.101' } })
    expect(primary().disabled).toBe(true)
    expect(within(dialog).getByText('Use at most 2 decimals.')).toBeDefined()

    fireEvent.change(amount, { target: { value: '100.01' } })
    expect(primary().disabled).toBe(true)
    expect(within(dialog).getByText('The amount is more than the money still held for this booking.')).toBeDefined()

    fireEvent.change(amount, { target: { value: '0' } })
    expect(primary().disabled).toBe(true)
    expect(within(dialog).getByText('The amount must be more than zero.')).toBeDefined()

    fireEvent.click(primary())
    expect(posts()).toHaveLength(0)
  })

  it('tracer: posts the integer amount, closes, refetches and shows the result line', async () => {
    const { calls, posts } = stubFetch(() => makeBody(), { status: 200, body: { outcome: 'ok' } })
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openCharge()
    fireEvent.change(within(dialog).getByLabelText(/Amount to charge/), { target: { value: '40.10' } })
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: ' Regular fee ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(4010)}` }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts()).toHaveLength(1)
    expect(posts()[0].url).toBe('/api/admin/bookings/b-1/fee')
    expect(posts()[0].body).toEqual({ action: 'charge', amount_minor: 4010, reason: 'Regular fee' })
    // one GET on mount, one refetch after the answer
    await waitFor(() => expect(calls.filter(c => c.method === 'GET')).toHaveLength(2))
    expect((await screen.findByText(`Done. ${eur(4010)} was charged and the client was emailed.`)).getAttribute('role')).toBe('status')
  })

  it('sends the contact note of a no-show and no currency', async () => {
    const { posts } = stubFetch(
      () => makeBody({ fee_case: makeCase({ kind: 'no_show', evidence: NO_SHOW_EVIDENCE }), payment: { state: 'card_saved' } }),
    )
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openCharge()
    fireEvent.change(within(dialog).getByLabelText('How did you try to reach the passenger?'), { target: { value: '  Called twice, no answer  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0].body).toEqual({ action: 'charge', amount_minor: 10000, contact_note: 'Called twice, no answer' })
  })

  it('shows Working… and cannot be dismissed while the request is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise(resolve => { release = resolve })
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(makeBody()) })
      return pending.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({ outcome: 'ok' }) }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openCharge()
    fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))

    const working = await within(dialog).findByRole('button', { name: 'Working…' }) as HTMLButtonElement
    expect(working.disabled).toBe(true)
    expect((within(dialog).getByRole('button', { name: "Don't charge" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeNull()
    // a second click sends nothing
    fireEvent.click(working)
    expect(fetchMock.mock.calls.filter(c => (c[1]?.method ?? 'GET') === 'POST')).toHaveLength(1)

    release(null)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  describe('responses of the fee route (UI-SPEC 4.3 table)', () => {
    it('200 declined: closes, refetches, danger line with the payment link', async () => {
      stubFetch(() => makeBody(), { status: 200, body: { outcome: 'declined' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      const line = await screen.findByText(`The card was declined. The client was emailed a payment link for ${eur(10000)}.`)
      expect(line.getAttribute('style')).toContain('--status-danger-fg')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('409 amount_locked keeps the dialog open with its line', async () => {
      stubFetch(() => makeBody(), { status: 409, body: { error: 'amount_locked' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      expect((await within(dialog).findByRole('alert')).textContent).toBe(
        'A charge for another amount is already in progress. Wait for it to finish.',
      )
      expect(screen.queryByRole('dialog')).not.toBeNull()
    })

    it('409 payment_busy keeps the dialog open', async () => {
      stubFetch(() => makeBody(), { status: 409, body: { error: 'payment_busy' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      expect((await within(dialog).findByRole('alert')).textContent).toBe('Payment is being processed. Wait a moment and try again.')
    })

    it('422 amount_above_cap shows the inline field error and keeps the dialog open', async () => {
      stubFetch(() => makeBody(), { status: 422, body: { error: 'amount_above_cap' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      expect(await within(dialog).findByText('The amount is more than the money still held for this booking.')).toBeDefined()
      expect(screen.queryByRole('dialog')).not.toBeNull()
    })

    it('422 note_required shows the inline note error', async () => {
      stubFetch(
        () => makeBody({ fee_case: makeCase({ kind: 'no_show', evidence: NO_SHOW_EVIDENCE }), payment: { state: 'card_saved' } }),
        { status: 422, body: { error: 'note_required' } },
      )
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.change(within(dialog).getByLabelText('How did you try to reach the passenger?'), { target: { value: 'Called twice, no answer' } })
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      expect(await within(dialog).findByText('Add a note about how you tried to reach the passenger.')).toBeDefined()
      expect(screen.queryByRole('dialog')).not.toBeNull()
    })

    it('422 action_not_allowed closes, refetches and says the decision is gone', async () => {
      const { calls } = stubFetch(() => makeBody(), { status: 422, body: { error: 'action_not_allowed' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      expect(await screen.findByText('That decision is no longer available. The panel shows the current state.')).toBeDefined()
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(calls.filter(c => c.method === 'GET')).toHaveLength(2))
    })

    it('502 refund_failed keeps the dialog open, says what happened and what to do, and refetches', async () => {
      const { calls } = stubFetch(() => makeBody(), { status: 502, body: { error: 'refund_failed' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      const line = (await within(dialog).findByRole('alert')).textContent ?? ''
      expect(line).toContain('did not go through')
      expect(line).toContain('only what is still missing is refunded')
      expect(line).toContain('Press Charge again to retry')
      expect(line).toContain('Stripe Dashboard')
      expect(screen.queryByRole('dialog')).not.toBeNull()
      await waitFor(() => expect(calls.filter(c => c.method === 'GET')).toHaveLength(2))
    })

    it('401 shows the session line', async () => {
      stubFetch(() => makeBody(), { status: 401, body: { error: 'Unauthorized' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      expect((await within(dialog).findByRole('alert')).textContent).toBe('Your session has ended. Sign in again.')
    })

    it('a 5xx says the action may have partly completed and refetches', async () => {
      const { calls } = stubFetch(() => makeBody(), { status: 500, body: { error: 'x' } })
      render(<PaymentPanel bookingId="b-1" />)
      const dialog = await openCharge()
      fireEvent.click(within(dialog).getByRole('button', { name: `Charge ${eur(10000)}` }))
      expect((await within(dialog).findByRole('alert')).textContent).toBe(
        'The action may have partly completed. The panel now shows the current state.',
      )
      await waitFor(() => expect(calls.filter(c => c.method === 'GET')).toHaveLength(2))
    })
  })

  it('the source has no hard-coded currency symbol', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    for (const f of ['FeeChargeModal.tsx', 'FeeDecisionBanner.tsx', 'paymentShared.ts']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/admin', f), 'utf8')
      expect(src.includes('€'), f).toBe(false)
    }
  })
})

// ── Surface 4.4: waive dialog (E16) ──────────────────────────────────────────

async function openWaive() {
  fireEvent.click(await screen.findByRole('button', { name: 'Waive fee…' }))
  return screen.findByRole('dialog')
}

describe('FeeWaiveModal (E16)', () => {
  it('names what happens to the money in each of the three cases', async () => {
    stubFetch(() => makeBody())
    const hold = render(<PaymentPanel bookingId="b-1" />)
    let dialog = await openWaive()
    expect(dialog.textContent).toContain(`Waive the fee for booking PRE-FEE1? The hold of ${eur(10000)} is released. This cannot be undone.`)
    hold.unmount()

    stubFetch(() => makeBody({ payment: { mode: 'pay_now', state: 'none', hold_amount_minor: null } }))
    const paid = render(<PaymentPanel bookingId="b-1" />)
    dialog = await openWaive()
    expect(dialog.textContent).toContain(`${eur(10000)} is refunded to the client.`)
    paid.unmount()

    stubFetch(() => makeBody({ payment: { state: 'card_saved', hold_amount_minor: null } }))
    render(<PaymentPanel bookingId="b-1" />)
    dialog = await openWaive()
    expect(dialog.textContent).toContain('The client is not charged.')
  })

  it('focuses the reason, and the waive request can not be sent with an empty reason', async () => {
    const { posts } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openWaive()
    const reason = within(dialog).getByLabelText('Reason') as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(reason))
    const primary = within(dialog).getByRole('button', { name: 'Waive fee' }) as HTMLButtonElement
    expect(primary.disabled).toBe(true)
    fireEvent.click(primary)
    fireEvent.change(reason, { target: { value: '   ' } })
    expect(primary.disabled).toBe(true)
    fireEvent.click(primary)
    expect(posts()).toHaveLength(0)
  })

  it('suggestion buttons fill the reason and the text stays editable', async () => {
    const { posts } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openWaive()
    const reason = within(dialog).getByLabelText('Reason') as HTMLInputElement
    for (const text of ['Flight cancelled', 'Regular client', 'Prestigo error']) {
      fireEvent.click(within(dialog).getByRole('button', { name: text }))
      expect(reason.value).toBe(text)
    }
    fireEvent.change(reason, { target: { value: 'Prestigo error, late pickup' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Waive fee' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0].body).toEqual({ action: 'waive', reason: 'Prestigo error, late pickup' })
  })

  it('closes, refetches and shows the ok line', async () => {
    const { calls } = stubFetch(() => makeBody())
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openWaive()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Flight cancelled' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Waive fee' }))
    expect(await screen.findByText('Done. The fee was waived and the client was emailed.')).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(calls.filter(c => c.method === 'GET')).toHaveLength(2))
  })

  it('502 refund_failed stays open and says what to do next', async () => {
    stubFetch(() => makeBody(), { status: 502, body: { error: 'refund_failed' } })
    render(<PaymentPanel bookingId="b-1" />)
    const dialog = await openWaive()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Flight cancelled' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Waive fee' }))
    const line = (await within(dialog).findByRole('alert')).textContent ?? ''
    expect(line).toContain('The refund did not go through, so the case stays open.')
    expect(line).toContain('Press Waive fee again to retry')
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('409 payment_busy and 422 behave like the charge dialog', async () => {
    stubFetch(() => makeBody(), { status: 409, body: { error: 'payment_busy' } })
    const busy = render(<PaymentPanel bookingId="b-1" />)
    let dialog = await openWaive()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Regular client' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Waive fee' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Payment is being processed. Wait a moment and try again.')
    busy.unmount()

    stubFetch(() => makeBody(), { status: 422, body: { error: 'action_not_allowed' } })
    render(<PaymentPanel bookingId="b-1" />)
    dialog = await openWaive()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Regular client' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Waive fee' }))
    expect(await screen.findByText('That decision is no longer available. The panel shows the current state.')).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// ── Surface 5.6: ledger labels, notes never in the list ──────────────────────

function ev(id: number, kind: string, over: Record<string, unknown> = {}) {
  return {
    id,
    created_at: '2026-11-20T10:00:00Z',
    kind,
    amount_minor: null,
    currency: null,
    actor_type: 'admin',
    actor_id: 'op@example.com',
    error_code: null,
    ...over,
  }
}

describe('payment history labels (UI-SPEC 5.6)', () => {
  it('labels fee_opened, cash_settled, cash_reopened and shows the short code of admin_action rows', async () => {
    stubFetch(() => makeBody({
      allowed: [],
      fee_case: null,
      events: [
        ev(1, 'fee_opened', { actor_type: 'system', actor_id: null, error_code: 'late_cancel' }),
        ev(2, 'cash_settled'),
        ev(3, 'cash_reopened'),
        ev(4, 'admin_action', { error_code: 'fee_charge' }),
      ],
    }))
    render(<PaymentPanel bookingId="b-1" />)
    const list = await screen.findByRole('list', { name: 'Payment history' })
    expect(within(list).getByText('Fee decision opened')).toBeDefined()
    expect(within(list).getByText('Paid in cash')).toBeDefined()
    expect(within(list).getByText('Cash confirmation reversed')).toBeDefined()
    expect(within(list).getByText('Operator action')).toBeDefined()
    expect(within(list).getByText('fee_charge')).toBeDefined()
  })

  it('waived reads "Fee waived" with a case and "Balance waived" without one', async () => {
    stubFetch(() => makeBody({
      allowed: [],
      fee_case: makeCase({ status: 'waived', reason: 'Flight cancelled' }),
      events: [ev(1, 'waived')],
    }))
    const withCase = render(<PaymentPanel bookingId="b-1" />)
    expect(await within(await screen.findByRole('list', { name: 'Payment history' })).findByText('Fee waived')).toBeDefined()
    withCase.unmount()

    stubFetch(() => makeBody({ allowed: [], fee_case: null, events: [ev(1, 'waived')] }))
    render(<PaymentPanel bookingId="b-1" />)
    expect(await within(await screen.findByRole('list', { name: 'Payment history' })).findByText('Balance waived')).toBeDefined()
  })

  it('the operator reason shows in the Fee facts and never inside the history list', async () => {
    stubFetch(() => makeBody({
      allowed: [],
      fee_case: makeCase({ status: 'waived', reason: 'Secret waive reason', contact_note: 'Secret contact note' }),
      events: [ev(1, 'waived'), ev(2, 'admin_action', { error_code: 'fee_waive' })],
    }))
    render(<PaymentPanel bookingId="b-1" />)
    const block = await screen.findByTestId('fee-block')
    expect(within(block).getByText('Secret waive reason')).toBeDefined()
    const list = screen.getByRole('list', { name: 'Payment history' })
    expect(list.textContent).not.toContain('Secret waive reason')
    expect(list.textContent).not.toContain('Secret contact note')
  })
})
