import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Suspense } from 'react'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

// Phase 93 (plan 93-33; TRIP-07; UI-SPEC Surface 8): the operator's custom-tour inbox. The REAL pages are rendered; every API
// call is a fetch mock (the routes belong to 93-31 and the quote routes to Phase 92).

const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/custom-tours',
  useRouter: () => ({ push }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>
  ),
}))

vi.mock('@/app/(internal)/admin/login/actions', () => ({ signOut: vi.fn() }))

import CustomToursPage from '@/app/(internal)/admin/(dashboard)/custom-tours/page'
import CustomTourDetailPage from '@/app/(internal)/admin/(dashboard)/custom-tours/[id]/page'
import AdminSidebar from '@/components/admin/AdminSidebar'

const REQ_ID = '3f2b1c9e-0000-4000-8000-0000000000a1'
const TOUR_ID = '3f2b1c9e-0000-4000-8000-0000000000b1'
const QUOTE_ID = '3f2b1c9e-0000-4000-8000-0000000000c1'

type Json = Record<string, unknown>

function requestDetail(over: Json = {}): Json {
  return {
    id: REQ_ID,
    receivedAt: '2026-11-20T09:05:00.000Z',
    name: 'Anna Maria Novak',
    email: 'anna@example.com',
    phone: '+420 725 986 855',
    where: 'Karlovy Vary and Loket\nwith a stop for lunch',
    date: '2027-03-10',
    people: 4,
    wishes: 'A guide who speaks Russian',
    tourSlug: 'karlstejn-day-trip',
    locale: 'ru',
    status: 'open',
    quote: null,
    ...over,
  }
}

function listItem(n: number, over: Json = {}): Json {
  return {
    id: `3f2b1c9e-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
    receivedAt: `2026-11-${String(20 - n).padStart(2, '0')}T09:05:00.000Z`,
    name: `Client ${n}`,
    email: `client${n}@example.com`,
    whereFirstLine: `Place ${n}`,
    date: '2027-03-10',
    people: 3,
    locale: 'en',
    status: 'open',
    quote: null,
    ...over,
  }
}

interface Call {
  url: string
  method: string
  body: Json | null
}

let calls: Call[]
let handlers: Array<(url: string, method: string) => { status: number; body: unknown } | null>

function installFetch(...fns: typeof handlers) {
  calls = []
  handlers = fns
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? (JSON.parse(String(init.body)) as Json) : null })
      for (const h of handlers) {
        const answer = h(url, method)
        if (answer) return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body } as Response
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response
    }),
  )
}

const toursAnswer = (url: string) =>
  url === '/api/admin/tours' ? { status: 200, body: { tours: [{ id: TOUR_ID, slug: 'karlstejn-day-trip', title: 'Karlstejn Castle Day Trip' }] } } : null

const detailAnswer =
  (body: unknown, status = 200) =>
  (url: string, method: string) =>
    method === 'GET' && url === `/api/admin/custom-tours/${REQ_ID}` ? { status, body } : null

async function renderDetailPage() {
  const params = Promise.resolve({ id: REQ_ID })
  await act(async () => {
    render(
      <Suspense fallback={<p>suspended</p>}>
        <CustomTourDetailPage params={params} />
      </Suspense>,
    )
    await params
  })
}

beforeEach(() => {
  push.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('custom-tour request detail (TRIP-07 tracer)', () => {
  it('renders the request and contact cards with the WhatsApp link built from the phone digits', async () => {
    installFetch(detailAnswer(requestDetail()), (u) => toursAnswer(u))
    await renderDetailPage()

    expect(await screen.findByRole('heading', { name: 'Request from Anna Maria Novak' })).toBeInTheDocument()
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0)
    expect(screen.getByText(/Karlovy Vary and Loket/)).toBeInTheDocument()
    expect(screen.getByText('A guide who speaks Russian')).toBeInTheDocument()

    const wa = screen.getByRole('link', { name: /WhatsApp/ })
    expect(wa).toHaveAttribute('href', 'https://wa.me/420725986855')
    expect(wa).toHaveAttribute('target', '_blank')
    expect(wa).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByRole('link', { name: 'anna@example.com' })).toHaveAttribute('href', 'mailto:anna@example.com')

    // The starting tour links to the tour editor once the slug is matched to a tour.
    const tour = await screen.findByRole('link', { name: 'Karlstejn Castle Day Trip' })
    expect(tour).toHaveAttribute('href', `/admin/tours/${TOUR_ID}`)
  })

  it('shows "None" for a request without a starting tour and without wishes', async () => {
    installFetch(detailAnswer(requestDetail({ tourSlug: null, wishes: null, date: null, phone: null })))
    await renderDetailPage()
    await screen.findByRole('heading', { name: /Request from/ })
    expect(screen.getAllByText('None').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Not given')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull()
  })

  it('Create quote posts the request, shows Creating… and opens the new quote', async () => {
    let release: (() => void) | null = null
    installFetch(detailAnswer(requestDetail()), (u) => toursAnswer(u), (url, method) =>
      method === 'POST' && url === '/api/admin/quotes' ? { status: 201, body: { id: QUOTE_ID } } : null,
    )
    // Hold the POST so the busy label can be seen.
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn((u: string, i?: RequestInit) => (i?.method === 'POST' ? new Promise<Response>((res) => { release = () => void base(u, i).then(res) }) : base(u, i))))
    await renderDetailPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Create quote' }))
    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/quotes/${QUOTE_ID}`))

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({
      client: { first_name: 'Anna Maria', last_name: 'Novak', email: 'anna@example.com', phone: '+420 725 986 855' },
      lead_channel: 'other',
      currency: 'eur',
      source_inquiry_id: REQ_ID,
      locale: 'ru',
    })
  })

  it('a double click sends one POST', async () => {
    installFetch(detailAnswer(requestDetail()), (url, method) => (method === 'POST' && url === '/api/admin/quotes' ? { status: 201, body: { id: QUOTE_ID } } : null))
    await renderDetailPage()
    const button = await screen.findByRole('button', { name: 'Create quote' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('a locale the quote does not support is left out, and a one-word name still posts a valid client', async () => {
    installFetch(detailAnswer(requestDetail({ name: 'Madonna', locale: 'de', phone: null })), (url, method) =>
      method === 'POST' && url === '/api/admin/quotes' ? { status: 201, body: { id: QUOTE_ID } } : null,
    )
    await renderDetailPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Create quote' }))
    await waitFor(() => expect(push).toHaveBeenCalled())
    const body = calls.find((c) => c.method === 'POST')!.body as { client: Json; locale?: string }
    expect(body).not.toHaveProperty('locale')
    expect(body.client).toEqual({ first_name: 'Madonna', last_name: '-', email: 'anna@example.com' })
  })

  it('a 409 re-reads the request and shows the linked quote button', async () => {
    let reads = 0
    installFetch(
      (url, method) => {
        if (method === 'GET' && url === `/api/admin/custom-tours/${REQ_ID}`) {
          reads += 1
          return { status: 200, body: reads === 1 ? requestDetail() : requestDetail({ status: 'quoted', quote: { id: QUOTE_ID, reference: 'Q-20261123-ABC123' } }) }
        }
        return null
      },
      (url, method) => (method === 'POST' ? { status: 409, body: { error: 'INQUIRY_ALREADY_QUOTED' } } : null),
      (url) => (url === `/api/admin/quotes/${QUOTE_ID}` ? { status: 200, body: { quote: { created_at: '2026-11-21T10:00:00.000Z' } } } : null),
    )
    await renderDetailPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Create quote' }))
    const open = await screen.findByRole('link', { name: 'Open quote Q-20261123-ABC123' })
    expect(open).toHaveAttribute('href', `/admin/quotes/${QUOTE_ID}`)
    expect(screen.queryByRole('button', { name: 'Create quote' })).toBeNull()
    expect(await screen.findByText(/Quote created/)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('a 500 shows the plain error and keeps the button', async () => {
    installFetch(detailAnswer(requestDetail()), (url, method) => (method === 'POST' ? { status: 500, body: { error: 'x' } } : null))
    await renderDetailPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Create quote' }))
    expect(await screen.findByText('Could not create the quote. Nothing was saved. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create quote' })).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('a request that is already quoted shows Open quote and the created line instead of Create quote', async () => {
    installFetch(
      detailAnswer(requestDetail({ status: 'quoted', quote: { id: QUOTE_ID, reference: 'Q-20261123-ABC123' } })),
      (url) => (url === `/api/admin/quotes/${QUOTE_ID}` ? { status: 200, body: { quote: { created_at: '2026-11-21T10:00:00.000Z' } } } : null),
    )
    await renderDetailPage()
    expect(await screen.findByRole('link', { name: 'Open quote Q-20261123-ABC123' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create quote' })).toBeNull()
    expect(await screen.findByText(/Quote created/)).toBeInTheDocument()
  })

  it('a missing request is shown as erased with no Create button', async () => {
    installFetch(detailAnswer({ error: 'not found' }, 404))
    await renderDetailPage()
    expect(await screen.findByRole('heading', { name: 'Erased request' })).toBeInTheDocument()
    expect(screen.getByText('This request was erased. A quote cannot be created.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create quote' })).toBeNull()
  })

  it('a 1000-character request wraps in the detail instead of overflowing (E23)', async () => {
    const long = 'x'.repeat(1000)
    installFetch(detailAnswer(requestDetail({ where: long })))
    await renderDetailPage()
    const el = await screen.findByText(long)
    expect(el.style.whiteSpace).toBe('pre-wrap')
    expect(el.style.overflowWrap).toBe('anywhere')
  })

  it('request text is rendered as text, never as HTML (T-93-76)', async () => {
    installFetch(detailAnswer(requestDetail({ where: '<img src=x onerror=alert(1)>', wishes: '<b>bold</b>' })))
    const { container } = await (async () => {
      await renderDetailPage()
      await screen.findByRole('heading', { name: /Request from/ })
      return { container: document.body }
    })()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })
})

describe('custom-tour requests list (TRIP-07)', () => {
  const listAnswer = (items: Json[], nextCursor: string | null = null) => (url: string, method: string) =>
    method === 'GET' && url.startsWith('/api/admin/custom-tours?') ? { status: 200, body: { items, nextCursor } } : null

  it('shows the columns for three requests newest first, with the Open link to each detail', async () => {
    const items = [
      listItem(1, { whereFirstLine: 'x'.repeat(120), date: null, locale: 'ru' }),
      listItem(2, { status: 'quoted', quote: { id: QUOTE_ID, reference: 'Q-20261123-ABC123' } }),
      listItem(3),
    ]
    installFetch(listAnswer(items))
    render(<CustomToursPage />)

    const rows = await screen.findAllByTestId('custom-tour-row')
    expect(rows).toHaveLength(3)
    expect(calls[0].url).toBe('/api/admin/custom-tours?status=all')
    for (const h of ['Received', 'Client', 'Where', 'Trip date', 'People', 'Language', 'Status']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
    const first = within(rows[0])
    expect(first.getByText('Client 1')).toBeInTheDocument()
    expect(first.getByText('client1@example.com')).toBeInTheDocument()
    expect(first.getByText('Not given')).toBeInTheDocument()
    expect(first.getByText('ru')).toBeInTheDocument()
    expect(first.getByText('Open', { selector: 'span span' })).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/admin/custom-tours/${(items[0] as { id: string }).id}`)
    // The long first line stays one line: ellipsis styles, full text in title.
    const where = first.getByTestId('custom-tour-where')
    expect(where).toHaveAttribute('title', 'x'.repeat(120))
    expect(where.style.whiteSpace).toBe('nowrap')
    expect(where.style.textOverflow).toBe('ellipsis')
    // Quoted rows show the reference.
    expect(within(rows[1]).getByText(/Quoted/)).toBeInTheDocument()
    expect(within(rows[1]).getByText(/Q-20261123-ABC123/)).toBeInTheDocument()
  })

  it('selecting Quoted refetches with status=quoted', async () => {
    installFetch(listAnswer([listItem(1)]))
    render(<CustomToursPage />)
    await screen.findAllByTestId('custom-tour-row')
    const group = screen.getByRole('radiogroup', { name: 'Filter' })
    expect(within(group).getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(group).getByRole('radio', { name: 'Quoted' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/admin/custom-tours?status=quoted')).toBe(true))
    expect(within(group).getByRole('radio', { name: 'Quoted' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Load more fetches the next cursor and appends', async () => {
    installFetch((url, method) => {
      if (method !== 'GET') return null
      if (url === '/api/admin/custom-tours?status=all') return { status: 200, body: { items: [listItem(1)], nextCursor: 'CUR1' } }
      if (url === '/api/admin/custom-tours?status=all&cursor=CUR1') return { status: 200, body: { items: [listItem(2)], nextCursor: null } }
      return null
    })
    render(<CustomToursPage />)
    await screen.findAllByTestId('custom-tour-row')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByTestId('custom-tour-row')).toHaveLength(2))
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('an empty inbox and an empty filter show their own sentences', async () => {
    installFetch(listAnswer([]))
    render(<CustomToursPage />)
    expect(await screen.findByText('No custom-tour requests yet.')).toBeInTheDocument()
    expect(screen.getByText('Requests from the site appear here.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Open' }))
    expect(await screen.findByText('No requests match this filter.')).toBeInTheDocument()
    expect(screen.queryByText('No custom-tour requests yet.')).toBeNull()
  })

  it('a failed load says so and Retry reads again', async () => {
    installFetch(() => ({ status: 500, body: {} }))
    render(<CustomToursPage />)
    expect(await screen.findByText('Could not load the requests. Try again.')).toBeInTheDocument()
    const before = calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(calls.length).toBeGreaterThan(before))
  })
})

describe('sidebar entry', () => {
  it('shows Custom tours right after Tours, linking to /admin/custom-tours', () => {
    render(<AdminSidebar />)
    const links = screen.getAllByRole('link').map((a) => a.textContent?.trim())
    const tours = links.indexOf('Tours')
    expect(tours).toBeGreaterThanOrEqual(0)
    expect(links[tours + 1]).toBe('Custom tours')
    expect(screen.getByRole('link', { name: /Custom tours/ })).toHaveAttribute('href', '/admin/custom-tours')
  })
})
