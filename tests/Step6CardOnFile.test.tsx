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
  confirmPaymentMock: vi.fn(),
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
    useStripe: () => ({ confirmSetup: h.confirmSetupMock, confirmPayment: h.confirmPaymentMock }),
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
let promoReply: Reply = { body: { valid: true, discountPct: 10 } }
let fetchCalls: Array<{ url: string; body: Record<string, unknown> | null }> = []

function respond(r: Reply) {
  if (r instanceof Error) return Promise.reject(r)
  const status = r.status ?? 200
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(r.body ?? {}) } as Response)
}

// Phase 89: init always carries the cancellation policy of the booking (an eligible answer without it is not usable).
const POLICY = {
  version: '2026-11-1',
  freeUntilIso: '2026-11-30T08:30:00.000Z',
  freeUntilPassed: false,
  hours: 24,
  percent: 100,
  feeMinor: 12000,
  waitMin: 45,
}

function eligibleInit(over: Record<string, unknown> = {}) {
  return {
    eligible: true,
    mode: 'setup',
    holdAtIso: '2026-11-12T06:00:00.000Z',
    holdDateIso: '2026-11-12',
    amountMinor: 12000,
    currency: 'eur',
    policy: POLICY,
    cashAvailable: false,
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
  h.confirmPaymentMock.mockResolvedValue({ paymentIntent: { status: 'requires_capture' } })
  storeRef.current.promoCode = null
  storeRef.current.promoDiscount = 0
  storeRef.current.attemptId = 'a1b2c3d4-0000-4000-8000-000000000001'
  window.sessionStorage.clear()
  initReplies = [{ body: eligibleInit() }]
  intentReplies = [{ body: { clientSecret: 'seti_1_secret_x', mode: 'setup', bookingReference: 'PRG-20261112-ABC123', amountMinor: 12000, currency: 'eur' } }]
  fetchCalls = []
  promoReply = { body: { valid: true, discountPct: 10 } }
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
    if (url.startsWith('/api/validate-promo')) return respond(promoReply)
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

  it('init in an unknown mode renders legacy Step6Payment', async () => {
    expect(SUPPORTED_MODES).toEqual(['setup', 'hold_now'])
    initReplies = [{ body: eligibleInit({ mode: 'bogus', holdAtIso: null, holdDateIso: null }) }]
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
    const vars = consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: '2026-11-12', locale: 'en' })
    // Phase 89-10: the wording now names {freeUntil}; the checkout passes it from the init policy in plan 89-11.
    const expected = cof[consentMessageKey('setup')]
      .replaceAll('{amount}', vars.amount)
      .replace('{holdDate}', vars.holdDate)
      .replace('{freeUntil}', vars.freeUntil)
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

// ---------------------------------------------------------------------------
// Task 2: promo / currency re-init, consent invalidation, every error and notice state
// ---------------------------------------------------------------------------

const step6En = en.Booking.step6 as unknown as Record<string, string> & { errors: Record<string, string> }
const invalidPhone = (enMessages as unknown as { Booking: { validation: { invalidPhone: string } } }).Booking.validation.invalidPhone

async function tickAndSubmit() {
  const box = await ready()
  if (!(box as HTMLInputElement).checked) fireEvent.click(box)
  await act(async () => { fireEvent.click(submitButton()) })
}

describe('currency and promo re-init', () => {
  it('switching to czk re-calls init, remounts Elements, clears a ticked box and announces it', async () => {
    initReplies = [{ body: eligibleInit() }, { body: eligibleInit({ currency: 'czk', amountMinor: 300000 }) }]
    await renderGate()
    const first = (await ready()) as HTMLInputElement
    fireEvent.click(first)
    expect(first.checked).toBe(true)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: step6En.czkLabel })) })

    const inits = fetchCalls.filter((c) => c.url === '/api/card-checkout/init')
    expect(inits).toHaveLength(2)
    expect((inits[1].body as { currency: string }).currency).toBe('czk')
    expect((inits[1].body as { bookingData: { currency: string } }).bookingData.currency).toBe('czk')

    const box = (await screen.findByRole('checkbox')) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.getByText(cof.noticeDetailsChanged)).toBeInTheDocument()
    // formatCZK uses non-breaking spaces; testing-library normalises the node text but not the matcher
    expect(screen.getByText(cof.setupHoldDay.replace('{amount}', formatMinor(300000, 'czk')).replace(/\s/g, ' '))).toBeInTheDocument()
    expect(h.elementsOptionsCapture[h.elementsOptionsCapture.length - 1]).toMatchObject({ mode: 'setup', currency: 'czk' })
  })

  it('does not announce when the box was not ticked', async () => {
    initReplies = [{ body: eligibleInit() }, { body: eligibleInit({ currency: 'czk', amountMinor: 300000 }) }]
    await renderGate()
    await ready()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: step6En.czkLabel })) })
    await screen.findByRole('checkbox')
    expect(screen.queryByText(cof.noticeDetailsChanged)).toBeNull()
  })

  it('a valid promo re-calls init with the promo code', async () => {
    initReplies = [{ body: eligibleInit() }, { body: eligibleInit({ amountMinor: 10800 }) }]
    await renderGate()
    await ready()
    fireEvent.change(screen.getByPlaceholderText(step6En.promoPlaceholder), { target: { value: 'save10' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: step6En.applyCode })) })
    await waitFor(() => expect(fetchCalls.filter((c) => c.url === '/api/card-checkout/init')).toHaveLength(2))
    expect(storeRef.current.setPromoCode).toHaveBeenCalledWith('SAVE10')
    expect(storeRef.current.setPromoDiscount).toHaveBeenCalledWith(10)
    const second = fetchCalls.filter((c) => c.url === '/api/card-checkout/init')[1]
    expect((second.body as { bookingData: { promoCode: string } }).bookingData.promoCode).toBe('SAVE10')
    expect(await screen.findByText(cof.setupHoldDay.replace('{amount}', formatMinor(10800, 'eur')))).toBeInTheDocument()
  })

  it('an invalid promo shows the existing promo error message and does not re-init', async () => {
    promoReply = { body: { valid: false, code: 'PROMO_INVALID' } }
    await renderGate()
    await ready()
    fireEvent.change(screen.getByPlaceholderText(step6En.promoPlaceholder), { target: { value: 'bad' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: step6En.applyCode })) })
    expect(await screen.findByText(step6En.errors.PROMO_INVALID)).toBeInTheDocument()
    expect(fetchCalls.filter((c) => c.url === '/api/card-checkout/init')).toHaveLength(1)
  })

  it('a re-init that comes back ineligible falls back to legacy Step6Payment', async () => {
    initReplies = [{ body: eligibleInit() }, { body: { eligible: false } }]
    await renderGate()
    await ready()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: step6En.czkLabel })) })
    expect(await screen.findByTestId('legacy-payment')).toBeInTheDocument()
  })
})

describe('409 notices', () => {
  it('PRICE_CHANGED updates the amount, clears the tick, shows the notice, then submits the new amount', async () => {
    intentReplies = [
      { status: 409, body: { code: 'PRICE_CHANGED', amountMinor: 13000 } },
      { body: { clientSecret: 'seti_1_secret_x', mode: 'setup', bookingReference: 'PRG-20261112-ABC123', amountMinor: 13000, currency: 'eur' } },
    ]
    await renderGate()
    await tickAndSubmit()

    const notice = await screen.findByText(cof.noticePriceChanged.replace('{amount}', formatMinor(13000, 'eur')))
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.getByText(cof.setupHoldDay.replace('{amount}', formatMinor(13000, 'eur')))).toBeInTheDocument()
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(submitButton()).toBeDisabled()
    expect(h.confirmSetupMock).not.toHaveBeenCalled()

    fireEvent.click(box)
    expect(submitButton()).toBeEnabled()
    await act(async () => { fireEvent.click(submitButton()) })
    await waitFor(() => expect(h.confirmSetupMock).toHaveBeenCalled())
    const intents = fetchCalls.filter((c) => c.url === '/api/card-checkout/intent')
    expect((intents[1].body as { displayedAmountMinor: number }).displayedAmountMinor).toBe(13000)
  })

  it('88-REVIEW B-WR-05: sends the hold date it showed; HOLD_DATE_CHANGED shows the new date, clears the tick and notices', async () => {
    intentReplies = [
      { status: 409, body: { code: 'HOLD_DATE_CHANGED', mode: 'setup', holdAtIso: '2026-11-13T06:00:00.000Z', holdDateIso: '2026-11-13' } },
    ]
    await renderGate()
    await tickAndSubmit()
    const intents = fetchCalls.filter((c) => c.url === '/api/card-checkout/intent')
    expect((intents[0].body as { displayedHoldDateIso: string }).displayedHoldDateIso).toBe('2026-11-12')
    expect(await screen.findByText(cof.noticeDetailsChanged)).toBeInTheDocument()
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
    const newDate = consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: '2026-11-13', locale: 'en' }).holdDate
    expect(document.body.textContent).toContain(newDate)
    expect(h.confirmSetupMock).not.toHaveBeenCalled()
  })

  it('88-REVIEW B-WR-03: ATTEMPT_CLOSED starts a new attempt and never navigates to the confirmation', async () => {
    intentReplies = [{ status: 409, body: { code: 'ATTEMPT_CLOSED' } }]
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(step6En.paymentGenericError)
    expect(storeRef.current.setAttemptId).toHaveBeenCalledTimes(1)
    expect(h.confirmSetupMock).not.toHaveBeenCalled()
  })

  it('MODE_CHANGED to an unsupported mode falls back to legacy Step6Payment', async () => {
    intentReplies = [{ status: 409, body: { code: 'MODE_CHANGED', mode: 'bogus', holdAtIso: null, holdDateIso: null } }]
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByTestId('legacy-payment')).toBeInTheDocument()
  })

  it('MODE_CHANGED to a supported mode remounts, clears the tick, updates the explainer and focuses the notice', async () => {
    intentReplies = [{ status: 409, body: { code: 'MODE_CHANGED', mode: 'hold_now', holdAtIso: null, holdDateIso: null } }]
    await renderGate()
    await tickAndSubmit()
    const notice = await screen.findByText(cof.noticeModeChanged)
    expect(screen.getByText(cof.headlineHoldNow)).toBeInTheDocument()
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
    expect(notice).toHaveAttribute('tabindex', '-1')
    await waitFor(() => expect(document.activeElement).toBe(notice))
  })
})

describe('error states', () => {
  it('setup_intent_authentication_failure shows the bank-verification message and keeps the card editable', async () => {
    h.confirmSetupMock.mockResolvedValue({ error: { type: 'card_error', code: 'setup_intent_authentication_failure', message: 'Auth failed' } })
    await renderGate()
    await tickAndSubmit()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(cof.errorBankVerification)
    expect(alert).not.toHaveTextContent('Auth failed')
    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
  })

  it('a card error shows paymentUnsuccessful with the Stripe message', async () => {
    h.confirmSetupMock.mockResolvedValue({ error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } })
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Payment unsuccessful. Your card was declined.')
  })

  it('a card error without a message falls back to paymentGenericError', async () => {
    h.confirmSetupMock.mockResolvedValue({ error: { type: 'card_error', code: 'card_declined' } })
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(step6En.paymentGenericError)
  })

  it('422 CONSENT_REQUIRED shows the consent error, a red row border and focuses the checkbox', async () => {
    intentReplies = [{ status: 422, body: { code: 'CONSENT_REQUIRED' } }]
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(cof.errorConsentRequired)
    const box = screen.getByRole('checkbox') as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(box))
    expect((box.closest('label') as HTMLElement).getAttribute('style')).toMatch(/border: 1px solid (#f87171|rgb\(248, 113, 113\))/i)
    expect(box.checked).toBe(false)
  })

  it('422 NOT_ELIGIBLE falls back to legacy Step6Payment and rotates the attempt id', async () => {
    intentReplies = [{ status: 422, body: { code: 'NOT_ELIGIBLE' } }]
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByTestId('legacy-payment')).toBeInTheDocument()
    expect(storeRef.current.setAttemptId).toHaveBeenCalledTimes(1)
    expect(storeRef.current.setAttemptId.mock.calls[0][0]).not.toBe('a1b2c3d4-0000-4000-8000-000000000001')
  })

  it('an init-time fallback with no card attempt keeps the attempt id', async () => {
    initReplies = [{ body: { eligible: false } }]
    await renderGate()
    await screen.findByTestId('legacy-payment')
    expect(storeRef.current.setAttemptId).not.toHaveBeenCalled()
  })

  it('422 INVALID_PHONE shows the phone message and returns to step 5', async () => {
    intentReplies = [{ status: 422, body: { code: 'INVALID_PHONE' } }]
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(invalidPhone)
    expect(storeRef.current.goToStep).toHaveBeenCalledWith(5)
  })

  it('429 shows the RATE_LIMITED message', async () => {
    intentReplies = [{ status: 429, body: { code: 'RATE_LIMITED' } }]
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(step6En.errors.RATE_LIMITED)
  })

  it('a network failure on the intent call shows networkError', async () => {
    intentReplies = [new Error('offline')]
    await renderGate()
    await tickAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(step6En.networkError)
  })

  it('an unknown server code shows paymentInitFailed, never raw server text', async () => {
    intentReplies = [{ status: 500, body: { code: 'SOMETHING_ELSE', error: 'raw database failure' } }]
    await renderGate()
    await tickAndSubmit()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(step6En.paymentInitFailed)
    expect(alert).not.toHaveTextContent('raw database failure')
  })

  it('an Elements load error shows paymentFormLoadError and keeps the button disabled', async () => {
    h.loadError.value = { error: { message: 'iframe blocked' } }
    await renderGate()
    const box = await screen.findByRole('checkbox')
    await act(async () => {})
    fireEvent.click(box)
    expect(await screen.findByRole('alert')).toHaveTextContent(step6En.paymentFormLoadError)
    expect(screen.getByRole('button', { name: cof.ctaSetup })).toBeDisabled()
  })
})

describe('submitting state and accessibility', () => {
  it('reads Confirming..., is disabled with aria-busy and ignores Escape while the challenge is open', async () => {
    let finish: (v: unknown) => void = () => {}
    h.confirmSetupMock.mockImplementation(() => new Promise((res) => { finish = res }))
    await renderGate()
    await tickAndSubmit()
    const busy = await screen.findByRole('button', { name: cof.ctaBusy })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    const form = busy.closest('form') as HTMLFormElement
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    await act(async () => { form.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(screen.getByRole('button', { name: cof.ctaBusy })).toBeDisabled()
    await act(async () => { finish({ setupIntent: { status: 'succeeded' } }) })
    await waitFor(() => expect(window.location.href).toMatch(/\/book\/confirmation\?ref=/))
  })

  it('the submit button is a real submit button described by the consent label', async () => {
    await renderGate()
    const box = await ready()
    const button = submitButton()
    expect(button).toHaveAttribute('type', 'submit')
    const describedBy = button.getAttribute('aria-describedby') as string
    expect(document.getElementById(describedBy)?.textContent).toBe((box.closest('label') as HTMLElement).textContent)
  })

  it('keeps the visual order promo, currency, Elements, consent, links, submit', async () => {
    await renderGate()
    await ready()
    const nodes = [
      screen.getByPlaceholderText(step6En.promoPlaceholder),
      screen.getByRole('button', { name: step6En.czkLabel }),
      screen.getByTestId('payment-element'),
      screen.getByRole('checkbox'),
      screen.getByRole('link', { name: cof.termsLink }),
      submitButton(),
    ]
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(nodes[i].compareDocumentPosition(nodes[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Plan 88-12 (HOLD-03): held-now variant, Elements mode 'payment', confirmPayment
// ---------------------------------------------------------------------------

function holdNowInit(over: Record<string, unknown> = {}) {
  return eligibleInit({ mode: 'hold_now', holdAtIso: null, holdDateIso: null, amountMinor: 9000, currency: 'czk', ...over })
}

function holdNowButton(amountMinor = 9000, currency: 'czk' | 'eur' = 'czk') {
  return screen.getByRole('button', { name: cof.ctaHoldNow.replace('{amount}', formatMinor(amountMinor, currency)) })
}

async function tickAndSubmitHoldNow() {
  const box = await ready()
  if (!(box as HTMLInputElement).checked) fireEvent.click(box)
  await act(async () => { fireEvent.click(holdNowButton()) })
}

describe('held-now variant (HOLD-03, D-11)', () => {
  beforeEach(() => {
    initReplies = [{ body: holdNowInit() }]
    intentReplies = [
      { body: { clientSecret: 'pi_1_secret_x', mode: 'hold_now', bookingReference: 'PRG-20261112-ABC123', amountMinor: 9000, currency: 'czk' } },
    ]
  })

  it('shows the held-now headline and the two held-now rows, with no hold date', async () => {
    await renderGate()
    await ready()
    expect(screen.getByText(cof.headlineHoldNow)).toBeInTheDocument()
    expect(screen.getByText(cof.holdNowToday.replace('{amount}', formatMinor(9000, 'czk')))).toBeInTheDocument()
    expect(screen.getByText(cof.holdNowAfterTrip)).toBeInTheDocument()
    expect(screen.queryByText(cof.headlineSetup)).toBeNull()
  })

  it("creates Elements in payment mode with the intent's amount, currency, manual capture and off_session", async () => {
    await renderGate()
    await ready()
    const opts = h.elementsOptionsCapture[h.elementsOptionsCapture.length - 1]
    expect(opts).toMatchObject({
      mode: 'payment',
      amount: 9000,
      currency: 'czk',
      captureMethod: 'manual',
      setupFutureUsage: 'off_session',
      paymentMethodTypes: ['card'],
      locale: 'en',
    })
    expect((opts as { appearance?: { theme?: string } }).appearance?.theme).toBe('night')
  })

  it('the button reads Hold <amount> & book and stays disabled until ticked', async () => {
    await renderGate()
    const box = await ready()
    expect(holdNowButton()).toBeDisabled()
    fireEvent.click(box)
    expect(holdNowButton()).toBeEnabled()
  })

  it('the consent label equals the held-now consent string with the formatted amount (no date)', async () => {
    await renderGate()
    const box = await ready()
    const label = box.closest('label') as HTMLLabelElement
    const vars = consentVars({ amountMinor: 9000, currency: 'czk', holdDateIso: null, locale: 'en' })
    expect(label.textContent).toBe(cof[consentMessageKey('hold_now')].replaceAll('{amount}', vars.amount).replace('{freeUntil}', vars.freeUntil))
    expect(label.textContent).toContain(formatMinor(9000, 'czk'))
  })

  it('submits elements.submit, the intent with mode hold_now, the snapshot, then confirmPayment (never confirmSetup)', async () => {
    const order: string[] = []
    h.submitMock.mockImplementation(async () => { order.push('submit'); return {} })
    h.snapshotMock.mockImplementation(() => { order.push('snapshot') })
    h.confirmPaymentMock.mockImplementation(async () => { order.push('confirm'); return { paymentIntent: { status: 'requires_capture' } } })

    await renderGate()
    await tickAndSubmitHoldNow()

    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalled())
    expect(order).toEqual(['submit', 'snapshot', 'confirm'])
    expect(h.confirmSetupMock).not.toHaveBeenCalled()

    const intent = fetchCalls.find((c) => c.url === '/api/card-checkout/intent')!
    expect(intent.body).toMatchObject({ consent: true, mode: 'hold_now', currency: 'czk', displayedAmountMinor: 9000 })

    const arg = h.confirmPaymentMock.mock.calls[0][0]
    expect(arg.clientSecret).toBe('pi_1_secret_x')
    expect(arg.redirect).toBe('if_required')
    expect(arg.confirmParams.return_url).toMatch(/\/book\/confirmation\?ref=PRG-20261112-ABC123$/)
    await waitFor(() => expect(window.location.href).toMatch(/\/book\/confirmation\?ref=PRG-20261112-ABC123$/))
    expect(h.snapshotMock.mock.calls[0][0]).toMatchObject({ ref: 'PRG-20261112-ABC123' })
  })

  it('alreadyConfirmed navigates without confirmPayment', async () => {
    intentReplies = [{ body: { alreadyConfirmed: true, bookingReference: 'PRG-20261112-ABC123' } }]
    await renderGate()
    await tickAndSubmitHoldNow()
    await waitFor(() => expect(window.location.href).toMatch(/\/book\/confirmation\?ref=PRG-20261112-ABC123$/))
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
  })

  it('payment_intent_authentication_failure shows the bank-verification message and keeps the card editable', async () => {
    h.confirmPaymentMock.mockResolvedValue({ error: { type: 'card_error', code: 'payment_intent_authentication_failure', message: 'Auth failed' } })
    await renderGate()
    await tickAndSubmitHoldNow()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(cof.errorBankVerification)
    expect(alert).not.toHaveTextContent('Auth failed')
    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
    expect(holdNowButton()).toBeEnabled()
  })

  it('a declined card shows the Stripe message and does not navigate', async () => {
    h.confirmPaymentMock.mockResolvedValue({ error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } })
    await renderGate()
    await tickAndSubmitHoldNow()
    expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined.')
    expect(window.location.href).toBe('http://localhost/en/book')
  })

  it('a PaymentIntent that is not authorised yet (requires_payment_method) shows the generic error', async () => {
    h.confirmPaymentMock.mockResolvedValue({ paymentIntent: { status: 'requires_payment_method' } })
    await renderGate()
    await tickAndSubmitHoldNow()
    expect(await screen.findByRole('alert')).toHaveTextContent(step6En.paymentGenericError)
  })

  it('PRICE_CHANGED keeps hold_now, updates the Elements amount and clears the tick', async () => {
    intentReplies = [{ status: 409, body: { code: 'PRICE_CHANGED', amountMinor: 9500 } }]
    await renderGate()
    await tickAndSubmitHoldNow()
    await waitFor(() => {
      const opts = h.elementsOptionsCapture[h.elementsOptionsCapture.length - 1]
      expect(opts).toMatchObject({ mode: 'payment', amount: 9500 })
    })
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
  })

  it('MODE_CHANGED to setup remounts in setup mode with the setup copy, the date, a cleared tick and a focused notice', async () => {
    intentReplies = [
      { status: 409, body: { code: 'MODE_CHANGED', mode: 'setup', holdAtIso: '2026-11-12T06:00:00.000Z', holdDateIso: '2026-11-12' } },
    ]
    await renderGate()
    await tickAndSubmitHoldNow()

    const notice = await screen.findByText(cof.noticeModeChanged)
    expect(screen.queryByTestId('legacy-payment')).toBeNull()
    expect(screen.getByText(cof.headlineSetup)).toBeInTheDocument()
    expect(screen.getByText(formatLocaleDate('2026-11-12', 'en'))).toBeInTheDocument()
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(false)
    const label = box.closest('label') as HTMLLabelElement
    const vars = consentVars({ amountMinor: 9000, currency: 'czk', holdDateIso: '2026-11-12', locale: 'en' })
    expect(label.textContent).toBe(
      cof[consentMessageKey('setup')].replaceAll('{amount}', vars.amount).replace('{holdDate}', vars.holdDate).replace('{freeUntil}', vars.freeUntil),
    )
    await waitFor(() => expect(document.activeElement).toBe(notice))
    const opts = h.elementsOptionsCapture[h.elementsOptionsCapture.length - 1]
    expect(opts).toMatchObject({ mode: 'setup', currency: 'czk' })
    expect(opts).not.toHaveProperty('amount')
    expect(opts).not.toHaveProperty('captureMethod')
    expect(screen.getByRole('button', { name: cof.ctaSetup })).toBeDisabled()
  })

  it('setup -> hold_now switch (the reverse direction) stays in the card step and confirms through confirmPayment', async () => {
    initReplies = [{ body: eligibleInit({ currency: 'eur', amountMinor: 12000 }) }]
    intentReplies = [
      { status: 409, body: { code: 'MODE_CHANGED', mode: 'hold_now', holdAtIso: null, holdDateIso: null } },
      { body: { clientSecret: 'pi_2_secret_x', mode: 'hold_now', bookingReference: 'PRG-20261112-ABC123', amountMinor: 12000, currency: 'eur' } },
    ]
    await renderGate()
    await tickAndSubmit()
    await screen.findByText(cof.noticeModeChanged)
    expect(screen.queryByTestId('legacy-payment')).toBeNull()
    expect(screen.getByText(cof.headlineHoldNow)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => { fireEvent.click(holdNowButton(12000, 'eur')) })
    await waitFor(() => expect(h.confirmPaymentMock).toHaveBeenCalled())
    expect(h.confirmSetupMock).not.toHaveBeenCalled()
    const second = fetchCalls.filter((c) => c.url === '/api/card-checkout/intent')[1]
    expect(second.body).toMatchObject({ mode: 'hold_now', consent: true })
  })

  it('shows Confirming..., is disabled with aria-busy while the 3DS challenge is open', async () => {
    let finish: (v: unknown) => void = () => {}
    h.confirmPaymentMock.mockImplementation(() => new Promise((res) => { finish = res }))
    await renderGate()
    await tickAndSubmitHoldNow()
    const busy = await screen.findByRole('button', { name: cof.ctaBusy })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    await act(async () => { finish({ paymentIntent: { status: 'requires_capture' } }) })
  })
})
