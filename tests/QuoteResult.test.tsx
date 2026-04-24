import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuoteResult from '@/components/calculator/QuoteResult'
import type { VehicleClass } from '@/types/booking'

beforeEach(() => {
  vi.resetAllMocks()
})

type PriceBreakdown = {
  base: number
  extras: number
  total: number
  currency: string
}

type PriceBreakdownMap = Record<VehicleClass, PriceBreakdown>

function makeDefaultProps(overrides: Partial<{
  price: number
  vehicleClass: VehicleClass
  priceBreakdown: PriceBreakdownMap
  from: { address: string; placeId: string }
  to: { address: string; placeId: string }
  date: string
  time: string
  passengers: number
  serviceType: string
  quoteMode: boolean
}> = {}) {
  return {
    price: 90,
    vehicleClass: 'business' as VehicleClass,
    priceBreakdown: {
      business: { base: 90, extras: 0, total: 90, currency: 'EUR' },
      first_class: { base: 140, extras: 0, total: 140, currency: 'EUR' },
      business_van: { base: 110, extras: 0, total: 110, currency: 'EUR' },
    } as PriceBreakdownMap,
    from: { address: 'Prague', placeId: 'ChIJi3lNIT2UDkcRGBlSF2JiX1c' },
    to: { address: 'Brno', placeId: 'ChIJYXjBiRvMHkcRDGMvL1K0bCQ' },
    date: '2026-05-10',
    time: '10:00',
    passengers: 2,
    serviceType: 'transfer',
    quoteMode: false,
    ...overrides,
  }
}

describe('QuoteResult — CALC-09, CALC-10, CALC-16', () => {
  it("renders fare display 'Your fare: €N · <vehicle>'", () => {
    render(<QuoteResult {...makeDefaultProps({ price: 90, vehicleClass: 'business' })} />)

    // Should contain the price and vehicle class label
    expect(screen.getByText(/€90/)).toBeInTheDocument()
    expect(screen.getByText(/E-Class Business|Business/i)).toBeInTheDocument()
  })

  it('breakdown collapsible toggles open/closed', async () => {
    const user = userEvent.setup()
    render(<QuoteResult {...makeDefaultProps()} />)

    // Initially, breakdown might be hidden
    const toggleButton = screen.getByRole('button', { name: /see breakdown|breakdown/i })
    expect(toggleButton).toBeInTheDocument()

    // Click to open
    await user.click(toggleButton)

    // Breakdown rows should now be visible
    expect(screen.getByText(/base/i)).toBeInTheDocument()
  })

  it('BOOK NOW CTA has correct deeplink URL with all params', () => {
    render(<QuoteResult {...makeDefaultProps({
      serviceType: 'transfer',
      vehicleClass: 'business',
      passengers: 2,
      date: '2026-05-10',
      time: '10:00',
      from: { address: 'Prague', placeId: 'ChIJi3lNIT2UDkcRGBlSF2JiX1c' },
      to: { address: 'Brno', placeId: 'ChIJYXjBiRvMHkcRDGMvL1K0bCQ' },
    })} />)

    const bookLink = screen.getByRole('link', { name: /book now/i })
    expect(bookLink).toBeInTheDocument()

    const href = bookLink.getAttribute('href') || ''
    expect(href).toContain('type=')
    expect(href).toContain('from=')
    expect(href).toContain('to=')
    expect(href).toContain('fromPlaceId=')
    expect(href).toContain('toPlaceId=')
    expect(href).toContain('date=')
    expect(href).toContain('class=')
    expect(href).toContain('pax=')
  })

  it('First Class card shows bespoke link', () => {
    render(<QuoteResult {...makeDefaultProps({ vehicleClass: 'first_class' })} />)

    expect(screen.getByRole('link', { name: /bespoke/i })).toBeInTheDocument()
  })

  it('quoteMode fallback renders when quoteMode=true', () => {
    render(<QuoteResult {...makeDefaultProps({ quoteMode: true })} />)

    expect(screen.getByText(/Unable to calculate fare|custom quote|get a quote/i)).toBeInTheDocument()
  })
})
