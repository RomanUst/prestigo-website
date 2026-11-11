import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { formatMinor } from '@/lib/payments/money'
import { ExtraChargeModal, type ExtraChargeModalProps } from '@/components/admin/ExtraChargeModal'

// Phase 91-11 (EXTRA-01, D-09, D-10, D-16): the operator's extra charge dialog. Amounts in expectations come from formatMinor,
// never typed, so the test follows the money formatting like the component does.

const BOOKING = '77777777-7777-4777-8777-777777777777'
const eur = (minor: number) => formatMinor(minor, 'eur')

interface Answer { status: number; body: unknown }
interface Call { url: string; method: string; body: Record<string, unknown> | undefined }

/**
 * fetch stub: GET /extra?minutes=N goes to `get`, POST /extra to `post`; both are recorded. A handler may return a promise, so a
 * test can hold the POST open to prove the double-submit guard.
 */
function stubFetch(handlers: { get?: (minutes: number) => Answer; post?: (body: Record<string, unknown>) => Answer | Promise<Answer> }) {
  const calls: Call[] = []
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    calls.push({ url: String(url), method, body })
    let answer: Answer
    if (method === 'GET') {
      const minutes = Number(new URL(String(url), 'http://localhost').searchParams.get('minutes'))
      answer = handlers.get ? handlers.get(minutes) : { status: 500, body: null }
    } else {
      answer = handlers.post ? await handlers.post(body ?? {}) : { status: 500, body: null }
    }
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: () => Promise.resolve(answer.body) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, gets: () => calls.filter((c) => c.method === 'GET'), posts: () => calls.filter((c) => c.method === 'POST') }
}

function renderModal(over: Partial<ExtraChargeModalProps> = {}) {
  const props: ExtraChargeModalProps = {
    isOpen: true,
    bookingId: BOOKING,
    currency: 'eur',
    inFlight: null,
    onClose: vi.fn(),
    onDone: vi.fn(),
    onRefetch: vi.fn(),
    ...over,
  }
  render(<ExtraChargeModal {...props} />)
  return props
}

const CHARGED = (amount_minor: number) => ({ status: 200, body: { outcome: 'charged', charge_id: 'c-1', amount_minor, currency: 'eur' } })
const primary = (name: RegExp | string) => screen.getByRole('button', { name }) as HTMLButtonElement

function fillOther(description: string, amount: string) {
  fireEvent.change(screen.getByLabelText('Shown to the client in the receipt'), { target: { value: description } })
  fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: amount } })
}

async function previewWaiting(minutes: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Extra waiting' }))
  fireEvent.change(screen.getByLabelText('Billable minutes'), { target: { value: minutes } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ── Task 1 (tracer): the "Other" mode ────────────────────────────────────────

describe('ExtraChargeModal: other mode (D-09 b, D-10)', () => {
  it('states the amount on the primary button and charges exactly once from that button', async () => {
    const net = stubFetch({ post: () => CHARGED(1500) })
    const props = renderModal()

    // before anything is typed the primary is off and the statement is already there
    expect(primary(/Charge/).disabled).toBe(true)
    expect(screen.getByText('The saved card is charged now. The client gets an email receipt.')).toBeDefined()

    fillOther('Airport parking', '15.00')
    const button = primary(`Charge ${eur(1500)} to the saved card`)
    expect(button.disabled).toBe(false)
    fireEvent.click(button)

    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1))
    expect(net.posts()).toHaveLength(1)
    expect(net.posts()[0].url).toBe(`/api/admin/bookings/${BOOKING}/extra`)
    expect(net.posts()[0].body).toEqual({ kind: 'other', description: 'Airport parking', amount_minor: 1500 })
    expect(props.onClose).toHaveBeenCalled()
    expect(vi.mocked(props.onDone).mock.calls[0][0]).toEqual({
      ok: true,
      text: `${eur(1500)} was charged to the saved card and the client was emailed a receipt.`,
    })
  })

  it('labels the description as shown to the client in the receipt', () => {
    stubFetch({})
    renderModal()
    expect(screen.getByLabelText('Shown to the client in the receipt')).toBeDefined()
  })

  it('keeps the primary disabled for a short description or an empty / invalid amount, and never sends', () => {
    const net = stubFetch({ post: () => CHARGED(1500) })
    renderModal()

    fillOther('ab', '15.00')
    expect(primary(/Charge/).disabled).toBe(true)

    fillOther('Airport parking', '')
    expect(primary(/Charge/).disabled).toBe(true)

    fillOther('Airport parking', '15.001')
    expect(primary(/Charge/).disabled).toBe(true)
    expect(screen.getByText('Use at most 2 decimals.')).toBeDefined()

    fillOther('Airport parking', '0')
    expect(primary(/Charge/).disabled).toBe(true)

    fireEvent.click(primary(/Charge/))
    expect(net.posts()).toHaveLength(0)
  })

  it('sends the typed minor units by string handling (10.10 is 1010)', async () => {
    const net = stubFetch({ post: () => CHARGED(1010) })
    const props = renderModal()
    fillOther('  Child seat  ', '10,10')
    fireEvent.click(primary(`Charge ${eur(1010)} to the saved card`))
    await waitFor(() => expect(props.onDone).toHaveBeenCalled())
    expect(net.posts()[0].body).toEqual({ kind: 'other', description: 'Child seat', amount_minor: 1010 })
  })
})

// ── Task 2: waiting mode and every non-happy answer ──────────────────────────

describe('ExtraChargeModal: waiting mode (D-09 a, D-16)', () => {
  it('asks the server for the amount once, shows minutes, blocks and amount, and posts expected_amount_minor equal to it', async () => {
    const net = stubFetch({
      get: () => ({ status: 200, body: { amount_minor: 3000, currency: 'eur', blocks: 3, rate_per_block_eur: 10 } }),
      post: () => CHARGED(3000),
    })
    const props = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Extra waiting' }))
    expect(screen.getByText('Enter only the billable minutes beyond the free waiting.')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Billable minutes'), { target: { value: '45' } })
    expect(await screen.findByText('45 min = 3 × 15 min')).toBeDefined()
    expect(screen.getByText(eur(3000))).toBeDefined()
    expect(net.gets()).toHaveLength(1)
    expect(net.gets()[0].url).toBe(`/api/admin/bookings/${BOOKING}/extra?minutes=45`)

    fireEvent.click(primary(`Charge ${eur(3000)} to the saved card`))
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1))
    expect(net.posts()).toHaveLength(1)
    expect(net.posts()[0].body).toEqual({ kind: 'waiting', minutes: 45, expected_amount_minor: 3000 })
  })

  it('never lets a stale amount reach the button: new minutes need a new preview', async () => {
    stubFetch({
      get: (m) => ({ status: 200, body: { amount_minor: m * 100, currency: 'eur', blocks: Math.ceil(m / 15) } }),
      post: () => CHARGED(1),
    })
    renderModal()
    await previewWaiting('30')
    await screen.findByText('30 min = 2 × 15 min')
    expect(primary(/Charge/).disabled).toBe(false)

    fireEvent.change(screen.getByLabelText('Billable minutes'), { target: { value: '31' } })
    expect(primary(/Charge/).disabled).toBe(true)
    await screen.findByText('31 min = 3 × 15 min')
    expect(primary(/Charge/).disabled).toBe(false)
  })

  it('invalid minutes ask the server nothing', async () => {
    const net = stubFetch({ get: () => ({ status: 200, body: {} }) })
    renderModal()
    await previewWaiting('0')
    fireEvent.change(screen.getByLabelText('Billable minutes'), { target: { value: '481' } })
    fireEvent.change(screen.getByLabelText('Billable minutes'), { target: { value: '4x' } })
    await new Promise((r) => setTimeout(r, 450))
    expect(net.gets()).toHaveLength(0)
    expect(primary(/Charge/).disabled).toBe(true)
  })

  it('422 waiting_rate_missing says where to set the rate and offers no charge', async () => {
    const net = stubFetch({ get: () => ({ status: 422, body: { error: 'waiting_rate_missing' } }) })
    renderModal()
    await previewWaiting('45')
    expect(await screen.findByText('No waiting rate is set for this class in Admin > Pricing.')).toBeDefined()
    expect(primary(/Charge/).disabled).toBe(true)
    fireEvent.click(primary(/Charge/))
    expect(net.posts()).toHaveLength(0)
  })

  it('amount_changed shows the new amount and sends nothing until a fresh click', async () => {
    const net = stubFetch({
      get: () => ({ status: 200, body: { amount_minor: 3000, currency: 'eur', blocks: 3 } }),
      post: (body) =>
        body.expected_amount_minor === 3000
          ? { status: 409, body: { error: 'amount_changed', amount_minor: 4000 } }
          : CHARGED(4000),
    })
    const props = renderModal()
    await previewWaiting('45')
    await screen.findByText('45 min = 3 × 15 min')
    fireEvent.click(primary(`Charge ${eur(3000)} to the saved card`))

    expect(await screen.findByText(`The amount changed to ${eur(4000)}. Check it and press the button again.`)).toBeDefined()
    expect(net.posts()).toHaveLength(1) // no automatic re-send
    expect(props.onDone).not.toHaveBeenCalled()

    fireEvent.click(primary(`Charge ${eur(4000)} to the saved card`))
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1))
    expect(net.posts()).toHaveLength(2)
    expect(net.posts()[1].body).toEqual({ kind: 'waiting', minutes: 45, expected_amount_minor: 4000 })
  })
})

describe('ExtraChargeModal: answers that charge nothing', () => {
  it('declined: says so with the code, stays open and refetches', async () => {
    stubFetch({ post: () => ({ status: 200, body: { outcome: 'declined', charge_id: 'c-1', code: 'insufficient_funds' } }) })
    const props = renderModal()
    fillOther('Airport parking', '15.00')
    fireEvent.click(primary(/Charge/))

    expect(await screen.findByText('The card was declined (insufficient_funds). Nothing was charged.')).toBeDefined()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onDone).not.toHaveBeenCalled()
    expect(props.onRefetch).toHaveBeenCalledTimes(1)
  })

  it('payment_busy: a charge is still being processed', async () => {
    stubFetch({ post: () => ({ status: 409, body: { error: 'payment_busy' } }) })
    const props = renderModal()
    fillOther('Airport parking', '15.00')
    fireEvent.click(primary(/Charge/))
    expect(await screen.findByText('A charge is still being processed. Try again in a few minutes.')).toBeDefined()
    expect(props.onDone).not.toHaveBeenCalled()
  })

  it('action_not_allowed: the reason in plain words', async () => {
    stubFetch({ post: () => ({ status: 422, body: { error: 'action_not_allowed', reason: 'consent_not_covered' } }) })
    const props = renderModal()
    fillOther('Airport parking', '15.00')
    fireEvent.click(primary(/Charge/))
    expect(await screen.findByText("The client's card consent does not cover extra charges.")).toBeDefined()
    expect(props.onDone).not.toHaveBeenCalled()
    expect(props.onRefetch).toHaveBeenCalled()
  })

  it('a 500 never claims that nothing was charged', async () => {
    stubFetch({ post: () => ({ status: 500, body: { error: 'Payment action failed' } }) })
    renderModal()
    fillOther('Airport parking', '15.00')
    fireEvent.click(primary(/Charge/))
    expect(await screen.findByText('The action may have partly completed. The panel now shows the current state.')).toBeDefined()
  })

  it('a lost answer (network error) is reported the same way', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const props = renderModal()
    fillOther('Airport parking', '15.00')
    fireEvent.click(primary(/Charge/))
    expect(await screen.findByText('The action may have partly completed. The panel now shows the current state.')).toBeDefined()
    expect(props.onRefetch).toHaveBeenCalled()
  })
})

describe('ExtraChargeModal: a pending charge (resume)', () => {
  const pending = (resumable: boolean) => ({
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'other' as const,
    amount_minor: 900,
    currency: 'eur' as const,
    requested_at: '2026-11-11T10:00:00.000Z',
    resumable,
  })

  it('resumable: offers "Retry the pending charge of X" and posts resume once', async () => {
    const net = stubFetch({ post: () => CHARGED(900) })
    const props = renderModal({ inFlight: pending(true) })
    expect(screen.queryByLabelText('Shown to the client in the receipt')).toBeNull()
    fireEvent.click(primary(`Retry the pending charge of ${eur(900)}`))
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1))
    expect(net.posts()).toHaveLength(1)
    expect(net.posts()[0].body).toEqual({ kind: 'resume', charge_id: '22222222-2222-4222-8222-222222222222' })
  })

  it('not yet resumable: the busy message and no charge button', () => {
    const net = stubFetch({})
    renderModal({ inFlight: pending(false) })
    expect(screen.getByText('A charge is still being processed. Try again in a few minutes.')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Retry the pending charge/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Charge/ })).toBeNull()
    expect(net.posts()).toHaveLength(0)
  })
})

describe('ExtraChargeModal: one request at a time (T-91-36)', () => {
  it('a double click sends one request; Escape and Close do nothing while it is in flight', async () => {
    let release: (a: Answer) => void = () => {}
    const held = new Promise<Answer>((resolve) => { release = resolve })
    const net = stubFetch({ post: () => held })
    const props = renderModal()
    fillOther('Airport parking', '15.00')

    const button = primary(`Charge ${eur(1500)} to the saved card`)
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(net.posts()).toHaveLength(1))
    expect(primary(/Working/).disabled).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).not.toHaveBeenCalled()

    release(CHARGED(1500))
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1))
    expect(net.posts()).toHaveLength(1)
  })

  it('closes on Escape when nothing is in flight', () => {
    stubFetch({})
    const props = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
