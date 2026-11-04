import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, waitFor, fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import enMessages from '@/messages/en.json'
import arMessagesRaw from '@/messages/ar.json'
import { formatLocaleDate } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import { consentMessageKey, consentVars } from '@/lib/payments/consent-text'

const arMessages = arMessagesRaw as unknown as AbstractIntlMessages
const en = enMessages as unknown as { Booking: { step6: { cardOnFile: Record<string, string> } } }
const cof = en.Booking.step6.cardOnFile

// ---------------------------------------------------------------------------
// Hoisted stubs for the vi.mock factories
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  elementsOptionsCapture: [] as Array<Record<string, unknown> | null>,
  elementsKeys: [] as string[],
  submitMock: vi.fn(),
  confirmSetupMock: vi.fn(),
  readyControl: { auto: true },
  loadError: { value: null as unknown },
  snapshotMock: vi.fn(),
}))

vi.mock('@stripe/react-stripe-js', async () => {
  const React = await import('react')
  return {
    Elements: ({ children, options }: { children: ReactNode; options: Record<string, unknown> | null }) => {
      h.elementsOptionsCapture.push(options)
      return children
    },
    PaymentElement: (props: { onReady?: () => void; onLoadError?: (e: unknown) => void }) => {
      React.useEffect(() => {
        if (h.loadError.value) props.onLoadError?.(h.loadError.value)
        else if (h.readyControl.auto) props.onReady?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return React.createElement('div', { 'data-testid': 'payment-element' })
    },
    useStripe: () => ({ confirmSetup: h.confirmSetupMock }),
    useElements: () => ({ submit: h.submitMock }),
  }
})

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/analytics-snapshot', () => ({
  writePurchaseSnapshot: (...a: unknown[]) => h.snapshotMock(...a),
}))

// Legacy step: replaced by a marker so the gate decision is observable and Step6Payment.tsx stays untouched.
vi.mock('@/components/booking/steps/Step6Payment', () => ({
  default: () => <div data-testid="legacy-payment">legacy payment</div>,
}))

const { storeRef } = vi.hoisted(() => ({
  storeRef: {
    current: {
      vehicleClass: 'business' as string | null,
      priceBreakdown: { business: { base: 100, extras: 0, total: 100, currency: 'EUR' } } as Record<string, { base: number; extras: number; total: number; currency: string }> | null,
      extras: { infantSeat: false, childSeat: false, boosterSeat: false, meetAndGreet: false, extraLuggage: false },
      tripType: 'transfer' as string | null,
      origin: { address: 'Prague Airport', lat: 50.1, lng: 14.26, placeId: 'origin-place' },
      destination: { address: 'Hotel Alcron', lat: 50.08, lng: 14.43, placeId: 'dest-place' },
      hours: 2,
      passengers: 2,
      luggage: 1,
      pickupDate: '2026-12-01',
      pickupTime: '10:00',
      returnDate: null as string | null,
      returnTime: null as string | null,
      roundTripPriceBreakdown: null,
      distanceKm: 10,
      passengerDetails: {
        firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '+420123456789',
        flightNumber: '', terminal: '', specialRequests: '',
      },
      promoCode: null as string | null,
      promoDiscount: 0,
      setPromoCode: vi.fn(),
      setPromoDiscount: vi.fn(),
      attemptId: 'a1b2c3d4-0000-4000-8000-000000000001' as string | null,
      setAttemptId: vi.fn(),
      goToStep: vi.fn(),
    },
  },
}))

vi.mock('@/lib/booking-store', () => {
  const useBookingStore = (selector: (s: typeof storeRef.current) => unknown) => selector(storeRef.current)
  useBookingStore.getState = () => storeRef.current
  return { useBookingStore }
})

import Step6Checkout from '@/components/booking/steps/Step6Checkout'
import { SUPPORTED_MODES } from '@/components/booking/steps/Step6CardOnFile'

// ---------------------------------------------------------------------------
// fetch router
// ---------------------------------------------------------------------------

type Reply = { status?: number; body?: unknown } | Error
let initReplies: Reply[] = []
let intentReplies: Reply[] = []
let fetchCalls: Array<{ url: string; body: Record<string, unknown> | null }> = []

function respond(r: Reply) {
  if (r instanceof Error) return Promise.reject(r)
  const status = r.status ?? 200
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(r.body ?? {}) } as Response)
}

function eligibleInit(over: Record<string, unknown> = {}) {
  return {
    eligible: true,
    mode: 'setup',
    holdAtIso: '2026-11-12T06:00:00.000Z',
    holdDateIso: '2026-11-12',
    amountMinor: 12000,
    currency: 'eur',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.elementsOptionsCapture.length = 0
  h.readyControl.auto = true
  h.loadError.value = null
  h.submitMock.mockResolvedValue({})
  h.confirmSetupMock.mockResolvedValue({ setupIntent: { status: 'succeeded' } })
  storeRef.current.promoCode = null
  storeRef.current.promoDiscount = 0
  storeRef.current.attemptId = 'a1b2c3d4-0000-4000-8000-000000000001'
  window.sessionStorage.clear()
  initReplies = [{ body: eligibleInit() }]
  intentReplies = [{ body: { clientSecret: 'seti_1_secret_x', mode: 'setup', bookingReference: 'PRG-20261112-ABC123', amountMinor: 12000, currency: 'eur' } }]
  fetchCalls = []
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    fetchCalls.push({ url, body })
    if (url === '/api/card-checkout/init') {
      const r = initReplies.length > 1 ? initReplies.shift()! : initReplies[0]
      return respond(r)
    }
    if (url === '/api/card-checkout/intent') {
      const r = intentReplies.length > 1 ? intentReplies.shift()! : intentReplies[0]
      return respond(r)
    }
    return respond({ body: {} })
  }) as unknown as typeof fetch
  // jsdom cannot navigate; capture assignments to location.href
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { origin: 'http://localhost', href: 'http://localhost/en/book', assign: vi.fn() },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function renderGate(opts: Parameters<typeof render>[1] = {}) {
  const view = render(<Step6Checkout />, opts)
  return view
}

async function ready() {
  const box = await screen.findByRole('checkbox')
  // flush the Element's onReady effect
  await act(async () => {})
  return box
}

function submitButton() {
  return screen.getByRole('button', { name: cof.ctaSetup })
}

// ---------------------------------------------------------------------------
// Gate (D-09, UI E1)
// ---------------------------------------------------------------------------

describe('Step6Checkout gate (D-09, UI E1)', () => {
  it('shows the loading line while init is in flight, then the card step', async () => {
    let release: (v: Response) => void = () => {}
    global.fetch = vi.fn(() => new Promise<Response>((res) => { release = res })) as unknown as typeof fetch
    await renderGate()
    expect(screen.getByText('Loading payment...')).toBeInTheDocument()
    expect(screen.queryByTestId('legacy-payment')).toBeNull()
    await act(async () => {
      release({ ok: true, status: 200, json: () => Promise.resolve(eligibleInit()) } as Response)
    })
    expect(await screen.findByText(cof.headlineSetup)).toBeInTheDocument()
  })

  it('init { eligible:false } renders legacy Step6Payment with no card copy', async () => {
    initReplies = [{ body: { eligible: false } }]
    const { container } = await renderGate()
    expect(await screen.findByTestId('legacy-payment')).toBeInTheDocument()
    expect(container.textContent).not.toContain(cof.headlineSetup)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('init network failure renders legacy Step6Payment, no error text', async () => {
    initReplies = [new Error('offline')]
    const { container } = await renderGate()
    expect(await screen.findByTestId('legacy-payment')).toBeInTheDocument()
    expect(container.textContent).toBe('legacy payment')
  })

  it.each([500, 429])('init HTTP %i renders legacy Step6Payment', async (status) => {
    initReplies = [{ status, body: { error: 'x' } }]
    await renderGate()
    expect(await screen.findByTestId('legacy-payment')).toBeInTheDocument()
  })

  it('calls init exactly once on mount with the booking body and eur', async () => {
    await renderGate()
    await ready()
    const inits = fetchCalls.filter((c) => c.url === '/api/card-checkout/init')
    expect(inits).toHaveLength(1)
    const body = inits[0].body as { currency: string; bookingData: Record<string, string> }
    expect(body.currency).toBe('eur')
    expect(body.bookingData.attemptId).toBe(storeRef.current.attemptId)
    expect(body.bookingData.email).toBe('john@example.com')
    expect(body.bookingData.pickupDate).toBe('2026-12-01')
  })

  it('init in an unsupported mode (hold_now) renders legacy Step6Payment', async () => {
    expect(SUPPORTED_MODES).toEqual(['setup'])
    initReplies = [{ body: eligibleInit({ mode: 'hold_now', holdAtIso: null, holdDateIso: null }) }]
    await renderGate()
    expect(await screen.findByTestId('legacy-payment')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('generates an attemptId when the store has none', async () => {
    storeRef.current.attemptId = null
    await renderGate()
    await ready()
    expect(storeRef.current.setAttemptId).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Explainer + Elements (D-12)
// ---------------------------------------------------------------------------

describe('Step6CardOnFile explainer and Elements (D-11, D-12)', () => {
  it('shows the headline, the exact hold date as a caption and the server amount', async () => {
    await renderGate()
    await ready()
    expect(screen.getByText(cof.headlineSetup)).toBeInTheDocument()
    expect(screen.getByText(formatLocaleDate('2026-11-12', 'en'))).toBeInTheDocument()
    expect(screen.getByText(cof.setupHoldDay.replace('{amount}', formatMinor(12000, 'eur')))).toBeInTheDocument()
  })

  it('creates Elements in setup mode, card only, with the legacy appearance', async () => {
    await renderGate()
    await ready()
    const opts = h.elementsOptionsCapture[h.elementsOptionsCapture.length - 1]
    expect(opts).toMatchObject({ mode: 'setup', currency: 'eur', paymentMethodTypes: ['card'], locale: 'en' })
    expect((opts as { appearance?: { theme?: string } }).appearance?.theme).toBe('night')
    expect(opts).not.toHaveProperty('amount')
  })
})

// ---------------------------------------------------------------------------
// Consent (HOLD-01)
// ---------------------------------------------------------------------------

describe('consent checkbox and submit button (HOLD-01)', () => {
  it('is unticked on mount, never defaultChecked, and the button is disabled', async () => {
    await renderGate()
    const box = (await ready()) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(box.getAttribute('type')).toBe('checkbox')
    expect(submitButton()).toBeDisabled()
  })

  it('stays disabled until ticked and Elements reported ready', async () => {
    h.readyControl.auto = false
    await renderGate()
    const box = await ready()
    fireEvent.click(box)
    // ticked but Elements never became ready -> still disabled, label shows Loading...
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
  })

  it('enables the button once ticked and ready; unticking disables it again', async () => {
    await renderGate()
    const box = await ready()
    fireEvent.click(box)
    expect(submitButton()).toBeEnabled()
    fireEvent.click(box)
    expect(submitButton()).toBeDisabled()
  })

  it('label text equals the consent string for the same mode, amount and hold date', async () => {
    await renderGate()
    const box = await ready()
    const label = box.closest('label') as HTMLLabelElement
    const expected = cof[consentMessageKey('setup')]
      .replace('{amount}', consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: '2026-11-12', locale: 'en' }).amount)
      .replace('{holdDate}', consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: '2026-11-12', locale: 'en' }).holdDate)
    expect(label.textContent).toBe(expected)
  })

  it('the links line is outside the consent label', async () => {
    await renderGate()
    const box = await ready()
    const label = box.closest('label') as HTMLLabelElement
    const terms = screen.getByRole('link', { name: cof.termsLink })
    expect(terms.getAttribute('target')).toBe('_blank')
    expect(terms.getAttribute('rel')).toContain('noopener')
    expect(label.contains(terms)).toBe(false)
  })

  it('in ar the consent text and caption show the hold date with Latin digits', async () => {
    await renderGate({ locale: 'ar', messages: arMessages })
    const box = await ready()
    const label = box.closest('label') as HTMLLabelElement
    const date = formatLocaleDate('2026-11-12', 'ar')
    expect(date).toMatch(/12/)
    expect(date).not.toMatch(/[٠-٩]/)
    expect(label.textContent).toContain(date)
  })

  it('a fresh mount starts unticked even after a previous mount was ticked', async () => {
    const first = await renderGate()
    fireEvent.click(await ready())
    first.unmount()
    await renderGate()
    expect(((await ready()) as HTMLInputElement).checked).toBe(false)
  })

  it('the checkbox state is never written to storage', async () => {
    await renderGate()
    fireEvent.click(await ready())
    const dump = JSON.stringify({ ...window.sessionStorage }) + JSON.stringify({ ...window.localStorage })
    expect(dump).not.toMatch(/consent/i)
  })
})

// ---------------------------------------------------------------------------
// Submit flow (HOLD-01)
// ---------------------------------------------------------------------------

describe('submit flow: elements.submit -> intent -> confirmSetup -> confirmation', () => {
  it('runs submit, intent (consent true, displayed amount), snapshot, confirmSetup, then navigates', async () => {
    const order: string[] = []
    h.submitMock.mockImplementation(async () => { order.push('submit'); return {} })
    h.snapshotMock.mockImplementation(() => { order.push('snapshot') })
    h.confirmSetupMock.mockImplementation(async () => { order.push('confirm'); return { setupIntent: { status: 'succeeded' } } })

    await renderGate()
    fireEvent.click(await ready())
    await act(async () => { fireEvent.click(submitButton()) })

    await waitFor(() => expect(h.confirmSetupMock).toHaveBeenCalled())
    expect(order).toEqual(['submit', 'snapshot', 'confirm'])

    const intent = fetchCalls.find((c) => c.url === '/api/card-checkout/intent')!
    expect(intent.body).toMatchObject({ consent: true, mode: 'setup', currency: 'eur', displayedAmountMinor: 12000 })
    expect((intent.body as { bookingData: { attemptId: string } }).bookingData.attemptId).toBe(storeRef.current.attemptId)

    const arg = h.confirmSetupMock.mock.calls[0][0]
    expect(arg.clientSecret).toBe('seti_1_secret_x')
    expect(arg.redirect).toBe('if_required')
    expect(arg.confirmParams.return_url).toMatch(/\/book\/confirmation\?ref=PRG-20261112-ABC123$/)

    await waitFor(() => expect(window.location.href).toMatch(/\/book\/confirmation\?ref=PRG-20261112-ABC123$/))
    expect(h.snapshotMock.mock.calls[0][0]).toMatchObject({ ref: 'PRG-20261112-ABC123', currency: 'EUR' })
  })

  it('stops at an elements.submit validation error without calling the server', async () => {
    h.submitMock.mockResolvedValue({ error: { message: 'Your card number is incomplete.' } })
    await renderGate()
    fireEvent.click(await ready())
    await act(async () => { fireEvent.click(submitButton()) })
    expect(fetchCalls.some((c) => c.url === '/api/card-checkout/intent')).toBe(false)
    expect(h.confirmSetupMock).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Your card number is incomplete.')
  })

  it('alreadyConfirmed navigates to the confirmation path without confirmSetup', async () => {
    intentReplies = [{ body: { alreadyConfirmed: true, bookingReference: 'PRG-20261112-ABC123' } }]
    await renderGate()
    fireEvent.click(await ready())
    await act(async () => { fireEvent.click(submitButton()) })
    await waitFor(() => expect(window.location.href).toMatch(/\/book\/confirmation\?ref=PRG-20261112-ABC123$/))
    expect(h.confirmSetupMock).not.toHaveBeenCalled()
  })

  it('does not submit when the box is unticked even on a form submit event', async () => {
    await renderGate()
    const box = await ready()
    await act(async () => { fireEvent.submit(box.closest('form') as HTMLFormElement) })
    expect(fetchCalls.some((c) => c.url === '/api/card-checkout/intent')).toBe(false)
  })

  it('marks the attempt as a card attempt before the intent call (one flow per attempt)', async () => {
    await renderGate()
    fireEvent.click(await ready())
    await act(async () => { fireEvent.click(submitButton()) })
    await waitFor(() => expect(h.confirmSetupMock).toHaveBeenCalled())
    expect(window.sessionStorage.getItem('prestigo-card-attempt')).toBe(storeRef.current.attemptId)
  })
})
