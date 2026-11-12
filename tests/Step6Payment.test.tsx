import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, waitFor, fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import ruMessagesRaw from '@/messages/ru.json'
import hiMessagesRaw from '@/messages/hi.json'

const ruMessages = ruMessagesRaw as unknown as AbstractIntlMessages
const hiMessages = hiMessagesRaw as unknown as AbstractIntlMessages

// ---------------------------------------------------------------------------
// vi.hoisted — stubs referenced inside vi.mock factories below
// ---------------------------------------------------------------------------

const { elementsOptionsCapture, confirmPaymentMock, onReadyRef } = vi.hoisted(() => {
  const elementsOptionsCapture: Array<Record<string, unknown> | null> = []
  const confirmPaymentMock = vi.fn().mockResolvedValue({
    error: null,
    paymentIntent: { status: 'succeeded' },
  })
  const onReadyRef: { current: (() => void) | null } = { current: null }
  return { elementsOptionsCapture, confirmPaymentMock, onReadyRef }
})

// Local override of the global tests/setup.ts mock — that one drops `options`
// entirely, which hides exactly the prop (Stripe Elements `locale`) this
// suite exists to assert on.
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children, options }: { children: ReactNode; options: Record<string, unknown> | null }) => {
    elementsOptionsCapture.push(options)
    return children
  },
  PaymentElement: (props: { onReady?: () => void }) => {
    onReadyRef.current = props.onReady ?? null
    return null
  },
  useStripe: () => ({ confirmPayment: confirmPaymentMock }),
  useElements: () => ({}),
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/analytics-snapshot', () => ({
  writePurchaseSnapshot: vi.fn(),
}))

const { storeRef } = vi.hoisted(() => {
  const storeRef = {
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
      pickupDate: '2026-06-01',
      pickupTime: '10:00',
      stops: [] as Array<{ id: string; place: { address: string; lat: number; lng: number; placeId: string } | null; waitMinutes?: number }>,
      landingDate: null as string | null,
      landingTime: null as string | null,
      pickupOffsetMin: 30,
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
      attemptId: 'attempt-test-1',
      setAttemptId: vi.fn(),
      goToStep: vi.fn(),
    },
  }
  return { storeRef }
})

vi.mock('@/lib/booking-store', () => {
  const useBookingStore = (selector: (s: typeof storeRef.current) => unknown) => selector(storeRef.current)
  useBookingStore.getState = () => storeRef.current
  return { useBookingStore }
})

import Step6Payment from '@/components/booking/steps/Step6Payment'

function mockCreatePaymentIntentFetch(bookingReference = 'PRG-20260101-ABC123') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      clientSecret: 'pi_test_secret',
      bookingReference,
      returnBookingReference: '',
    }),
  } as Response)
}

beforeEach(() => {
  vi.clearAllMocks()
  storeRef.current.stops = []
  storeRef.current.landingDate = null
  storeRef.current.landingTime = null
  storeRef.current.pickupOffsetMin = 30
  storeRef.current.tripType = 'transfer'
  storeRef.current.pickupDate = '2026-06-01'
  storeRef.current.pickupTime = '10:00'
  elementsOptionsCapture.length = 0
  onReadyRef.current = null
  confirmPaymentMock.mockResolvedValue({ error: null, paymentIntent: { status: 'succeeded' } })
  mockCreatePaymentIntentFetch()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('D-07: Step6Payment Stripe Elements locale follows the site locale', () => {
  it('locale "ru" -> Elements receives options.locale "ru"', async () => {
    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    await waitFor(() => {
      const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
      expect(last).not.toBeNull()
    })

    const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
    expect(last?.locale).toBe('ru')
  })

  it('locale "hi" -> Elements receives options.locale "auto" (Stripe has no Hindi)', async () => {
    render(<Step6Payment />, { locale: 'hi', messages: hiMessages })

    await waitFor(() => {
      const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
      expect(last).not.toBeNull()
    })

    const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
    expect(last?.locale).toBe('auto')
  })

  it('locale "en" -> Elements receives options.locale "en"', async () => {
    render(<Step6Payment />, { locale: 'en' })

    await waitFor(() => {
      const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
      expect(last).not.toBeNull()
    })

    const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
    expect(last?.locale).toBe('en')
  })
})

describe('D-07: Step6Payment Stripe return_url keeps the booking locale', () => {
  it('locale "ru" -> confirmPayment return_url is origin + /ru/book/confirmation?ref=...', async () => {
    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    await waitFor(() => {
      expect(onReadyRef.current).not.toBeNull()
    })
    act(() => { onReadyRef.current?.() })

    const button = await waitFor(() => {
      const el = document.querySelector('button[type="submit"]')
      if (!el) throw new Error('submit button not found yet')
      return el as HTMLButtonElement
    })
    await waitFor(() => expect(button).not.toBeDisabled())
    fireEvent.click(button)

    await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(1))
    const callArg = confirmPaymentMock.mock.calls[0][0]
    expect(callArg.confirmParams.return_url).toBe(
      `${window.location.origin}/ru/book/confirmation?ref=PRG-20260101-ABC123`
    )
  })

  it('locale "en" -> confirmPayment return_url has no locale prefix', async () => {
    render(<Step6Payment />, { locale: 'en' })

    await waitFor(() => {
      expect(onReadyRef.current).not.toBeNull()
    })
    act(() => { onReadyRef.current?.() })

    const button = await waitFor(() => {
      const el = document.querySelector('button[type="submit"]')
      if (!el) throw new Error('submit button not found yet')
      return el as HTMLButtonElement
    })
    await waitFor(() => expect(button).not.toBeDisabled())
    fireEvent.click(button)

    await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(1))
    const callArg = confirmPaymentMock.mock.calls[0][0]
    expect(callArg.confirmParams.return_url).toBe(
      `${window.location.origin}/book/confirmation?ref=PRG-20260101-ABC123`
    )
  })
})

describe('D-07: Step6Payment shows translated errors keyed by the server code, never raw English text', () => {
  it('LEAD_TIME code under ru -> shows the ru LEAD_TIME catalog message, not the English server text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        error: 'Bookings must be made at least 12 hours in advance.',
        code: 'LEAD_TIME',
      }),
    } as Response)

    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    const expected = (ruMessagesRaw as { Booking: { step6: { errors: { LEAD_TIME: string } } } })
      .Booking.step6.errors.LEAD_TIME

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('Bookings must be made at least 12 hours in advance.')).toBeNull()
  })

  it('missing code under ru -> falls back to the ru paymentInitFailed generic message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Something server-side went wrong.' }),
    } as Response)

    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    const expected = (ruMessagesRaw as { Booking: { step6: { paymentInitFailed: string } } })
      .Booking.step6.paymentInitFailed

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('Something server-side went wrong.')).toBeNull()
  })

  it('unknown code "SOMETHING_NEW" under ru -> falls back to the ru paymentInitFailed generic message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        error: 'A brand new server error string.',
        code: 'SOMETHING_NEW',
      }),
    } as Response)

    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    const expected = (ruMessagesRaw as { Booking: { step6: { paymentInitFailed: string } } })
      .Booking.step6.paymentInitFailed

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('A brand new server error string.')).toBeNull()
  })
})

describe('WR-07: Step6Payment maps a server INVALID_PHONE (422) back to the phone field', () => {
  it('INVALID_PHONE under ru -> goes back to step 5 and never shows the generic init failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'Phone must include the country code', code: 'INVALID_PHONE' }),
    } as Response)

    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    await waitFor(() => {
      expect(storeRef.current.goToStep).toHaveBeenCalledWith(5)
    })
    const generic = (ruMessagesRaw as { Booking: { step6: { paymentInitFailed: string } } })
      .Booking.step6.paymentInitFailed
    expect(screen.queryByText(generic)).toBeNull()
  })
})

describe('D-07: Step6Payment promo error shows translated message keyed by the server code', () => {
  it('PROMO_INVALID code under ru -> shows the ru PROMO_INVALID catalog message', async () => {
    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    await waitFor(() => {
      const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
      expect(last).not.toBeNull()
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        valid: false,
        error: 'Promo code is invalid, expired, or has reached its usage limit.',
        code: 'PROMO_INVALID',
      }),
    } as Response)

    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'BADCODE' } })
    const applyButton = screen.getByText('Применить код')
    fireEvent.click(applyButton)

    const expected = (ruMessagesRaw as { Booking: { step6: { errors: { PROMO_INVALID: string } } } })
      .Booking.step6.errors.PROMO_INVALID

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('Promo code is invalid, expired, or has reached its usage limit.')).toBeNull()
  })

  it('unknown code under ru -> falls back to the ru promoInvalid generic message', async () => {
    render(<Step6Payment />, { locale: 'ru', messages: ruMessages })

    await waitFor(() => {
      const last = elementsOptionsCapture[elementsOptionsCapture.length - 1]
      expect(last).not.toBeNull()
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ valid: false, error: 'Some new server text.', code: 'UNKNOWN_XYZ' }),
    } as Response)

    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'WHATEVER' } })
    const applyButton = screen.getByText('Применить код')
    fireEvent.click(applyButton)

    const expected = (ruMessagesRaw as { Booking: { step6: { promoInvalid: string } } })
      .Booking.step6.promoInvalid

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeTruthy()
    })
    expect(screen.queryByText('Some new server text.')).toBeNull()
  })
})

describe('Phase 89 (D-18): cancellation note and acceptance line on the pay-now step', () => {
  const policy = {
    version: '2026-11-1',
    freeUntilIso: '2026-05-31T08:30:00.000Z',
    freeUntilPassed: false,
    hours: 24,
    percent: 100,
    feeMinor: 10000,
    waitMin: 45,
  }

  it('no policy: no note, no acceptance line, the step renders as before Phase 89', async () => {
    const { container } = render(<Step6Payment />, { locale: 'en' })
    await waitFor(() => expect(onReadyRef.current).not.toBeNull())
    expect(screen.queryByTestId('cancellation-note')).toBeNull()
    expect(screen.queryByTestId('cancellation-acceptance')).toBeNull()
    expect(screen.queryByText('CANCELLATION')).toBeNull()
    expect(container.textContent).not.toContain('Free cancellation')
    expect(container.textContent).not.toContain('By paying, you accept')
    // the explicit null the gate passes for a client with nothing public behaves the same
    const second = render(<Step6Payment policy={null} />, { locale: 'en' })
    expect(second.container.querySelector('[data-testid="cancellation-note"]')).toBeNull()
  })

  it('with a policy: the note sits between the currency selector and the payment form, the acceptance line directly above the pay button', async () => {
    const { container } = render(<Step6Payment policy={policy} />, { locale: 'en' })
    await waitFor(() => expect(container.querySelector('button[type="submit"]')).not.toBeNull())

    const note = screen.getByTestId('cancellation-note')
    expect(note.textContent).toContain('Free cancellation until')
    expect(note.textContent).toContain('After that, 100% of the fare (€100) applies.')

    const acceptance = screen.getByTestId('cancellation-acceptance')
    expect(acceptance.textContent).toBe('By paying, you accept the cancellation terms above and our Terms & Conditions.')
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement
    const order = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const secure = screen.getByText('SECURE PAYMENT')
    expect(order(note, secure)).toBe(true)
    expect(order(secure, acceptance)).toBe(true)
    expect(order(acceptance, submit)).toBe(true)
    // directly above the button: nothing but the acceptance line sits between the form fields and the button
    expect(submit.previousElementSibling).toBe(acceptance)
  })

  it('the CZK toggle shows the fee in CZK', async () => {
    const { container } = render(<Step6Payment policy={policy} />, { locale: 'en' })
    await waitFor(() => expect(container.querySelector('button[type="submit"]')).not.toBeNull())
    fireEvent.click(screen.getByText('CZK — Kč'))
    expect(screen.getByTestId('cancellation-note').textContent).toContain('Kč')
    expect(screen.getByTestId('cancellation-note').textContent).not.toContain('€')
  })

  it('still creates the payment intent and confirms payment as before (no consent gate on pay-now)', async () => {
    render(<Step6Payment policy={policy} />, { locale: 'en' })
    await waitFor(() => expect(onReadyRef.current).not.toBeNull())
    act(() => { onReadyRef.current?.() })
    const button = await waitFor(() => {
      const el = document.querySelector('button[type="submit"]')
      if (!el) throw new Error('submit button not found yet')
      return el as HTMLButtonElement
    })
    await waitFor(() => expect(button).not.toBeDisabled())
    fireEvent.click(button)
    await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(1))
  })
})

describe('STEP6-01: Full booking summary shown before card input', () => {
  it.todo('renders route origin and destination from store')
  it.todo('renders pickup date and time from store')
  it.todo('renders vehicle class and passenger count from store')
  it.todo('renders extras list with prices when extras are selected')
  it.todo('renders total in CZK with EUR equivalent')
})

describe('STEP6-02: Stripe Payment Element rendered', () => {
  it.todo('renders PaymentElement component')
  it.todo('renders SECURE PAYMENT label above payment element')
})

describe('STEP6-03: Pay button creates PaymentIntent and confirms payment', () => {
  it.todo('calls /api/create-payment-intent on mount')
  it.todo('calls stripe.confirmPayment on Pay button click')
})

describe('STEP6-04: Pay button disabled immediately on click', () => {
  it.todo('Pay button is disabled while processing')
  it.todo('Pay button has aria-disabled=true while processing')
  it.todo('Pay button has opacity 0.4 while processing')
})

describe('STEP6-05: Payment error displayed inline with retry', () => {
  it.todo('shows error message below Payment Element on confirmPayment error')
  it.todo('re-enables Pay button after error')
  it.todo('booking data in store is not cleared on error')
})

describe('STEP6-06: Redirect to /book/confirmation on success', () => {
  it.todo('confirmPayment is called with return_url containing /book/confirmation')
})

describe('STEP6-RT: Round-trip Step 6 support', () => {
  it.todo('STEP6-RT-COMBINED-TOTAL: totalEur equals outbound + return when tripType=round_trip')
  it.todo('STEP6-RT-RETURNTIME-IN-BODY: fetch body contains returnTime for round_trip')
  it.todo('STEP6-RT-DISCOUNT-COMBINED: discountedTotalEur applies promo to combined total, not just outbound')
  it.todo('STEP6-RT-PROMO-PERSIST: promoCode survives a store rehydrate (partialize)')
})

describe('Phase 91: the pay-now body carries stops and the landing (STOP-01, STOP-04, STOP-05)', () => {
  const stop = { id: 's1', place: { address: 'Karlstejn', lat: 50.05, lng: 14.4, placeId: 'p1' }, waitMinutes: 45 }

  async function sentBookingData(): Promise<Record<string, unknown>> {
    render(<Step6Payment />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === '/api/create-payment-intent')
    return (JSON.parse(String(call![1].body)) as { bookingData: Record<string, unknown> }).bookingData
  }

  it('a transfer from the airport with a stop and a landing sends them, with the derived pickup', async () => {
    storeRef.current.stops = [stop, { id: 's2', place: null, waitMinutes: 0 }]
    storeRef.current.landingDate = '2027-06-10'
    storeRef.current.landingTime = '14:00'
    storeRef.current.pickupOffsetMin = 30
    storeRef.current.pickupDate = '2027-06-10'
    storeRef.current.pickupTime = '14:30'
    const bd = await sentBookingData()
    expect(bd.stops).toEqual([{ address: 'Karlstejn', lat: 50.05, lng: 14.4, waitMinutes: 45 }])
    expect(bd.landingDate).toBe('2027-06-10')
    expect(bd.landingTime).toBe('14:00')
    expect(bd.pickupOffsetMin).toBe('30')
    expect(bd.pickupTime).toBe('14:30')
  })

  it('a round trip sends no stops key and no landing keys for a city pickup', async () => {
    storeRef.current.tripType = 'round_trip'
    storeRef.current.origin = { address: 'Wenceslas Square, Prague', lat: 50.0813, lng: 14.4274, placeId: 'city' }
    storeRef.current.stops = [stop]
    const bd = await sentBookingData()
    storeRef.current.origin = { address: 'Prague Airport', lat: 50.1, lng: 14.26, placeId: 'origin-place' }
    expect(bd).not.toHaveProperty('stops')
    expect(bd).not.toHaveProperty('landingDate')
    expect(bd).not.toHaveProperty('pickupOffsetMin')
  })

  it.each(['hourly', 'daily'] as const)('%s sends no stops key and no landing keys', async (tripType) => {
    storeRef.current.tripType = tripType
    storeRef.current.stops = [stop]
    storeRef.current.landingDate = '2027-06-10'
    storeRef.current.landingTime = '14:00'
    const bd = await sentBookingData()
    expect(bd).not.toHaveProperty('stops')
    expect(bd).not.toHaveProperty('landingDate')
    expect(bd).not.toHaveProperty('landingTime')
    expect(bd).not.toHaveProperty('pickupOffsetMin')
  })
})
