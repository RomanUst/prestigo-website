import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Suspense } from 'react'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

// Phase 92-19 (QUOTE-01, QUOTE-03, QUOTE-04, QUOTE-06): the admin quote detail page. The REAL page is rendered, so the
// mount chain page -> QuoteBuilder -> QuoteLineEditor is proved. The API is a fetch mock (the routes are 92-08).

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/quotes/q1',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>
  ),
}))

// AddressInput loads Google Places: a button per field stands in for it.
vi.mock('@/components/booking/AddressInput', () => ({
  default: ({ label, value, onSelect }: { label: string; value: { address: string } | null; onSelect: (p: { address: string; placeId: string; lat: number; lng: number }) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect({ address: `${label} place`, placeId: 'p', lat: 50, lng: 14 })}>{`pick ${label}`}</button>
      {value ? <span>{`${label} = ${value.address}`}</span> : null}
    </div>
  ),
}))

import QuoteDetailPage from '@/app/(internal)/admin/(dashboard)/quotes/[id]/page'
import { QuoteBuilder } from '@/components/admin/quotes/QuoteBuilder'

const QUOTE_ID = '3f2b1c9e-0000-4000-8000-000000000001'

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
  lines?: Json[]
  frozen?: boolean
  versionNo?: number
  versions?: number[]
  deposit?: { kind: 'percent' | 'fixed'; value: number } | null
  remainder?: string | null
  currency?: 'eur' | 'czk'
  locale?: string
  expiresAt?: string | null
  freeHours?: number | null
  feePercent?: number | null
  effectiveStatus?: string
}

function detail(o: DetailOptions = {}): Json {
  const versionNo = o.versionNo ?? 1
  return {
    quote: {
      id: QUOTE_ID,
      reference: 'Q-20261114-ABC123',
      status: o.frozen ? 'sent' : 'draft',
      current_version_id: 'v1',
      client_first_name: 'Anna',
      client_last_name: 'Novak',
      client_email: 'anna@example.com',
      client_phone: '+420123456789',
      lead_channel: 'email',
      expires_at: o.expiresAt ?? null,
      cancelled_at: null,
    },
    version: {
      id: 'v1',
      quote_id: QUOTE_ID,
      version_no: versionNo,
      frozen_at: o.frozen ? '2026-11-14T10:00:00.000Z' : null,
      locale: o.locale ?? 'en',
      currency: o.currency ?? 'eur',
      total_minor: 0,
      deposit_kind: o.deposit === undefined ? null : (o.deposit?.kind ?? null),
      deposit_value: o.deposit === undefined ? null : (o.deposit?.value ?? null),
      deposit_minor: null,
      remainder_method: o.remainder ?? null,
      cancel_free_hours: o.freeHours ?? null,
      cancel_fee_percent: o.feePercent ?? null,
      billing_name: null,
      billing_address: null,
      billing_company_id: null,
      billing_vat_id: null,
      billing_note: null,
    },
    lines: o.lines ?? [lineRow(1, 30000)],
    versions: (o.versions ?? [versionNo]).map((n) => ({ id: `v${n}`, version_no: n, frozen_at: n < versionNo || o.frozen ? '2026-11-01T10:00:00.000Z' : null })),
    events: [],
    bookings: [],
    effective_status: o.effectiveStatus ?? (o.frozen ? 'sent' : 'draft'),
    links_count: 0,
  }
}

interface Call {
  url: string
  method: string
  body: Json | null
}

let calls: Call[]
let getAnswers: Array<{ status: number; body: unknown }>
let patchAnswer: { status: number; body: unknown }

function installFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? (JSON.parse(String(init.body)) as Json) : null })
      const answer = method === 'PATCH' ? patchAnswer : (getAnswers.length > 1 ? getAnswers.shift()! : getAnswers[0])
      return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body } as Response
    }),
  )
}

const patches = () => calls.filter((c) => c.method === 'PATCH')
const gets = () => calls.filter((c) => c.method === 'GET')

async function renderPage(initial: Json = detail({ deposit: { kind: 'percent', value: 30 }, remainder: 'saved_card' })) {
  getAnswers = [{ status: 200, body: initial }]
  patchAnswer = { status: 200, body: { ok: true } }
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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('quote detail page: mount and tracer (QUOTE-01)', () => {
  it('the real page renders the builder with one line editor per line, for the id of the route', async () => {
    await renderPage(detail({ lines: [lineRow(1, 30000), lineRow(2, 20000)], deposit: { kind: 'percent', value: 30 }, remainder: 'saved_card' }))
    expect(gets()[0].url).toBe(`/api/admin/quotes/${QUOTE_ID}`)
    const builder = screen.getByTestId('quote-builder')
    expect(within(builder).getAllByTestId('quote-line-editor')).toHaveLength(2)
    expect(within(builder).getByText('Q-20261114-ABC123')).toBeInTheDocument()
    expect(screen.getByText(/Anna Novak/)).toBeInTheDocument()
  })

  it('the page is also reachable through the builder alone and shows a missing quote plainly', async () => {
    getAnswers = [{ status: 404, body: { error: 'Quote not found' } }]
    patchAnswer = { status: 200, body: { ok: true } }
    installFetch()
    render(<QuoteBuilder quoteId={QUOTE_ID} />)
    expect(await screen.findByText('This quote does not exist.')).toBeInTheDocument()
  })

  it('Add trip appends an empty line', async () => {
    await renderPage()
    expect(screen.getAllByTestId('quote-line-editor')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Add trip/ }))
    expect(screen.getAllByTestId('quote-line-editor')).toHaveLength(2)
    expect(screen.getAllByLabelText(/Amount \(EUR\)/).map((el) => (el as HTMLInputElement).value)).toEqual(['300.00', ''])
  })

  it('a quote of 19 trips takes one more, and at 20 the Add trip button is gone', async () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => lineRow(i + 1, 10000))
    await renderPage(detail({ lines: nineteen, deposit: { kind: 'percent', value: 30 }, remainder: 'saved_card' }))
    fireEvent.click(screen.getByRole('button', { name: /Add trip/ }))
    expect(screen.getAllByTestId('quote-line-editor')).toHaveLength(20)
    expect(screen.queryByRole('button', { name: /Add trip/ })).toBeNull()
  }, 30000)

  it('reorder and remove work through the line editors', async () => {
    await renderPage(detail({ lines: [lineRow(1, 30000), lineRow(2, 20000)], deposit: { kind: 'percent', value: 30 }, remainder: 'saved_card' }))
    const amountsOf = () => screen.getAllByLabelText(/Amount \(EUR\)/).map((el) => (el as HTMLInputElement).value)
    expect(amountsOf()).toEqual(['300.00', '200.00'])
    fireEvent.click(screen.getAllByLabelText('Move trip down')[0])
    expect(amountsOf()).toEqual(['200.00', '300.00'])
    fireEvent.click(screen.getAllByLabelText('Remove trip')[0])
    expect(amountsOf()).toEqual(['300.00'])
  })

  it('Save sends one PATCH with the line as lineToPayload makes it (no distance, no suggestion) and shows Saved', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(patches()).toHaveLength(1)
    const body = patches()[0].body as { lines: Json[]; deposit: Json; remainder_method: string }
    expect(patches()[0].url).toBe(`/api/admin/quotes/${QUOTE_ID}`)
    expect(body.lines).toHaveLength(1)
    expect(body.lines[0]).toMatchObject({ trip_type: 'transfer', amount_minor: 30000, pickup_time: '09:30', vehicle_class: 'business' })
    expect(body.lines[0]).not.toHaveProperty('distance_km')
    expect(body.lines[0]).not.toHaveProperty('suggested_amount_minor')
    expect(body.deposit).toEqual({ kind: 'percent', value: 30 })
    expect(body.remainder_method).toBe('saved_card')
  })

  it('503 pricing_unavailable shows "Route or prices unavailable, try again"', async () => {
    await renderPage()
    patchAnswer = { status: 503, body: { error: 'pricing_unavailable' } }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Route or prices unavailable, try again')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('409 version_frozen reloads the quote into read-only mode', async () => {
    await renderPage()
    patchAnswer = { status: 409, body: { error: 'version_frozen' } }
    getAnswers = [{ status: 200, body: detail({ frozen: true, deposit: { kind: 'percent', value: 30 }, remainder: 'saved_card' }) }]
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/already sent/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull())
    expect(screen.queryByRole('button', { name: /Add trip/ })).toBeNull()
  })

  it('an invalid line amount is caught before the request, with a plain message', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText(/Amount \(EUR\)/), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Trip 1: enter an amount greater than 0.')).toBeInTheDocument()
    expect(patches()).toHaveLength(0)
  })

  it('a quote with no trips cannot be saved', async () => {
    await renderPage()
    fireEvent.click(screen.getByLabelText('Remove trip'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Add at least one trip.')).toBeInTheDocument()
    expect(patches()).toHaveLength(0)
  })

  it('each refusal code of the server is answered with its own sentence', async () => {
    const cases: Array<[Json, string]> = [
      [{ error: 'action_not_allowed', reason: 'deposit_zero' }, 'The deposit cannot be 0. Enter a percent or an amount.'],
      [{ error: 'action_not_allowed', reason: 'deposit_above_total' }, 'The deposit is more than the total of the trips.'],
      [{ error: 'invalid_lines', reason: 'no_lines' }, 'Add at least one trip before saving.'],
      [{ error: 'invalid_lines', reason: 'currency_needs_lines' }, 'The currency changed, so every trip must be saved again with its amount in the new currency.'],
      [{ error: 'action_not_allowed', reason: 'expiry_in_past' }, 'The expiry date has passed. Choose today or a later day.'],
      [{ error: 'action_not_allowed', reason: 'quote_voided' }, 'This quote was cancelled. It can no longer be edited.'],
      [{ error: 'action_not_allowed', reason: 'quote_paid' }, 'This quote is already paid. It can no longer be edited.'],
    ]
    await renderPage()
    for (const [body, sentence] of cases) {
      patchAnswer = { status: 422, body }
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText(sentence)).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled())
    }
  })

  it('a 400 names the fields, a 401 says the session ended, a 500 says nothing changed', async () => {
    await renderPage()
    patchAnswer = { status: 400, body: { error: 'Invalid payload', details: { fieldErrors: { lines: ['x'] } } } }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Check these fields and try again: lines.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled())
    patchAnswer = { status: 401, body: { error: 'Unauthorized' } }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled())
    patchAnswer = { status: 500, body: { error: 'x' } }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Could not save the quote. Nothing was changed. Try again.')).toBeInTheDocument()
  })
})
