/**
 * Phase 92 plan 92-17 Task 1 (QUOTE-03, QUOTE-05; D-08; T-92-54, T-92-55, T-92-56): the accept-and-pay island.
 *
 * Stripe is mocked at the module level (same shape as tests/Step6CardOnFile.test.tsx): Elements records its options,
 * PaymentElement reports ready, useStripe / useElements expose the mocked confirmPayment / submit. fetch is routed by
 * URL. The island translates nothing: the test hands it ready strings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { locales } from '@/i18n/locales'
import { STRIPE_ELEMENTS_LOCALE } from '@/lib/booking-locale'
import QuoteAcceptPay, { type QuoteAcceptPayCopy } from '@/app/[locale]/quote/[token]/QuoteAcceptPay'

const h = vi.hoisted(() => ({
  elementsOptions: [] as Array<Record<string, unknown> | null>,
  submitMock: vi.fn(),
  confirmPaymentMock: vi.fn(),
  refreshMock: vi.fn(),
  readyAuto: { value: true },
}))

vi.mock('@stripe/react-stripe-js', async () => {
  const React = await import('react')
  return {
    Elements: ({ children, options }: { children: ReactNode; options: Record<string, unknown> | null }) => {
      h.elementsOptions.push(options)
      return children
    },
    PaymentElement: (props: { onReady?: () => void }) => {
      React.useEffect(() => {
        if (h.readyAuto.value) props.onReady?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return React.createElement('div', { 'data-testid': 'payment-element' })
    },
    useStripe: () => ({ confirmPayment: h.confirmPaymentMock }),
    useElements: () => ({ submit: h.submitMock }),
  }
})

vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue({}) }))

vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>()
  return { ...actual, useRouter: () => ({ refresh: h.refreshMock, push: vi.fn(), replace: vi.fn() }) }
})

const TOKEN = 'A'.repeat(43)
const CONSENT = 'I accept quote Q-1 (version 3) and its cancellation terms.\nThe remainder is charged to the card.'

const COPY: QuoteAcceptPayCopy = {
  heading: 'Accept and pay the deposit',
  button: 'Pay deposit €90',
  consentRequired: 'Please tick the box to accept the terms.',
  processing: 'Processing your payment…',
  confirming: 'Payment received. We are confirming your trips…',
  declined: 'Your card was declined. Please try another card.',
  error: 'The payment did not go through. Please try again.',
  changed: 'This quote has changed. Please reload the page.',
  unavailable: 'This quote can no longer be accepted.',
}

let fetchMock: ReturnType<typeof vi.fn>
let acceptAnswer: () => Response
let stateAnswer: () => Response

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mount(over: Partial<React.ComponentProps<typeof QuoteAcceptPay>> = {}) {
  return render(
    <QuoteAcceptPay
      token={TOKEN}
      locale="en"
      versionNo={3}
      depositMinor={9000}
      currency="eur"
      consentText={CONSENT}
      copy={COPY}
      {...over}
    />,
  )
}

const checkbox = () => screen.getByRole('checkbox') as HTMLInputElement
const payButton = () => screen.getByRole('button', { name: /Pay deposit|Processing/ }) as HTMLButtonElement

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function tickAndPay() {
  fireEvent.click(checkbox())
  await act(async () => {
    fireEvent.click(payButton())
  })
  await tick(0)
}

function stateCalls(): number {
  return fetchMock.mock.calls.filter((c) => c[0] === '/api/quote/state').length
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  h.elementsOptions.length = 0
  h.readyAuto.value = true
  h.submitMock.mockResolvedValue({})
  h.confirmPaymentMock.mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
  acceptAnswer = () => json(200, { clientSecret: 'pi_1_secret_x', amountMinor: 9000, currency: 'eur' })
  stateAnswer = () => json(200, { state: 'accepted', bookingReferences: [] })
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/quote/accept') return acceptAnswer()
    if (url === '/api/quote/state') return stateAnswer()
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('QuoteAcceptPay: the one explicit step (D-08, T-92-55)', () => {
  it('shows the server-rendered consent text and a pay button that is disabled until the box is ticked', async () => {
    mount()
    await tick(0)
    expect(screen.getByTestId('quote-accept')).toBeTruthy()
    expect(screen.getByText(COPY.heading)).toBeTruthy()
    // The text the client ticks is the text the server stored, character for character.
    expect(screen.getByTestId('quote-accept-consent').textContent).toBe(CONSENT)
    expect(checkbox().checked).toBe(false)
    expect(payButton().disabled).toBe(true)
    expect(payButton().textContent).toBe(COPY.button)

    fireEvent.click(checkbox())
    expect(payButton().disabled).toBe(false)
    fireEvent.click(checkbox())
    expect(payButton().disabled).toBe(true)
  })

  it('an unticked box never sends anything: a forced submit shows the consent message and posts nothing', async () => {
    mount()
    await tick(0)
    const form = screen.getByTestId('quote-accept').querySelector('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })
    await tick(0)
    expect(h.submitMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(COPY.consentRequired)
  })

  it('the pay button stays disabled until the card element is ready', async () => {
    h.readyAuto.value = false
    mount()
    await tick(0)
    fireEvent.click(checkbox())
    expect(payButton().disabled).toBe(true)
  })
})

describe('QuoteAcceptPay: Stripe setup', () => {
  it('Elements: payment mode, the displayed deposit, card only, saves the card, locale from STRIPE_ELEMENTS_LOCALE', async () => {
    mount({ locale: 'zh-hant' })
    await tick(0)
    const options = h.elementsOptions[0] as Record<string, unknown>
    expect(options.mode).toBe('payment')
    expect(options.amount).toBe(9000)
    expect(options.currency).toBe('eur')
    expect(options.setupFutureUsage).toBe('off_session')
    expect(options.paymentMethodTypes).toEqual(['card'])
    expect(options.locale).toBe('zh-TW')
    expect(options.captureMethod).toBeUndefined()
  })

  it.each([...locales])('%s: Elements gets the mapped Stripe locale (Hindi is auto)', async (locale) => {
    mount({ locale })
    await tick(0)
    expect((h.elementsOptions[0] as Record<string, unknown>).locale).toBe(STRIPE_ELEMENTS_LOCALE[locale])
  })
})

describe('QuoteAcceptPay: the order of the steps (T-92-54, T-92-56)', () => {
  it('elements.submit, then POST /api/quote/accept with cross-checks only, then confirmPayment with a tokenless return URL', async () => {
    const order: string[] = []
    h.submitMock.mockImplementation(async () => {
      order.push('submit')
      return {}
    })
    fetchMock.mockImplementation(async (url: string) => {
      order.push(`fetch ${url}`)
      return url === '/api/quote/accept' ? acceptAnswer() : stateAnswer()
    })
    h.confirmPaymentMock.mockImplementation(async () => {
      order.push('confirm')
      return { paymentIntent: { status: 'succeeded' } }
    })

    mount()
    await tick(0)
    await tickAndPay()

    expect(order.slice(0, 3)).toEqual(['submit', 'fetch /api/quote/accept', 'confirm'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/quote/accept')
    expect(init.method).toBe('POST')
    // Exactly the cross-check values; never an amount key, a currency or a text.
    expect(JSON.parse(init.body as string)).toEqual({
      token: TOKEN,
      displayedVersionNo: 3,
      displayedDepositMinor: 9000,
      consent: true,
    })

    expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1)
    const args = h.confirmPaymentMock.mock.calls[0][0] as {
      clientSecret: string
      redirect: string
      confirmParams: { return_url: string }
    }
    expect(args.clientSecret).toBe('pi_1_secret_x')
    expect(args.redirect).toBe('if_required')
    expect(args.confirmParams.return_url.endsWith('/quote/done')).toBe(true)
    expect(args.confirmParams.return_url).not.toContain(TOKEN)
    expect(args.confirmParams.return_url).not.toContain('?')
  })

  it('the return URL carries the locale prefix and still no token', async () => {
    mount({ locale: 'ru' })
    await tick(0)
    await tickAndPay()
    const args = h.confirmPaymentMock.mock.calls[0][0] as { confirmParams: { return_url: string } }
    expect(new URL(args.confirmParams.return_url).pathname).toBe('/ru/quote/done')
    expect(args.confirmParams.return_url).not.toContain(TOKEN)
  })

  it('a validation error from elements.submit stops before any request', async () => {
    h.submitMock.mockResolvedValue({ error: { type: 'validation_error', message: 'Incomplete' } })
    mount()
    await tick(0)
    await tickAndPay()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
    expect(payButton().disabled).toBe(false)
  })

  it('a double click sends one POST and one confirm', async () => {
    mount()
    await tick(0)
    fireEvent.click(checkbox())
    const form = screen.getByTestId('quote-accept').querySelector('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await tick(0)
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/quote/accept')).toHaveLength(1)
    expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1)
  })

  it('the amount shown is the amount the server returned: a different answer is never confirmed', async () => {
    acceptAnswer = () => json(200, { clientSecret: 'pi_1_secret_x', amountMinor: 12000, currency: 'eur' })
    mount()
    await tick(0)
    await tickAndPay()
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(COPY.changed)
    expect(checkbox().checked).toBe(false)
  })

  it('a different currency in the answer is never confirmed either', async () => {
    acceptAnswer = () => json(200, { clientSecret: 'pi_1_secret_x', amountMinor: 9000, currency: 'czk' })
    mount()
    await tick(0)
    await tickAndPay()
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(COPY.changed)
  })
})

describe('QuoteAcceptPay: refusals and failures', () => {
  it('409 quote_changed shows the changed text and clears the tick', async () => {
    acceptAnswer = () => json(409, { error: 'quote_changed' })
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.changed)
    expect(checkbox().checked).toBe(false)
    expect(payButton().disabled).toBe(true)
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
  })

  it('after a refusal the next press needs a new tick (the ref was cleared too)', async () => {
    acceptAnswer = () => json(409, { error: 'quote_changed' })
    mount()
    await tick(0)
    await tickAndPay()
    const form = screen.getByTestId('quote-accept').querySelector('form') as HTMLFormElement
    fetchMock.mockClear()
    await act(async () => {
      fireEvent.submit(form)
    })
    await tick(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('404 invalid_link and 422 map to their own messages', async () => {
    acceptAnswer = () => json(404, { error: 'invalid_link' })
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.unavailable)
    cleanup()

    acceptAnswer = () => json(422, { code: 'CONSENT_REQUIRED' })
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.consentRequired)
  })

  it.each([
    [409, { error: 'busy' }],
    [429, { error: 'rate_limited' }],
    [502, { error: 'payment_unavailable' }],
    [500, {}],
  ])('status %s shows the generic error and lets the client try again', async (status, body) => {
    acceptAnswer = () => json(status, body)
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.error)
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
    expect(payButton().disabled).toBe(false)
    expect(checkbox().checked).toBe(true)
  })

  it('a network failure shows the generic error', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.error)
    expect(payButton().disabled).toBe(false)
  })

  it('a card decline shows the declined text and the client can press again', async () => {
    h.confirmPaymentMock.mockResolvedValueOnce({ error: { type: 'card_error', code: 'card_declined', message: 'raw stripe text' } })
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.declined)
    expect(screen.queryByText('raw stripe text')).toBeNull()
    expect(payButton().disabled).toBe(false)
    expect(stateCalls()).toBe(0)

    await act(async () => {
      fireEvent.click(payButton())
    })
    await tick(0)
    expect(h.confirmPaymentMock).toHaveBeenCalledTimes(2)
  })

  it('any other Stripe error shows the generic error, never the raw Stripe text', async () => {
    h.confirmPaymentMock.mockResolvedValueOnce({ error: { type: 'api_error', message: 'raw stripe text' } })
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.error)
    expect(screen.queryByText('raw stripe text')).toBeNull()
  })

  it('a status that is not an authorisation is not treated as paid', async () => {
    h.confirmPaymentMock.mockResolvedValueOnce({ paymentIntent: { status: 'requires_payment_method' } })
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.error)
    expect(stateCalls()).toBe(0)
  })
})

describe('QuoteAcceptPay: confirming and polling (T-92-56)', () => {
  it('after a confirmed payment it shows the confirming text and polls /api/quote/state every 2 s until paid, then refreshes', async () => {
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('status').textContent).toBe(COPY.confirming)
    expect(stateCalls()).toBe(0)

    await tick(2000)
    expect(stateCalls()).toBe(1)
    const stateCall = fetchMock.mock.calls.find((c) => c[0] === '/api/quote/state') as [string, RequestInit]
    expect(stateCall[1].method).toBe('POST')
    expect(JSON.parse(stateCall[1].body as string)).toEqual({ token: TOKEN })
    expect(h.refreshMock).not.toHaveBeenCalled()

    await tick(2000)
    expect(stateCalls()).toBe(2)
    expect(h.refreshMock).not.toHaveBeenCalled()

    stateAnswer = () => json(200, { state: 'paid', bookingReferences: ['PR-9001'] })
    await tick(2000)
    expect(stateCalls()).toBe(3)
    expect(h.refreshMock).toHaveBeenCalledTimes(1)

    await tick(10_000)
    expect(stateCalls()).toBe(3)
    expect(h.refreshMock).toHaveBeenCalledTimes(1)
  })

  it('the browser never creates the bookings: it only reads the state', async () => {
    mount()
    await tick(0)
    await tickAndPay()
    await tick(6000)
    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(new Set(urls)).toEqual(new Set(['/api/quote/accept', '/api/quote/state']))
  })

  it('stops after 60 seconds and keeps the confirming text, without refreshing', async () => {
    mount()
    await tick(0)
    await tickAndPay()
    await tick(60_000)
    const atSixty = stateCalls()
    expect(atSixty).toBe(30)
    await tick(30_000)
    expect(stateCalls()).toBe(atSixty)
    expect(screen.getByRole('status').textContent).toBe(COPY.confirming)
    expect(h.refreshMock).not.toHaveBeenCalled()
  })

  it('a failing poll does not stop the polling', async () => {
    mount()
    await tick(0)
    await tickAndPay()
    stateAnswer = () => {
      throw new Error('offline')
    }
    await tick(2000)
    stateAnswer = () => json(200, { state: 'paid', bookingReferences: [] })
    await tick(2000)
    expect(h.refreshMock).toHaveBeenCalledTimes(1)
  })

  it('already_paying (a payment in progress) goes straight to confirming and polls without a second confirm', async () => {
    acceptAnswer = () => json(409, { error: 'already_paying' })
    mount()
    await tick(0)
    await tickAndPay()
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(COPY.confirming)
    await tick(2000)
    expect(stateCalls()).toBe(1)
  })

  it('already_paid refreshes the page into the paid view', async () => {
    acceptAnswer = () => json(409, { error: 'already_paid' })
    mount()
    await tick(0)
    await tickAndPay()
    expect(h.refreshMock).toHaveBeenCalledTimes(1)
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
  })

  it('a payment that is processing at the bank also goes to confirming', async () => {
    h.confirmPaymentMock.mockResolvedValueOnce({ paymentIntent: { status: 'processing' } })
    mount()
    await tick(0)
    await tickAndPay()
    expect(screen.getByRole('status').textContent).toBe(COPY.confirming)
  })
})

describe('QuoteAcceptPay: the source', () => {
  const source = readFileSync(join(process.cwd(), 'app/[locale]/quote/[token]/QuoteAcceptPay.tsx'), 'utf8')

  it("saves the card, pays by card only and returns to /quote/done", () => {
    expect(source).toContain("setupFutureUsage: 'off_session'")
    expect(source).toContain("paymentMethodTypes: ['card']")
    expect(source).toContain('/quote/done')
    expect(source).toContain('STRIPE_ELEMENTS_LOCALE')
  })

  it('stores nothing about the token or the payment in the browser, and never builds a return URL from the token', () => {
    expect(source).not.toMatch(/sessionStorage|localStorage|writePurchaseSnapshot/)
    expect(source).not.toMatch(/return_url:[^\n]*token/)
  })

  it('types no amount and no English sentence of its own', () => {
    expect(source).not.toMatch(/€/)
    expect(source).not.toMatch(/useTranslations|useLocale/)
  })
})
