import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Suspense } from 'react'
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react'

// Phase 92-25 (QUOTE-01, QUOTE-02, QUOTE-06; D-02): the lifecycle bar and the history on the admin quote page. The REAL
// page is rendered (page -> QuoteBuilder -> QuoteActionsBar / QuoteEventsList), so the mount is proved. The routes of
// 92-13 are a fetch mock that answers the contracts documented in their summaries.

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
const SECRET_URL = 'https://rideprestigo.com/en/quote/AbCdEf0123456789-secret-token-value'

type Json = Record<string, unknown>

function lineRow(position: number, amountMinor: number): Json {
  return {
    id: `line-${position}`,
    version_id: 'v1',
    position,
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
    suggested_amount_minor: amountMinor,
    amount_minor: amountMinor,
    price_overridden: false,
    deposit_share_minor: null,
    remainder_minor: null,
    amount_eur: null,
    amount_czk: null,
    stops: [],
  }
}

interface DetailOptions {
  status?: string
  versionNo?: number
  events?: Json[]
  bookings?: Json[]
  expiresAt?: string | null
}

function detail(o: DetailOptions = {}): Json {
  const status = o.status ?? 'draft'
  const versionNo = o.versionNo ?? 1
  const frozen = status !== 'draft'
  const versions = Array.from({ length: versionNo }, (_, i) => i + 1)
  return {
    quote: {
      id: QUOTE_ID,
      reference: 'Q-20261114-ABC123',
      status: status === 'cancelled' ? 'paid' : status === 'expired' ? 'sent' : status,
      current_version_id: `v${versionNo}`,
      client_first_name: 'Anna',
      client_last_name: 'Novak',
      client_email: 'anna@example.com',
      client_phone: '+420123456789',
      lead_channel: 'email',
      expires_at: o.expiresAt ?? (status === 'expired' ? '2026-11-01T10:00:00.000Z' : null),
      cancelled_at: status === 'cancelled' ? '2026-11-14T10:00:00.000Z' : null,
    },
    version: {
      id: `v${versionNo}`,
      quote_id: QUOTE_ID,
      version_no: versionNo,
      frozen_at: frozen ? '2026-11-14T10:00:00.000Z' : null,
      locale: 'en',
      currency: 'eur',
      total_minor: 30000,
      deposit_kind: 'percent',
      deposit_value: 30,
      deposit_minor: 9000,
      remainder_method: 'saved_card',
      cancel_free_hours: null,
      cancel_fee_percent: null,
      billing_name: null,
      billing_address: null,
      billing_company_id: null,
      billing_vat_id: null,
      billing_note: null,
    },
    lines: [lineRow(1, 30000)],
    versions: versions.map((n) => ({ id: `v${n}`, version_no: n, frozen_at: n < versionNo || frozen ? '2026-11-01T10:00:00.000Z' : null })),
    events: o.events ?? [],
    bookings: o.bookings ?? [],
    effective_status: status,
    links_count: 0,
  }
}

interface Call {
  url: string
  method: string
  body: Json | null
}

let calls: Call[]
let current: Json
let answers: Record<string, { status: number; body: unknown; then?: Json }>
let hold: Promise<void> | null

function installFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? (JSON.parse(String(init.body)) as Json) : null })
      if (method === 'GET') return { ok: true, status: 200, json: async () => current } as Response
      const action = url.split('/').pop() as string
      if (hold) await hold
      const answer = answers[action]
      if (answer.then) current = answer.then
      return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body } as Response
    }),
  )
}

const posts = (action?: string) => calls.filter((c) => c.method === 'POST' && (!action || c.url.endsWith(`/${action}`)))

async function renderPage(initial: Json) {
  current = initial
  answers = {}
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

const bar = () => screen.getByTestId('quote-actions')
const dialog = () => screen.getByRole('dialog')

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('quote actions: mount and state header (QUOTE-06, SC1)', () => {
  it('the real page renders the actions bar and the history inside the builder, with the badge and the version', async () => {
    await renderPage(detail())
    expect(within(screen.getByTestId('quote-builder')).getByTestId('quote-actions')).toBeInTheDocument()
    expect(within(screen.getByTestId('quote-builder')).getByTestId('quote-events')).toBeInTheDocument()
    expect(within(bar()).getByText('Draft')).toBeInTheDocument()
    expect(within(bar()).getByTestId('quote-version')).toHaveTextContent('Version 1')
    expect(within(bar()).getByTestId('quote-action-send')).toBeEnabled()
  })

  it('says in a sentence what the client\'s link is, per state (D-02: it lives until the operator cancels)', async () => {
    await renderPage(detail({ status: 'sent' }))
    expect(within(bar()).getByTestId('quote-link-state')).toHaveTextContent(/works until you cancel the quote/)
    cleanup()
    await renderPage(detail({ status: 'draft' }))
    expect(within(bar()).getByTestId('quote-link-state')).toHaveTextContent('Not sent yet. The client has no link.')
    cleanup()
    await renderPage(detail({ status: 'expired' }))
    expect(within(bar()).getByTestId('quote-link-state')).toHaveTextContent(/expiry date has passed/)
  })
})

describe('quote actions: actions by state', () => {
  const matrix: Array<[string, string[]]> = [
    ['draft', ['send']],
    ['sent', ['link', 'resend', 'revise', 'void']],
    ['viewed', ['link', 'resend', 'revise', 'void']],
    ['accepted', ['link', 'resend', 'revise', 'void']],
    ['expired', ['link', 'resend', 'revise', 'void']],
    ['paid', ['link']],
    ['voided', []],
    ['cancelled', []],
  ]
  it.each(matrix)('a %s quote offers exactly its actions', async (status, expected) => {
    await renderPage(detail({ status }))
    const shown = ['send', 'link', 'resend', 'revise', 'void'].filter((a) => within(bar()).queryByTestId(`quote-action-${a}`))
    expect(shown).toEqual(expected)
  })

  it('a paid quote shows no Edit and no Cancel quote here, and says where the money actions will be', async () => {
    await renderPage(detail({ status: 'paid' }))
    expect(within(bar()).queryByRole('button', { name: /Edit/ })).toBeNull()
    expect(within(bar()).queryByRole('button', { name: /Cancel quote/ })).toBeNull()
    expect(within(bar()).getByTestId('quote-money-note')).toBeInTheDocument()
  })

  it('a voided quote shows no actions and says so', async () => {
    await renderPage(detail({ status: 'voided' }))
    expect(within(bar()).queryAllByRole('button')).toHaveLength(0)
    expect(within(bar()).getByText('No actions: this quote is closed.')).toBeInTheDocument()
    expect(within(bar()).getByText('Voided')).toBeInTheDocument()
  })
})

describe('quote actions: Send (tracer, QUOTE-02)', () => {
  it('names its effect first, then posts once, shows the URL once with Copy, and the refetch turns the badge to Sent', async () => {
    await renderPage(detail())
    fireEvent.click(screen.getByTestId('quote-action-send'))
    // Nothing is sent before the confirmation, and the dialog says what will happen.
    expect(posts()).toHaveLength(0)
    expect(within(dialog()).getByText(/can no longer be edited/)).toBeInTheDocument()
    expect(within(dialog()).getByText(/anna@example\.com gets an email in English/)).toBeInTheDocument()

    answers.send = { status: 200, body: { status: 'sent', url: SECRET_URL, emailed: true }, then: detail({ status: 'sent' }) }
    const primary = within(dialog()).getByRole('button', { name: 'Send quote' })
    fireEvent.click(primary)
    fireEvent.click(primary)
    await waitFor(() => expect(within(bar()).getByText('Sent')).toBeInTheDocument())
    expect(posts('send')).toHaveLength(1)
    expect(posts('send')[0].url).toBe(`/api/admin/quotes/${QUOTE_ID}/send`)
    expect(screen.queryByRole('dialog')).toBeNull()

    expect(within(bar()).getByTestId('quote-link-once-url')).toHaveTextContent(SECRET_URL)
    expect(within(bar()).getByText('Email sent to anna@example.com.')).toBeInTheDocument()
    expect(within(bar()).getByText(/This link is shown only now/)).toBeInTheDocument()
    expect(within(bar()).getByText(/If you edit the quote into a new version, this link stops working/)).toBeInTheDocument()

    fireEvent.click(within(bar()).getByTestId('quote-link-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET_URL))
    expect(await within(bar()).findByText('Copied')).toBeInTheDocument()
  })

  it('shows "Email not sent - copy the link to the client" when the email failed; the link is still given', async () => {
    await renderPage(detail())
    fireEvent.click(screen.getByTestId('quote-action-send'))
    answers.send = { status: 200, body: { status: 'sent', url: SECRET_URL, emailed: false }, then: detail({ status: 'sent' }) }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Send quote' }))
    expect(await within(bar()).findByText('Email not sent - copy the link to the client')).toBeInTheDocument()
    expect(within(bar()).getByTestId('quote-link-once-url')).toHaveTextContent(SECRET_URL)
  })

  const refusals: Array<[string, number, Json, string]> = [
    ['first_pickup_passed', 422, { error: 'action_not_allowed', code: 'first_pickup_passed', reason: 'first_pickup_passed' }, 'The first trip is in the past. Change the date before sending.'],
    ['not_sendable', 422, { error: 'action_not_allowed', code: 'not_sendable', reason: 'not_sendable' }, 'This quote cannot be sent in its current state. The page shows the current state.'],
    ['expired', 422, { error: 'action_not_allowed', code: 'expired', reason: 'expired' }, 'The expiry date has passed. Move the expiry date to a later day (edit the quote if it was already sent), then send it.'],
    ['distance_missing', 422, { error: 'action_not_allowed', code: 'distance_missing', reason: 'distance_missing' }, 'A transfer has no distance. Choose its pickup and destination again, save, then send.'],
    ['deposit_missing', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'deposit_missing' }, 'Choose the deposit before sending.'],
    ['remainder_method_missing', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'remainder_method_missing' }, 'Choose how the remainder is paid before sending.'],
    ['terms_invalid', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'terms_invalid' }, 'The cancellation terms are out of range. Correct them and save before sending.'],
    ['no_lines', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'no_lines' }, 'Add at least one trip before sending.'],
    ['deposit_zero', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'deposit_zero' }, 'The deposit cannot be 0.'],
    ['deposit_above_total', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'deposit_above_total' }, 'The deposit is more than the total of the trips.'],
    ['deposit_below_minimum', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'deposit_below_minimum' }, 'The deposit is below the smallest amount a card can be charged.'],
    ['remainder_below_minimum', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'remainder_below_minimum' }, 'The remainder is below the smallest amount a card can be charged. Change the deposit or the amounts.'],
    ['unknown money reason', 422, { error: 'action_not_allowed', code: 'money_invalid', reason: 'something_new' }, 'The deposit or the amounts are not valid. Check them, save, then send.'],
    ['busy', 409, { error: 'busy' }, 'The quote is being changed right now. Try again in a moment.'],
    ['not found', 404, { error: 'Quote not found' }, 'This quote no longer exists.'],
    ['signed out', 401, { error: 'Unauthorized' }, 'Your session has ended. Sign in again.'],
    ['server error', 500, { error: 'Failed to send quote' }, 'Could not complete the action. The page shows the current state; check it before trying again.'],
  ]
  it.each(refusals)('refusal %s is a plain sentence, the dialog stays open and nothing is revealed', async (_name, status, body, sentence) => {
    await renderPage(detail())
    fireEvent.click(screen.getByTestId('quote-action-send'))
    answers.send = { status, body }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Send quote' }))
    expect(await within(dialog()).findByText(sentence)).toBeInTheDocument()
    expect(screen.queryByTestId('quote-link-once')).toBeNull()
    // A refused send can be tried again from the same dialog.
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Send quote' })).toBeEnabled())
  })

  it('cannot be dismissed while the request runs (Escape, Go back), and a double click is one request', async () => {
    await renderPage(detail())
    fireEvent.click(screen.getByTestId('quote-action-send'))
    let release!: () => void
    hold = new Promise<void>((r) => { release = r })
    answers.send = { status: 200, body: { status: 'sent', url: SECRET_URL, emailed: true }, then: detail({ status: 'sent' }) }
    const primary = within(dialog()).getByRole('button', { name: 'Send quote' })
    fireEvent.click(primary)
    fireEvent.click(primary)
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: /Working/ })).toBeDisabled())
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Go back' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(posts('send')).toHaveLength(1)
    await act(async () => { release() })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(posts('send')).toHaveLength(1)
  })

  it('Go back closes the confirmation without sending anything', async () => {
    await renderPage(detail())
    fireEvent.click(screen.getByTestId('quote-action-send'))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Go back' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts()).toHaveLength(0)
  })

  it('Send waits while the builder holds unsaved edits, and says why', async () => {
    await renderPage(detail())
    expect(screen.getByTestId('quote-action-send')).toBeEnabled()
    fireEvent.change(screen.getAllByLabelText(/Amount \(EUR\)/)[0], { target: { value: '310.00' } })
    await waitFor(() => expect(screen.getByTestId('quote-action-send')).toBeDisabled())
    expect(within(bar()).getByText(/You have unsaved changes. Save the quote first/)).toBeInTheDocument()
    expect(posts()).toHaveLength(0)
  })
})

describe('quote actions: Copy new link (T-92-79)', () => {
  it('posts to /link once, shows the new URL once, and it is not shown again after Done or after leaving the page', async () => {
    await renderPage(detail({ status: 'sent' }))
    answers.link = { status: 200, body: { url: SECRET_URL } }
    const button = screen.getByTestId('quote-action-link')
    expect(within(bar()).getByText(/Links you gave out earlier keep working. Nothing is emailed/)).toBeInTheDocument()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(await within(bar()).findByTestId('quote-link-once-url')).toHaveTextContent(SECRET_URL)
    expect(posts('link')).toHaveLength(1)
    expect(posts('link')[0].url).toBe(`/api/admin/quotes/${QUOTE_ID}/link`)

    fireEvent.click(within(bar()).getByTestId('quote-link-done'))
    expect(screen.queryByTestId('quote-link-once')).toBeNull()
    expect(document.body.textContent).not.toContain('secret-token-value')

    // Leaving and returning: a fresh mount has no memory of the URL.
    cleanup()
    await renderPage(detail({ status: 'sent' }))
    expect(screen.queryByTestId('quote-link-once')).toBeNull()
    expect(document.body.textContent).not.toContain('secret-token-value')
  })

  it('keeps the URL in component state only: nothing in storage, nothing logged, nothing in the address bar', async () => {
    await renderPage(detail({ status: 'sent' }))
    answers.link = { status: 200, body: { url: SECRET_URL } }
    fireEvent.click(screen.getByTestId('quote-action-link'))
    await within(bar()).findByTestId('quote-link-once-url')
    const everything = JSON.stringify([
      Object.entries(window.localStorage),
      Object.entries(window.sessionStorage),
      (console.log as unknown as { mock: { calls: unknown[] } }).mock.calls,
      (console.error as unknown as { mock: { calls: unknown[] } }).mock.calls,
      window.location.href,
      document.cookie,
    ])
    expect(everything).not.toContain('secret-token-value')
    // The only request that carries it is the response of /link; no later request sends it back.
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain('secret-token-value')
  })

  it('selects the link for a manual copy when the browser refuses the clipboard', async () => {
    await renderPage(detail({ status: 'sent' }))
    writeText.mockRejectedValue(new Error('denied'))
    answers.link = { status: 200, body: { url: SECRET_URL } }
    fireEvent.click(screen.getByTestId('quote-action-link'))
    await within(bar()).findByTestId('quote-link-once-url')
    fireEvent.click(within(bar()).getByTestId('quote-link-copy'))
    expect(await within(bar()).findByText(/did not allow copying/)).toBeInTheDocument()
  })

  it('a paid quote can still copy a new link; a refused link is a plain sentence and refetches the state', async () => {
    await renderPage(detail({ status: 'paid' }))
    answers.link = { status: 422, body: { error: 'action_not_allowed', reason: 'not_live' } }
    fireEvent.click(screen.getByTestId('quote-action-link'))
    expect(await within(bar()).findByText(/This quote has no link to give/)).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByTestId('quote-link-once')).toBeNull()
  })

  it('Resend posts { resend: true }, shows the new link once, and says the old ones keep working', async () => {
    await renderPage(detail({ status: 'sent' }))
    fireEvent.click(screen.getByTestId('quote-action-resend'))
    expect(within(dialog()).getByText('The links the client already has keep working.')).toBeInTheDocument()
    expect(posts()).toHaveLength(0)
    answers.send = { status: 200, body: { status: 'sent', url: SECRET_URL, emailed: true } }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Resend quote' }))
    expect(await within(bar()).findByTestId('quote-link-once-url')).toHaveTextContent(SECRET_URL)
    expect(posts('send')).toHaveLength(1)
    expect(posts('send')[0].body).toEqual({ resend: true })
  })
})

describe('quote actions: Edit into a new version (QUOTE-06, T-92-80)', () => {
  it('asks first with the consequence, posts to /revise once, and the builder comes back editable as Version 2 (draft)', async () => {
    await renderPage(detail({ status: 'sent' }))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.click(screen.getByTestId('quote-action-revise'))
    expect(posts()).toHaveLength(0)
    expect(within(dialog()).getByText("Editing creates version 2. The client's current link stops working.")).toBeInTheDocument()

    answers.revise = { status: 200, body: { versionId: 'v2' }, then: detail({ status: 'draft', versionNo: 2 }) }
    const primary = within(dialog()).getByRole('button', { name: 'Create version 2' })
    fireEvent.click(primary)
    fireEvent.click(primary)
    await waitFor(() => expect(within(bar()).getByTestId('quote-version')).toHaveTextContent('Version 2 (draft)'))
    expect(posts('revise')).toHaveLength(1)
    expect(posts('revise')[0].url).toBe(`/api/admin/quotes/${QUOTE_ID}/revise`)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(within(bar()).getByText(/The previous link no longer works; send this version to give the client a new one/)).toBeInTheDocument()
    expect(within(bar()).getByTestId('quote-action-send')).toBeEnabled()
  })

  it('409 deposit_in_flight says the client is paying the deposit right now', async () => {
    await renderPage(detail({ status: 'accepted' }))
    fireEvent.click(screen.getByTestId('quote-action-revise'))
    answers.revise = { status: 409, body: { error: 'deposit_in_flight' } }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create version 2' }))
    expect(await within(dialog()).findByText('The client is paying the deposit right now. Try again in a few minutes.')).toBeInTheDocument()
    expect(within(bar()).getByTestId('quote-version')).toHaveTextContent('Version 1')
  })

  const reviseRefusals: Array<[number, Json, string]> = [
    [409, { error: 'busy' }, 'The quote is being changed right now. Try again in a moment.'],
    [422, { error: 'action_not_allowed', reason: 'not_revisable' }, 'This quote can no longer be edited into a new version. The page shows its current state.'],
    [404, { error: 'Quote not found' }, 'This quote no longer exists.'],
    [403, { error: 'Forbidden' }, 'Your session has ended. Sign in again.'],
  ]
  it.each(reviseRefusals)('revise refusal %s is a plain sentence', async (status, body, sentence) => {
    await renderPage(detail({ status: 'sent' }))
    fireEvent.click(screen.getByTestId('quote-action-revise'))
    answers.revise = { status, body }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create version 2' }))
    expect(await within(dialog()).findByText(sentence)).toBeInTheDocument()
  })
})

describe('quote actions: Cancel quote (void)', () => {
  it('opens the void dialog (92-14), posts to /void once, and the badge becomes Voided with no actions left', async () => {
    await renderPage(detail({ status: 'sent' }))
    fireEvent.click(screen.getByTestId('quote-action-void'))
    expect(within(dialog()).getByText("The client's link stops working. Nothing is charged.")).toBeInTheDocument()
    expect(posts()).toHaveLength(0)
    answers.void = { status: 200, body: { ok: true }, then: detail({ status: 'voided' }) }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote' }))
    await waitFor(() => expect(within(bar()).getByText('Voided')).toBeInTheDocument())
    expect(posts('void')).toHaveLength(1)
    expect(posts('void')[0].url).toBe(`/api/admin/quotes/${QUOTE_ID}/void`)
    expect(within(bar()).queryByTestId('quote-action-void')).toBeNull()
    expect(within(bar()).queryByTestId('quote-action-revise')).toBeNull()
  })

  it('409 deposit_in_flight keeps the quote as it was and says why', async () => {
    await renderPage(detail({ status: 'sent' }))
    fireEvent.click(screen.getByTestId('quote-action-void'))
    answers.void = { status: 409, body: { error: 'deposit_in_flight' } }
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel quote' }))
    expect(await within(dialog()).findByText('The client is paying the deposit right now. Try again in a few minutes.')).toBeInTheDocument()
    expect(within(bar()).getByText('Sent')).toBeInTheDocument()
  })
})

describe('quote events and bookings (SC1, QUOTE-06)', () => {
  const events: Json[] = [
    { id: 'e1', quote_id: QUOTE_ID, kind: 'created', created_at: '2026-11-14T09:00:00.000Z', version_id: 'v1', amount_minor: null, currency: null, error_code: null, actor_type: 'admin' },
    { id: 'e3', quote_id: QUOTE_ID, kind: 'deposit_paid', created_at: '2026-11-14T10:05:00.000Z', version_id: 'v1', amount_minor: 9000, currency: 'eur', error_code: null, actor_type: 'webhook', client_email: 'leak@example.com', client_phone: '+420999888777', address: 'Leak Street 1' },
    { id: 'e2', quote_id: QUOTE_ID, kind: 'email_failed', created_at: '2026-11-14T09:30:00.000Z', version_id: 'v1', amount_minor: null, currency: null, error_code: 'send_failed', actor_type: 'system' },
  ]
  const bookings: Json[] = [
    { id: 'b1', booking_reference: 'PRG-100001', status: 'confirmed', payment_mode: 'quote', payment_state: 'captured', pickup_date: '2027-03-10', pickup_time: '09:30:00', quote_line_id: 'line-1' },
  ]

  it('lists the events newest first with Prague time, kind, version and amount, and the linked bookings with their payment state', async () => {
    await renderPage(detail({ status: 'paid', events, bookings }))
    const list = screen.getByTestId('quote-events')
    const rows = within(list).getAllByTestId('quote-event-row')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByTestId('quote-event-kind')).toHaveTextContent('Deposit paid')
    expect(within(rows[0]).getByTestId('quote-event-time')).toHaveTextContent('14 Nov, 11:05')
    expect(within(rows[0]).getByTestId('quote-event-amount')).toHaveTextContent(formatMinor(9000, 'eur'))
    expect(within(rows[0]).getByText('Version 1')).toBeInTheDocument()
    expect(within(rows[1]).getByTestId('quote-event-kind')).toHaveTextContent('Email not sent')
    expect(within(rows[1]).getByText('send_failed')).toBeInTheDocument()
    expect(within(rows[2]).getByTestId('quote-event-kind')).toHaveTextContent('Quote created')
    expect(within(rows[2]).queryByTestId('quote-event-amount')).toBeNull()

    const booking = within(list).getByTestId('quote-booking-row')
    expect(booking).toHaveTextContent('PRG-100001')
    expect(booking).toHaveTextContent('Captured')
  })

  it('shows no email, phone or address of the client anywhere in the history', async () => {
    await renderPage(detail({ status: 'paid', events, bookings }))
    const text = screen.getByTestId('quote-events').textContent ?? ''
    for (const secret of ['anna@example.com', '420123456789', 'leak@example.com', '+420999888777', 'Leak Street', 'Prague Airport']) {
      expect(text).not.toContain(secret)
    }
  })

  it('says so when nothing happened and no booking exists', async () => {
    await renderPage(detail())
    const list = screen.getByTestId('quote-events')
    expect(within(list).getByText('Nothing has happened yet.')).toBeInTheDocument()
    expect(within(list).getByText(/No bookings yet/)).toBeInTheDocument()
  })
})
