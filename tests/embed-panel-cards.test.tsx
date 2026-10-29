/**
 * Phase 84 plan 84-08 (PANEL-01, D-05..D-09, D-12): booking cards, the copy-payment-link fallback chain,
 * the page structure, empty and hint states, show-more and refresh behaviour of the Chatwoot panel.
 *
 * jsdom has no real parent window: a same-document iframe's contentWindow stands in for the Chatwoot
 * SPA (see tests/embed-panel.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react'
import BookingCard from '@/app/embed/chatwoot-dashboard/BookingCard'
import PanelClient from '@/app/embed/chatwoot-dashboard/PanelClient'
import { TOKEN_STORAGE_KEY } from '@/app/embed/chatwoot-dashboard/panel-handshake'
import type { PanelBooking, PanelResponse } from '@/lib/panel-dto'

const ORIGIN = 'https://chat.example.test'
const TOKEN = 'tok_abcDEF123456'
const LINK = 'https://buy.stripe.com/test_x'
const EUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

function booking(over: Partial<PanelBooking> = {}): PanelBooking {
  return {
    id: 'b1',
    reference: 'PRG-1234',
    status: 'unpaid',
    paymentState: 'awaiting_payment',
    isReturnLeg: false,
    pickupUtc: '2026-11-12T13:30:00.000Z',
    pickupDate: '2026-11-12',
    pickupTime: '14:30',
    pickupMs: Date.parse('2026-11-12T13:30:00.000Z'),
    origin: 'Václav Havel Airport',
    destination: 'Hotel X',
    hours: null,
    vehicleClass: 'business_van',
    passengers: 3,
    luggage: 4,
    amountEur: 180,
    driverName: 'Petr',
    tripProgress: 'en_route',
    flightNumber: 'OK123',
    notes: 'Child seat',
    paymentLinkUrl: LINK,
    adminHref: '/admin/bookings?search=PRG-1234',
    ...over,
  }
}

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  })
}

function setExecCommand(fn: ((command: string) => boolean) | undefined) {
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true, writable: true })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setClipboard(undefined)
  setExecCommand(undefined)
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
})

// ── Task 1: the booking card ────────────────────────────────────────────────────────────────────
describe('BookingCard: D-06 fields in order', () => {
  it('renders every field of a fully populated booking', () => {
    render(<BookingCard booking={booking()} isNext={false} />)
    const card = screen.getByRole('article')

    expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('Thu 12 Nov 2026, 14:30')
    expect(card).toHaveTextContent('Václav Havel Airport')
    expect(card).toHaveTextContent('to Hotel X')
    expect(within(card).getByText('Unpaid')).toBeInTheDocument()
    expect(within(card).getByText('Awaiting payment')).toBeInTheDocument()
    expect(within(card).getByText('PRG-1234')).toBeInTheDocument()
    expect(card).toHaveTextContent(`Business Van · 3 pax · 4 bags · ${EUR.format(180)}`)
    expect(within(card).getByText('Petr')).toBeInTheDocument()
    expect(within(card).getByText('En Route')).toBeInTheDocument()
    expect(within(card).getByText('Flight OK123')).toBeInTheDocument()
    expect(within(card).getByText('Customer notes')).toBeInTheDocument()
    expect(within(card).getByText('Child seat')).toBeInTheDocument()

    const link = within(card).getByRole('link', { name: 'Open in admin' })
    expect(link).toHaveAttribute('href', '/admin/bookings?search=PRG-1234')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(card).getByRole('button', { name: 'Copy payment link' })).toBeInTheDocument()
  })

  it('keeps the UI-SPEC order: date, route, badges, meta, driver, flight, notes, actions', () => {
    render(<BookingCard booking={booking()} isNext={false} />)
    const text = screen.getByRole('article').textContent ?? ''
    const order = [
      'Thu 12 Nov 2026, 14:30',
      'Václav Havel Airport',
      'to Hotel X',
      'Unpaid',
      'PRG-1234',
      'Business Van',
      'Petr',
      'Flight OK123',
      'Customer notes',
      'Open in admin',
      'Copy payment link',
    ].map((s) => text.indexOf(s))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('marks the next trip with the accent class only when isNext', () => {
    const { rerender } = render(<BookingCard booking={booking()} isNext />)
    expect(screen.getByRole('article')).toHaveClass('card-next')
    rerender(<BookingCard booking={booking()} isNext={false} />)
    expect(screen.getByRole('article')).not.toHaveClass('card-next')
  })

  it('omits optional rows entirely when the data is missing (no N/A, no empty labels)', () => {
    render(
      <BookingCard
        booking={booking({
          driverName: null,
          tripProgress: null,
          flightNumber: null,
          notes: null,
          paymentLinkUrl: null,
          amountEur: null,
        })}
        isNext={false}
      />,
    )
    const card = screen.getByRole('article')
    expect(card).not.toHaveTextContent(/N\/A/i)
    expect(card).not.toHaveTextContent('Flight')
    expect(card).not.toHaveTextContent('Customer notes')
    expect(card).not.toHaveTextContent('Show full note')
    expect(within(card).queryByText('Petr')).not.toBeInTheDocument()
    expect(within(card).queryByText('En Route')).not.toBeInTheDocument()
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()
    expect(card).toHaveTextContent('Business Van · 3 pax · 4 bags')
    expect(card.textContent).not.toMatch(/bags ·/)
  })

  it('shows the driver without a progress badge when only the driver is known', () => {
    render(<BookingCard booking={booking({ tripProgress: null })} isNext={false} />)
    expect(screen.getByText('Petr')).toBeInTheDocument()
    expect(screen.queryByText('En Route')).not.toBeInTheDocument()
  })

  it('renders an hourly booking as "{origin} - {n} h" with no destination line', () => {
    render(<BookingCard booking={booking({ hours: 3, destination: null })} isNext={false} />)
    const card = screen.getByRole('article')
    expect(card).toHaveTextContent('Václav Havel Airport - 3 h')
    expect(card).not.toHaveTextContent(/\bto\b/)
  })

  it('renders a Return badge on return legs and none otherwise', () => {
    const { rerender } = render(<BookingCard booking={booking({ isReturnLeg: true })} isNext={false} />)
    expect(within(screen.getByRole('heading', { level: 3 })).getByText('Return')).toBeInTheDocument()
    rerender(<BookingCard booking={booking({ isReturnLeg: false })} isNext={false} />)
    expect(screen.queryByText('Return')).not.toBeInTheDocument()
  })

  it('falls back to the wall-clock date and time when pickupMs is null', () => {
    render(
      <BookingCard booking={booking({ pickupMs: null, pickupUtc: null, pickupDate: '2026-11-12', pickupTime: '14:30' })} isNext={false} />,
    )
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('2026-11-12 14:30')
  })

  it('renders an unknown status as raw text in the neutral badge', () => {
    render(<BookingCard booking={booking({ status: 'weird' })} isNext={false} />)
    const badge = screen.getByText('weird')
    expect(badge).toHaveClass('badge', 'badge-neutral')
  })

  it('does not treat object-prototype keys as known statuses', () => {
    render(<BookingCard booking={booking({ status: 'constructor', vehicleClass: 'toString', tripProgress: 'valueOf' })} isNext={false} />)
    const card = screen.getByRole('article')
    expect(screen.getByText('constructor')).toHaveClass('badge-neutral')
    expect(card).toHaveTextContent('toString')
    expect(screen.getByText('valueOf')).toHaveClass('badge-neutral')
  })

  it('gives each known status its own hue class and maps trip progress onto the shared hues', () => {
    const { rerender } = render(<BookingCard booking={booking({ status: 'on_location' })} isNext={false} />)
    expect(screen.getByText('On Location')).toHaveClass('badge-on_location')
    for (const [progress, label, cls] of [
      ['en_route', 'En Route', 'badge-en_route'],
      ['arrived', 'Arrived', 'badge-on_location'],
      ['on_board', 'On Board', 'badge-assigned'],
      ['completed', 'Completed', 'badge-completed'],
      ['no_show', 'No-Show', 'badge-cancelled'],
    ] as const) {
      rerender(<BookingCard booking={booking({ status: 'assigned', tripProgress: progress })} isNext={false} />)
      expect(screen.getByText(label), progress).toHaveClass(cls)
    }
  })

  it('shows no payment badge for a cancelled booking and Paid / Quote for the other states', () => {
    const { rerender } = render(
      <BookingCard booking={booking({ status: 'cancelled', paymentState: 'cancelled', paymentLinkUrl: null })} isNext={false} />,
    )
    const card = screen.getByRole('article')
    expect(within(card).getByText('Cancelled')).toBeInTheDocument()
    expect(card).not.toHaveTextContent(/Paid|Awaiting payment|Quote/)

    rerender(<BookingCard booking={booking({ status: 'confirmed', paymentState: 'paid', paymentLinkUrl: null })} isNext={false} />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
    rerender(<BookingCard booking={booking({ status: 'pending', paymentState: 'quote', paymentLinkUrl: null })} isNext={false} />)
    expect(screen.getByText('Quote')).toBeInTheDocument()
  })

  it('clamps long notes to three lines with a toggle that removes the clamp', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 120 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 60 })
    render(<BookingCard booking={booking({ notes: 'Line one\nLine two\nLine three\nLine four' })} isNext={false} />)
    const notes = screen.getByText(/Line one/)
    expect(notes).toHaveClass('notes-clamped')
    fireEvent.click(screen.getByRole('button', { name: 'Show full note' }))
    expect(screen.getByText(/Line one/)).not.toHaveClass('notes-clamped')
  })

  it('shows no toggle when the notes fit', () => {
    render(<BookingCard booking={booking({ notes: 'Child seat' })} isNext={false} />)
    expect(screen.queryByRole('button', { name: 'Show full note' })).not.toBeInTheDocument()
  })

  it('renders notes, addresses and names as plain text, never markup', () => {
    const { container } = render(
      <BookingCard
        booking={booking({
          origin: '<img src=x onerror=alert(1)>',
          notes: '<script>alert(1)</script><b>bold</b>',
          driverName: '<i>Petr</i>',
        })}
        isNext={false}
      />,
    )
    expect(container.querySelector('img, script, b, i')).toBeNull()
    expect(container).toHaveTextContent('<script>alert(1)</script><b>bold</b>')
  })

  it('does not render an admin link that does not point into /admin/', () => {
    render(<BookingCard booking={booking({ adminHref: 'javascript:alert(1)' })} isNext={false} />)
    expect(screen.queryByRole('link', { name: 'Open in admin' })).not.toBeInTheDocument()
  })

  it('formats the amount through Intl and types no currency symbol in the component sources', () => {
    for (const file of ['BookingCard.tsx', 'CopyLinkButton.tsx', 'PanelClient.tsx']) {
      const source = readFileSync(path.resolve(__dirname, '../app/embed/chatwoot-dashboard', file), 'utf-8')
      expect(source, file).not.toContain('€')
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML/)
    }
    const card = readFileSync(path.resolve(__dirname, '../app/embed/chatwoot-dashboard/BookingCard.tsx'), 'utf-8')
    expect(card).toContain("currency: 'EUR'")
    expect(card).toContain("'en-IE'")
  })
})

describe('Copy payment link (D-09)', () => {
  const click = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy payment link' }))
    })
  }

  it('tier 1: writes with the clipboard API, shows Copied, announces, and reverts after 2 s', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    const exec = vi.fn(() => true)
    setExecCommand(exec)
    const { container } = render(<BookingCard booking={booking()} isNext={false} />)

    await click()
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(exec).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Payment link copied')

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('button', { name: 'Copy payment link' })).toBeInTheDocument()
    expect(container.querySelector('[aria-live="polite"]')).not.toHaveTextContent('Payment link copied')
  })

  it('tier 2: falls back to execCommand on a selected hidden textarea, then removes it', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('blocked')))
    let seen: { value: string; selected: boolean } | null = null
    setExecCommand((command) => {
      expect(command).toBe('copy')
      const area = document.querySelector('textarea')
      seen = area
        ? { value: area.value, selected: area.selectionStart === 0 && area.selectionEnd === area.value.length }
        : null
      return true
    })
    render(<BookingCard booking={booking()} isNext={false} />)

    await click()
    expect(seen).toEqual({ value: LINK, selected: true })
    expect(document.querySelector('textarea')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('tier 2 is also used when the clipboard API is missing entirely', async () => {
    setClipboard(undefined)
    const exec = vi.fn(() => true)
    setExecCommand(exec)
    render(<BookingCard booking={booking()} isNext={false} />)
    await click()
    expect(exec).toHaveBeenCalledWith('copy')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('tier 3: reveals a read-only auto-selected input with the link and the manual-copy hint', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('blocked')))
    setExecCommand(() => false)
    render(<BookingCard booking={booking()} isNext={false} />)

    await click()
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe(LINK)
    expect(input).toHaveAttribute('readonly')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(LINK.length)
    expect(screen.getByText('Press Ctrl/Cmd+C to copy')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument()
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('tier 3 when execCommand throws', async () => {
    setClipboard(undefined)
    setExecCommand(() => {
      throw new Error('denied')
    })
    render(<BookingCard booking={booking()} isNext={false} />)
    await click()
    expect(screen.getByText('Press Ctrl/Cmd+C to copy')).toBeInTheDocument()
  })

  it('never opens or follows the link', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    setClipboard(vi.fn().mockResolvedValue(undefined))
    const { container } = render(<BookingCard booking={booking()} isNext={false} />)
    await click()
    expect(open).not.toHaveBeenCalled()
    expect(container.querySelector(`a[href="${LINK}"]`)).toBeNull()
  })

  it('renders no button and no URL text when there is no payment link', () => {
    const { container } = render(<BookingCard booking={booking({ paymentLinkUrl: null })} isNext={false} />)
    expect(screen.queryByRole('button', { name: /copy payment link/i })).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent('stripe')
  })

  it.each([
    'http://buy.stripe.com/test_x',
    'https://evil.example/test_x',
    'https://buy.stripe.com.evil.example/test_x',
    'https://user:pw@buy.stripe.com/test_x',
    'https://buy.stripe.com:8443/test_x',
    'javascript:alert(1)',
  ])('renders no button and no URL text for the unsafe link %s', (url) => {
    const { container } = render(<BookingCard booking={booking({ paymentLinkUrl: url })} isNext={false} />)
    expect(screen.queryByRole('button', { name: /copy payment link/i })).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent('evil')
    expect(container).not.toHaveTextContent('stripe')
    expect(container.querySelector('input, textarea')).toBeNull()
  })

  it('renders no button when the payment state is not awaiting_payment', () => {
    render(<BookingCard booking={booking({ paymentState: 'paid', status: 'confirmed' })} isNext={false} />)
    expect(screen.queryByRole('button', { name: /copy payment link/i })).not.toBeInTheDocument()
  })

  it('uses the panel live region instead of its own when an announcer is passed', async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined))
    const announce = vi.fn()
    const { container } = render(<BookingCard booking={booking()} isNext={false} onAnnounce={announce} />)
    await click()
    expect(announce).toHaveBeenCalledWith('Payment link copied')
    expect(container.querySelector('[aria-live]')).toBeNull()
  })
})

// ── shared panel harness ────────────────────────────────────────────────────────────────────────
function panelResponse(over: Partial<PanelResponse> = {}): PanelResponse {
  return {
    state: 'ok',
    contact: { email: 'guest@example.test', phone: null, verified: true, phoneMismatch: false },
    counters: { trips: 2, totalSpentEur: 1234.5 },
    upcoming: [booking({ id: 'u1', reference: 'PRG-UP01' })],
    past: [
      booking({
        id: 'p1',
        reference: 'PRG-PAST1',
        status: 'completed',
        paymentState: 'paid',
        paymentLinkUrl: null,
        pickupUtc: '2026-01-05T08:00:00.000Z',
        pickupMs: Date.parse('2026-01-05T08:00:00.000Z'),
        pickupDate: '2026-01-05',
        pickupTime: '09:00',
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
let iframe: HTMLIFrameElement
let fetchMock: ReturnType<typeof vi.fn>

function installParent() {
  iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  parentWin = iframe.contentWindow as Window
  Object.defineProperty(parentWin, 'postMessage', { value: vi.fn(), configurable: true })
  Object.defineProperty(window, 'parent', { value: parentWin, configurable: true })
}

function send(theme = 'light', id = 42) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'appContext', data: { conversation: { id }, theme } }),
        origin: ORIGIN,
        source: parentWin,
      }),
    )
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  if (realParent) Object.defineProperty(window, 'parent', realParent)
  iframe?.remove()
})

describe('tracer: API booking -> BookingCard -> Copy payment link -> clipboard -> Copied', () => {
  it('shows every D-06 detail from the API and copies the link into the clipboard', async () => {
    installParent()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    fetchMock.mockResolvedValue(json(200, panelResponse({ past: [] })))

    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send()
    const card = await screen.findByRole('article')
    expect(card).toHaveTextContent('Thu 12 Nov 2026, 14:30')
    expect(card).toHaveTextContent('Awaiting payment')
    expect(card).toHaveTextContent(`Business Van · 3 pax · 4 bags · ${EUR.format(180)}`)
    expect(card).toHaveTextContent('Flight OK123')
    expect(card).toHaveTextContent('Child seat')
    expect(within(card).getByRole('link', { name: 'Open in admin' })).toHaveAttribute('rel', 'noopener noreferrer')

    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Copy payment link' }))
    })
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(within(card).getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Payment link copied')
  })
})

// ── Task 2: page structure, states, show-more, refresh, footer ─────────────────────────────────
function manyBookings(prefix: string, count: number, over: Partial<PanelBooking> = {}): PanelBooking[] {
  return Array.from({ length: count }, (_, i) =>
    booking({
      id: `${prefix}${i}`,
      reference: `PRG-${prefix.toUpperCase()}${i}`,
      status: 'completed',
      paymentState: 'paid',
      paymentLinkUrl: null,
      driverName: null,
      tripProgress: null,
      flightNumber: null,
      notes: null,
      ...over,
    }),
  )
}

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

async function mountReady(res: PanelResponse = panelResponse()) {
  installParent()
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
  fetchMock.mockResolvedValue(json(200, res))
  const view = render(<PanelClient chatwootOrigin={ORIGIN} />)
  send()
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  await settle()
  return view
}

function deferred() {
  let resolve!: (r: Response) => void
  const promise = new Promise<Response>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('PanelClient: page structure (D-05)', () => {
  it('renders the counters as a dl with Trips and the Intl-formatted total spent', async () => {
    const { container } = await mountReady()
    const dl = container.querySelector('dl') as HTMLElement
    expect(dl).not.toBeNull()
    expect(within(dl).getByText('Trips').tagName).toBe('DT')
    expect(within(dl).getByText('Total spent').tagName).toBe('DT')
    const values = [...dl.querySelectorAll('dd')].map((d) => d.textContent)
    expect(values).toEqual(['2', EUR.format(1234.5)])
    expect(dl.querySelector('dd')).toHaveClass('counter-value')
  })

  it('lists all upcoming bookings in order and marks only the first card as the next trip', async () => {
    const upcoming = manyBookings('u', 3, { status: 'confirmed' })
    await mountReady(panelResponse({ upcoming, past: [] }))
    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming · 3' })).toBeInTheDocument()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.classList.contains('card-next'))).toEqual([true, false, false])
    expect(cards[0]).toHaveTextContent('PRG-U0')
    expect(cards[2]).toHaveTextContent('PRG-U2')
  })

  it('shows 10 past cards and expands in place with Show {n} more, without another request', async () => {
    await mountReady(panelResponse({ upcoming: [], past: manyBookings('p', 25) }))
    expect(screen.getByRole('heading', { level: 2, name: 'Past · 25' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Show 15 more' }))
    expect(screen.getAllByRole('article')).toHaveLength(25)
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows no Show more button for 10 or fewer past bookings', async () => {
    await mountReady(panelResponse({ upcoming: [], past: manyBookings('p', 10) }))
    expect(screen.getAllByRole('article')).toHaveLength(10)
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).not.toBeInTheDocument()
  })

  it('adds Open all bookings in admin only when the server cap was reached', async () => {
    await mountReady(panelResponse({ pastTruncated: true, past: manyBookings('p', 12) }))
    const link = screen.getByRole('link', { name: 'Open all bookings in admin' })
    expect(link).toHaveAttribute('href', '/admin/bookings')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    cleanup()
    iframe.remove()
    fetchMock.mockReset()
    await mountReady(panelResponse({ pastTruncated: false }))
    expect(screen.queryByRole('link', { name: 'Open all bookings in admin' })).not.toBeInTheDocument()
  })

  it('keeps the Upcoming heading with a line when there are no upcoming trips, and the reverse', async () => {
    await mountReady(panelResponse({ upcoming: [] }))
    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming · 0' })).toBeInTheDocument()
    expect(screen.getByText('No upcoming trips')).toBeInTheDocument()
    expect(screen.queryByText('No past trips')).not.toBeInTheDocument()
    cleanup()
    iframe.remove()
    fetchMock.mockReset()
    await mountReady(panelResponse({ past: [] }))
    expect(screen.getByRole('heading', { level: 2, name: 'Past · 0' })).toBeInTheDocument()
    expect(screen.getByText('No past trips')).toBeInTheDocument()
    expect(screen.queryByText('No upcoming trips')).not.toBeInTheDocument()
  })
})

describe('PanelClient: empty, no-contact and hint states', () => {
  it('empty state: No bookings with the searched email and links only', async () => {
    await mountReady(panelResponse({ upcoming: [], past: [] }))
    expect(screen.getByRole('heading', { level: 2, name: 'No bookings' })).toBeInTheDocument()
    expect(screen.getByText('No bookings found for guest@example.test.')).toBeInTheDocument()
    const create = screen.getByRole('link', { name: 'Create booking in admin' })
    expect(create).toHaveAttribute('href', '/admin')
    expect(create).toHaveAttribute('target', '_blank')
    expect(screen.queryByRole('link', { name: 'Open Lead in EspoCRM' })).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByText('Trips')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Refresh', 'Forget token'])
  })

  it('empty state: uses the phone when there is no email and adds the Lead link only when present', async () => {
    const lead = 'https://crm.example.test/#Lead/view/0123456789abcdef0'
    await mountReady(
      panelResponse({
        upcoming: [],
        past: [],
        contact: { email: null, phone: '+420111222333', verified: false, phoneMismatch: false },
        leadUrl: lead,
      }),
    )
    expect(screen.getByText('No bookings found for +420111222333.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open Lead in EspoCRM' })
    expect(link).toHaveAttribute('href', lead)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('never renders a Lead link that is not https', async () => {
    await mountReady(panelResponse({ upcoming: [], past: [], leadUrl: 'javascript:alert(1)' }))
    expect(screen.queryByRole('link', { name: 'Open Lead in EspoCRM' })).not.toBeInTheDocument()
  })

  it('no_contact shows only the hint, and the next refresh shows bookings without a reload', async () => {
    installParent()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    const noContact = panelResponse({
      state: 'no_contact',
      upcoming: [],
      past: [],
      contact: { email: null, phone: null, verified: false, phoneMismatch: false },
    })
    fetchMock.mockResolvedValueOnce(json(200, noContact)).mockResolvedValueOnce(json(200, panelResponse()))
    const { container } = render(<PanelClient chatwootOrigin={ORIGIN} />)
    send()
    expect(await screen.findByText('Add an email or phone to this contact in Chatwoot to see bookings')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(container.querySelector('dl')).toBeNull()
    expect(screen.queryByText(/Unverified|Verified/)).not.toBeInTheDocument()
    expect(container.querySelector('input, textarea')).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }))
    expect(await screen.findAllByRole('article')).toHaveLength(2)
    expect(screen.queryByText('Add an email or phone to this contact in Chatwoot to see bookings')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows the contact line and the verified hint above the counters', async () => {
    const { container } = await mountReady()
    expect(screen.getByText('guest@example.test')).toBeInTheDocument()
    const verified = screen.getByText('Verified customer (signed in)')
    expect(screen.queryByText(/Unverified/)).not.toBeInTheDocument()
    const dl = container.querySelector('dl') as HTMLElement
    expect(verified.compareDocumentPosition(dl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the unverified hint in primary text with the unpaid-hue dot, above the counters, never red', async () => {
    const { container } = await mountReady(
      panelResponse({ contact: { email: 'guest@example.test', phone: null, verified: false, phoneMismatch: false } }),
    )
    const hint = screen.getByText('Unverified email - confirm identity before sharing booking details')
    expect(hint).toHaveClass('hint')
    expect(hint.querySelector('.hint-dot')).not.toBeNull()
    expect(hint).not.toHaveClass('error-text')
    expect(screen.queryByText('Verified customer (signed in)')).not.toBeInTheDocument()
    const dl = container.querySelector('dl') as HTMLElement
    expect(hint.compareDocumentPosition(dl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the muted phone-mismatch line without any data about the other customer', async () => {
    await mountReady(
      panelResponse({ contact: { email: 'guest@example.test', phone: '+420999888777', verified: true, phoneMismatch: true } }),
    )
    const line = screen.getByText('Phone matches a different customer')
    expect(line).toHaveClass('meta')
    expect(document.body).not.toHaveTextContent('+420999888777')
  })

  it('no_access shows only its copy: no cards, no counters, no contact data', async () => {
    installParent()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    fetchMock.mockResolvedValueOnce(json(200, panelResponse())).mockResolvedValueOnce(json(403, { error: 'no_access' }))
    const { container } = render(<PanelClient chatwootOrigin={ORIGIN} />)
    send()
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to this conversation, so its bookings are hidden.",
    )
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(container.querySelector('dl')).toBeNull()
    expect(screen.queryByText('guest@example.test')).not.toBeInTheDocument()
  })
})

describe('PanelClient: refresh behaviour', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  }
  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState
  })

  it('refreshes once on window focus', async () => {
    await mountReady()
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes once when the tab becomes visible, and not when it becomes hidden', async () => {
    await mountReady()
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('refreshes every 30 s while visible and never while hidden', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    installParent()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    fetchMock.mockResolvedValue(json(200, panelResponse()))
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(29_000)
    })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    setVisibility('hidden')
    act(() => {
      vi.advanceTimersByTime(90_000)
    })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not start another request while one is in flight', async () => {
    const first = deferred()
    installParent()
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    fetchMock.mockReturnValue(first.promise)
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    send()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      first.resolve(json(200, panelResponse()))
      await new Promise((r) => setTimeout(r, 10))
    })
  })

  it('keeps the cards on screen during a background refresh and shows Refreshing... on a disabled button', async () => {
    const { container } = await mountReady()
    const pending = deferred()
    fetchMock.mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    const busy = await screen.findByRole('button', { name: 'Refreshing...' })
    expect(busy).toBeDisabled()
    expect(container.querySelectorAll('.skeleton')).toHaveLength(0)
    expect(screen.getAllByRole('article')).toHaveLength(2)

    await act(async () => {
      pending.resolve(json(200, panelResponse({ upcoming: manyBookings('n', 1, { status: 'confirmed' }), past: [] })))
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('PRG-N0')
  })

  it('keeps the loaded cards below the error line when a background refresh fails', async () => {
    await mountReady()
    fetchMock.mockResolvedValueOnce(json(502, { error: 'unavailable' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Can't reach Chatwoot right now. Try again in a minute.")
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(alert.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('a 401 on a background refresh clears the token and returns to token entry', async () => {
    await mountReady()
    fetchMock.mockResolvedValueOnce(json(401, { error: 'invalid_token' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('heading', { name: 'Connect your Chatwoot account' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})

describe('PanelClient: footer, accessibility and read-only guarantees', () => {
  it('shows Updated in Prague time and forgets the token without a confirmation', async () => {
    await mountReady()
    // generatedAt 2026-10-29T10:00Z is 11:00 in Prague (CET).
    expect(screen.getByText('Updated 11:00')).toBeInTheDocument()
    const confirm = vi.fn()
    vi.stubGlobal('confirm', confirm)
    fireEvent.click(screen.getByRole('button', { name: 'Forget token' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Connect your Chatwoot account' })).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Forget token' })).not.toBeInTheDocument()
  })

  it('does not offer Forget token while no token is stored', () => {
    installParent()
    render(<PanelClient chatwootOrigin={ORIGIN} />)
    expect(screen.queryByRole('button', { name: 'Forget token' })).not.toBeInTheDocument()
  })

  it('has one h1, h2 sections, an article with an h3 per card and one polite live region', async () => {
    const { container } = await mountReady(
      panelResponse({ upcoming: manyBookings('u', 2, { status: 'confirmed' }), past: manyBookings('p', 3) }),
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Upcoming · 2', 'Past · 3'])
    const articles = screen.getAllByRole('article')
    expect(articles).toHaveLength(5)
    for (const a of articles) expect(within(a).getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(container.querySelectorAll('ul.cards')).toHaveLength(2)
  })

  it('has no search box and no text field other than the token field', async () => {
    installParent()
    const { container } = render(<PanelClient chatwootOrigin={ORIGIN} />)
    send()
    // token entry: the only input is the password field
    expect([...container.querySelectorAll('input')].map((i) => i.type)).toEqual(['password'])
    cleanup()

    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, TOKEN)
    fetchMock.mockResolvedValue(json(200, panelResponse()))
    const ready = render(<PanelClient chatwootOrigin={ORIGIN} />)
    send()
    await screen.findAllByRole('article')
    expect(
      ready.container.querySelectorAll('input, textarea, [type="search"], [role="searchbox"], [role="search"]'),
    ).toHaveLength(0)
  })

  it('adds no control that writes: only the listed buttons and plain links exist', async () => {
    await mountReady(panelResponse({ upcoming: [], past: manyBookings('p', 11) }))
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(['Refresh', 'Show 1 more', 'Forget token'])
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('source has no search field and no extra transport', () => {
    for (const file of ['BookingCard.tsx', 'CopyLinkButton.tsx', 'PanelClient.tsx']) {
      const source = readFileSync(path.resolve(__dirname, '../app/embed/chatwoot-dashboard', file), 'utf-8')
      expect(source, file).not.toMatch(/type="search"|type='search'/)
      expect(source, file).not.toMatch(/localStorage|sendBeacon|XMLHttpRequest|WebSocket/)
    }
  })
})
