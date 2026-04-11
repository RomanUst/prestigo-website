import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useBookingStore } from '@/lib/booking-store'

// Mock heavy dependencies to keep tests fast
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/booking/TripTypeTabs', () => ({
  default: () => <div data-testid="trip-type-tabs" />,
}))

vi.mock('@/components/booking/AddressInput', () => ({
  default: (props: { label: string }) => <div data-testid={`address-input-${props.label}`} />,
}))

vi.mock('@/components/booking/DurationSelector', () => ({
  default: () => <div data-testid="duration-selector" />,
}))

vi.mock('@/components/booking/Stepper', () => ({
  default: () => <div data-testid="stepper" />,
}))

// Mock StopList to avoid pulling in AddressInput Google Maps loader
vi.mock('@/components/booking/StopList', () => ({
  default: (props: { stops: Array<{ id: string; place: unknown }>; onAdd: () => void }) => (
    <div data-testid="stop-list-mock">
      <span data-testid="stop-count">{props.stops.length}</span>
      <button type="button" onClick={props.onAdd}>ADD STOP MOCK</button>
    </div>
  ),
}))

import Step1TripType from '@/components/booking/steps/Step1TripType'

describe('Step1TripType', () => {
  describe('WIZD-03: Step 1 is trip type entry', () => {
    it.todo('renders TripTypeTabs')
    it.todo('renders origin and destination AddressInput')
    it.todo('renders Passengers and Luggage steppers')
  })

  describe('STEP1-04: conditional fields by trip type', () => {
    it.todo('hourly hides destination, shows DurationSelector')
    it.todo('airport_pickup shows read-only destination with PRG')
    it.todo('airport_dropoff shows read-only origin with PRG')
    it.todo('transfer shows swap icon between origin and destination')
  })

  describe('STEP1-07: validation and Next button', () => {
    it.todo('Continue button disabled when origin is empty')
    it.todo('Continue button disabled when destination is empty (non-hourly)')
    it.todo('shows error messages on Continue click with empty fields')
    it.todo('errors clear when field receives valid value')
    it.todo('Continue calls nextStep when all fields valid')
  })
})

// -----------------------------------------------------------------------
// Helper: set Zustand store state for Step1 tests
// -----------------------------------------------------------------------
function setStoreState(overrides: Record<string, unknown> = {}) {
  useBookingStore.setState({
    tripType: 'transfer',
    origin: null,
    destination: null,
    hours: 2,
    passengers: 1,
    luggage: 0,
    stops: [],
    addStop: vi.fn(),
    removeStop: vi.fn(),
    updateStop: vi.fn(),
    nextStep: vi.fn(),
    swapOriginDestination: vi.fn(),
    setOrigin: vi.fn(),
    setDestination: vi.fn(),
    setPassengers: vi.fn(),
    setLuggage: vi.fn(),
    ...overrides,
  })
}

describe('Step1TripType — STOP-01 integration', () => {
  beforeEach(() => {
    setStoreState()
  })

  it('renders StopList when tripType is transfer', () => {
    setStoreState({ tripType: 'transfer', stops: [] })
    render(<Step1TripType />)
    expect(screen.getByTestId('stop-list-mock')).toBeTruthy()
  })

  it('does NOT render StopList when tripType is round_trip', () => {
    setStoreState({ tripType: 'round_trip', stops: [] })
    render(<Step1TripType />)
    expect(screen.queryByTestId('stop-list-mock')).toBeNull()
  })

  it('does NOT render StopList when tripType is hourly', () => {
    setStoreState({ tripType: 'hourly', stops: [] })
    render(<Step1TripType />)
    expect(screen.queryByTestId('stop-list-mock')).toBeNull()
  })

  it('does NOT render StopList when tripType is daily', () => {
    setStoreState({ tripType: 'daily', stops: [] })
    render(<Step1TripType />)
    expect(screen.queryByTestId('stop-list-mock')).toBeNull()
  })

  it('clicking ADD STOP in StopList calls store.addStop', () => {
    const addStop = vi.fn()
    setStoreState({
      tripType: 'transfer',
      stops: [],
      origin: { address: 'A', placeId: 'a', lat: 50, lng: 14 },
      destination: { address: 'B', placeId: 'b', lat: 50, lng: 14 },
      addStop,
    })
    render(<Step1TripType />)
    fireEvent.click(screen.getByText('ADD STOP MOCK'))
    expect(addStop).toHaveBeenCalledTimes(1)
  })

  it('Continue is disabled when any stop has place === null', () => {
    const nextStep = vi.fn()
    setStoreState({
      tripType: 'transfer',
      origin: { address: 'A', placeId: 'a', lat: 50, lng: 14 },
      destination: { address: 'B', placeId: 'b', lat: 50, lng: 14 },
      stops: [{ id: 's1', place: null }],
      nextStep,
    })
    render(<Step1TripType />)
    // Desktop + mobile both render a Continue button — take the first (desktop)
    const btn = screen.getAllByRole('button', { name: /continue/i })[0]
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(btn)
    expect(nextStep).not.toHaveBeenCalled()
  })

  it('Continue is enabled when all stops have a non-null place', () => {
    const nextStep = vi.fn()
    setStoreState({
      tripType: 'transfer',
      origin: { address: 'A', placeId: 'a', lat: 50, lng: 14 },
      destination: { address: 'B', placeId: 'b', lat: 50, lng: 14 },
      stops: [{ id: 's1', place: { address: 'X', placeId: 'x', lat: 50, lng: 14 } }],
      nextStep,
    })
    render(<Step1TripType />)
    // Desktop + mobile both render a Continue button — take the first (desktop)
    const btn = screen.getAllByRole('button', { name: /continue/i })[0]
    expect(btn.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(btn)
    expect(nextStep).toHaveBeenCalled()
  })
})
