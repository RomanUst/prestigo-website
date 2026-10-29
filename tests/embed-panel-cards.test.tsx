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
