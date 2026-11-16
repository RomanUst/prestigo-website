/**
 * Phase 92 plan 92-27 Task 2 (QUOTE-04; D-16; T-92-84, T-92-85): the remainder island of a paid payment-link quote.
 *
 * Stripe is mocked at the module level (the shape of tests/quote-accept-pay.test.tsx): Elements records its options,
 * PaymentElement reports ready, useStripe / useElements expose the mocked confirmPayment / submit. fetch is routed by
 * URL. The island translates nothing and computes no amount: the test hands it ready strings and the server's due.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { STRIPE_ELEMENTS_LOCALE } from '@/lib/booking-locale'
import QuoteRemainderPay, { type QuoteRemainderPayCopy } from '@/app/[locale]/quote/[token]/QuoteRemainderPay'

const h = vi.hoisted(() => ({
  elementsOptions: [] as Array<Record<string, unknown> | null>,
  submitMock: vi.fn(),
  confirmPaymentMock: vi.fn(),
  refreshMock: vi.fn(),
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
        props.onReady?.()
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

const TOKEN = 'B'.repeat(43)

const COPY: QuoteRemainderPayCopy = {
  heading: 'Pay the remainder',
  due: 'Remainder to pay: €120.00',
  button: 'Pay €120.00',
  processing: 'Processing your payment…',
  confirming: 'Payment received. We are updating your quote…',
  declined: 'Your card was declined. Please try another card.',
  error: 'The payment did not go through. Please try again.',
  changed: 'This quote has changed. Please reload the page.',
}

let fetchMock: ReturnType<typeof vi.fn>
let remainderAnswer: () => Response
let stateAnswer: () => Response

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mount(over: Partial<React.ComponentProps<typeof QuoteRemainderPay>> = {}) {
  return render(<QuoteRemainderPay token={TOKEN} locale="en" dueMinor={12000} currency="eur" copy={COPY} {...over} />)
}

const payButton = () => screen.getByRole('button', { name: /Pay €|Processing/ }) as HTMLButtonElement

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function pay() {
  await act(async () => {
    fireEvent.click(payButton())
  })
  await tick(0)
}

const calls = (url: string) => fetchMock.mock.calls.filter((c) => c[0] === url)

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  h.elementsOptions.length = 0
  h.submitMock.mockResolvedValue({})
  h.confirmPaymentMock.mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
  remainderAnswer = () => json(200, { clientSecret: 'pi_r_secret_x', amountMinor: 12000, currency: 'eur' })
  stateAnswer = () => json(200, { state: 'paid', bookingReferences: ['PR-1'] })
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/quote/remainder') return remainderAnswer()
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

describe('QuoteRemainderPay: what it shows', () => {
  it('the heading, the server-computed due and a pay button with the same amount; no consent box', async () => {
    mount()
    await tick(0)
    const area = screen.getByTestId('quote-remainder')
    expect(area.textContent).toContain(COPY.heading)
    expect(area.textContent).toContain(COPY.due)
    expect(payButton().textContent).toBe(COPY.button)
    expect(payButton().disabled).toBe(false)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByTestId('payment-element')).toBeTruthy()
  })

  it('Elements: payment mode, the due amount, card only, the card is not saved again, the locale of the quote', async () => {
    mount({ locale: 'fr', dueMinor: 12000, currency: 'eur' })
    await tick(0)
    const options = h.elementsOptions.at(-1)!
    expect(options).toMatchObject({ mode: 'payment', amount: 12000, currency: 'eur', paymentMethodTypes: ['card'] })
    expect(options.locale).toBe(STRIPE_ELEMENTS_LOCALE.fr)
    expect(options).not.toHaveProperty('setupFutureUsage')
  })
})

describe('QuoteRemainderPay: the order of the steps (T-92-84, T-92-85)', () => {
  it('elements.submit, then POST /api/quote/remainder with the token and the displayed amount, then confirmPayment with a tokenless return URL', async () => {
    mount()
    await tick(0)
    await pay()

    expect(h.submitMock).toHaveBeenCalledTimes(1)
    const [call] = calls('/api/quote/remainder') as Array<[string, RequestInit]>
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body as string)).toEqual({ token: TOKEN, displayedAmountMinor: 12000 })
    expect(h.submitMock.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0])

    expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1)
    const arg = h.confirmPaymentMock.mock.calls[0][0] as {
      clientSecret: string
      redirect: string
      confirmParams: { return_url: string }
    }
    expect(arg.clientSecret).toBe('pi_r_secret_x')
    expect(arg.redirect).toBe('if_required')
    expect(arg.confirmParams.return_url).toBe(`${window.location.origin}/quote/done`)
    expect(arg.confirmParams.return_url).not.toContain(TOKEN)
  })

  it('the return URL carries the locale prefix and still no token', async () => {
    mount({ locale: 'ru' })
    await tick(0)
    await pay()
    const arg = h.confirmPaymentMock.mock.calls[0][0] as { confirmParams: { return_url: string } }
    expect(arg.confirmParams.return_url).toBe(`${window.location.origin}/ru/quote/done`)
  })

  it('a validation error from elements.submit stops before any request', async () => {
    h.submitMock.mockResolvedValue({ error: { type: 'validation_error' } })
    mount()
    await tick(0)
    await pay()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
  })

  it('one request at a time: a burst of presses sends one POST and one confirm', async () => {
    mount()
    await tick(0)
    const form = payButton().closest('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await tick(0)
    expect(calls('/api/quote/remainder')).toHaveLength(1)
    expect(h.confirmPaymentMock).toHaveBeenCalledTimes(1)
  })

  it('an answer with another amount or currency is never confirmed: the changed text instead', async () => {
    for (const answer of [
      { clientSecret: 'pi_r_secret_x', amountMinor: 9999, currency: 'eur' },
      { clientSecret: 'pi_r_secret_x', amountMinor: 12000, currency: 'czk' },
    ]) {
      remainderAnswer = () => json(200, answer)
      const { unmount } = mount()
      await tick(0)
      await pay()
      expect(h.confirmPaymentMock).not.toHaveBeenCalled()
      expect(screen.getByRole('alert').textContent).toBe(COPY.changed)
      unmount()
    }
  })
})

describe('QuoteRemainderPay: refusals and failures', () => {
  it('409 amount_changed shows the changed text and refreshes the page so the new due is shown', async () => {
    remainderAnswer = () => json(409, { error: 'amount_changed' })
    mount()
    await tick(0)
    await pay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.changed)
    expect(h.refreshMock).toHaveBeenCalled()
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
    // The client can press again.
    expect(payButton().disabled).toBe(false)
  })

  it('409 already_paying waits for the payment in progress (confirming), confirms nothing', async () => {
    remainderAnswer = () => json(409, { error: 'already_paying' })
    mount()
    await tick(0)
    await pay()
    expect(screen.getByTestId('quote-remainder-confirming').textContent).toBe(COPY.confirming)
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
  })

  it('422 nothing_due refreshes the page (it is already paid) and shows the confirming text', async () => {
    remainderAnswer = () => json(422, { error: 'nothing_due' })
    mount()
    await tick(0)
    await pay()
    expect(h.refreshMock).toHaveBeenCalled()
    expect(screen.getByTestId('quote-remainder-confirming')).toBeTruthy()
  })

  it('404, 422 not_payable, 409 busy, 429 and a network failure show the generic error and confirm nothing', async () => {
    const answers: Array<() => Response> = [
      () => json(404, { error: 'invalid_link' }),
      () => json(422, { error: 'not_payable' }),
      () => json(409, { error: 'busy' }),
      () => json(429, { error: 'Too many requests' }),
      () => {
        throw new TypeError('network down')
      },
    ]
    for (const answer of answers) {
      remainderAnswer = answer
      const { unmount } = mount()
      await tick(0)
      await pay()
      expect(screen.getByRole('alert').textContent).toBe(COPY.error)
      unmount()
    }
    expect(h.confirmPaymentMock).not.toHaveBeenCalled()
  })

  it('a card decline shows the declined text and the client can press again', async () => {
    h.confirmPaymentMock.mockResolvedValueOnce({ error: { type: 'card_error', message: 'Raw Stripe text' } })
    mount()
    await tick(0)
    await pay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.declined)
    expect(document.body.textContent).not.toContain('Raw Stripe text')
    await pay()
    expect(calls('/api/quote/remainder')).toHaveLength(2)
  })

  it('any other Stripe error, or a status that is not paid, shows the generic error', async () => {
    h.confirmPaymentMock.mockResolvedValueOnce({ error: { type: 'api_error', message: 'Raw' } })
    mount()
    await tick(0)
    await pay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.error)
    h.confirmPaymentMock.mockResolvedValueOnce({ paymentIntent: { status: 'requires_payment_method' } })
    await pay()
    expect(screen.getByRole('alert').textContent).toBe(COPY.error)
  })
})

describe('QuoteRemainderPay: confirming and polling', () => {
  it('after a confirmed payment it shows the confirming text, checks /api/quote/state and refreshes the page every 2 s', async () => {
    mount()
    await tick(0)
    await pay()
    expect(screen.getByTestId('quote-remainder-confirming').textContent).toBe(COPY.confirming)
    expect(calls('/api/quote/state')).toHaveLength(0)

    await tick(2000)
    expect(calls('/api/quote/state')).toHaveLength(1)
    expect(JSON.parse((calls('/api/quote/state')[0] as [string, RequestInit])[1].body as string)).toEqual({ token: TOKEN })
    expect(h.refreshMock).toHaveBeenCalledTimes(1)

    await tick(2000)
    expect(calls('/api/quote/state')).toHaveLength(2)
    expect(h.refreshMock).toHaveBeenCalledTimes(2)
  })

  it('polling stops after 60 s', async () => {
    mount()
    await tick(0)
    await pay()
    await tick(2000 * 40)
    expect(calls('/api/quote/state')).toHaveLength(30)
  })

  it('a dead link (404) stops the polling after one refresh (the page then shows the invalid view)', async () => {
    stateAnswer = () => json(404, { error: 'invalid_link' })
    mount()
    await tick(0)
    await pay()
    await tick(2000)
    await tick(2000 * 5)
    expect(calls('/api/quote/state')).toHaveLength(1)
    expect(h.refreshMock).toHaveBeenCalledTimes(1)
  })

  it('unmounting (the page now shows the paid sentence) stops the polling', async () => {
    const { unmount } = mount()
    await tick(0)
    await pay()
    await tick(2000)
    unmount()
    await tick(2000 * 5)
    expect(calls('/api/quote/state')).toHaveLength(1)
  })
})

describe('QuoteRemainderPay: source', () => {
  const source = readFileSync(join(process.cwd(), 'app/[locale]/quote/[token]/QuoteRemainderPay.tsx'), 'utf8')

  it('calls the remainder endpoint once, stores nothing in the browser and builds no amount of its own', () => {
    expect((source.match(/\/api\/quote\/remainder/g) ?? []).length).toBe(1)
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
    expect(source).not.toMatch(/formatMinor|Intl\.NumberFormat/)
  })
})
