// Phase 87 plan 12 (D-16 a): the operator's no-show banner and the Confirm no-show modal.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { NoShowBanner } from '@/components/admin/NoShowBanner'
import { ConfirmNoShowModal } from '@/components/admin/ConfirmNoShowModal'

// 13:41 UTC on 3 Nov 2026 is 14:41 in Prague (CET, UTC+1)
const REQUESTED_AT = '2026-11-03T13:41:00.000Z'

type Reply = { ok: boolean; status?: number; body?: unknown }

/** GET answers `getReply`; every POST answers `postReply` (a promise gates a pending state). */
function stubFetch(opts: { get?: Reply | 'reject'; post?: Reply | Promise<Reply> }) {
  const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const reply = opts.post ?? { ok: true, status: 200, body: { ok: true } }
      return Promise.resolve(reply).then(r => ({
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 500),
        json: () => Promise.resolve(r.body ?? {}),
      }))
    }
    if (opts.get === 'reject') return Promise.reject(new Error('network'))
    const g = opts.get ?? { ok: true, body: { status: 'on_location', noShowRequestedAt: REQUESTED_AT, driverName: 'Jan Novak' } }
    return Promise.resolve({ ok: g.ok, status: g.status ?? 200, json: () => Promise.resolve(g.body ?? {}) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function postCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NoShowBanner', () => {
  it('shows the title, the driver name from GET and the Prague time of the request', async () => {
    const fetchMock = stubFetch({})
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={() => {}} />)

    expect(screen.getByText('No-show requested')).toBeDefined()
    expect(
      await screen.findByText(
        'Jan Novak asked for a no-show at 14:41 after waiting for the passenger. Try to reach the client, then confirm or dismiss.',
      ),
    ).toBeDefined()
    const getCall = fetchMock.mock.calls.find(([, init]) => !(init as RequestInit | undefined)?.method || (init as RequestInit).method === 'GET')
    expect(getCall?.[0]).toBe('/api/admin/bookings/b1/no-show')
  })

  it("falls back to 'The driver' when the GET fails", async () => {
    stubFetch({ get: 'reject' })
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={() => {}} />)
    expect(
      await screen.findByText(/^The driver asked for a no-show at 14:41 after waiting for the passenger\./),
    ).toBeDefined()
  })

  it("falls back to 'The driver' when GET has no driver name", async () => {
    stubFetch({ get: { ok: true, body: { status: 'on_location', noShowRequestedAt: REQUESTED_AT, driverName: null } } })
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={() => {}} />)
    expect(await screen.findByText(/^The driver asked for a no-show at 14:41/)).toBeDefined()
  })

  it("'Confirm no-show' only asks the table to open the modal and sends nothing", async () => {
    const fetchMock = stubFetch({})
    const onConfirmRequest = vi.fn()
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={onConfirmRequest} onCleared={() => {}} />)
    await screen.findByText(/Jan Novak asked/)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm no-show' }))
    expect(onConfirmRequest).toHaveBeenCalledTimes(1)
    expect(postCalls(fetchMock)).toHaveLength(0)
  })

  it("'Client found' POSTs { action: 'dismiss' } once with both buttons disabled while pending, then calls onCleared", async () => {
    let release: (r: Reply) => void = () => {}
    const gate = new Promise<Reply>(resolve => { release = resolve })
    const fetchMock = stubFetch({ post: gate })
    const onCleared = vi.fn()
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={onCleared} />)
    await screen.findByText(/Jan Novak asked/)

    fireEvent.click(screen.getByRole('button', { name: 'Client found' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }))

    expect(postCalls(fetchMock)).toHaveLength(1)
    const [url, init] = postCalls(fetchMock)[0]
    expect(url).toBe('/api/admin/bookings/b1/no-show')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ action: 'dismiss' })
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Confirm no-show' }) as HTMLButtonElement).disabled).toBe(true)
    expect(onCleared).not.toHaveBeenCalled()

    await act(async () => {
      release({ ok: true, status: 200, body: { ok: true, noShowRequestedAt: null } })
    })
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1))
  })

  it("a failed dismiss shows 'Could not clear the request. Reload and try again.' in the danger token and re-enables the buttons", async () => {
    stubFetch({ post: { ok: false, status: 500, body: { error: 'DB update failed' } } })
    const onCleared = vi.fn()
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={onCleared} />)
    await screen.findByText(/Jan Novak asked/)

    fireEvent.click(screen.getByRole('button', { name: 'Client found' }))
    const msg = await screen.findByText('Could not clear the request. Reload and try again.')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    expect(onCleared).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Client found' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Confirm no-show' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('a network error on dismiss shows the same failure text', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new Error('offline'))
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ driverName: 'Jan Novak' }) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={() => {}} />)
    await screen.findByText(/Jan Novak asked/)

    fireEvent.click(screen.getByRole('button', { name: 'Client found' }))
    expect(await screen.findByText('Could not clear the request. Reload and try again.')).toBeDefined()
  })

  it('long driver names wrap inside the banner and both buttons keep a 44px target (E8 long-text backstop)', async () => {
    const longName = 'Maximilian-Alexander von Hohenzollern-Sigmaringen-Wolfeschlegelsteinhausenbergerdorff'
    stubFetch({ get: { ok: true, body: { driverName: longName } } })
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={() => {}} />)
    const text = await screen.findByText(new RegExp(`^${longName} asked for a no-show`))
    const textStyle = (text as HTMLElement).style
    expect(textStyle.overflowWrap).toBe('anywhere')
    for (const name of ['Confirm no-show', 'Client found']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).style.minHeight).toBe('44px')
    }
  })

  it('uses design tokens for the warn banner and the destructive button', async () => {
    stubFetch({})
    render(<NoShowBanner bookingId="b1" requestedAt={REQUESTED_AT} onConfirmRequest={() => {}} onCleared={() => {}} />)
    await screen.findByText(/Jan Novak asked/)
    const banner = screen.getByTestId('no-show-banner')
    expect(banner.getAttribute('style') ?? '').toContain('var(--status-warn-bg)')
    expect(banner.getAttribute('style') ?? '').toContain('var(--status-warn-fg)')
    const confirm = screen.getByRole('button', { name: 'Confirm no-show' })
    expect(confirm.getAttribute('style') ?? '').toContain('var(--admin-danger-solid)')
    expect(confirm.getAttribute('style') ?? '').toContain('var(--admin-on-danger)')
  })
})

describe('ConfirmNoShowModal', () => {
  const baseProps = { bookingId: 'b1', bookingReference: 'PRE-12345' }

  it('renders nothing while closed', () => {
    stubFetch({})
    render(<ConfirmNoShowModal {...baseProps} isOpen={false} onClose={() => {}} onConfirmed={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the title, the reference in the body and both buttons', () => {
    stubFetch({})
    render(<ConfirmNoShowModal {...baseProps} isOpen onClose={() => {}} onConfirmed={() => {}} />)
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Confirm no-show' })).toBeDefined()
    expect(
      screen.getByText(
        "Mark booking PRE-12345 as a no-show? The driver's trip link stops working and the status cannot be changed back.",
      ),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Confirm no-show' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Keep booking open' })).toBeDefined()
  })

  it("'Keep booking open' closes the modal and sends no request", () => {
    const fetchMock = stubFetch({})
    const onClose = vi.fn()
    render(<ConfirmNoShowModal {...baseProps} isOpen onClose={onClose} onConfirmed={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep booking open' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the primary POSTs { action: 'confirm', expected_status: 'on_location' } once, shows 'Confirming…' with both buttons disabled, then onConfirmed('no_show')", async () => {
    let release: (r: Reply) => void = () => {}
    const gate = new Promise<Reply>(resolve => { release = resolve })
    const fetchMock = stubFetch({ post: gate })
    const onConfirmed = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmNoShowModal {...baseProps} isOpen onClose={onClose} onConfirmed={onConfirmed} />)

    const primary = screen.getByRole('button', { name: 'Confirm no-show' })
    fireEvent.click(primary)
    fireEvent.click(primary)

    expect(postCalls(fetchMock)).toHaveLength(1)
    const [url, init] = postCalls(fetchMock)[0]
    expect(url).toBe('/api/admin/bookings/b1/no-show')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ action: 'confirm', expected_status: 'on_location' })
    expect((screen.getByRole('button', { name: 'Confirming…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Keep booking open' }) as HTMLButtonElement).disabled).toBe(true)

    // not dismissable mid-request: Escape does nothing
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      release({ ok: true, status: 200, body: { ok: true, status: 'no_show' } })
    })
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith('no_show'))
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('a 409 status_conflict shows the conflict copy in the modal and does not confirm', async () => {
    stubFetch({ post: { ok: false, status: 409, body: { error: 'status_conflict', currentStatus: 'on_board' } } })
    const onConfirmed = vi.fn()
    render(<ConfirmNoShowModal {...baseProps} isOpen onClose={() => {}} onConfirmed={onConfirmed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm no-show' }))
    const msg = await screen.findByRole('alert')
    expect(msg.textContent).toBe('This booking was just changed to On Board by the driver. Reload to see the latest state.')
    expect(msg.getAttribute('style') ?? '').toContain('var(--status-danger-fg)')
    expect(onConfirmed).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Confirm no-show' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('any other failure shows a generic error and keeps the modal open', async () => {
    stubFetch({ post: { ok: false, status: 500, body: { error: 'DB update failed' } } })
    const onConfirmed = vi.fn()
    render(<ConfirmNoShowModal {...baseProps} isOpen onClose={() => {}} onConfirmed={onConfirmed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm no-show' }))
    const msg = await screen.findByRole('alert')
    expect(msg.textContent).toBe('Could not confirm the no-show. Reload and try again.')
    expect(onConfirmed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('uses the destructive token pair on the primary and an outlined secondary', () => {
    stubFetch({})
    render(<ConfirmNoShowModal {...baseProps} isOpen onClose={() => {}} onConfirmed={() => {}} />)
    const primary = screen.getByRole('button', { name: 'Confirm no-show' })
    expect(primary.getAttribute('style') ?? '').toContain('var(--admin-danger-solid)')
    expect(primary.getAttribute('style') ?? '').toContain('var(--admin-on-danger)')
    const secondary = screen.getByRole('button', { name: 'Keep booking open' })
    expect(secondary.getAttribute('style') ?? '').toContain('var(--admin-border-strong)')
  })

  it('clears a previous error when reopened', async () => {
    stubFetch({ post: { ok: false, status: 500, body: {} } })
    const { rerender } = render(<ConfirmNoShowModal {...baseProps} isOpen onClose={() => {}} onConfirmed={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm no-show' }))
    await screen.findByRole('alert')

    rerender(<ConfirmNoShowModal {...baseProps} isOpen={false} onClose={() => {}} onConfirmed={() => {}} />)
    rerender(<ConfirmNoShowModal {...baseProps} isOpen onClose={() => {}} onConfirmed={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
