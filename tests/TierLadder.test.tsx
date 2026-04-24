import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TierLadder from '@/components/pricing/TierLadder'
import type { PricingGlobals } from '@/lib/pricing-config'

const promoActiveGlobals: PricingGlobals = {
  airportFee: 0, nightCoefficient: 1.3, holidayCoefficient: 1.3,
  extraChildSeat: 15, extraLuggage: 10, holidayDates: [],
  returnDiscountPercent: 10, hourlyMinHours: 2, hourlyMaxHours: 8,
  notificationFlags: null,
  airportPromoActive: true,
  airportRegularPriceEur: 69,
  airportPromoPriceEur: 59,
}
const promoInactiveGlobals: PricingGlobals = { ...promoActiveGlobals, airportPromoActive: false }

describe('TierLadder', () => {
  it('renders three tier cards', () => {
    const { container } = render(
      <TierLadder config={promoActiveGlobals} sClassPrice={120} vClassPrice={76} />
    )
    // getByRole heading avoids ambiguity with tier-dots nav anchors that repeat the same text
    expect(screen.getAllByText('Business').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('First Class').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Business Van').length).toBeGreaterThanOrEqual(1)
    expect(container).toBeTruthy()
  })

  it('renders PromoBadge when airportPromoActive=true', () => {
    render(<TierLadder config={promoActiveGlobals} sClassPrice={120} vClassPrice={76} />)
    expect(screen.getByText(/LIMITED-TIME OFFER/i)).toBeTruthy()
  })

  it('hides PromoBadge when airportPromoActive=false', () => {
    render(<TierLadder config={promoInactiveGlobals} sClassPrice={120} vClassPrice={76} />)
    expect(screen.queryByText(/LIMITED-TIME OFFER/i)).toBeNull()
  })

  it('shows promo price with strikethrough was-price when active', () => {
    const { container } = render(
      <TierLadder config={promoActiveGlobals} sClassPrice={120} vClassPrice={76} />
    )
    const strikethrough = container.querySelector('s')
    expect(strikethrough).toBeTruthy()
    expect(strikethrough?.textContent).toContain('69')
    expect(screen.getByText(/59/)).toBeTruthy()
  })

  it('First Class card has copper border class', () => {
    const { container } = render(
      <TierLadder config={promoActiveGlobals} sClassPrice={120} vClassPrice={76} />
    )
    const copperCard = container.querySelector('.tier-card-copper')
    expect(copperCard).toBeTruthy()
    expect(copperCard?.textContent).toContain('First Class')
  })

  it('Business card shows regular price when promo inactive', () => {
    render(<TierLadder config={promoInactiveGlobals} sClassPrice={120} vClassPrice={76} />)
    expect(screen.getByText(/69/)).toBeTruthy()
    expect(screen.queryByText(/LIMITED-TIME OFFER/i)).toBeNull()
    const { container } = render(
      <TierLadder config={promoInactiveGlobals} sClassPrice={120} vClassPrice={76} />
    )
    expect(container.querySelector('s')).toBeNull()
  })
})
