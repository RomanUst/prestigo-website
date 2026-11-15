import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Suspense } from 'react'
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react'

// Phase 92-26 (QUOTE-03, QUOTE-04; D-03, D-11, D-12, D-16, D-17): the money dialogs of a paid quote. The REAL page is
// rendered (page -> QuoteBuilder -> QuoteActionsBar -> dialogs), so the mount is proved. The routes of 92-22 and 92-24 are
// a fetch mock that answers the contracts documented in their summaries.

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/quotes/q1',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>
  ),
}))

vi.mock('@/components/booking/AddressInput', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}))

import QuoteDetailPage from '@/app/(internal)/admin/(dashboard)/quotes/[id]/page'
import { formatMinor } from '@/lib/payments/money'

const QUOTE_ID = '3f2b1c9e-0000-4000-8000-000000000001'

type Json = Record<string, unknown>

const eur = (minor: number) => formatMinor(minor, 'eur')

function lineRow(): Json {
  return {
    id: 'line-1',
    version_id: 'v1',
    position: 1,
    trip_type: 'transfer',
    pickup_date: '2027-03-10',
    pickup_time: '09:30:00',
    landing_date: null,
    landing_time: null,
    pickup_offset_min: null,
    origin_address: 'Prague Airport',
    origin_lat: 50.1,
    origin_lng: 14.26,
    destination_address: 'Vienna Hotel',
    destination_lat: 48.2,
    destination_lng: 16.37,
    vehicle_class: 'business',
    passengers: 2,
    luggage: 1,
    hours: null,
    return_date: null,
    distance_km: 330,
    flight_number: null,
    terminal: null,
    special_requests: null,
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    suggested_amount_minor: 30000,
    amount_minor: 30000,
    price_overridden: false,
    deposit_share_minor: 9000,
    remainder_minor: 21000,
    amount_eur: null,
    amount_czk: null,
    stops: [],
  }
}

function booking(o: Json = {}): Json {
  return {
    id: 'b1',
    booking_reference: 'PR-1',
    status: 'confirmed',
    payment_mode: 'quote',
    payment_state: null,
    paid_at: null,
    pickup_date: '2027-03-10',
    pickup_time: '09:30:00',
    quote_line_id: 'line-1',
    ...o,
  }
}

interface DetailOptions {
  status?: string
  method?: string
  quote?: Json
  bookings?: Json[]
}

function detail(o: DetailOptions = {}): Json {
  const status = o.status ?? 'paid'
  return {
    quote: {
      id: QUOTE_ID,
      reference: 'Q-20261114-ABC123',
      status: status === 'cancelled' ? 'paid' : status,
      current_version_id: 'v1',
      client_first_name: 'Anna',
      client_last_name: 'Novak',
      client_email: 'anna@example.com',
      client_phone: '+420123456789',
      lead_channel: 'email',
      expires_at: null,
      cancelled_at: status === 'cancelled' ? '2026-11-14T10:00:00.000Z' : null,
      paid_at: '2026-11-14T09:00:00.000Z',
      deposit_payment_intent_id: 'pi_deposit',
      deposit_refunded_minor: 0,
      remainder_refunded_minor: 0,
      remainder_payment_intent_id: null,
      remainder_amount_minor: null,
      remainder_paid_at: null,
      invoice_number: null,
      invoice_paid_at: null,
      ...(o.quote ?? {}),
    },
    version: {
      id: 'v1',
      quote_id: QUOTE_ID,
      version_no: 1,
      frozen_at: '2026-11-14T10:00:00.000Z',
      locale: 'en',
      currency: 'eur',
      total_minor: 30000,
      deposit_kind: 'percent',
      deposit_value: 30,
      deposit_minor: 9000,
      remainder_method: o.method ?? 'saved_card',
      cancel_free_hours: 48,
      cancel_fee_percent: 100,
      billing_name: null,
      billing_address: null,
      billing_company_id: null,
      billing_vat_id: null,
      billing_note: null,
    },
    lines: [lineRow()],
    versions: [{ id: 'v1', version_no: 1, frozen_at: '2026-11-01T10:00:00.000Z' }],
    events: [],
    bookings: o.bookings ?? [booking()],
    effective_status: status,
    links_count: 0,
  }
}

interface Call {
  url: string
  method: string
  body: Json | null
}

type Answer = { status: number; body: unknown; then?: Json }

let calls: Call[]
let current: Json
let previews: Record<string, Answer>
let answers: Record<string, Answer>
let hold: Promise<void> | null

function installFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? (JSON.parse(String(init.body)) as Json) : null })
      const reply = (a: Answer) =>
        ({ ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body }) as Response
      if (method === 'GET') {
        if (url.includes('/cancel')) {
          const initiator = new URL(url, 'http://x').searchParams.get('initiator') ?? 'admin_client'
          return reply(previews[initiator] ?? { status: 500, body: null })
        }
        return reply({ status: 200, body: current })
      }
      const action = url.split('/').pop() as string
      if (hold) await hold
      const a = answers[action]
      if (a.then) current = a.then
      return reply(a)
    }),
  )
}

const posts = (action?: string) => calls.filter((c) => c.method === 'POST' && (!action || c.url.endsWith(`/${action}`)))
const previewCalls = () => calls.filter((c) => c.method === 'GET' && c.url.includes('/cancel'))

async function renderPage(initial: Json) {
  current = initial
  answers = {}
  previews = {}
  hold = null
  installFetch()
  const params = Promise.resolve({ id: QUOTE_ID })
  await act(async () => {
    render(
      <Suspense fallback={<p>suspended</p>}>
        <QuoteDetailPage params={params} />
      </Suspense>,
    )
    await params
  })
  await screen.findByTestId('quote-builder')
}

// Both clicks land before React re-renders (one act scope): only the in-flight ref can stop the second request, the disabled
// button cannot.
async function doubleClick(el: HTMLElement) {
  await act(async () => {
    el.click()
    el.click()
  })
}

const bar = () => screen.getByTestId('quote-actions')
const dialog = () => screen.getByRole('dialog')

const FREE = { outcome: 'free', freeUntilMs: 1, depositMinor: 9000, refundedMinor: 0, keptMinor: 0, proposedRefundMinor: 9000, remainderRefundMinor: 0 }
const LATE_100 = { outcome: 'late', freeUntilMs: 1, depositMinor: 9000, refundedMinor: 0, keptMinor: 9000, proposedRefundMinor: 0, remainderRefundMinor: 0 }
const LATE_50 = { outcome: 'late', freeUntilMs: 1, depositMinor: 9000, refundedMinor: 0, keptMinor: 4500, proposedRefundMinor: 4500, remainderRefundMinor: 0 }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openCancel(preview: Json) {
  await renderPage(detail())
  previews.admin_client = { status: 200, body: preview }
  previews.admin_prestigo = { status: 200, body: FREE }
  fireEvent.click(within(bar()).getByTestId('quote-action-cancel'))
  await within(dialog()).findByTestId('quote-cancel-outcome')
}

describe('cancel a paid quote (D-03, D-11)', () => {
  it('the real page mounts the Cancel quote button on a paid quote, in the actions bar inside the builder', async () => {
    await renderPage(detail())
    expect(within(screen.getByTestId('quote-builder')).getByTestId('quote-actions')).toBeInTheDocument()
    expect(within(bar()).getByTestId('quote-action-cancel')).toBeEnabled()
    expect(within(bar()).getByTestId('quote-cancel-effect')).toHaveTextContent(/Only you can cancel a paid quote/)
    expect(within(bar()).queryByTestId('quote-money-note')).toBeNull()
  })

  it('does not offer the paid cancel on states that are not paid', async () => {
    await renderPage(detail({ status: 'sent' }))
    expect(within(bar()).queryByTestId('quote-action-cancel')).toBeNull()
  })

  it('tracer: free window states the refund first, then posts { admin_client, null } once on a double click', async () => {
    await openCancel(FREE)
    expect(posts()).toHaveLength(0)
    expect(previewCalls()[0].url).toContain('initiator=admin_client')
    expect(within(dialog()).getByText(`Free. The deposit of ${eur(9000)} is refunded in full.`)).toBeInTheDocument()
    expect(within(dialog()).getByTestId('quote-cancel-total')).toHaveTextContent(`Refunded to the client's card now: ${eur(9000)}`)
    expect(within(dialog()).queryByTestId('quote-cancel-refund')).toBeNull()

    answers.cancel = { status: 200, body: { ok: true, outcome: 'free', refundedMinor: 9000, refundFailed: false }, then: detail({ status: 'cancelled' }) }
    const primary = within(dialog()).getByRole('button', { name: 'Cancel quote and refund' })
    await doubleClick(primary)
    await waitFor(() => expect(posts('cancel')).toHaveLength(1))
    expect(posts('cancel')[0].body).toEqual({ initiator: 'admin_client', refund_minor: null })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(bar()).getByRole('status')).toHaveTextContent(`Quote cancelled. ${eur(9000)} refunded to the client's card.`)
    // The page refetched: the cancelled quote no longer offers the cancel.
    await waitFor(() => expect(within(bar()).queryByTestId('quote-action-cancel')).toBeNull())
  })

  it('says that a remainder paid on the page is refunded in full', async () => {
    await openCancel({ ...FREE, remainderRefundMinor: 21000 })
    expect(within(dialog()).getByText(`The remainder paid on the quote page, ${eur(21000)}, is refunded in full.`)).toBeInTheDocument()
    expect(within(dialog()).getByTestId('quote-cancel-total')).toHaveTextContent(eur(30000))
  })

  it('late, fee 100: the deposit is kept and the refund input is prefilled 0.00', async () => {
    await openCancel(LATE_100)
    expect(within(dialog()).getByText(`Late. Under this quote's terms the deposit of ${eur(9000)} is kept.`)).toBeInTheDocument()
    expect(within(dialog()).getByTestId('quote-cancel-refund')).toHaveValue('0.00')
    answers.cancel = { status: 200, body: { ok: true, outcome: 'late', refundedMinor: 0, refundFailed: false }, then: detail({ status: 'cancelled' }) }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote, no refund' }))
    await waitFor(() => expect(posts('cancel')).toHaveLength(1))
    expect(posts('cancel')[0].body).toEqual({ initiator: 'admin_client', refund_minor: 0 })
    await waitFor(() => expect(within(bar()).getByRole('status')).toHaveTextContent('Quote cancelled. Nothing was refunded.'))
  })

  it('late, fee 50: prefilled with half; an amount typed in the currency is sent in minor units', async () => {
    await openCancel(LATE_50)
    expect(within(dialog()).getByTestId('quote-cancel-refund')).toHaveValue('45.00')
    fireEvent.change(within(dialog()).getByTestId('quote-cancel-refund'), { target: { value: '12,30' } })
    expect(within(dialog()).getByTestId('quote-cancel-total')).toHaveTextContent(`Kept by Prestigo: ${eur(9000 - 1230)}`)
    answers.cancel = { status: 200, body: { ok: true, outcome: 'late', refundedMinor: 1230, refundFailed: false }, then: detail({ status: 'cancelled' }) }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote and refund' }))
    await waitFor(() => expect(posts('cancel')).toHaveLength(1))
    expect(posts('cancel')[0].body).toEqual({ initiator: 'admin_client', refund_minor: 1230 })
  })

  it('an input above the bound shows "At most <amount>" and disables the button', async () => {
    await openCancel(LATE_50)
    fireEvent.change(within(dialog()).getByTestId('quote-cancel-refund'), { target: { value: '90.01' } })
    expect(within(dialog()).getByTestId('quote-cancel-refund-problem')).toHaveTextContent(`At most ${eur(9000)}`)
    expect(within(dialog()).getByRole('button', { name: /Cancel quote/ })).toBeDisabled()
    fireEvent.change(within(dialog()).getByTestId('quote-cancel-refund'), { target: { value: '90.00' } })
    expect(within(dialog()).getByRole('button', { name: /Cancel quote/ })).toBeEnabled()
    fireEvent.change(within(dialog()).getByTestId('quote-cancel-refund'), { target: { value: 'abc' } })
    expect(within(dialog()).getByRole('button', { name: /Cancel quote/ })).toBeDisabled()
    expect(posts()).toHaveLength(0)
  })

  it('the bound takes the earlier refunds into account', async () => {
    await openCancel({ ...LATE_50, refundedMinor: 2000, proposedRefundMinor: 2500 })
    expect(within(dialog()).getByTestId('quote-cancel-refund')).toHaveValue('25.00')
    fireEvent.change(within(dialog()).getByTestId('quote-cancel-refund'), { target: { value: '70.01' } })
    expect(within(dialog()).getByTestId('quote-cancel-refund-problem')).toHaveTextContent(`At most ${eur(7000)}`)
  })

  it('"Prestigo cancels" turns a late preview into free (the server answers again) and posts admin_prestigo', async () => {
    await openCancel(LATE_100)
    expect(within(dialog()).getByTestId('quote-cancel-refund')).toBeInTheDocument()
    fireEvent.click(within(dialog()).getByTestId('quote-cancel-prestigo'))
    await within(dialog()).findByText(`Free. The deposit of ${eur(9000)} is refunded in full.`)
    expect(previewCalls().at(-1)?.url).toContain('initiator=admin_prestigo')
    expect(within(dialog()).queryByTestId('quote-cancel-refund')).toBeNull()
    answers.cancel = { status: 200, body: { ok: true, outcome: 'free', refundedMinor: 9000, refundFailed: false }, then: detail({ status: 'cancelled' }) }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote and refund' }))
    await waitFor(() => expect(posts('cancel')).toHaveLength(1))
    expect(posts('cancel')[0].body).toEqual({ initiator: 'admin_prestigo', refund_minor: null })
  })

  it('cannot be dismissed while the request runs, and a double click is one request', async () => {
    await openCancel(FREE)
    let release: () => void = () => {}
    hold = new Promise<void>((r) => { release = r })
    answers.cancel = { status: 200, body: { ok: true, outcome: 'free', refundedMinor: 9000, refundFailed: false }, then: detail({ status: 'cancelled' }) }
    const primary = within(dialog()).getByRole('button', { name: 'Cancel quote and refund' })
    await doubleClick(primary)
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Go back' })).toBeDisabled())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(posts('cancel')).toHaveLength(1)
    await act(async () => { release() })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts('cancel')).toHaveLength(1)
  })

  it('422 trips_started says so, plainly', async () => {
    await openCancel(FREE)
    answers.cancel = { status: 422, body: { error: 'trips_started' } }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote and refund' }))
    expect(await within(dialog()).findByText('A trip of this quote has started. Cancel single trips in Bookings and refund here.')).toBeInTheDocument()
  })

  it('refundFailed keeps the cancel, shows the sentence and leaves only Close', async () => {
    await openCancel(FREE)
    answers.cancel = { status: 200, body: { ok: true, outcome: 'free', refundedMinor: 0, refundFailed: true }, then: detail({ status: 'cancelled' }) }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote and refund' }))
    expect(await within(dialog()).findByText('Cancelled. The refund failed - the operator alert has the details.')).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: /Cancel quote/ })).toBeNull()
    fireEvent.click(within(dialog()).getByTestId('quote-cancel-close'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    [422, 'already_cancelled', /already cancelled/],
    [422, 'not_paid', /no deposit payment/],
    [422, 'refund_out_of_range', /not allowed any more/],
    [409, 'busy', /Some trips may already be cancelled/],
    [404, 'Quote not found', /no longer exists/],
    [500, 'Failed', /may have partly completed/],
  ])('%s %s gets its own sentence', async (status, error, text) => {
    await openCancel(FREE)
    answers.cancel = { status: status as number, body: { error } }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote and refund' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text)
  })

  it('a preview that cannot be read blocks the button and says why', async () => {
    await renderPage(detail())
    previews.admin_client = { status: 422, body: { error: 'already_cancelled' } }
    fireEvent.click(within(bar()).getByTestId('quote-action-cancel'))
    expect(await within(dialog()).findByTestId('quote-cancel-preview-error')).toHaveTextContent(/already cancelled/)
    expect(within(dialog()).getByRole('button', { name: /Cancel quote/ })).toBeDisabled()
  })

  it('a started trip disables the button and says why before the dialog is even opened', async () => {
    await renderPage(detail({ bookings: [booking({ status: 'en_route' })] }))
    expect(within(bar()).getByTestId('quote-action-cancel')).toBeDisabled()
    expect(within(bar()).getByTestId('quote-cancel-effect')).toHaveTextContent(/A trip of this quote has started/)
  })
})

const REMAINDER_PAID = {
  remainder_paid_at: '2026-11-15T09:00:00.000Z',
  remainder_payment_intent_id: 'pi_remainder',
  remainder_amount_minor: 21000,
}

async function openRefund(o: DetailOptions = {}) {
  await renderPage(detail(o))
  fireEvent.click(within(bar()).getByTestId('quote-action-refund'))
  await within(dialog()).findByTestId('quote-refund-amount')
}

describe('partial refund (D-12)', () => {
  it('Refund is offered on a paid quote with the total it can return, and not on a quote that is not paid', async () => {
    await renderPage(detail())
    expect(within(bar()).getByTestId('quote-refund-effect')).toHaveTextContent(`up to ${eur(9000)} in total`)
    cleanup()
    await renderPage(detail({ status: 'sent' }))
    expect(within(bar()).queryByTestId('quote-action-refund')).toBeNull()
  })

  it('a deposit refund: states the bound, the button names the amount, one POST { deposit, minor } on a double click', async () => {
    await openRefund({ quote: { deposit_refunded_minor: 2000 } })
    expect(within(dialog()).getByTestId('quote-refund-bound')).toHaveTextContent(
      `Deposit: paid ${eur(9000)}, refunded before ${eur(2000)}. You can refund up to ${eur(7000)}.`,
    )
    expect(within(dialog()).queryByTestId('quote-refund-source-remainder')).toBeNull()
    expect(within(dialog()).getByRole('button', { name: 'Refund' })).toBeDisabled()

    fireEvent.change(within(dialog()).getByTestId('quote-refund-amount'), { target: { value: '25.50' } })
    answers.refund = { status: 200, body: { ok: true }, then: detail({ quote: { deposit_refunded_minor: 4550 } }) }
    const primary = within(dialog()).getByRole('button', { name: `Refund ${eur(2550)}` })
    expect(posts()).toHaveLength(0)
    await doubleClick(primary)
    await waitFor(() => expect(posts('refund')).toHaveLength(1))
    expect(posts('refund')[0].body).toEqual({ source: 'deposit', amount_minor: 2550 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(bar()).getByRole('status')).toHaveTextContent(`${eur(2550)} refunded to the client's card.`)
    // The page refetched: the new bound is 9000 - 4550.
    await waitFor(() => expect(within(bar()).getByTestId('quote-refund-effect')).toHaveTextContent(`up to ${eur(4450)}`))
  })

  it('a remainder paid on the page can be refunded too: the source switch changes the bound and the request', async () => {
    await openRefund({ quote: { ...REMAINDER_PAID, remainder_refunded_minor: 1000 } })
    fireEvent.click(within(dialog()).getByTestId('quote-refund-source-remainder'))
    expect(within(dialog()).getByTestId('quote-refund-bound')).toHaveTextContent(
      `Remainder: paid ${eur(21000)}, refunded before ${eur(1000)}. You can refund up to ${eur(20000)}.`,
    )
    fireEvent.change(within(dialog()).getByTestId('quote-refund-amount'), { target: { value: '200.01' } })
    expect(within(dialog()).getByTestId('quote-refund-problem')).toHaveTextContent(`At most ${eur(20000)}`)
    expect(within(dialog()).getByRole('button', { name: 'Refund' })).toBeDisabled()
    fireEvent.change(within(dialog()).getByTestId('quote-refund-amount'), { target: { value: '200' } })
    answers.refund = { status: 200, body: { ok: true } }
    fireEvent.click(within(dialog()).getByRole('button', { name: `Refund ${eur(20000)}` }))
    await waitFor(() => expect(posts('refund')).toHaveLength(1))
    expect(posts('refund')[0].body).toEqual({ source: 'remainder', amount_minor: 20000 })
  })

  it('an amount above the deposit bound, zero, and text are refused in the dialog: nothing is sent', async () => {
    await openRefund()
    const input = within(dialog()).getByTestId('quote-refund-amount')
    for (const value of ['90.01', '0', 'abc', '1.234']) {
      fireEvent.change(input, { target: { value } })
      expect(within(dialog()).getByRole('button', { name: 'Refund' })).toBeDisabled()
    }
    expect(posts()).toHaveLength(0)
  })

  it('cannot be dismissed while the request runs', async () => {
    await openRefund()
    let release: () => void = () => {}
    hold = new Promise<void>((r) => { release = r })
    answers.refund = { status: 200, body: { ok: true } }
    fireEvent.change(within(dialog()).getByTestId('quote-refund-amount'), { target: { value: '10' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: `Refund ${eur(1000)}` }))
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Go back' })).toBeDisabled())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => { release() })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts('refund')).toHaveLength(1)
  })

  it.each([
    [422, { error: 'out_of_range' }, /more than what was paid minus what was already refunded/],
    [422, { error: 'not_paid' }, /never made/],
    [502, { error: 'refund_failed' }, /Nothing was refunded/],
    [404, { error: 'Quote not found' }, /no longer exists/],
    [500, { error: 'Failed to refund' }, /may have partly completed/],
  ])('%s %j gets its own sentence and keeps the dialog open', async (status, body, text) => {
    await openRefund()
    fireEvent.change(within(dialog()).getByTestId('quote-refund-amount'), { target: { value: '10' } })
    answers.refund = { status: status as number, body }
    fireEvent.click(within(dialog()).getByRole('button', { name: `Refund ${eur(1000)}` }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('a cancelled quote keeps the refund (retry of a failed cancel refund) but not the cancel', async () => {
    await renderPage(detail({ status: 'cancelled' }))
    expect(within(bar()).getByTestId('quote-action-refund')).toBeInTheDocument()
    expect(within(bar()).queryByTestId('quote-action-cancel')).toBeNull()
  })

  it('nothing left to refund hides the Refund action', async () => {
    await renderPage(detail({ quote: { deposit_refunded_minor: 9000 } }))
    expect(within(bar()).queryByTestId('quote-action-refund')).toBeNull()
  })
})

describe('mark invoice paid (D-17)', () => {
  it('is offered only on a paid invoice-method quote', async () => {
    await renderPage(detail({ method: 'invoice' }))
    expect(within(bar()).getByTestId('quote-action-invoice-paid')).toBeInTheDocument()
    expect(within(bar()).getByTestId('quote-invoice-effect')).toHaveTextContent(/No card is charged and no email is sent/)
    expect(within(bar()).queryByTestId('quote-action-remainder')).toBeNull()
    for (const method of ['saved_card', 'cash', 'payment_link']) {
      cleanup()
      await renderPage(detail({ method }))
      expect(within(bar()).queryByTestId('quote-action-invoice-paid')).toBeNull()
    }
    cleanup()
    await renderPage(detail({ method: 'invoice', status: 'sent' }))
    expect(within(bar()).queryByTestId('quote-action-invoice-paid')).toBeNull()
  })

  it('requires an invoice number, states the effect first and posts once { invoice_number } on a double click', async () => {
    await renderPage(detail({ method: 'invoice' }))
    fireEvent.click(within(bar()).getByTestId('quote-action-invoice-paid'))
    expect(within(dialog()).getByText(/No card is charged and no email is sent/)).toBeInTheDocument()
    const primary = within(dialog()).getByRole('button', { name: 'Mark invoice paid' })
    expect(primary).toBeDisabled()
    fireEvent.change(within(dialog()).getByTestId('invoice-paid-number'), { target: { value: '   ' } })
    expect(primary).toBeDisabled()
    fireEvent.change(within(dialog()).getByTestId('invoice-paid-number'), { target: { value: ' 2026-0042 ' } })
    expect(primary).toBeEnabled()
    expect(posts()).toHaveLength(0)

    answers['invoice-paid'] = { status: 200, body: { changed: true }, then: detail({ method: 'invoice', quote: { invoice_number: '2026-0042', invoice_paid_at: '2026-11-16T09:00:00.000Z' } }) }
    await doubleClick(primary)
    await waitFor(() => expect(posts('invoice-paid')).toHaveLength(1))
    expect(posts('invoice-paid')[0].body).toEqual({ invoice_number: '2026-0042' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(bar()).getByRole('status')).toHaveTextContent('Invoice 2026-0042 marked paid.')
    // The page refetched: the action is replaced by the fact.
    await waitFor(() => expect(within(bar()).queryByTestId('quote-action-invoice-paid')).toBeNull())
    expect(within(bar()).getByTestId('quote-invoice-done')).toHaveTextContent('Invoice 2026-0042 is marked paid.')
  })

  it('a multi-line or over-long number is refused in the dialog', async () => {
    await renderPage(detail({ method: 'invoice' }))
    fireEvent.click(within(bar()).getByTestId('quote-action-invoice-paid'))
    const primary = within(dialog()).getByRole('button', { name: 'Mark invoice paid' })
    fireEvent.change(within(dialog()).getByTestId('invoice-paid-number'), { target: { value: 'A'.repeat(61) } })
    expect(primary).toBeDisabled()
    fireEvent.change(within(dialog()).getByTestId('invoice-paid-number'), { target: { value: 'A B' } })
    expect(primary).toBeDisabled()
    expect(posts()).toHaveLength(0)
  })

  it('cannot be dismissed while the request runs', async () => {
    await renderPage(detail({ method: 'invoice' }))
    fireEvent.click(within(bar()).getByTestId('quote-action-invoice-paid'))
    let release: () => void = () => {}
    hold = new Promise<void>((r) => { release = r })
    answers['invoice-paid'] = { status: 200, body: { changed: true } }
    fireEvent.change(within(dialog()).getByTestId('invoice-paid-number'), { target: { value: 'INV-1' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mark invoice paid' }))
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Go back' })).toBeDisabled())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => { release() })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each([
    [422, { error: 'action_not_allowed', reason: 'number_conflict' }, 'This quote is already marked paid with another invoice number.'],
    [422, { error: 'action_not_allowed', reason: 'not_invoice' }, /not paid by invoice/],
    [422, { error: 'action_not_allowed', reason: 'not_paid' }, /not paid, or the quote is cancelled/],
    [400, { error: 'Invalid payload' }, /not valid/],
    [500, { error: 'Failed' }, /may have partly completed/],
  ])('%s %j gets its own sentence', async (status, body, text) => {
    await renderPage(detail({ method: 'invoice' }))
    fireEvent.click(within(bar()).getByTestId('quote-action-invoice-paid'))
    fireEvent.change(within(dialog()).getByTestId('invoice-paid-number'), { target: { value: 'INV-1' } })
    answers['invoice-paid'] = { status: status as number, body }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mark invoice paid' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('send remainder request (D-16)', () => {
  it('is offered only on a paid payment-link quote with an amount due, and names the amount', async () => {
    await renderPage(detail({ method: 'payment_link' }))
    expect(within(bar()).getByTestId('quote-action-remainder')).toHaveTextContent(`Send remainder request (${eur(21000)})`)
    expect(within(bar()).queryByTestId('quote-action-invoice-paid')).toBeNull()
    for (const method of ['saved_card', 'cash', 'invoice']) {
      cleanup()
      await renderPage(detail({ method }))
      expect(within(bar()).queryByTestId('quote-action-remainder')).toBeNull()
    }
  })

  it('nothing due (every trip paid or cancelled) hides it', async () => {
    await renderPage(detail({ method: 'payment_link', bookings: [booking({ paid_at: '2026-11-15T09:00:00.000Z' })] }))
    expect(within(bar()).queryByTestId('quote-action-remainder')).toBeNull()
    cleanup()
    await renderPage(detail({ method: 'payment_link', bookings: [booking({ status: 'cancelled' })] }))
    expect(within(bar()).queryByTestId('quote-action-remainder')).toBeNull()
  })

  it('states the amount first, posts once on a double click and says "Request sent"', async () => {
    await renderPage(detail({ method: 'payment_link' }))
    fireEvent.click(within(bar()).getByTestId('quote-action-remainder'))
    expect(posts()).toHaveLength(0)
    expect(within(dialog()).getByText(`Ask Anna Novak to pay the remaining ${eur(21000)}?`)).toBeInTheDocument()
    expect(within(dialog()).getByText(`anna@example.com gets an email in English with a new link to pay ${eur(21000)} by card.`)).toBeInTheDocument()
    answers['remainder-request'] = { status: 200, body: { amountMinor: 21000 } }
    const primary = within(dialog()).getByRole('button', { name: `Send request for ${eur(21000)}` })
    await doubleClick(primary)
    await waitFor(() => expect(posts('remainder-request')).toHaveLength(1))
    expect(posts('remainder-request')[0].body).toEqual({})
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(bar()).getByRole('status')).toHaveTextContent(`Request sent. anna@example.com was emailed a link to pay the remaining ${eur(21000)}.`)
  })

  it.each([
    [429, { error: 'recently_sent' }, 'A request was sent less than 10 minutes ago.'],
    [422, { error: 'action_not_allowed', reason: 'nothing_due' }, /Nothing is due/],
    [422, { error: 'action_not_allowed', reason: 'not_payment_link' }, /does not pay its remainder by payment link/],
    [422, { error: 'action_not_allowed', reason: 'not_paid' }, /not paid, or the quote is cancelled/],
    [502, { error: 'email_failed' }, /email could not be sent/],
    [404, { error: 'Quote not found' }, /no longer exists/],
  ])('%s %j gets its own sentence', async (status, body, text) => {
    await renderPage(detail({ method: 'payment_link' }))
    fireEvent.click(within(bar()).getByTestId('quote-action-remainder'))
    answers['remainder-request'] = { status: status as number, body }
    fireEvent.click(within(dialog()).getByRole('button', { name: `Send request for ${eur(21000)}` }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
