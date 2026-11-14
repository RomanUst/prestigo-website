import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'

// Phase 92-14 (QUOTE-01, QUOTE-06): the admin quote list, state badges, the New quote form and Cancel quote.
// The void route belongs to 92-13: here it is a fetch mock.

const push = vi.fn()
const getUser = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/quotes',
  useRouter: () => ({ push }),
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>
  ),
}))

vi.mock('@/app/(internal)/admin/login/actions', () => ({ signOut: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

import QuotesPage from '@/app/(internal)/admin/(dashboard)/quotes/page'
import AdminDashboardLayout from '@/app/(internal)/admin/(dashboard)/layout'
import { QuoteStatusBadge, QUOTE_STATUS_BADGE } from '@/components/admin/quotes/QuoteStatusBadge'

type Row = {
  id: string
  reference: string
  client_name: string
  client_email: string
  effective_status: string
  first_pickup_date: string | null
  total_minor: number
  currency: 'eur' | 'czk'
  updated_at: string
  version_no: number
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reference: 'Q-2026-0001',
    client_name: 'Anna Novak',
    client_email: 'anna@example.com',
    effective_status: 'sent',
    first_pickup_date: '2026-12-01',
    total_minor: 45000,
    currency: 'eur',
    updated_at: '2026-11-10T10:00:00.000Z',
    version_no: 2,
    ...over,
  }
}

const ROW_A = row()
const ROW_B = row({
  id: '22222222-2222-4222-8222-222222222222',
  reference: 'Q-2026-0002',
  client_name: 'Boris Ivanov',
  client_email: 'boris@example.com',
  effective_status: 'paid',
  first_pickup_date: '2026-12-15',
  total_minor: 1200000,
  currency: 'czk',
  version_no: 1,
})

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

function listBody(quotes: Row[]) {
  return { quotes, total: quotes.length, page: 1, limit: 25 }
}

let fetchMock: ReturnType<typeof vi.fn>

function calls(prefix: string, method = 'GET') {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
}

beforeEach(() => {
  push.mockReset()
  getUser.mockReset()
  fetchMock = vi.fn(() => json(listBody([ROW_A, ROW_B])))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QuoteStatusBadge (QUOTE-06 / SC1)', () => {
  const LABELS: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    viewed: 'Viewed',
    accepted: 'Accepted',
    paid: 'Paid',
    expired: 'Expired',
    voided: 'Voided',
    cancelled: 'Cancelled',
  }

  it.each(Object.entries(LABELS))('renders %s as the label %s', (status, label) => {
    render(<QuoteStatusBadge status={status as keyof typeof QUOTE_STATUS_BADGE} />)
    expect(screen.getByText(label)).toBeDefined()
  })

  it('gives each of the eight states its own colour family', () => {
    const families = Object.values(QUOTE_STATUS_BADGE).map((b) => b.family)
    expect(families).toHaveLength(8)
    expect(new Set(families).size).toBe(8)
  })

  it('shows the raw value in the neutral family for an unknown state instead of throwing', () => {
    render(<QuoteStatusBadge status={'mystery' as never} />)
    expect(screen.getByText('mystery')).toBeDefined()
  })
})

describe('quotes page: the list (tracer, QUOTE-06)', () => {
  it('loads /api/admin/quotes and renders one row per quote with reference, client, trip date, total and badge', async () => {
    render(<QuotesPage />)
    const table = await screen.findByTestId('quotes-table')
    expect(calls('/api/admin/quotes').length).toBeGreaterThanOrEqual(1)

    const rows = within(table).getAllByTestId('quote-row')
    expect(rows).toHaveLength(2)

    const first = within(rows[0])
    expect(first.getByText('Q-2026-0001')).toBeDefined()
    expect(first.getByText('Anna Novak')).toBeDefined()
    expect(first.getByText(/2026/, { selector: '[data-testid="quote-date"]' })).toBeDefined()
    // The amount is the API's integer, formatted: no number is typed in the component.
    expect(first.getByTestId('quote-total').textContent).toContain('450')
    expect(first.getByText('v2')).toBeDefined()
    expect(first.getByText('Sent')).toBeDefined()

    const second = within(rows[1])
    expect(second.getByText('Boris Ivanov')).toBeDefined()
    expect(second.getByText('Paid')).toBeDefined()
    expect(second.getByTestId('quote-total').textContent).toContain('12')
  })

  it('opens /admin/quotes/<id> when a row is clicked', async () => {
    render(<QuotesPage />)
    const rows = await screen.findAllByTestId('quote-row')
    fireEvent.click(rows[0])
    expect(push).toHaveBeenCalledWith(`/admin/quotes/${ROW_A.id}`)
  })

  it('shows an empty state when there are no quotes', async () => {
    fetchMock.mockImplementation(() => json(listBody([])))
    render(<QuotesPage />)
    expect(await screen.findByText('No quotes yet.')).toBeDefined()
  })

  it('shows an error line when the list cannot be loaded', async () => {
    fetchMock.mockImplementation(() => json({ error: 'Failed to load quotes' }, 500))
    render(<QuotesPage />)
    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.queryByTestId('quotes-table')).toBeNull()
  })

  it('refetches with ?status= when the status filter changes', async () => {
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'expired' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=expired'))).toBe(true)
    })
  })

  it('refetches with ?search= when the search box changes', async () => {
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'anna@example.com' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=anna%40example.com'))).toBe(true)
    })
  })
})

describe('the real parents: admin (dashboard) layout mounts the sidebar and the page', () => {
  it('layout renders the Quotes nav link to /admin/quotes next to the quotes list for an admin', async () => {
    getUser.mockResolvedValue({ data: { user: { app_metadata: { is_admin: true } } } })
    const tree = await AdminDashboardLayout({ children: <QuotesPage /> })
    render(tree)
    const nav = screen.getByText('Quotes', { selector: '.admin-nav-label' }).closest('a')
    expect(nav?.getAttribute('href')).toBe('/admin/quotes')
    expect(nav?.getAttribute('aria-current')).toBe('page')
    expect(await screen.findByTestId('quotes-table')).toBeDefined()
  })

  it('layout still redirects a signed-out visitor and a non-admin before anything renders', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(AdminDashboardLayout({ children: null })).rejects.toThrow('REDIRECT:/admin/login')
    getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } })
    await expect(AdminDashboardLayout({ children: null })).rejects.toThrow('REDIRECT:/')
  })
})

describe('New quote form (QUOTE-01)', () => {
  function fill(over: { email?: string; channel?: string; currency?: string; phone?: string } = {}) {
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Anna' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Novak' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: over.email ?? 'anna@example.com' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: over.phone ?? '+420 725 986 855' } })
    fireEvent.change(screen.getByLabelText('Lead channel'), { target: { value: over.channel ?? 'whatsapp' } })
    if (over.currency) fireEvent.change(screen.getByLabelText('Currency'), { target: { value: over.currency } })
  }

  const NEW_ID = '33333333-3333-4333-8333-333333333333'

  function answerPost(response: () => Promise<Response>) {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST' ? response() : json(listBody([ROW_A])),
    )
  }

  it('offers the five lead channels and EUR / CZK with EUR selected', async () => {
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    const channel = screen.getByLabelText('Lead channel') as HTMLSelectElement
    expect(Array.from(channel.options).map((o) => o.value).filter(Boolean)).toEqual(['whatsapp', 'phone', 'email', 'partner', 'other'])
    const currency = screen.getByLabelText('Currency') as HTMLSelectElement
    expect(Array.from(currency.options).map((o) => o.value)).toEqual(['eur', 'czk'])
    expect(currency.value).toBe('eur')
  })

  it('posts the client, lead channel and currency to /api/admin/quotes and opens the new draft', async () => {
    answerPost(() => json({ id: NEW_ID }, 201))
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fill({ channel: 'partner', currency: 'czk' })
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/quotes/${NEW_ID}`))
    const posts = calls('/api/admin/quotes', 'POST')
    expect(posts).toHaveLength(1)
    const init = posts[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      client: { first_name: 'Anna', last_name: 'Novak', email: 'anna@example.com', phone: '+420 725 986 855' },
      lead_channel: 'partner',
      currency: 'czk',
    })
  })

  it('omits an empty phone from the body', async () => {
    answerPost(() => json({ id: NEW_ID }, 201))
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fill({ phone: '  ' })
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }))
    await waitFor(() => expect(push).toHaveBeenCalled())
    const body = JSON.parse((calls('/api/admin/quotes', 'POST')[0][1] as RequestInit).body as string)
    expect(body.client).toEqual({ first_name: 'Anna', last_name: 'Novak', email: 'anna@example.com' })
  })

  it('does not post until the name, a valid email and a lead channel are given', async () => {
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }))
    expect(calls('/api/admin/quotes', 'POST')).toHaveLength(0)
    expect(screen.getByRole('alert').textContent).toMatch(/first name/i)
    fill({ email: 'not-an-email', channel: '' })
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }))
    expect(calls('/api/admin/quotes', 'POST')).toHaveLength(0)
    expect(push).not.toHaveBeenCalled()
  })

  it.each([
    [400, { error: 'Invalid payload', details: { fieldErrors: { email: ['Invalid email'] } } }, /email/i],
    [422, { error: 'action_not_allowed', reason: 'nope' }, /could not create/i],
  ])('a %i answer shows the error text, keeps the input and does not navigate', async (status, body, text) => {
    answerPost(() => json(body, status as number))
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(text)
    expect(push).not.toHaveBeenCalled()
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Anna')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('anna@example.com')
    expect((screen.getByLabelText('Lead channel') as HTMLSelectElement).value).toBe('whatsapp')
  })

  it('disables the button while the request runs and sends one request for a double click', async () => {
    let release: (r: Response) => void = () => {}
    answerPost(() => new Promise<Response>((resolve) => { release = resolve }))
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fill()
    const btn = screen.getByRole('button', { name: 'Create quote' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect((screen.getByRole('button', { name: /working/i }) as HTMLButtonElement).disabled).toBe(true))
    expect(calls('/api/admin/quotes', 'POST')).toHaveLength(1)
    release(new Response(JSON.stringify({ id: NEW_ID }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/quotes/${NEW_ID}`))
  })

  it('shows a plain message when the network fails and keeps the input', async () => {
    answerPost(() => Promise.reject(new Error('offline')))
    render(<QuotesPage />)
    await screen.findByTestId('quotes-table')
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not create/i)
    expect((screen.getByLabelText('Last name') as HTMLInputElement).value).toBe('Novak')
  })
})
