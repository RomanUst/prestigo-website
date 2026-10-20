import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent, cleanup, act } from '@testing-library/react'

import OutboxPage from '@/app/(internal)/admin/(dashboard)/outbox/page'

const UUID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

type Health = {
  pending: number
  processing: number
  failed: number
  stuck: number
  open_total: number
  oldest_pending_seconds: number | null
  sent_last_24h: number
  by_type: Array<{ event_type: string; status: string; count: number }>
}

function health(over: Partial<Health> = {}): Health {
  return {
    pending: 0,
    processing: 0,
    failed: 0,
    stuck: 0,
    open_total: 0,
    oldest_pending_seconds: null,
    sent_last_24h: 0,
    by_type: [],
    ...over,
  }
}

function event(i: number, over: Record<string, unknown> = {}) {
  const id = `${UUID.slice(0, -4)}${String(i).padStart(4, '0')}`
  return {
    idempotency_key: `lead.booking:${id}:new`,
    event_type: 'lead.booking',
    aggregate_type: 'booking',
    aggregate_id: id,
    status: 'failed',
    stuck: false,
    attempts: 6,
    last_error: 'crm_unconfigured',
    available_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
    booking_reference: `PRG-${1000 + i}`,
    ...over,
  }
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function fail(status = 500): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

function mockGet(payload: { health: Health; events: unknown[] } | Response) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return ok({ ok: true })
    if (payload instanceof Object && 'ok' in payload && typeof (payload as Response).json === 'function') {
      return payload as Response
    }
    return ok({ ...(payload as object), updatedAt: '2026-10-19T10:15:30Z' })
  })
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

describe('Outbox page — loading', () => {
  it('shows Loading... in the table and a dash in every KPI before the first response', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<OutboxPage />)
    expect(screen.getByText('Loading...')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBe(5)
  })
})

describe('Outbox page — empty', () => {
  it('empty: zero open events shows the healthy banner and the empty state', async () => {
    mockGet({ health: health(), events: [] })
    render(<OutboxPage />)
    expect(await screen.findByText('All sync events are being delivered.')).toBeTruthy()
    expect(screen.getByText('Everything is delivered')).toBeTruthy()
    expect(
      screen.getByText('No pending or failed events. New booking and signup events appear here until they are delivered.'),
    ).toBeTruthy()
  })
})

describe('Outbox page — load error', () => {
  it('load error: a 403 shows the message and a Refresh outbox button, no table', async () => {
    mockGet(fail(403))
    render(<OutboxPage />)
    expect(await screen.findByText('Could not load outbox health. Refresh to retry.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refresh outbox/ })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('load error: a network failure shows the same message', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<OutboxPage />)
    expect(await screen.findByText('Could not load outbox health. Refresh to retry.')).toBeTruthy()
  })

  it('load error: Refresh outbox fetches again', async () => {
    mockGet(fail(401))
    render(<OutboxPage />)
    await screen.findByText('Could not load outbox health. Refresh to retry.')
    mockGet({ health: health(), events: [] })
    fireEvent.click(screen.getByRole('button', { name: /Refresh outbox/ }))
    expect(await screen.findByText('Everything is delivered')).toBeTruthy()
  })
})

describe('Outbox page — populated', () => {
  it('problem banner omits a zero clause and lists rows with hints', async () => {
    mockGet({
      health: health({ failed: 2, open_total: 2, by_type: [{ event_type: 'lead.booking', status: 'failed', count: 2 }] }),
      events: [event(1), event(2, { last_error: 'cw_ambiguous' })],
    })
    render(<OutboxPage />)
    expect(await screen.findByText('2 failed events. Check that the CRM server is reachable, then retry.')).toBeTruthy()
    expect(screen.getByText('Credentials are missing in Vercel settings.')).toBeTruthy()
    expect(screen.getByText(/Chatwoot has several matching contacts/)).toBeTruthy()
    expect(screen.getByText('PRG-1001')).toBeTruthy()
    for (const th of screen.getAllByRole('columnheader')) expect(th.getAttribute('scope')).toBe('col')
  })

  it('problem banner names both counts when failed and stuck are set', async () => {
    mockGet({ health: health({ failed: 3, stuck: 1, open_total: 4 }), events: [event(1)] })
    render(<OutboxPage />)
    expect(
      await screen.findByText('3 failed and 1 stuck events. Check that the CRM server is reachable, then retry.'),
    ).toBeTruthy()
  })

  it('uses the first 8 id characters when the aggregate is not a booking', async () => {
    mockGet({
      health: health({ failed: 1, open_total: 1 }),
      events: [event(1, { aggregate_type: 'inquiry', booking_reference: null, event_type: 'sync.espo' })],
    })
    render(<OutboxPage />)
    expect(await screen.findByText('EspoCRM update')).toBeTruthy()
    expect(screen.getByText(UUID.slice(0, 8))).toBeTruthy()
  })

  it('shows no email or phone shaped value anywhere on the page', async () => {
    mockGet({ health: health({ failed: 1, open_total: 1 }), events: [event(1)] })
    const { container } = render(<OutboxPage />)
    await screen.findByText('PRG-1001')
    expect(container.textContent ?? '').not.toMatch(/@|\+\d{6,}/)
  })
})

describe('Outbox page — more than 100 open events', () => {
  it('100 rows are shown with a caption that carries the total of 120', async () => {
    const events = Array.from({ length: 100 }, (_, i) => event(i + 1))
    mockGet({
      health: health({ failed: 120, open_total: 120, by_type: [{ event_type: 'lead.booking', status: 'failed', count: 120 }] }),
      events,
    })
    render(<OutboxPage />)
    expect(
      await screen.findByText('Showing the latest 100 open events of 120. Sent events are not listed.'),
    ).toBeTruthy()
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBe(101) // 100 body rows + header
    expect(screen.getByRole('button', { name: /^All \(120\)/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Failed \(120\)/ })).toBeTruthy()
  }, 20_000)
})

describe('Outbox page — filter chips', () => {
  it('chips carry totals and a click refetches with the status', async () => {
    mockGet({
      health: health({
        failed: 3,
        pending: 2,
        open_total: 5,
        by_type: [
          { event_type: 'lead.booking', status: 'failed', count: 3 },
          { event_type: 'lead.booking', status: 'pending', count: 2 },
        ],
      }),
      events: [event(1)],
    })
    render(<OutboxPage />)
    await screen.findByText('PRG-1001')
    expect(screen.getByRole('button', { name: /^All \(5\)/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Pending \(2\)/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Processing \(0\)/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Pending \(2\)/ }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('status=pending'))).toBe(true)
    })
  })
})

describe('Outbox page — retry all', () => {
  const failedPayload = () => ({
    health: health({ failed: 3, open_total: 3, by_type: [{ event_type: 'lead.booking', status: 'failed', count: 3 }] }),
    events: [event(1), event(2), event(3)],
  })

  it('retry all: asks for inline confirmation, posts once, and reports queuing only', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ ok: true, queued: 3, published: 3 })
      return ok({ ...failedPayload(), updatedAt: '2026-10-19T10:15:30Z' })
    })
    render(<OutboxPage />)
    await screen.findByText('PRG-1001')

    fireEvent.click(screen.getByRole('button', { name: 'Retry all failed' }))
    expect(screen.queryByRole('button', { name: 'Retry all failed' })).toBeNull()
    expect(screen.getByText('Retry 3 failed events?')).toBeTruthy()
    expect(screen.getByRole('button', { name: "Don't retry" })).toBeTruthy()

    const confirm = screen.getByRole('button', { name: 'Retry all' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(await screen.findByText('3 events queued for retry.')).toBeTruthy()

    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')
    expect(posts.length).toBe(1)
    expect(posts[0][0]).toBe('/api/admin/outbox/retry-all')
    expect(screen.getByText('3 events queued for retry.').closest('[aria-live="polite"]')).not.toBeNull()
    expect(screen.queryByText(/delivered/i)).toBeNull()
  })

  it('retry all: the success text clears after 4 seconds', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ ok: true, queued: 3, published: 3 })
      return ok({ ...failedPayload(), updatedAt: '2026-10-19T10:15:30Z' })
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<OutboxPage />)
    await screen.findByText('PRG-1001')
    fireEvent.click(screen.getByRole('button', { name: 'Retry all failed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry all' }))
    await screen.findByText('3 events queued for retry.')
    await act(async () => {
      vi.advanceTimersByTime(4100)
    })
    expect(screen.queryByText('3 events queued for retry.')).toBeNull()
  })

  it("retry all: Don't retry closes the confirmation without posting", async () => {
    mockGet(failedPayload())
    render(<OutboxPage />)
    await screen.findByText('PRG-1001')
    fireEvent.click(screen.getByRole('button', { name: 'Retry all failed' }))
    fireEvent.click(screen.getByRole('button', { name: "Don't retry" }))
    expect(screen.getByRole('button', { name: 'Retry all failed' })).toBeTruthy()
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST').length).toBe(0)
  })

  it('retry all: a failed POST shows the retry error and nothing as queued', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return fail(500)
      return ok({ ...failedPayload(), updatedAt: '2026-10-19T10:15:30Z' })
    })
    render(<OutboxPage />)
    await screen.findByText('PRG-1001')
    fireEvent.click(screen.getByRole('button', { name: 'Retry all failed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry all' }))
    expect(await screen.findByText('Could not queue the retry. Check your connection and try again.')).toBeTruthy()
    expect(screen.queryByText(/queued for retry/)).toBeNull()
  })
})

describe('Outbox page — retry one event', () => {
  it('queued: after Retry event the row shows Queued and keeps its old error code', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return ok({ ok: true, queued: true, published: true })
      return ok({
        health: health({ failed: 1, open_total: 1 }),
        events: [event(1)],
        updatedAt: '2026-10-19T10:15:30Z',
      })
    })
    render(<OutboxPage />)
    await screen.findByText('PRG-1001')
    const btn = screen.getByRole('button', { name: 'Retry Lead PRG-1001' })
    fireEvent.click(btn)
    const row = (await screen.findByText('Queued')).closest('tr') as HTMLElement
    expect(within(row).getByText('crm_unconfigured')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry Lead PRG-1001' })).toBeNull()
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')
    expect(post?.[0]).toBe('/api/admin/outbox/retry')
    expect(JSON.parse(post?.[1].body)).toEqual({ key: event(1).idempotency_key })
  })

  it('a failed retry shows the error and does not mark the row queued', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return fail(422)
      return ok({
        health: health({ failed: 1, open_total: 1 }),
        events: [event(1)],
        updatedAt: '2026-10-19T10:15:30Z',
      })
    })
    render(<OutboxPage />)
    await screen.findByText('PRG-1001')
    fireEvent.click(screen.getByRole('button', { name: 'Retry Lead PRG-1001' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not queue the retry. Check your connection and try again.')
    expect(screen.queryByText('Queued')).toBeNull()
  })
})
