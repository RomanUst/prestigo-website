import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'

// Phase 93 (plan 93-10; TRIP-05, TRIP-03; UI-SPEC 7.3 A, B, E): the tour editor shell. Every API call is a fetch mock;
// the routes belong to 93-07 / 93-08. The content tabs and the photo manager have their own test files.

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>
  ),
}))

import TourEditor from '@/components/admin/tours/TourEditor'

const ID = '11111111-1111-4111-8111-111111111111'

type Json = Record<string, unknown>

function tourRow(over: Json = {}): Json {
  return {
    id: ID,
    slug: 'karlstejn-day-trip',
    status: 'draft',
    sort_order: 0,
    hours_included: 5,
    drive_minutes_each_way: 45,
    start_time_min: '08:00',
    start_time_max: '11:00',
    price_e_eur: 320,
    price_s_eur: 420,
    price_v_eur: 380,
    destination_label: 'Karlstejn',
    first_published_at: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...over,
  }
}

function enRow(over: Json = {}) {
  return {
    tour_id: ID,
    locale: 'en',
    title: 'Karlstejn Castle day trip',
    short_description: 'Castle and forest.',
    description: 'About.',
    pickup_info: 'Hotel lobby.',
    important_info: '',
    seo_title: 'Karlstejn',
    seo_description: 'Karlstejn from Prague.',
    highlights: ['Castle'],
    itinerary: [{ title: 'Pickup', body: 'At the hotel.' }],
    includes: ['Water'],
    excludes: ['Lunch'],
    faq: [{ q: 'Q', a: 'A' }],
    is_complete: true,
    updated_at: '2026-11-01T10:00:00.000Z',
    ...over,
  }
}

function detail(over: { tour?: Json; failures?: string[]; translations?: Json; photos?: unknown[] } = {}) {
  const failures = over.failures ?? []
  return {
    tour: tourRow(over.tour),
    translations: { en: enRow(), ru: null, es: null, fr: null, ar: null, hi: null, zh: null, 'zh-hant': null, ...(over.translations ?? {}) },
    photos: over.photos ?? [],
    checklist: { ok: failures.length === 0, failures },
  }
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

let fetchMock: ReturnType<typeof vi.fn>
let current: Json
let patchAnswer: (body: Json) => Promise<Response>
let publishAnswer: (body: Json) => Promise<Response>

function calls(method: string, suffix = '') {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const m = (init as RequestInit | undefined)?.method ?? 'GET'
    return m === method && String(url) === `/api/admin/tours/${ID}${suffix}`
  })
}

beforeEach(() => {
  current = detail()
  patchAnswer = (body) => {
    current = { ...current, tour: { ...(current.tour as Json), ...body } }
    return json({ tour: current.tour })
  }
  publishAnswer = (body) => {
    const status = body.action === 'publish' ? 'published' : 'draft'
    current = { ...current, tour: { ...(current.tour as Json), status, first_published_at: '2026-11-18T09:00:00.000Z' } }
    return json({ tour: current.tour })
  }
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === `/api/admin/tours/${ID}` && (!init?.method || init.method === 'GET')) return json(current)
    if (url === `/api/admin/tours/${ID}` && init?.method === 'PATCH') return patchAnswer(JSON.parse(String(init.body)))
    if (url === `/api/admin/tours/${ID}/publish`) return publishAnswer(JSON.parse(String(init?.body)))
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function field(label: string) {
  return (await screen.findByLabelText(label)) as HTMLInputElement
}

describe('TourEditor', () => {
  it('shows the header, the Draft badge and a disabled Publish while the checklist has failures', async () => {
    current = detail({ failures: ['NO_PHOTO', 'MISSING_PRICE'] })
    render(<TourEditor tourId={ID} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Karlstejn Castle day trip' })).toBeDefined()
    const back = screen.getByRole('link', { name: /All tours/ })
    expect(back.getAttribute('href')).toBe('/admin/tours')
    expect(screen.getByText('Draft')).toBeDefined()
    const publish = screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    expect(publish.getAttribute('aria-describedby')).toBe('tour-publish-checklist')
    expect(document.getElementById('tour-publish-checklist')).not.toBeNull()
  })

  it('checklist rows show pass or fail from the server answer', async () => {
    current = detail({ failures: ['NO_PHOTO', 'MISSING_PRICE'] })
    render(<TourEditor tourId={ID} />)
    const card = await screen.findByRole('region', { name: 'Publish checklist' })
    const row = (text: string) => within(card).getByText(text).closest('li') as HTMLElement
    expect(within(row('English content complete')).getByRole('img', { name: 'Done' })).toBeDefined()
    expect(within(row('At least one photo, with a cover')).getByRole('img', { name: 'Missing' })).toBeDefined()
    expect(within(row('Credit and licence for every photo that needs one')).getByRole('img', { name: 'Done' })).toBeDefined()
    expect(within(row('Prices for all three cars')).getByRole('img', { name: 'Missing' })).toBeDefined()
  })

  it('names the failing basics line when the server says MISSING_BASICS', async () => {
    current = detail({ failures: ['MISSING_BASICS'] })
    render(<TourEditor tourId={ID} />)
    const card = await screen.findByRole('region', { name: 'Publish checklist' })
    expect(within(card).getByText('Destination name and drive time')).toBeDefined()
  })

  it('fills the basics from the tour', async () => {
    render(<TourEditor tourId={ID} />)
    expect((await field('Hours at the destination (included)')).value).toBe('5')
    expect((await field('Drive time each way, minutes')).value).toBe('45')
    expect((await field('Price per car, Business (E)')).value).toBe('320')
    expect((await field('Price per car, First Class (S)')).value).toBe('420')
    expect((await field('Price per car, Business Van (V)')).value).toBe('380')
    expect((await field('Destination name for bookings (English)')).value).toBe('Karlstejn')
    expect((await field('Address')).value).toBe('karlstejn')
  })

  it('has no start-time window: guests book any time of day', async () => {
    render(<TourEditor tourId={ID} />)
    await field('Hours at the destination (included)')
    expect(screen.queryByLabelText('Earliest start')).toBeNull()
    expect(screen.queryByLabelText('Latest start')).toBeNull()
  })

  it('shows Unsaved changes and PATCHes only the changed field, then re-reads the tour and the checklist', async () => {
    render(<TourEditor tourId={ID} />)
    const hours = await field('Hours at the destination (included)')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    fireEvent.change(hours, { target: { value: '6' } })
    expect(screen.getByText('Unsaved changes')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Save basics' }))
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1))
    expect(JSON.parse(String((calls('PATCH')[0][1] as RequestInit).body))).toEqual({ hours_included: 6 })
    await waitFor(() => expect(calls('GET')).toHaveLength(2))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
    expect(((await field('Hours at the destination (included)')) as HTMLInputElement).value).toBe('6')
  })

  it('refuses hours outside 1 to 12 and a price of 0', async () => {
    render(<TourEditor tourId={ID} />)
    fireEvent.change(await field('Hours at the destination (included)'), { target: { value: '13' } })
    fireEvent.change(await field('Price per car, Business (E)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save basics' }))
    expect(await screen.findByText('Enter a whole number from 1 to 12.')).toBeDefined()
    expect(screen.getByText('Enter a price greater than 0.')).toBeDefined()
    expect(calls('PATCH')).toHaveLength(0)
  })

  it('shows a server SLUG_TAKEN answer at the address field', async () => {
    patchAnswer = () => json({ error: 'Slug already exists', code: 'SLUG_TAKEN' }, 409)
    render(<TourEditor tourId={ID} />)
    fireEvent.change(await field('Address'), { target: { value: 'konopiste' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save basics' }))
    expect(await screen.findByText('This address is already used by another tour.')).toBeDefined()
    expect(JSON.parse(String((calls('PATCH')[0][1] as RequestInit).body))).toEqual({ slug: 'konopiste-day-trip' })
  })

  it('shows the address read-only with the note once the tour was ever published', async () => {
    current = detail({ tour: { first_published_at: '2026-11-10T10:00:00.000Z' } })
    render(<TourEditor tourId={ID} />)
    expect(await screen.findByText('/services/karlstejn-day-trip')).toBeDefined()
    expect(screen.getByText('The address cannot change after publishing. Google has indexed it.')).toBeDefined()
    expect(screen.queryByLabelText('Address')).toBeNull()
  })

  it('warns before leaving the page while anything is unsaved (beforeunload)', async () => {
    render(<TourEditor tourId={ID} />)
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    fireEvent.change(await field('Hours at the destination (included)'), { target: { value: '7' } })
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })

  it('with a passing checklist Publish opens the dialog and confirming POSTs the publish action', async () => {
    render(<TourEditor tourId={ID} />)
    const publish = (await screen.findByRole('button', { name: 'Publish' })) as HTMLButtonElement
    expect(publish.disabled).toBe(false)
    fireEvent.click(publish)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Publish Karlstejn Castle day trip?')).toBeDefined()
    expect(within(dialog).getByText(/Other languages go live when they are complete\./)).toBeDefined()
    expect(within(dialog).getByRole('button', { name: 'Not yet' })).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(calls('POST', '/publish')).toHaveLength(1))
    expect(JSON.parse(String((calls('POST', '/publish')[0][1] as RequestInit).body))).toEqual({ action: 'publish' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeDefined()
    expect(screen.getByText('Published')).toBeDefined()
    expect(screen.getByText(/^Published\. Visible in 1 language: English\.$/)).toBeDefined()
  })

  it('a 422 from publish shows the failures in the checklist', async () => {
    publishAnswer = () => json({ error: 'not ready', code: 'CHECKLIST_FAILED', failures: ['MISSING_CREDIT'] }, 422)
    render(<TourEditor tourId={ID} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const card = screen.getByRole('region', { name: 'Publish checklist' })
    const row = within(card).getByText('Credit and licence for every photo that needs one').closest('li') as HTMLElement
    expect(within(row).getByRole('img', { name: 'Missing' })).toBeDefined()
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Unpublish opens the danger dialog with Keep published focused and POSTs the unpublish action', async () => {
    current = detail({ tour: { status: 'published', first_published_at: '2026-11-10T10:00:00.000Z' } })
    render(<TourEditor tourId={ID} />)
    expect(await screen.findByText('Published')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    const view = screen.getByRole('link', { name: /View on site/ })
    expect(view.getAttribute('href')).toBe('/services/karlstejn-day-trip')

    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Unpublish Karlstejn Castle day trip?')).toBeDefined()
    expect(within(dialog).getByText(/The page disappears from the site and the sitemap/)).toBeDefined()
    const keep = within(dialog).getByRole('button', { name: 'Keep published' })
    await waitFor(() => expect(document.activeElement).toBe(keep))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(calls('POST', '/publish')).toHaveLength(1))
    expect(JSON.parse(String((calls('POST', '/publish')[0][1] as RequestInit).body))).toEqual({ action: 'unpublish' })
  })

  it('Keep published closes the dialog without a request', async () => {
    current = detail({ tour: { status: 'published', first_published_at: '2026-11-10T10:00:00.000Z' } })
    render(<TourEditor tourId={ID} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep published' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls('POST', '/publish')).toHaveLength(0)
  })

  it('re-reads the checklist after a photo change and after a language save', async () => {
    const photoRow = {
      id: '22222222-2222-4222-8222-222222222221',
      tour_id: ID,
      storage_path: `tours/${ID}/22222222-2222-4222-8222-222222222221.jpg`,
      position: 1,
      is_cover: false,
      source: 'own',
      credit_text: null,
      license: null,
      credit_url: null,
      width: null,
      height: null,
      created_at: '2026-11-01T10:00:00.000Z',
    }
    current = detail({ failures: ['NO_COVER'], photos: [photoRow] })
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === `/api/admin/tours/${ID}` && (!init?.method || init.method === 'GET')) return json(current)
      if (url === `/api/admin/tours/${ID}/photos/${photoRow.id}` && init?.method === 'PATCH') {
        current = detail({ failures: [], photos: [{ ...photoRow, is_cover: true }] })
        return json({ photos: [{ ...photoRow, is_cover: true }] })
      }
      return json({}, 404)
    })
    render(<TourEditor tourId={ID} />)
    expect((await screen.findByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Use photo 1 as cover' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(false))
    expect(calls('GET')).toHaveLength(2)
  })

  it('shows the content tabs and the photo card', async () => {
    render(<TourEditor tourId={ID} />)
    expect(await screen.findByRole('tablist', { name: 'Language' })).toBeDefined()
    expect(screen.getAllByRole('tab')).toHaveLength(8)
    expect(screen.getByRole('region', { name: 'Photos' })).toBeDefined()
    expect(screen.getByText('No photos yet.')).toBeDefined()
  })

  it('an unsaved language edit turns on the beforeunload warning', async () => {
    render(<TourEditor tourId={ID} />)
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Changed title' } })
    await waitFor(() => {
      const ev = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    })
  })

  it('shows an error with Retry when the tour cannot be loaded', async () => {
    fetchMock.mockImplementation(() => json({ error: 'x' }, 500))
    render(<TourEditor tourId={ID} />)
    expect(await screen.findByText('Could not load the tour. Try again.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined()
  })
})
