import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useBookingStore } from '@/lib/booking-store'
import type { PlaceResult } from '@/types/booking'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock Google Maps loader (avoid real API calls in tests)
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue({}),
  Loader: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue({}),
  })),
}))

// Track AddressInput onSelect callbacks for test control
let capturedOnSelect: Map<string, (place: PlaceResult) => void> = new Map()

// Mock AddressInput — renders a simple input that fires onSelect via data-testid
vi.mock('@/components/booking/AddressInput', () => ({
  default: ({ ariaLabel, onSelect, value }: {
    ariaLabel: string
    onSelect: (place: PlaceResult) => void
    value: PlaceResult | null
    label: string
    placeholder: string
    onClear: () => void
    hasError?: boolean
  }) => {
    // Capture the onSelect callback so tests can call it
    capturedOnSelect.set(ariaLabel, onSelect)
    return (
      <div>
        <input
          aria-label={ariaLabel}
          data-testid={`address-input-${ariaLabel.toLowerCase().replace(/\s+/g, '-')}`}
          value={value?.address ?? ''}
          readOnly
        />
      </div>
    )
  },
}))

// Mock TripTypeTabs — renders a simple tablist
vi.mock('@/components/booking/TripTypeTabs', () => ({
  default: () => (
    <div role="tablist" aria-label="Trip type">
      <button role="tab" aria-selected={true}>Transfer</button>
    </div>
  ),
}))

// Mock DurationSelector
vi.mock('@/components/booking/DurationSelector', () => ({
  default: () => (
    <div>
      <button aria-label="1 hours">1h</button>
      <button aria-label="2 hours">2h</button>
    </div>
  ),
}))

// Import BookingWidget after mocks
import BookingWidget from '@/components/booking/BookingWidget'

// Helper: mock PlaceResult values
const mockOrigin: PlaceResult = { address: '123 Test St', placeId: 'place-1', lat: 50.08, lng: 14.44 }
const mockDest: PlaceResult = { address: '456 End Ave', placeId: 'place-2', lat: 50.1, lng: 14.5 }

function resetStore() {
  useBookingStore.setState({
    tripType: 'transfer',
    origin: null,
    destination: null,
    hours: 2,
    passengers: 1,
    luggage: 0,
    currentStep: 1,
    completedSteps: new Set<number>(),
    pickupDate: null,
    pickupTime: null,
  })
  mockPush.mockClear()
  capturedOnSelect.clear()
}

describe('HOME-01: BookingWidget renders on the homepage', () => {
  beforeEach(() => {
    resetStore()
  })

  it('renders BookingWidget without crashing', () => {
    render(<BookingWidget />)
    expect(screen.getByRole('button', { name: /BOOK NOW/i })).toBeInTheDocument()
  })

  it('renders the trip type tablist', () => {
    render(<BookingWidget />)
    expect(screen.getByRole('tablist', { name: /trip type/i })).toBeInTheDocument()
  })
})

describe('HOME-02: Widget renders required form fields', () => {
  beforeEach(() => {
    resetStore()
  })

  it('renders a date input', () => {
    render(<BookingWidget />)
    const dateInput = document.querySelector('input[type="date"]')
    expect(dateInput).toBeTruthy()
  })

  it('renders a time input with step=900', () => {
    render(<BookingWidget />)
    const timeInput = document.querySelector('input[type="time"]')
    expect(timeInput).toBeTruthy()
    expect((timeInput as HTMLInputElement).step).toBe('900')
  })

  it('renders Book Now button', () => {
    render(<BookingWidget />)
    expect(screen.getByRole('button', { name: /BOOK NOW/i })).toBeInTheDocument()
  })

  it('renders DurationSelector when tripType is hourly', () => {
    useBookingStore.setState({ tripType: 'hourly' })
    render(<BookingWidget />)
    expect(screen.getByRole('button', { name: /1 hours/i })).toBeInTheDocument()
  })

  it('does not render DurationSelector when tripType is transfer', () => {
    useBookingStore.setState({ tripType: 'transfer' })
    render(<BookingWidget />)
    expect(screen.queryByRole('button', { name: /1 hours/i })).not.toBeInTheDocument()
  })
})

describe('HOME-03: Book Now CTA behavior', () => {
  beforeEach(() => {
    resetStore()
  })

  it('shows validation error when origin is empty and Book Now is clicked', () => {
    render(<BookingWidget />)
    fireEvent.click(screen.getByRole('button', { name: /BOOK NOW/i }))
    expect(
      screen.getByText(/Please fill in all required fields before continuing\./i)
    ).toBeInTheDocument()
  })

  it('does not navigate when validation fails', () => {
    render(<BookingWidget />)
    fireEvent.click(screen.getByRole('button', { name: /BOOK NOW/i }))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('sets currentStep to 3 and completedSteps {1,2} on valid submit', () => {
    render(<BookingWidget />)

    // Trigger onSelect for origin via captured callback
    act(() => {
      capturedOnSelect.get('Pick-up address')?.(mockOrigin)
    })
    act(() => {
      capturedOnSelect.get('Drop-off address')?.(mockDest)
    })

    // Fill date and time
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-04-15' } })
    fireEvent.change(timeInput, { target: { value: '10:00' } })

    fireEvent.click(screen.getByRole('button', { name: /BOOK NOW/i }))

    const state = useBookingStore.getState()
    expect(state.currentStep).toBe(3)
    expect(state.completedSteps.has(1)).toBe(true)
    expect(state.completedSteps.has(2)).toBe(true)
  })

  it('calls router.push("/book") on valid submit', () => {
    render(<BookingWidget />)

    act(() => {
      capturedOnSelect.get('Pick-up address')?.(mockOrigin)
    })
    act(() => {
      capturedOnSelect.get('Drop-off address')?.(mockDest)
    })

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-04-15' } })
    fireEvent.change(timeInput, { target: { value: '10:00' } })

    fireEvent.click(screen.getByRole('button', { name: /BOOK NOW/i }))

    expect(mockPush).toHaveBeenCalledWith('/book')
  })

  it('does not require destination for hourly trip type', () => {
    useBookingStore.setState({ tripType: 'hourly' })
    render(<BookingWidget />)

    act(() => {
      capturedOnSelect.get('Pick-up address')?.(mockOrigin)
    })

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-04-15' } })
    fireEvent.change(timeInput, { target: { value: '10:00' } })

    fireEvent.click(screen.getByRole('button', { name: /BOOK NOW/i }))

    expect(mockPush).toHaveBeenCalledWith('/book')
    expect(
      screen.queryByText(/Please fill in all required fields/i)
    ).not.toBeInTheDocument()
  })
})
