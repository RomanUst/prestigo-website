import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
      {children}
    </a>
  ),
}))

import ErasurePage from '@/app/(internal)/admin/(dashboard)/erasure/page'

const REQUEST_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const EMAIL = 'jane.doe@example.com'

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function fail(status: number, body: unknown = {}): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

const previewBody = (over: Record<string, unknown> = {}) => ({
  requestId: REQUEST_ID,
  primaryEmail: EMAIL,
  counts: { bookings: 4, upcoming: 0, inquiries: 2, quoteLeads: 1, hasAccount: true, ...over },
})

let fetchMock: ReturnType<typeof vi.fn>

/** Routes fetch by URL; the log endpoint always answers an empty list unless overridden. */
function mockApi(handlers: {
  preview?: () => Response | Promise<Response>
  confirm?: (init: RequestInit) => Response | Promise<Response>
  log?: () => Response | Promise<Response>
}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/erasure/preview') return (handlers.preview ?? (() => ok(previewBody())))()
    if (url === '/api/admin/erasure/confirm') return (handlers.confirm ?? (() => ok({ ok: true, queued: true })))(init!)
    if (url === '/api/admin/erasure') return (handlers.log ?? (() => ok({ rows: [] })))()
    throw new Error(`unexpected fetch ${url}`)
  })
}

function callsTo(url: string): Array<[string, RequestInit]> {
  return fetchMock.mock.calls.filter((c) => c[0] === url) as Array<[string, RequestInit]>
}

async function search(value = EMAIL) {
  fireEvent.change(screen.getByLabelText(/email or phone/i), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview erasure' }))
}

async function openConfirm() {
  await search()
  fireEvent.click(await screen.findByRole('button', { name: 'Erase this person...' }))
  return await screen.findByRole('dialog')
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Erasure page: search', () => {
  it('shows the h1, the intro panel, the labelled search field, its placeholder and the primary button', () => {
    mockApi({})
    render(<ErasurePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Erasure' })).toBeTruthy()
    expect(
      screen.getByText(/Use this page only after you have verified the requester's identity outside the site/),
    ).toBeTruthy()
    const field = screen.getByLabelText(/email or phone/i) as HTMLInputElement
    expect(field.placeholder).toBe('name@example.com or +420 777 123 456')
    expect(screen.getByRole('button', { name: 'Preview erasure' })).toBeTruthy()
  })

  it('an empty search shows the validation text and sends nothing', async () => {
    mockApi({})
    render(<ErasurePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview erasure' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Enter an email address or a phone number with country code.',
    )
    expect(callsTo('/api/admin/erasure/preview')).toHaveLength(0)
  })

  it('a 422 invalid_query shows the validation text', async () => {
    mockApi({ preview: () => fail(422, { error: 'invalid_query' }) })
    render(<ErasurePage />)
    await search('nonsense')
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Enter an email address or a phone number with country code.',
    )
  })

  it('not found shows the not-found text and no preview', async () => {
    mockApi({ preview: () => fail(422, { error: 'not_found' }) })
    render(<ErasurePage />)
    await search()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No customer found for that email or phone. Check the spelling; the person may already be erased.',
    )
    expect(screen.queryByRole('button', { name: 'Erase this person...' })).toBeNull()
  })

  it('a shared phone shows the shared message with the count and offers no preview', async () => {
    mockApi({ preview: () => fail(422, { error: 'shared_phone', identities: 3 }) })
    render(<ErasurePage />)
    await search('+442079460958')
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This number is shared by 3 contacts, so it cannot identify one person. Search by email instead.',
    )
    expect(screen.queryByText('What will happen')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Erase this person...' })).toBeNull()
  })

  it('an erasure that is already in progress shows its message', async () => {
    mockApi({ preview: () => fail(422, { error: 'already_in_progress' }) })
    render(<ErasurePage />)
    await search()
    expect((await screen.findByRole('alert')).textContent).toBe('An erasure for this person is already in progress.')
  })

  it('an unconfigured server (503) and a network error each show a readable message', async () => {
    mockApi({ preview: () => fail(503, { error: 'erasure_unconfigured' }) })
    const first = render(<ErasurePage />)
    await search()
    expect((await screen.findByRole('alert')).textContent).toMatch(/not set up on this server/)
    first.unmount()

    mockApi({
      preview: () => {
        throw new Error('offline')
      },
    })
    render(<ErasurePage />)
    await search()
    expect((await screen.findByRole('alert')).textContent).toBe('Could not search for this person. Try again.')
  })
})

describe('Erasure page: preview', () => {
  it('shows the person as the heading, WHAT WILL HAPPEN and the Site / Chatwoot / EspoCRM / Not covered rows', async () => {
    mockApi({})
    render(<ErasurePage />)
    await search()
    const heading = await screen.findByRole('heading', { level: 2, name: EMAIL })
    expect(heading.style.fontWeight).toBe('500')
    expect(screen.getByText('What will happen')).toBeTruthy()
    expect(
      screen.getByText(
        '4 bookings will be anonymised: name, email, phone, notes and addresses are wiped. Date, amount, vehicle class, reference and invoice data are kept for accounting. Account deleted. 3 form inquiries deleted.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('The contact and all of its conversations will be deleted.')).toBeTruthy()
    expect(screen.getByText('The contact and its leads will be deleted. 4 bookings will be anonymised.')).toBeTruthy()
    expect(
      screen.getByText(
        /Not covered: the email mailbox archive, Stripe and Resend records, and encrypted backups \(kept until they rotate out, up to 6 months\)\. Handle these by hand if needed\./,
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('says "No account." for a person without an account', async () => {
    mockApi({ preview: () => ok(previewBody({ hasAccount: false, bookings: 1, inquiries: 0, quoteLeads: 0 })) })
    render(<ErasurePage />)
    await search()
    await screen.findByRole('heading', { level: 2, name: EMAIL })
    expect(screen.getByText(/1 booking will be anonymised.*No account\. 0 form inquiries deleted\./)).toBeTruthy()
  })

  it('Discard preview clears the preview without a request', async () => {
    mockApi({})
    render(<ErasurePage />)
    await search()
    await screen.findByRole('heading', { level: 2, name: EMAIL })
    fireEvent.click(screen.getByRole('button', { name: 'Discard preview' }))
    expect(screen.queryByRole('heading', { level: 2, name: EMAIL })).toBeNull()
    expect(callsTo('/api/admin/erasure/confirm')).toHaveLength(0)
  })

  it('upcoming trips: the warning panel with the trip count is shown', async () => {
    mockApi({ preview: () => ok(previewBody({ upcoming: 1 })) })
    render(<ErasurePage />)
    await search()
    const note = await screen.findByRole('note')
    expect(note.textContent).toBe(
      "This person has 1 upcoming trip. Erasing now removes the passenger's name, phone and addresses from those bookings, so the driver will lose the trip details.",
    )
    expect(note.querySelector('svg')).not.toBeNull()
  })

  it('upcoming trips: plural wording for several trips', async () => {
    mockApi({ preview: () => ok(previewBody({ upcoming: 3 })) })
    render(<ErasurePage />)
    await search()
    expect((await screen.findByRole('note')).textContent).toMatch(/This person has 3 upcoming trips\./)
  })
})

describe('Erasure page: confirm modal', () => {
  it('Erase permanently stays disabled until the checkbox is ticked and the typed email matches', async () => {
    mockApi({})
    render(<ErasurePage />)
    const dialog = await openConfirm()
    expect(within(dialog).getByRole('heading', { name: 'Erase this person permanently' })).toBeTruthy()
    expect(
      within(dialog).getByText(
        `This wipes ${EMAIL} from the site, Chatwoot and EspoCRM. Deleted conversations and contacts cannot be restored.`,
      ),
    ).toBeTruthy()
    const button = within(dialog).getByRole('button', { name: 'Erase permanently' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(within(dialog).getByText(`Type ${EMAIL} exactly.`)).toBeTruthy()

    const box = within(dialog).getByLabelText("I verified the requester's identity outside the site.")
    const typed = within(dialog).getByLabelText(/type the email to confirm/i)
    fireEvent.click(box)
    expect(button.disabled).toBe(true)
    fireEvent.change(typed, { target: { value: 'someone.else@example.com' } })
    expect(button.disabled).toBe(true)
    fireEvent.change(typed, { target: { value: `  ${EMAIL.toUpperCase()} ` } })
    expect(button.disabled).toBe(false)
    fireEvent.click(box)
    expect(button.disabled).toBe(true)
    expect(button.style.background).toMatch(/#f87171|rgb\(248, 113, 113\)/)
  })

  it('without upcoming trips there is no second checkbox', async () => {
    mockApi({})
    render(<ErasurePage />)
    const dialog = await openConfirm()
    expect(within(dialog).queryByLabelText('I understand upcoming trips will be anonymised.')).toBeNull()
  })

  it('upcoming trips: a second checkbox is required before Erase permanently is enabled', async () => {
    mockApi({ preview: () => ok(previewBody({ upcoming: 2 })) })
    render(<ErasurePage />)
    const dialog = await openConfirm()
    const button = within(dialog).getByRole('button', { name: 'Erase permanently' }) as HTMLButtonElement
    fireEvent.click(within(dialog).getByLabelText("I verified the requester's identity outside the site."))
    fireEvent.change(within(dialog).getByLabelText(/type the email to confirm/i), { target: { value: EMAIL } })
    expect(button.disabled).toBe(true)
    fireEvent.click(within(dialog).getByLabelText('I understand upcoming trips will be anonymised.'))
    expect(button.disabled).toBe(false)
  })

  async function fillAndSubmit(dialog: HTMLElement, upcoming = false) {
    fireEvent.click(within(dialog).getByLabelText("I verified the requester's identity outside the site."))
    if (upcoming) fireEvent.click(within(dialog).getByLabelText('I understand upcoming trips will be anonymised.'))
    fireEvent.change(within(dialog).getByLabelText(/type the email to confirm/i), { target: { value: ` ${EMAIL} ` } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Erase permanently' }))
  }

  it('posts once with identityVerified true (double click starts one erasure), then closes and announces the success', async () => {
    let release: (r: Response) => void = () => {}
    mockApi({
      confirm: () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })
    render(<ErasurePage />)
    const dialog = await openConfirm()
    await fillAndSubmit(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: /Erasing/ }))
    fireEvent.submit(dialog.querySelector('form')!)
    await waitFor(() => expect(callsTo('/api/admin/erasure/confirm')).toHaveLength(1))
    const [, init] = callsTo('/api/admin/erasure/confirm')[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      requestId: REQUEST_ID,
      confirmEmail: EMAIL,
      identityVerified: true,
    })

    release(ok({ ok: true, queued: true, published: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Erasure queued. It usually finishes within a few minutes.')).toBeTruthy()
    // After the request is accepted the plain email is gone from the screen.
    expect(screen.queryByText(EMAIL)).toBeNull()
    expect(document.body.textContent).not.toContain(EMAIL)
  })

  it('sends upcomingAcknowledged true when the preview had upcoming trips', async () => {
    mockApi({ preview: () => ok(previewBody({ upcoming: 1 })) })
    render(<ErasurePage />)
    const dialog = await openConfirm()
    await fillAndSubmit(dialog, true)
    await waitFor(() => expect(callsTo('/api/admin/erasure/confirm')).toHaveLength(1))
    expect(JSON.parse(callsTo('/api/admin/erasure/confirm')[0][1].body as string)).toMatchObject({
      upcomingAcknowledged: true,
    })
  })

  it('a failed confirm shows the error inside the modal (role=alert) and keeps it open', async () => {
    mockApi({ confirm: () => fail(500, { error: 'Database error' }) })
    render(<ErasurePage />)
    const dialog = await openConfirm()
    await fillAndSubmit(dialog)
    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe('Could not start the erasure. Nothing was deleted. Try again.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: 'Erase permanently' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('a network error also keeps the modal open with the error text', async () => {
    mockApi({
      confirm: () => {
        throw new Error('offline')
      },
    })
    render(<ErasurePage />)
    const dialog = await openConfirm()
    await fillAndSubmit(dialog)
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Nothing was deleted/)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('already in progress (second tab or double submit) shows its message and creates nothing', async () => {
    mockApi({ confirm: () => fail(422, { error: 'already_in_progress' }) })
    render(<ErasurePage />)
    const dialog = await openConfirm()
    await fillAndSubmit(dialog)
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'An erasure for this person is already in progress.',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText('Erasure queued. It usually finishes within a few minutes.')).toBeNull()
  })

  it('Keep this person closes the modal without a request and keeps the preview', async () => {
    mockApi({})
    render(<ErasurePage />)
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep this person' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo('/api/admin/erasure/confirm')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 2, name: EMAIL })).toBeTruthy()
  })
})
