import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useBookingStore } from '@/lib/booking-store'
import BookingWizard from '@/components/booking/BookingWizard'

// Helper: mock next/navigation (router) since BookingWizard uses useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

  describe('WIZD-06: canProceed case 2 — round_trip guard', () => {
    beforeEach(() => {
      setupStep2State()
    })

    it('returns false for round_trip when returnTime is null (all other fields set)', () => {
      setupStep2State({
        tripType: 'round_trip',
        pickupDate: '2026-05-10',
        pickupTime: '14:00',
        returnDate: '2026-05-11',
        returnTime: null,
      })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).toBeDisabled()
    })

    it('returns false for round_trip when returnDatetime <= pickupDatetime (same day, return earlier)', () => {
      setupStep2State({
        tripType: 'round_trip',
        pickupDate: '2026-05-10',
        pickupTime: '14:00',
        returnDate: '2026-05-10',
        returnTime: '14:00', // equal — not strictly after
      })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).toBeDisabled()
    })

    it('returns true for round_trip when all fields set and returnDatetime > pickupDatetime', () => {
      setupStep2State({
        tripType: 'round_trip',
        pickupDate: '2026-05-10',
        pickupTime: '14:00',
        returnDate: '2026-05-10',
        returnTime: '15:00', // strictly after
      })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).not.toBeDisabled()
    })

    it('returns true for round_trip transfer when pickupDate and pickupTime are set (returnTime irrelevant)', () => {
      setupStep2State({
        tripType: 'transfer',
        pickupDate: '2026-05-10',
        pickupTime: '14:00',
        returnTime: null, // no return time needed for transfer
      })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).not.toBeDisabled()
    })

    it('returns true for daily when pickupDate + pickupTime + returnDate are set (returnTime irrelevant)', () => {
      setupStep2State({
        tripType: 'daily',
        pickupDate: '2026-05-10',
        pickupTime: '09:00',
        returnDate: '2026-05-12',
        returnTime: null, // no return time needed for daily
      })
      render(<BookingWizard />)
      const continueBtn = getContinueButton()
      expect(continueBtn).not.toBeDisabled()
    })
  })
})
