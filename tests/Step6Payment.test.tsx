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
