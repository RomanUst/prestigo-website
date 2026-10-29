/**
 * Phase 84 plan 84-07 (PANEL-01, PANEL-02, D-02, D-03): the Chatwoot Dashboard App iframe.
 *
 * jsdom has no real parent window, so a same-document iframe's contentWindow stands in for the
 * Chatwoot SPA (RESEARCH A7): window.parent is redefined to it and MessageEvents carry it as source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, act, fireEvent, waitFor, cleanup } from '@testing-library/react'
import {
  FETCH_INFO_MESSAGE,
  PANEL_API_PATH,
  TOKEN_STORAGE_KEY,
  isTrustedContextEvent,
  parseAppContext,
} from '@/app/embed/chatwoot-dashboard/panel-handshake'
import PanelClient from '@/app/embed/chatwoot-dashboard/PanelClient'
import { STATUS_LABELS, type PanelBooking, type PanelResponse } from '@/lib/panel-dto'

const ORIGIN = 'https://chat.example.test'
const TOKEN = 'tok_abcDEF123456'

// ── pure handshake helpers ──────────────────────────────────────────────────────────────────────
describe('parseAppContext', () => {
  const ctx = (data: unknown, event = 'appContext') => JSON.stringify({ event, data })

  it('keeps only the conversation id and the theme (D-03)', () => {
    const out = parseAppContext(
      ctx({
        conversation: { id: 42, status: 'open' },
        theme: 'dark',
        contact: { email: 'x@example.test', phone_number: '+420000000000' },
        currentAgent: { id: 1, email: 'agent@example.test' },
        customAttributes: { a: 'b' },
      }),
    )
    expect(out).toEqual({ conversationId: 42, theme: 'dark' })
    expect(Object.keys(out as object).sort()).toEqual(['conversationId', 'theme'])
  })

  it('maps any theme other than dark to light', () => {
    expect(parseAppContext(ctx({ conversation: { id: 1 }, theme: 'weird' }))?.theme).toBe('light')
    expect(parseAppContext(ctx({ conversation: { id: 1 } }))?.theme).toBe('light')
    expect(parseAppContext(ctx({ conversation: { id: 1 }, theme: 'light' }))?.theme).toBe('light')
  })

  it.each([0, -1, 1.5, '42', null, undefined, Number.MAX_SAFE_INTEGER + 2, NaN])(
    'rejects conversation id %s',
    (id) => {
      expect(parseAppContext(ctx({ conversation: { id }, theme: 'dark' }))).toBeNull()
    },
  )

  it('rejects a missing conversation, a non-string payload, invalid JSON and other events', () => {
    expect(parseAppContext(ctx({ theme: 'dark' }))).toBeNull()
    expect(parseAppContext(ctx({ conversation: null }))).toBeNull()
    expect(parseAppContext({ event: 'appContext', data: { conversation: { id: 1 } } })).toBeNull()
    expect(parseAppContext(42)).toBeNull()
    expect(parseAppContext(null)).toBeNull()
    expect(parseAppContext('{not json')).toBeNull()
    expect(parseAppContext('"appContext"')).toBeNull()
    expect(parseAppContext(ctx({ conversation: { id: 1 } }, 'other'))).toBeNull()
    expect(parseAppContext(JSON.stringify({ data: { conversation: { id: 1 } } }))).toBeNull()
  })
})

describe('isTrustedContextEvent', () => {
  const parent = { name: 'parent' } as unknown as Window
  const other = { name: 'other' } as unknown as Window
  const ev = (origin: string, source: unknown) => ({ origin, source }) as unknown as MessageEvent

  it('is true only for the exact origin and the parent window', () => {
    expect(isTrustedContextEvent(ev(ORIGIN, parent), ORIGIN, parent)).toBe(true)
  })

  it.each([
    'https://chat.example.test.evil.example',
    'https://chat.example.test:8443',
    'http://chat.example.test',
    'https://evil.example',
    'https://CHAT.example.test',
    'null',
    '',
  ])('is false for origin %s', (origin) => {
    expect(isTrustedContextEvent(ev(origin, parent), ORIGIN, parent)).toBe(false)
  })

  it('is false for a different source', () => {
    expect(isTrustedContextEvent(ev(ORIGIN, other), ORIGIN, parent)).toBe(false)
    expect(isTrustedContextEvent(ev(ORIGIN, null), ORIGIN, parent)).toBe(false)
  })
})

describe('constants', () => {
  it('pins the wire strings', () => {
    expect(FETCH_INFO_MESSAGE).toBe('chatwoot-dashboard-app:fetch-info')
    expect(TOKEN_STORAGE_KEY).toBe('prestigo.chatwootPanel.token')
    expect(PANEL_API_PATH).toBe('/api/chatwoot/dashboard-app')
  })

  it('PanelClient keeps a local literal for the isolation guard that equals PANEL_API_PATH', () => {
    const source = readFileSync(path.resolve(__dirname, '../app/embed/chatwoot-dashboard/PanelClient.tsx'), 'utf-8')
    expect(source).toContain(`const PANEL_API = '${PANEL_API_PATH}'`)
  })
})

// ── component ───────────────────────────────────────────────────────────────────────────────────
function booking(over: Partial<PanelBooking>): PanelBooking {
  return {
    id: 'b1',
    reference: 'PRG-0001',
    status: 'confirmed',
    paymentState: 'paid',
    isReturnLeg: false,
    pickupUtc: '2026-11-12T13:30:00.000Z',
    pickupDate: '2026-11-12',
    pickupTime: '14:30',
    pickupMs: Date.parse('2026-11-12T13:30:00.000Z'),
    origin: 'Vaclav Havel Airport Prague',
    destination: 'Hotel Aria, Tržiště 9',
    hours: null,
    vehicleClass: 'business',
    passengers: 2,
    luggage: 2,
    amountEur: 80,
    driverName: null,
    tripProgress: null,
    flightNumber: null,
    notes: null,
    paymentLinkUrl: null,
    adminHref: null,
    ...over,
  }
}

function response(over: Partial<PanelResponse> = {}): PanelResponse {
  return {
    state: 'ok',
    contact: { email: 'guest@example.test', phone: null, verified: true, phoneMismatch: false },
    counters: { trips: 2, totalSpentEur: 160 },
    upcoming: [booking({ id: 'u1', reference: 'PRG-UP01', status: 'confirmed' })],
    past: [
      booking({
        id: 'p1',
        reference: 'PRG-PAST1',
        status: 'completed',
        pickupUtc: '2026-01-05T08:00:00.000Z',
        pickupDate: '2026-01-05',
        pickupTime: '09:00',
        pickupMs: Date.parse('2026-01-05T08:00:00.000Z'),
        origin: 'Prague Main Station',
        destination: 'Karlovy Vary',
      }),
    ],
    pastTruncated: false,
    leadUrl: null,
    generatedAt: '2026-10-29T10:00:00.000Z',
    ...over,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const realParent = Object.getOwnPropertyDescriptor(window, 'parent')
let parentWin: Window
let parentPost: ReturnType<typeof vi.fn>
let iframe: HTMLIFrameElement

function installParent() {
  iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  parentWin = iframe.contentWindow as Window
  parentPost = vi.fn()
  Object.defineProperty(parentWin, 'postMessage', { value: parentPost, configurable: true })
  Object.defineProperty(window, 'parent', { value: parentWin, configurable: true })
}

function uninstallParent() {
  if (realParent) Object.defineProperty(window, 'parent', realParent)
  iframe?.remove()
}

function send(
  data: unknown,
  opts: { origin?: string; source?: Window | null } = {},
) {
  const payload = typeof data === 'string' ? data : JSON.stringify({ event: 'appContext', data })
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: payload,
        origin: opts.origin ?? ORIGIN,
        source: opts.source === undefined ? parentWin : opts.source,
      }),
    )
  })
}

const goodContext = (id = 42, theme = 'light') => ({
  conversation: { id },
  theme,
  contact: { email: 'secret@example.test', phone_number: '+420111222333' },
  currentAgent: { id: 7, email: 'agent@example.test' },
  customAttributes: { k: 'v' },
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  uninstallParent()
})

describe('PanelClient: not framed', () => {
  it('shows the inert copy, adds no message listener and makes no request', () => {
    const add = vi.spyOn(window, 'addEventListener')
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(screen.getByText('Open this panel from a Chatwoot conversation.')).toBeInTheDocument()
    expect(add.mock.calls.filter(([type]) => type === 'message')).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    add.mockRestore()
  })

  it('is inert when the Chatwoot origin is not configured, even if framed', () => {
    installParent()
    const add = vi.spyOn(window, 'addEventListener')
    render(<PanelClient chatwootOrigin={null} />)
    expect(screen.getByText('Open this panel from a Chatwoot conversation.')).toBeInTheDocument()
    expect(add.mock.calls.filter(([type]) => type === 'message')).toHaveLength(0)
    expect(parentPost).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    add.mockRestore()
  })
})

describe('PanelClient: handshake', () => {
  beforeEach(() => installParent())

  it('asks the parent with the exact origin as target, never a wildcard', () => {
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(parentPost).toHaveBeenCalledTimes(1)
    expect(parentPost).toHaveBeenCalledWith(FETCH_INFO_MESSAGE, ORIGIN)
    expect(parentPost.mock.calls.every(([, target]) => target === ORIGIN)).toBe(true)
  })

  it('attaches the listener before the first request', () => {
    const order: string[] = []
    const add = vi.spyOn(window, 'addEventListener').mockImplementation(((type: string) => {
      if (type === 'message') order.push('listen')
    }) as never)
    parentPost.mockImplementation(() => order.push('post'))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(order.slice(0, 2)).toEqual(['listen', 'post'])
    add.mockRestore()
  })

  it('re-sends every second at most 5 times, then shows the timeout copy and keeps listening', () => {
    vi.useFakeTimers()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(parentPost).toHaveBeenCalledTimes(1)
    for (let i = 1; i <= 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(parentPost).toHaveBeenCalledTimes(1 + i)
    }
    expect(screen.queryByText(/Chatwoot didn't send the conversation/)).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(parentPost).toHaveBeenCalledTimes(6)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(parentPost).toHaveBeenCalledTimes(6)
    expect(
      screen.getByText(
        "Chatwoot didn't send the conversation. Switch to another conversation and back, or reload this page.",
      ),
    ).toBeInTheDocument()
  })

  it('stops re-sending as soon as a trusted context arrives', () => {
    vi.useFakeTimers()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(parentPost).toHaveBeenCalledTimes(3)
    send(goodContext())
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(parentPost).toHaveBeenCalledTimes(3)
  })

  it('renders data from a late context that arrives after the retry window', async () => {
    vi.useFakeTimers()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    fetchMock.mockResolvedValue(json(200, response()))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(screen.getByText(/Chatwoot didn't send the conversation/)).toBeInTheDocument()
    send(goodContext(42))
    vi.useRealTimers()
    expect(await screen.findByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument()
    expect(screen.queryByText(/Chatwoot didn't send the conversation/)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignores a context from the wrong origin or the wrong source', () => {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext(), { origin: 'https://chat.example.test.evil.example' })
    send(goodContext(), { origin: 'https://chat.example.test:8443' })
    send(goodContext(), { origin: 'http://chat.example.test' })
    send(goodContext(), { source: window })
    send(goodContext(), { source: null })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it.each([
    ['zero id', { conversation: { id: 0 } }],
    ['negative id', { conversation: { id: -3 } }],
    ['fractional id', { conversation: { id: 2.5 } }],
    ['string id', { conversation: { id: '42' } }],
    ['missing conversation', { theme: 'dark' }],
  ])('ignores a trusted context with a %s', (_name, data) => {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(data)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores non-JSON, non-string and non-appContext messages', () => {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send('{not json')
    send('chatwoot-dashboard-app:fetch-info')
    send(JSON.stringify({ event: 'other', data: goodContext() }))
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { event: 'appContext', data: goodContext() }, origin: ORIGIN, source: parentWin }),
      )
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applies the theme from the context to the html element', () => {
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(document.documentElement.dataset.theme).toBeUndefined()
    send(goodContext(42, 'dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    send(goodContext(42, 'weird'))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('renders the header shell and three skeleton cards while waiting', () => {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    const { container } = render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument()
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3)
  })

  it('removes its message listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<PanelClient chatwootOrigin={ORIGIN} />)
    unmount()
    expect(remove.mock.calls.filter(([type]) => type === 'message')).toHaveLength(1)
    remove.mockRestore()
  })
})

describe('PanelClient: token entry', () => {
  beforeEach(() => installParent())

  it('shows the connect form when no token is stored', () => {
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(screen.getByRole('heading', { name: 'Connect your Chatwoot account' })).toBeInTheDocument()
    expect(
      screen.getByText(
        "Paste your personal access token to see this customer's bookings. Find it in Chatwoot under Profile settings, Access Token. It stays in this browser tab only and is cleared when you close it.",
      ),
    ).toBeInTheDocument()
    const field = screen.getByLabelText('Chatwoot access token')
    expect(field).toHaveAttribute('placeholder', 'Paste token')
    expect(screen.getByRole('button', { name: 'Save token' })).toBeInTheDocument()
  })

  it('stores the token in sessionStorage only and calls the API with the exact request shape', async () => {
    fetchMock.mockResolvedValue(json(200, response()))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext(42))
    fireEvent.change(screen.getByLabelText('Chatwoot access token'), { target: { value: `  ${TOKEN}  ` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }))

    expect(await screen.findAllByRole('article')).toHaveLength(2)
    expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN)
    expect(window.localStorage.length).toBe(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/chatwoot/dashboard-app')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(init.cache).toBe('no-store')
    expect(init.headers['api-access-token']).toBe(TOKEN)
    expect(init.body).toBe(JSON.stringify({ conversationId: 42 }))
    // D-03: nothing from the Chatwoot message except the conversation id reaches the API.
    expect(String(init.body)).not.toMatch(/secret@example|\+420|contact|email|phone|agent|customAttributes/i)
    expect(JSON.stringify(init.headers)).not.toMatch(/secret@example|\+420/)
  })

  it('does not submit an empty token', () => {
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }))
    expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses a stored token without asking again', async () => {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    fetchMock.mockResolvedValue(json(200, response()))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(screen.queryByText('Connect your Chatwoot account')).not.toBeInTheDocument()
    send(goodContext(7))
    await screen.findAllByRole('article')
    expect(fetchMock.mock.calls[0][1].headers['api-access-token']).toBe(TOKEN)
    expect(fetchMock.mock.calls[0][1].body).toBe('{"conversationId":7}')
  })
})

describe('PanelClient: ready and errors', () => {
  beforeEach(() => {
    installParent()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
  })

  it('lists one article per booking with Prague date/time, route, reference and status label', async () => {
    fetchMock.mockResolvedValue(json(200, response()))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    const articles = await screen.findAllByRole('article')
    expect(articles).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument()

    const [upcoming, past] = articles
    expect(upcoming).toHaveTextContent('Thu 12 Nov 2026, 14:30')
    expect(upcoming).toHaveTextContent('Vaclav Havel Airport Prague')
    expect(upcoming).toHaveTextContent('to Hotel Aria, Tržiště 9')
    expect(upcoming).toHaveTextContent('PRG-UP01')
    expect(upcoming).toHaveTextContent(STATUS_LABELS.confirmed)

    expect(past).toHaveTextContent('Mon 5 Jan 2026, 09:00')
    expect(past).toHaveTextContent('Prague Main Station')
    expect(past).toHaveTextContent('PRG-PAST1')
    expect(past).toHaveTextContent(STATUS_LABELS.completed)
  })

  it('falls back to the wall-clock date and time when pickupMs is null, and to the raw status key', async () => {
    fetchMock.mockResolvedValue(
      json(
        200,
        response({
          upcoming: [booking({ id: 'x', pickupMs: null, pickupUtc: null, status: 'brand_new', reference: 'PRG-X' })],
          past: [],
        }),
      ),
    )
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    const article = (await screen.findAllByRole('article'))[0]
    expect(article).toHaveTextContent('2026-11-12 14:30')
    expect(article).toHaveTextContent('brand_new')
  })

  it('renders booking text as text, never as markup', async () => {
    fetchMock.mockResolvedValue(
      json(
        200,
        response({
          upcoming: [booking({ origin: '<img src=x onerror=alert(1)>', destination: '<b>bold</b>' })],
          past: [],
        }),
      ),
    )
    const { container } = render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    await screen.findAllByRole('article')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('article b')).toBeNull()
    expect(container.querySelector('article')).toHaveTextContent('<img src=x onerror=alert(1)>')
  })

  it('shows the no-contact hint and the empty state', async () => {
    fetchMock.mockResolvedValueOnce(json(200, response({ state: 'no_contact', upcoming: [], past: [] })))
    const first = render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    expect(
      await screen.findByText('Add an email or phone to this contact in Chatwoot to see bookings'),
    ).toBeInTheDocument()
    first.unmount()

    fetchMock.mockResolvedValueOnce(json(200, response({ upcoming: [], past: [] })))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    expect(await screen.findByRole('heading', { name: 'No bookings' })).toBeInTheDocument()
  })

  it('on 401 clears the token, returns to token entry with the copy and focuses the field', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'invalid_token' }))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    expect(
      await screen.findByText(
        'Token not accepted. Copy it again from Profile settings, Access Token in Chatwoot, then paste it here.',
      ),
    ).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Connect your Chatwoot account' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Chatwoot access token')).toHaveFocus())
  })

  it.each([
    [403, 'no_access', "You don't have access to this conversation, so its bookings are hidden."],
    [502, 'unavailable', "Can't reach Chatwoot right now. Try again in a minute."],
    [429, 'rate_limited', 'Too many requests. Wait a moment, then press Refresh.'],
    [503, 'rate_limited', 'Too many requests. Wait a moment, then press Refresh.'],
    [503, 'not_configured', "The panel isn't set up yet. Ask the site owner to check the Chatwoot settings."],
    [500, 'internal', "Couldn't load bookings. Press Refresh to try again."],
    [400, 'bad_request', "Couldn't load bookings. Press Refresh to try again."],
    [418, 'something_new', "Couldn't load bookings. Press Refresh to try again."],
  ])('maps %s %s to its copy in a role=alert region', async (status, error, copy) => {
    fetchMock.mockResolvedValue(json(status as number, { error }))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(copy as string)
    expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN)
  })

  it('shows the generic copy when the request itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext())
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load bookings. Press Refresh to try again.")
  })

  it('Refresh re-requests the same conversation', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { error: 'internal' })).mockResolvedValueOnce(json(200, response()))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext(42))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findAllByRole('article')).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never writes the persistent storage area during any flow', async () => {
    fetchMock.mockResolvedValue(json(200, response()))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send(goodContext(42, 'dark'))
    await screen.findAllByRole('article')
    expect(window.localStorage.length).toBe(0)
    expect(Object.keys(window.localStorage)).toEqual([])
  })
})
