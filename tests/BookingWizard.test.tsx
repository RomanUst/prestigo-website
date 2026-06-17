import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useBookingStore } from '@/lib/booking-store'
import BookingWizard from '@/components/booking/BookingWizard'

// Helper: mock next/navigation (router) since BookingWizard uses useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Prevent next/image from throwing in jsdom
vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _fill, ...rest }: { src: string; alt: string; fill?: boolean; [key: string]: unknown }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />,
}))

function setupStep2State(overrides: Record<string, unknown> = {}) {
  // Prevent BookingWizard mount effect from resetting to step 1
  sessionStorage.setItem('booking_deeplink', '1')
  useBookingStore.setState({
    tripType: 'transfer',
    pickupDate: null,
    pickupTime: null,
    returnDate: null,
    returnTime: null,
    currentStep: 2,
    completedSteps: new Set([1]),
    origin: null,
    destination: null,
    vehicleClass: null,
    passengerDetails: null,
    ...overrides,
  })
}

function getContinueButton() {
  // BookingWizard renders both a desktop and mobile Continue button; pick the first
  return screen.getAllByRole('button', { name: /continue/i })[0]
}

describe('BookingWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('gtag', vi.fn())
  })

  describe('WIZD-01: wizard renders on /book', () => {
    it.todo('renders BookingWizard with ProgressBar')
    it.todo('renders step content for currentStep')
  })

  describe('WIZD-04: Back navigation', () => {
    it.todo('Back button hidden on step 1')
    it.todo('Back button visible on step 2+')
    it.todo('clicking Back decrements currentStep')
  })

  describe('WIZD-05: step transitions', () => {
    it.todo('step container has animate-step-enter class')
    it.todo('step container uses key={currentStep} for remount')
  })

  describe('WIZD-06: canProceed case 2 — vehicle selection guard (5-step wizard)', () => {
    beforeEach(() => {
      setupStep2State()
    })

    it('Continue is disabled when no vehicle class is selected at step 2', () => {
      setupStep2State({ vehicleClass: null })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).toBeDisabled()
    })

    it('Continue is enabled when a vehicle class is selected at step 2 (transfer)', () => {
      setupStep2State({ vehicleClass: 'business', tripType: 'transfer' })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).not.toBeDisabled()
    })

    it('Continue is enabled when vehicleClass is first_class (transfer)', () => {
      setupStep2State({ vehicleClass: 'first_class', tripType: 'transfer' })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).not.toBeDisabled()
    })

    it('Continue is enabled for round_trip when vehicleClass + returnDate + returnTime set', () => {
      setupStep2State({
        tripType: 'round_trip',
        vehicleClass: 'business',
        returnDate: '2026-05-11',
        returnTime: '15:00',
      })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).not.toBeDisabled()
    })

    it('Continue is disabled for round_trip when returnTime is missing', () => {
      setupStep2State({
        tripType: 'round_trip',
        vehicleClass: 'business',
        returnDate: '2026-05-11',
        returnTime: null,
      })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).toBeDisabled()
    })
  })

  describe('WIZD-07: 5-step renumber — ProgressBar and EntryBar', () => {
    it('ProgressBar reports 5 steps total', () => {
      sessionStorage.setItem('booking_deeplink', '1')
      useBookingStore.setState({ currentStep: 1, completedSteps: new Set([]) })
      render(<BookingWizard />)
      // ProgressBar aria-label includes "of 5"
      const nav = screen.getByRole('navigation')
      expect(nav).toHaveAttribute('aria-label', expect.stringContaining('of 5'))
    })

    it('step 1 mounts EntryBar (renders CTA "Посмотреть варианты")', () => {
      sessionStorage.setItem('booking_deeplink', '1')
      useBookingStore.setState({ currentStep: 1, completedSteps: new Set([]) })
      render(<BookingWizard />)
      expect(screen.getByText('Посмотреть варианты')).toBeInTheDocument()
    })
  })

  describe('WIZD-08: analytics step names locked', () => {
    it('checkout_progress fires with step_name "entry_bar" at step 1', () => {
      sessionStorage.setItem('booking_deeplink', '1')
      useBookingStore.setState({ currentStep: 1, completedSteps: new Set([]) })
      render(<BookingWizard />)
      const gtagFn = window.gtag as ReturnType<typeof vi.fn>
      const progressCalls = gtagFn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'event' && call[1] === 'checkout_progress'
      )
      expect(progressCalls.length).toBeGreaterThanOrEqual(1)
      const step1Call = progressCalls.find(
        (call: unknown[]) => (call[2] as Record<string, unknown>)?.checkout_step === 1
      )
      expect(step1Call).toBeDefined()
      expect((step1Call![2] as Record<string, unknown>).step_name).toBe('entry_bar')
    })

    it('checkout_progress fires with step_name "vehicle" at step 2', () => {
      sessionStorage.setItem('booking_deeplink', '1')
      useBookingStore.setState({
        currentStep: 2,
        completedSteps: new Set([1]),
        vehicleClass: null,
      })
      render(<BookingWizard />)
      const gtagFn = window.gtag as ReturnType<typeof vi.fn>
      const progressCalls = gtagFn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'event' && call[1] === 'checkout_progress'
      )
      const step2Call = progressCalls.find(
        (call: unknown[]) => (call[2] as Record<string, unknown>)?.checkout_step === 2
      )
      expect(step2Call).toBeDefined()
      expect((step2Call![2] as Record<string, unknown>).step_name).toBe('vehicle')
    })
  })
})
