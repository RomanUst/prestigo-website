import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'

// Phase 93 (plan 93-09; TRIP-05): the admin tours list, the New tour dialog and the sidebar entry.
// Every API call is a fetch mock; the routes belong to 93-07.

const push = vi.fn()
const getUser = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tours',
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

import ToursPage from '@/app/(internal)/admin/(dashboard)/tours/page'
import AdminSidebar from '@/components/admin/AdminSidebar'

type Completeness = Record<string, boolean>

function tour(over: Record<string, unknown> = {}) {
  const completeness: Completeness = {
    en: true,
    ru: true,
    es: false,
    fr: false,
    ar: false,
    hi: false,
    zh: false,
    'zh-hant': false,
  }
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'karlstejn-day-trip',
    status: 'published',
    sort_order: 0,
    hours_included: 6,
    price_e_eur: 240,
    price_s_eur: 330,
    price_v_eur: 300,
    title: 'Karlstejn Castle Day Trip',
    cover_path: null,
    completeness,
    ...over,
  }
}

const TOUR_A = tour()
const TOUR_B = tour({
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'cesky-krumlov-day-trip',
  status: 'draft',
  sort_order: 1,
  title: 'Cesky Krumlov Day Trip',
  hours_included: 10,
  price_e_eur: null,
  price_s_eur: null,
  price_v_eur: null,
  completeness: { en: true, ru: false, es: false, fr: false, ar: false, hi: false, zh: false, 'zh-hant': false },
})

const SETTINGS = {
  id: 1,
  extra_hour_e_eur: 45,
  extra_hour_s_eur: 60,
  extra_hour_v_eur: 55,
  free_cancel_hours: 24,
  pickup_radius_km: 15,
  updated_at: '2026-11-10T10:00:00.000Z',
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

let fetchMock: ReturnType<typeof vi.fn>
let listAnswer: () => Promise<Response>

function calls(prefix: string, method = 'GET') {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === prefix && ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
}

beforeEach(() => {
  push.mockReset()
  getUser.mockReset()
  listAnswer = () => json({ tours: [TOUR_A, TOUR_B] })
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/admin/tours' && method === 'GET') return listAnswer()
    if (url === '/api/admin/tour-settings' && method === 'GET') return json(SETTINGS)
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tours page: the list (tracer, TRIP-05)', () => {
  it('loads /api/admin/tours and shows both tours with title, address, badge and View only when published', async () => {
    render(<ToursPage />)
    const table = await screen.findByTestId('tours-table')
    expect(calls('/api/admin/tours').length).toBeGreaterThanOrEqual(1)

    const rows = within(table).getAllByTestId('tour-row')
    expect(rows).toHaveLength(2)

    expect(within(rows[0]).getByText('Karlstejn Castle Day Trip')).toBeDefined()
    expect(within(rows[0]).getByText('/services/karlstejn-day-trip')).toBeDefined()
    expect(within(rows[0]).getByText('Published')).toBeDefined()
    expect(within(rows[0]).getByRole('link', { name: /View/ })).toBeDefined()
    expect(within(rows[0]).getByText('6 h included')).toBeDefined()

    expect(within(rows[1]).getByText('Cesky Krumlov Day Trip')).toBeDefined()
    expect(within(rows[1]).getByText('Draft')).toBeDefined()
    expect(within(rows[1]).queryByRole('link', { name: /View/ })).toBeNull()
    expect(within(rows[1]).getByRole('link', { name: /Edit/ }).getAttribute('href')).toBe(
      '/admin/tours/22222222-2222-4222-8222-222222222222',
    )
  })

  it('shows eight language chips per row with a text label, never colour only', async () => {
    render(<ToursPage />)
    const rows = await screen.findAllByTestId('tour-row')
    const first = rows[0]
    expect(within(first).getAllByTestId('lang-chip')).toHaveLength(8)
    expect(within(first).getByLabelText('RU: complete')).toBeDefined()
    expect(within(first).getByLabelText('AR: not complete')).toBeDefined()
    expect(within(first).getByLabelText('ZH-HANT: not complete')).toBeDefined()
    expect(within(first).getByLabelText('EN: complete')).toBeDefined()
  })

  it('shows the three prices from the row, and a dash while a price is not set', async () => {
    render(<ToursPage />)
    const rows = await screen.findAllByTestId('tour-row')
    const priced = within(rows[0]).getByTestId('tour-prices').textContent ?? ''
    expect(priced).toContain('E')
    expect(priced).toContain('240')
    expect(priced).toContain('330')
    expect(priced).toContain('300')
    const unpriced = within(rows[1]).getByTestId('tour-prices').textContent ?? ''
    expect(unpriced).toContain('—')
  })

  it('shows the empty state when there are no tours', async () => {
    listAnswer = () => json({ tours: [] })
    render(<ToursPage />)
    expect(await screen.findByText('No tours yet.')).toBeDefined()
    expect(screen.getByText('Create the first tour. It stays a draft until you publish it.')).toBeDefined()
  })

  it('shows the session message on a 401', async () => {
    listAnswer = () => json({ error: 'Unauthorized' }, 401)
    render(<ToursPage />)
    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeDefined()
  })

  it('shows the load error with Retry, and Retry reads the list again', async () => {
    listAnswer = () => json({ error: 'Request failed' }, 500)
    render(<ToursPage />)
    expect(await screen.findByText('Could not load tours. Try again.')).toBeDefined()
    listAnswer = () => json({ tours: [TOUR_A] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('tours-table')).toBeDefined()
  })
})

describe('tours page: New tour (TRIP-05)', () => {
  async function openModal() {
    render(<ToursPage />)
    await screen.findByTestId('tours-table')
    fireEvent.click(screen.getByRole('button', { name: 'New tour' }))
    return screen.findByRole('dialog')
  }

  function fill(dialog: HTMLElement, address: string, title: string) {
    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: address } })
    fireEvent.change(within(dialog).getByLabelText('English title'), { target: { value: title } })
  }

  it('previews the full address and creates the draft, then opens its editor', async () => {
    const dialog = await openModal()
    fill(dialog, 'karlstejn', 'Karlstejn Castle')
    expect(within(dialog).getByText('/services/karlstejn-day-trip')).toBeDefined()

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/tours' && init?.method === 'POST') return json({ id: 'abc-id' }, 201)
      return json({}, 404)
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/tours/abc-id'))
    const post = calls('/api/admin/tours', 'POST')[0]
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      slug: 'karlstejn-day-trip',
      title: 'Karlstejn Castle',
    })
  })

  it('shows the address-taken message on a 409', async () => {
    const dialog = await openModal()
    fill(dialog, 'karlstejn', 'Karlstejn Castle')
    fetchMock.mockImplementation(() => json({ error: 'Slug already exists', code: 'SLUG_TAKEN' }, 409))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }))
    expect(await within(dialog).findByText('This address is already used by another tour.')).toBeDefined()
    expect(push).not.toHaveBeenCalled()
  })

  it('refuses a bad address with the lowercase message and never calls the API', async () => {
    const dialog = await openModal()
    fill(dialog, 'Karl Stejn', 'Karlstejn Castle')
    const before = fetchMock.mock.calls.length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }))
    expect(await within(dialog).findByText('Use lowercase letters, numbers and single hyphens.')).toBeDefined()
    expect(fetchMock.mock.calls.length).toBe(before)
  })

  it('shows the session message when the create answers 401', async () => {
    const dialog = await openModal()
    fill(dialog, 'karlstejn', 'Karlstejn Castle')
    fetchMock.mockImplementation(() => json({ error: 'Unauthorized' }, 401))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }))
    expect(await within(dialog).findByText('Your session has ended. Sign in again.')).toBeDefined()
  })

  it('closes without creating', async () => {
    const dialog = await openModal()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close without creating' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls('/api/admin/tours', 'POST')).toHaveLength(0)
  })
})

describe('admin sidebar: Tours entry', () => {
  it('links to /admin/tours right after Quotes', () => {
    render(<AdminSidebar />)
    const links = screen.getAllByRole('link').map((a) => ({ href: a.getAttribute('href'), text: a.textContent ?? '' }))
    const quotes = links.findIndex((l) => l.href === '/admin/quotes')
    const tours = links.findIndex((l) => l.href === '/admin/tours')
    expect(quotes).toBeGreaterThanOrEqual(0)
    expect(tours).toBe(quotes + 1)
    expect(links[tours].text).toContain('Tours')
  })
})
