import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
      {children}
    </a>
  ),
}))

import IdentitiesPage from '@/app/(internal)/admin/(dashboard)/identities/page'

type Merge = {
  identityId: string
  contactEmail: string | null
  mergedEmail: string
  phone: string | null
  bookings: number
  mergedAt: string
}

function merge(i: number, over: Partial<Merge> = {}): Merge {
  return {
    identityId: `00000000-0000-4000-8000-00000000000${i}`,
    contactEmail: `owner${i}@example.com`,
    mergedEmail: `second${i}@example.com`,
    phone: `+4207771234${String(i).padStart(2, '0')}`,
    bookings: i + 1,
    mergedAt: '2026-10-01T10:00:00Z',
    ...over,
  }
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function fail(status = 500, body: unknown = {}): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

function mockApi(
  lists: { merges?: Merge[]; shared?: unknown[] } | Response,
  post: (url: string, init: RequestInit) => Response | Promise<Response> = () => ok({ ok: true }),
) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return post(url, init)
    if ('ok' in lists && typeof (lists as Response).json === 'function') return lists as Response
    const l = lists as { merges?: Merge[]; shared?: unknown[] }
    return ok({ merges: l.merges ?? [], shared: l.shared ?? [] })
  })
}

function postCalls(): Array<[string, RequestInit]> {
  return fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST') as Array<
    [string, RequestInit]
  >
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Identities page: header and loading', () => {
  it('renders the h1, the intro line and the tablist', async () => {
    mockApi({ merges: [merge(1)] })
    render(<IdentitiesPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Identities' })).toBeTruthy()
    expect(screen.getByText(/Contacts are matched across the site, EspoCRM and Chatwoot by email/)).toBeTruthy()
    expect(screen.getByRole('tablist')).toBeTruthy()
    await screen.findByText('owner1@example.com')
  })

  it('shows Loading... in the table cell before the first response', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<IdentitiesPage />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })
})

describe('Identities page: merged tab', () => {
  it('lists each merge with the Phone merge badge and the bookings count', async () => {
    mockApi({ merges: [merge(1), merge(2)] })
    render(<IdentitiesPage />)
    await screen.findByText('owner1@example.com')
    expect(screen.getByText('second1@example.com')).toBeTruthy()
    expect(screen.getAllByText('Phone merge')).toHaveLength(2)
    const row = screen.getByText('second2@example.com').closest('tr') as HTMLElement
    expect(within(row).getByText('3')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Merged by phone (2)' })).toBeTruthy()
    for (const th of screen.getAllByRole('columnheader')) expect(th.getAttribute('scope')).toBe('col')
  })

  it('shows the empty state when there are no phone merges', async () => {
    mockApi({ merges: [] })
    render(<IdentitiesPage />)
    expect(await screen.findByText('No phone merges yet')).toBeTruthy()
    expect(screen.getByText(/A contact is merged by phone only when a new email arrives/)).toBeTruthy()
  })

  it('shows the load error and a Refresh identities button on 403, no table', async () => {
    mockApi(fail(403))
    render(<IdentitiesPage />)
    expect(await screen.findByText('Could not load identities. Refresh to retry.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    fetchMock.mockClear()
    mockApi({ merges: [merge(1)] })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh identities' }))
    expect(await screen.findByText('owner1@example.com')).toBeTruthy()
  })
})

describe('Identities page: split contact', () => {
  it('opens the modal with the full body text, then posts the merged email once and shows Split queued', async () => {
    let release: (r: Response) => void = () => {}
    mockApi({ merges: [merge(1)] }, () => new Promise<Response>((r) => { release = r }))
    render(<IdentitiesPage />)
    await screen.findByText('owner1@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Split second1@example.com from owner1@example.com' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Split this contact')).toBeTruthy()
    expect(
      within(dialog).getByText(
        'second1@example.com will become a separate contact from owner1@example.com. The number +420777123401 will be marked as shared and never used to match contacts again. EspoCRM and Chatwoot update within a few minutes. Past Chatwoot conversations stay with the original contact.',
      ),
    ).toBeTruthy()

    const submit = within(dialog).getByRole('button', { name: 'Split contact' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Splitting...' })).toBeTruthy())
    expect((within(dialog).getByRole('button', { name: 'Splitting...' }) as HTMLButtonElement).disabled).toBe(true)
    expect(postCalls()).toHaveLength(1)
    const [url, init] = postCalls()[0]
    expect(url).toBe('/api/admin/identities/split')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'second1@example.com' })

    mockApi({ merges: [] })
    release(ok({ ok: true, oldIdentityId: 'a', newIdentityId: 'b' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      await screen.findByText(/Split queued\. EspoCRM and Chatwoot will update within a few minutes\./),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View Outbox' }).getAttribute('href')).toBe('/admin/outbox')
  })

  it('Keep contact merged closes without any request', async () => {
    mockApi({ merges: [merge(1)] })
    render(<IdentitiesPage />)
    await screen.findByText('owner1@example.com')
    fireEvent.click(screen.getByRole('button', { name: /^Split second1/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep contact merged' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(postCalls()).toHaveLength(0)
  })

  it('a failed split keeps the modal open with a role=alert message', async () => {
    mockApi({ merges: [merge(1)] }, () => fail(500))
    render(<IdentitiesPage />)
    await screen.findByText('owner1@example.com')
    fireEvent.click(screen.getByRole('button', { name: /^Split second1/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Split contact' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe('Could not split this contact. Try again; if it keeps failing, check the Outbox.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText(/Split queued/)).toBeNull()
  })
})
