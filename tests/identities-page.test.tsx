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

// ── Task 2: shared numbers, mark-as-shared form, filter, tabs, hash ─────────────────────────────

type Shared = {
  phone: string
  source: 'auto' | 'manual' | 'split'
  note: string | null
  markedAt: string
  emails: string[]
}

function shared(i: number, over: Partial<Shared> = {}): Shared {
  return {
    phone: `+4219001000${String(i).padStart(2, '0')}`,
    source: 'auto',
    note: null,
    markedAt: '2026-10-02T09:00:00Z',
    emails: [`a${i}@x.com`, `b${i}@x.com`],
    ...over,
  }
}

async function openSharedTab() {
  const tab = await screen.findByRole('tab', { name: /^Shared numbers/ })
  fireEvent.click(tab)
}

describe('Identities page: shared numbers tab', () => {
  it('lists shared numbers with HOW badges, emails, note and marked date', async () => {
    mockApi({
      merges: [merge(1)],
      shared: [
        shared(1, { source: 'auto' }),
        shared(2, { source: 'manual', note: 'TravelExpress desk' }),
        shared(3, { source: 'split' }),
      ],
    })
    render(<IdentitiesPage />)
    await openSharedTab()
    expect(screen.getByRole('tab', { name: 'Shared numbers (3)' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Automatic')).toBeTruthy()
    expect(screen.getByText('Manual')).toBeTruthy()
    expect(screen.getByText('After split')).toBeTruthy()
    expect(screen.getByText('TravelExpress desk')).toBeTruthy()
    expect(screen.getByText('+421900100001')).toBeTruthy()
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads).toEqual(['PHONE', 'HOW', 'EMAILS', 'NOTE', 'MARKED'])
  })

  it('shows "+2 more" for four emails and keeps the full list in the title', async () => {
    const emails = ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']
    mockApi({ shared: [shared(1, { emails })] })
    render(<IdentitiesPage />)
    await openSharedTab()
    expect(await screen.findByText('a@x.com, b@x.com')).toBeTruthy()
    expect(screen.getByText('+2 more')).toBeTruthy()
    const cell = screen.getByText('+2 more').closest('td') as HTMLElement
    expect(cell.getAttribute('title')).toBe('a@x.com, b@x.com, c@x.com, d@x.com')
  })

  it('shows the shared empty state', async () => {
    mockApi({ merges: [merge(1)], shared: [] })
    render(<IdentitiesPage />)
    await openSharedTab()
    expect(await screen.findByText('No shared numbers')).toBeTruthy()
    expect(screen.getByText(/A number becomes shared automatically when it appears with two different emails/)).toBeTruthy()
  })
})

describe('Identities page: mark number as shared', () => {
  async function openMark() {
    fireEvent.click(await screen.findByRole('button', { name: 'Mark number as shared' }))
    return screen.findByRole('dialog')
  }

  it('shared: posts { phone, note } once, closes the modal and refreshes the list', async () => {
    let release: (r: Response) => void = () => {}
    mockApi({ shared: [] }, () => new Promise<Response>((r) => { release = r }))
    render(<IdentitiesPage />)
    await screen.findByText('No phone merges yet')
    const dialog = await openMark()
    expect(within(dialog).getByText('Mark a number as shared')).toBeTruthy()
    expect(
      within(dialog).getByText('Include the country code. Shared numbers are never used to merge contacts.'),
    ).toBeTruthy()
    const phone = within(dialog).getByLabelText(/phone number/i) as HTMLInputElement
    expect(document.activeElement).toBe(phone)
    const note = within(dialog).getByPlaceholderText('e.g. TravelExpress desk') as HTMLInputElement
    expect(note.maxLength).toBe(80)
    fireEvent.change(phone, { target: { value: '+420 777 123 456' } })
    fireEvent.change(note, { target: { value: 'TravelExpress desk' } })

    const form = phone.closest('form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(postCalls()).toHaveLength(1)
    const [url, init] = postCalls()[0]
    expect(url).toBe('/api/admin/identities/shared')
    expect(JSON.parse(init.body as string)).toEqual({ phone: '+420 777 123 456', note: 'TravelExpress desk' })
    expect((within(dialog).getByRole('button', { name: 'Marking...' }) as HTMLButtonElement).disabled).toBe(true)

    fetchMock.mockClear()
    mockApi({ shared: [shared(1, { source: 'manual', note: 'TravelExpress desk' })] })
    release(ok({ ok: true, phone: '+420777123456' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/identities'))
    expect(await screen.findByRole('tab', { name: 'Shared numbers (1)' })).toBeTruthy()
  })

  it('invalid_phone shows the API message under the phone field and keeps the modal open', async () => {
    mockApi({}, () =>
      fail(422, {
        error: 'invalid_phone',
        message: 'Enter the number with country code, for example +420 777 123 456.',
      }),
    )
    render(<IdentitiesPage />)
    await screen.findByText('No phone merges yet')
    const dialog = await openMark()
    fireEvent.change(within(dialog).getByLabelText(/phone number/i), { target: { value: '777123456' } })
    fireEvent.submit(within(dialog).getByLabelText(/phone number/i).closest('form') as HTMLFormElement)
    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe('Enter the number with country code, for example +420 777 123 456.')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('already_shared shows "That number is already marked as shared."', async () => {
    mockApi({}, () =>
      fail(422, { error: 'already_shared', message: 'That number is already marked as shared.' }),
    )
    render(<IdentitiesPage />)
    await screen.findByText('No phone merges yet')
    const dialog = await openMark()
    fireEvent.change(within(dialog).getByLabelText(/phone number/i), { target: { value: '+420 777 123 456' } })
    fireEvent.submit(within(dialog).getByLabelText(/phone number/i).closest('form') as HTMLFormElement)
    expect((await within(dialog).findByRole('alert')).textContent).toBe('That number is already marked as shared.')
  })

  it("Don't mark number closes without any request", async () => {
    mockApi({})
    render(<IdentitiesPage />)
    await screen.findByText('No phone merges yet')
    const dialog = await openMark()
    fireEvent.click(within(dialog).getByRole('button', { name: "Don't mark number" }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(postCalls()).toHaveLength(0)
  })

  it('has no unmark action anywhere', async () => {
    mockApi({ merges: [merge(1)], shared: [shared(1, { source: 'manual' })] })
    render(<IdentitiesPage />)
    await openSharedTab()
    expect(screen.queryByRole('button', { name: /unmark|remove|delete/i })).toBeNull()
  })
})

describe('Identities page: filter', () => {
  it('filter narrows merged rows by email or phone and shows the no-match line with the row count', async () => {
    mockApi({ merges: [merge(1), merge(2)] })
    render(<IdentitiesPage />)
    await screen.findByText('owner1@example.com')
    const input = screen.getByPlaceholderText('Filter by email or phone')
    fireEvent.change(input, { target: { value: 'second2' } })
    expect(screen.queryByText('owner1@example.com')).toBeNull()
    expect(screen.getByText('owner2@example.com')).toBeTruthy()
    fireEvent.change(input, { target: { value: '+420 777 123 401' } })
    expect(screen.getByText('owner1@example.com')).toBeTruthy()
    expect(screen.queryByText('owner2@example.com')).toBeNull()
    fireEvent.change(input, { target: { value: 'nobody' } })
    expect(screen.getByText('No matches. Clear the filter to see all 2 rows.')).toBeTruthy()
  })

  it('filter narrows shared rows by any email and keeps a separate filter per tab', async () => {
    mockApi({ merges: [merge(1)], shared: [shared(1), shared(2)] })
    render(<IdentitiesPage />)
    await openSharedTab()
    const input = await screen.findByPlaceholderText('Filter by email or phone')
    fireEvent.change(input, { target: { value: 'b2@x.com' } })
    expect(screen.queryByText('+421900100001')).toBeNull()
    expect(screen.getByText('+421900100002')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No matches. Clear the filter to see all 2 rows.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /^Merged by phone/ }))
    expect((screen.getByPlaceholderText('Filter by email or phone') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('owner1@example.com')).toBeTruthy()
  })
})

describe('Identities page: tabs and hash', () => {
  it('ArrowRight moves focus and selection to Shared numbers and sets the #shared hash; ArrowLeft returns', async () => {
    mockApi({ merges: [merge(1)], shared: [shared(1), shared(2)] })
    render(<IdentitiesPage />)
    const merged = await screen.findByRole('tab', { name: 'Merged by phone (1)' })
    merged.focus()
    expect(merged.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(merged, { key: 'ArrowRight' })
    const sharedTab = screen.getByRole('tab', { name: 'Shared numbers (2)' })
    expect(sharedTab.getAttribute('aria-selected')).toBe('true')
    expect(merged.getAttribute('aria-selected')).toBe('false')
    expect(document.activeElement).toBe(sharedTab)
    expect(window.location.hash).toBe('#shared')
    expect(sharedTab.getAttribute('aria-controls')).toBe('identities-panel')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(sharedTab.id)

    fireEvent.keyDown(sharedTab, { key: 'ArrowLeft' })
    expect(merged.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(merged)
    expect(window.location.hash).toBe('')
  })

  it('loading the page with #shared opens the Shared numbers tab', async () => {
    window.location.hash = '#shared'
    mockApi({ merges: [merge(1)], shared: [shared(1)] })
    render(<IdentitiesPage />)
    const tab = await screen.findByRole('tab', { name: 'Shared numbers (1)' })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('+421900100001')).toBeTruthy()
  })

  it('tabs are 44px high and the active tab has the copper 2px bottom border', async () => {
    mockApi({ merges: [merge(1)], shared: [] })
    render(<IdentitiesPage />)
    const merged = await screen.findByRole('tab', { name: 'Merged by phone (1)' })
    expect(merged.style.minHeight).toBe('44px')
    expect(merged.style.borderBottom).toBe('2px solid var(--copper)')
    expect(screen.getByRole('tab', { name: 'Shared numbers (0)' }).style.borderBottom).toBe('2px solid transparent')
  })
})

describe('Identities page: styling contract', () => {
  it('table wrapper scrolls horizontally, table is 720px wide, rows and header are 48px', async () => {
    mockApi({ merges: [merge(1)] })
    render(<IdentitiesPage />)
    await screen.findByText('owner1@example.com')
    const table = screen.getByRole('table')
    expect(table.style.minWidth).toBe('720px')
    expect((table.parentElement as HTMLElement).style.overflowX).toBe('auto')
    expect((screen.getAllByRole('row')[0] as HTMLElement).style.height).toBe('48px')
    expect((screen.getByText('owner1@example.com') as HTMLElement).style.height).toBe('48px')
    expect((screen.getByText('owner1@example.com') as HTMLElement).style.maxWidth).toBe('280px')
  })

  it('no new element uses font weight 300 or 700 (page, tables, mark-as-shared modal)', async () => {
    mockApi({ merges: [merge(1)], shared: [shared(1)] })
    render(<IdentitiesPage />)
    await screen.findByText('owner1@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Mark number as shared' }))
    await screen.findByRole('dialog')
    const bad = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter(
      (el) => el.id !== 'modal-title' && ['300', '700', 'bold', 'lighter'].includes(el.style.fontWeight),
    )
    expect(bad.map((el) => el.outerHTML.slice(0, 80))).toEqual([])
  })

  it('a hovered row switches to the anthracite-light background', async () => {
    mockApi({ merges: [merge(1)] })
    render(<IdentitiesPage />)
    const row = (await screen.findByText('owner1@example.com')).closest('tr') as HTMLElement
    expect(row.style.background).toBe('var(--anthracite-mid)')
    fireEvent.mouseEnter(row)
    expect(row.style.background).toBe('var(--anthracite-light)')
  })
})
