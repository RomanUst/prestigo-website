import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import QuoteCalculator from '@/components/calculator/QuoteCalculator'

// Mock the sub-components to avoid deep dependency tree
vi.mock('@/components/calculator/QuoteWizard', () => ({
  default: () => <div data-testid="quote-wizard">QuoteWizard</div>,
}))

vi.mock('@/components/calculator/QuoteDesktop', () => ({
  default: () => <div data-testid="quote-desktop">QuoteDesktop</div>,
}))

// Mock useCalculatorStore
vi.mock('@/lib/calculator-store', () => ({
  useCalculatorStore: vi.fn(() => ({
    from: null,
    to: null,
    serviceType: 'transfer',
    date: null,
    time: null,
    hours: 2,
    passengers: 1,
    childSeats: 0,
    extraStops: 0,
    vehicleClass: null,
    expiresAt: null,
    priceBreakdown: null,
    distanceKm: null,
    quoteMode: false,
    matchedRouteSlug: null,
    setFrom: vi.fn(),
    setTo: vi.fn(),
    setServiceType: vi.fn(),
    setDate: vi.fn(),
    setTime: vi.fn(),
    setHours: vi.fn(),
    setPassengers: vi.fn(),
    setChildSeats: vi.fn(),
    setExtraStops: vi.fn(),
    setVehicleClass: vi.fn(),
    setPriceBreakdown: vi.fn(),
    setDistanceKm: vi.fn(),
    setQuoteMode: vi.fn(),
    setMatchedRouteSlug: vi.fn(),
    touchSession: vi.fn(),
    resetQuote: vi.fn(),
  })),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QuoteCalculator — CALC-12 (responsive layout)', () => {
  it('renders mobile wizard below 768px', () => {
    vi.stubGlobal('innerWidth', 375)
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true })

    render(<QuoteCalculator />)

    expect(screen.getByTestId('quote-wizard')).toBeInTheDocument()
  })

  it('renders desktop layout at 1024px', () => {
    vi.stubGlobal('innerWidth', 1280)
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true })

    render(<QuoteCalculator />)

    expect(screen.getByTestId('quote-desktop')).toBeInTheDocument()
  })
})
