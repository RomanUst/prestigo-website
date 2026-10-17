import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import { useBookingStore } from '@/lib/booking-store'
import BookingWizard from '@/components/booking/BookingWizard'

// WR-07: the step-5 Continue button must not unlock on a phone the server will
// refuse (national format, no country code) — otherwise the customer reaches
// Step 6 and only then meets a 422 INVALID_PHONE.

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      return chain
    }),
  }),
}))

vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>()
  return { ...actual, useRouter: () => ({ push: vi.fn() }) }
})

vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _fill, ...rest }: { src: string; alt: string; fill?: boolean; [key: string]: unknown }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />,
}))

function setupStep5(phone: string) {
  sessionStorage.setItem('booking_deeplink', '1')
  useBookingStore.setState({
    tripType: 'transfer',
    pickupDate: '2026-06-15',
    pickupTime: '10:00',
    currentStep: 5,
    completedSteps: new Set([1, 2, 3, 4]),
    origin: { placeId: 'o', address: 'Prague', lat: 50.08, lng: 14.43 },
    destination: { placeId: 'd', address: 'Vienna', lat: 48.2, lng: 16.37 },
    vehicleClass: 'business',
    passengerDetails: {
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone,
      flightNumber: '', terminal: '', specialRequests: '',
    },
  })
}

describe('BookingWizard step 5 phone gate', () => {
  beforeEach(() => {
    vi.stubGlobal('gtag', vi.fn())
  })

  it('keeps Continue disabled while the phone has no country code', () => {
    setupStep5('725123456')
    render(<BookingWizard />)
    const buttons = screen.getAllByRole('button', { name: /^continue$/i })
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((b) => expect(b).toBeDisabled())
  })

  it('enables Continue for a valid international phone', () => {
    setupStep5('+420725123456')
    render(<BookingWizard />)
    const buttons = screen.getAllByRole('button', { name: /^continue$/i })
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((b) => expect(b).toBeEnabled())
  })
})
