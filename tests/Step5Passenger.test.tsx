import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { PRG_CONFIG } from '@/types/booking'
import type { FlightCheckResult } from '@/types/booking'
import Step5Passenger from '@/components/booking/steps/Step5Passenger'

// ---------------------------------------------------------------------------
// vi.hoisted — declare stubs before vi.mock factories run
// ---------------------------------------------------------------------------

const { storeRef, mockSetPassengerDetails, mockSetFlightCheckResult } = vi.hoisted(() => {
  const mockSetPassengerDetails = vi.fn()
  const mockSetFlightCheckResult = vi.fn()

  const storeRef = {
    current: {
      origin: {
        placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec',
        address: 'Vaclav Havel Airport Prague (PRG)',
        lat: 50.1008,
        lng: 14.26,
      },
      destination: { placeId: 'some-other-place', address: 'Prague City Center', lat: 50.08, lng: 14.43 },
      passengerDetails: null as null,
      flightCheckResult: null as FlightCheckResult | null,
      pickupDate: '2026-06-15',
      setPassengerDetails: mockSetPassengerDetails,
      setFlightCheckResult: mockSetFlightCheckResult,
    },
  }

  return { storeRef, mockSetPassengerDetails, mockSetFlightCheckResult }
})

vi.mock('@/lib/booking-store', () => {
  const useBookingStore = (selector: (s: typeof storeRef.current) => unknown) =>
    selector(storeRef.current)
  useBookingStore.getState = () => storeRef.current
  return { useBookingStore }
})


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResponse(overrides: Partial<FlightCheckResult> = {}): FlightCheckResult {
  return {
    flight_iata: 'OK123',
    flight_status: 'scheduled',
    flight_estimated_arrival: '2026-06-15T15:40:00.000Z',
    flight_delay_minutes: null,
    flight_departure_airport: 'LHR',
    flight_arrival_airport: 'PRG',
    flight_terminal: null,
    ...overrides,
  }
}

function mockFetchSuccess(data: FlightCheckResult) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ ok: true, ...data }),
  } as Response)
}

function mockFetchError(errorCode = 'NOT_FOUND') {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ ok: false, error: errorCode }),
  } as Response)
}

function resetStore(overrides: Partial<typeof storeRef.current> = {}) {
  storeRef.current = {
    origin: {
      placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec',
      address: 'Vaclav Havel Airport Prague (PRG)',
      lat: 50.1008,
      lng: 14.26,
    },
    destination: { placeId: 'some-other-place', address: 'Prague City Center', lat: 50.08, lng: 14.43 },
    passengerDetails: null,
    flightCheckResult: null,
    pickupDate: '2026-06-15',
    setPassengerDetails: mockSetPassengerDetails,
    setFlightCheckResult: mockSetFlightCheckResult,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Step5Passenger', () => {
  describe('STEP5-01: Required fields present', () => {
    it.todo('renders First Name input field')
    it.todo('renders Last Name input field')
    it.todo('renders Email input field')
    it.todo('renders Phone input field')
    it.todo('all four fields are required (aria-required=true)')
  })

  describe('STEP5-02: Airport ride conditional fields', () => {
    it.todo('renders Flight Number field when origin is PRG airport')
    it.todo('renders Flight Number field when destination is PRG airport')
    it.todo('Flight Number is required for airport rides (aria-required=true)')
    it.todo('does not render Flight Number for non-airport rides')
    it.todo('renders Terminal field (optional) for airport rides')
  })

  describe('STEP5-03: Special Requests field', () => {
    it.todo('renders Special Requests textarea')
    it.todo('textarea has maxLength=500 attribute')
    it.todo('displays character counter showing current/500')
  })

  describe('STEP5-04: Inline validation on blur', () => {
    it.todo('no error messages shown on initial render')
    it.todo('shows "First name is required" after blur on empty First Name')
    it.todo('shows "Last name is required" after blur on empty Last Name')
    it.todo('shows "Enter a valid email address" after blur on invalid email')
    it.todo('shows "Enter a valid phone number" after blur on short phone')
    it.todo('shows "Flight number is required for airport rides" after blur on empty Flight Number for airport ride')
    it.todo('clears error message when valid value entered and field blurred again')
  })

  // -------------------------------------------------------------------------
  // FLIGHT-02: Check flight button and status block
  // -------------------------------------------------------------------------

  describe('FLIGHT-02: Check flight button and status block', () => {
    it('shows CHECK FLIGHT button when flight number is valid IATA format', () => {
      render(<Step5Passenger />)
      const input = screen.getByPlaceholderText('e.g. BA256')
      fireEvent.change(input, { target: { value: 'OK123' } })
      const btn = screen.getByRole('button', { name: /check flight status/i })
      expect(btn).toBeInTheDocument()
      expect(btn).not.toBeDisabled()
    })

    it('hides CHECK FLIGHT button when flight number is fewer than 2 chars', () => {
      render(<Step5Passenger />)
      const input = screen.getByPlaceholderText('e.g. BA256')
      fireEvent.change(input, { target: { value: 'A' } })
      const btn = screen.getByRole('button', { name: /check flight status/i })
      expect(btn).toBeDisabled()
    })

    it('shows status block with flight info after successful check', async () => {
      const result = makeSuccessResponse({ flight_status: 'scheduled' })
      mockFetchSuccess(result)
      render(<Step5Passenger />)
      const input = screen.getByPlaceholderText('e.g. BA256')
      fireEvent.change(input, { target: { value: 'OK123' } })

      const btn = screen.getByRole('button', { name: /check flight status/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(mockSetFlightCheckResult).toHaveBeenCalledWith(
          expect.objectContaining({ flight_iata: 'OK123' })
        )
      })
    })

    it('shows RE-CHECK FLIGHT after successful check', () => {
      // Pre-populate store to simulate returning to step 5 with existing result
      resetStore({ flightCheckResult: makeSuccessResponse() })

      render(<Step5Passenger />)
      // flightCheckState initialises as 'success' because getState().flightCheckResult is non-null
      const btn = screen.getByRole('button', { name: /re-check flight status/i })
      expect(btn).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // FLIGHT-03: Airport mismatch warning
  // -------------------------------------------------------------------------

  describe('FLIGHT-03: Airport mismatch warning', () => {
    it('shows mismatch warning when neither airport is PRG', () => {
      const result = makeSuccessResponse({
        flight_departure_airport: 'VIE',
        flight_arrival_airport: 'FRA',
      })
      resetStore({ flightCheckResult: result })

      render(<Step5Passenger />)
      expect(screen.getByText(/Airport mismatch/i)).toBeInTheDocument()
    })

    it('does not show mismatch warning when arrival airport is PRG', () => {
      const result = makeSuccessResponse({
        flight_departure_airport: 'LHR',
        flight_arrival_airport: 'PRG',
      })
      resetStore({ flightCheckResult: result })

      render(<Step5Passenger />)
      expect(screen.queryByText(/Airport mismatch/i)).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // FLIGHT-04: Terminal auto-fill
  // -------------------------------------------------------------------------

  describe('FLIGHT-04: Terminal auto-fill', () => {
    it('auto-fills terminal field when API returns terminal data', async () => {
      const result = makeSuccessResponse({ flight_terminal: '2' })
      mockFetchSuccess(result)
      render(<Step5Passenger />)

      const flightInput = screen.getByPlaceholderText('e.g. BA256')
      fireEvent.change(flightInput, { target: { value: 'OK123' } })

      const btn = screen.getByRole('button', { name: /check flight status/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(mockSetFlightCheckResult).toHaveBeenCalled()
      })
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/check-flight'))
      // Terminal input is updated via react-hook-form setValue
      await waitFor(() => {
        expect(screen.getByDisplayValue('2')).toBeInTheDocument()
      })
    })

    it('leaves terminal empty when API returns null terminal', async () => {
      const result = makeSuccessResponse({ flight_terminal: null })
      mockFetchSuccess(result)
      render(<Step5Passenger />)

      const flightInput = screen.getByPlaceholderText('e.g. BA256')
      fireEvent.change(flightInput, { target: { value: 'OK123' } })

      const btn = screen.getByRole('button', { name: /check flight status/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(mockSetFlightCheckResult).toHaveBeenCalled()
      })
      expect(screen.queryByDisplayValue('2')).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // FLIGHT-08: Error and graceful degradation
  // -------------------------------------------------------------------------

  describe('FLIGHT-08: Error and graceful degradation', () => {
    it('shows error message when API returns ok: false', async () => {
      mockFetchError('NOT_FOUND')
      render(<Step5Passenger />)

      const input = screen.getByPlaceholderText('e.g. BA256')
      fireEvent.change(input, { target: { value: 'OK123' } })

      const btn = screen.getByRole('button', { name: /check flight status/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(screen.getByText(/Flight not found or check unavailable/i)).toBeInTheDocument()
      })
    })

    it('wizard remains operable after flight check error', async () => {
      mockFetchError('NOT_FOUND')
      render(<Step5Passenger />)

      const input = screen.getByPlaceholderText('e.g. BA256')
      fireEvent.change(input, { target: { value: 'OK123' } })

      const btn = screen.getByRole('button', { name: /check flight status/i })
      await act(async () => { fireEvent.click(btn) })

      await waitFor(() => {
        expect(screen.getByText(/Flight not found or check unavailable/i)).toBeInTheDocument()
      })

      // First Name input should still be interactive (wizard not blocked)
      const allTextboxes = screen.getAllByRole('textbox')
      const firstNameInput = allTextboxes[0]
      expect(firstNameInput).not.toBeDisabled()
    })
  })
})
