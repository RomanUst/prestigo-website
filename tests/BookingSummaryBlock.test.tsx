import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import BookingSummaryBlock from '@/components/booking/BookingSummaryBlock'
import { useBookingStore } from '@/lib/booking-store'

const outboundBreakdown = {
  business: { base: 100, total: 100, extras: 0, currency: 'EUR' },
  first_class: { base: 150, total: 150, extras: 0, currency: 'EUR' },
  business_van: { base: 120, total: 120, extras: 0, currency: 'EUR' },
}

const returnLegBreakdown = {
  business: { base: 90, total: 90, extras: 0, currency: 'EUR' },
  first_class: { base: 135, total: 135, extras: 0, currency: 'EUR' },
  business_van: { base: 108, total: 108, extras: 0, currency: 'EUR' },
}

describe('BookingSummaryBlock', () => {
  describe('SUM-RT: Round-trip layout', () => {
    beforeEach(() => {
      useBookingStore.setState({
        tripType: 'round_trip',
        vehicleClass: 'business',
        origin: { address: 'Prague Airport', lat: 50.1, lng: 14.26, placeId: 'A' },
        destination: { address: 'Karlovy Vary', lat: 50.23, lng: 12.87, placeId: 'B' },
        pickupDate: '2026-06-01',
        pickupTime: '10:00',
        returnDate: '2026-06-05',
        returnTime: '14:30',
        passengers: 2,
        luggage: 2,
        priceBreakdown: outboundBreakdown,
        roundTripPriceBreakdown: returnLegBreakdown,
        returnDiscountPercent: 10,
        extras: { infantSeat: false, childSeat: false, boosterSeat: false, meetAndGreet: false, extraLuggage: false },
        promoCode: null,
        promoDiscount: 0,
      })
    })

    it('SUM-RT-01: renders OUTBOUND and RETURN labels', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText('OUTBOUND')).toBeInTheDocument()
      expect(screen.getByText('RETURN')).toBeInTheDocument()
    })

    it('SUM-RT-02: renders forward outbound route and reversed return route', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      // Outbound: Prague Airport → Karlovy Vary
      expect(
        screen.getByText((content) => content.includes('Prague Airport') && content.includes('Karlovy Vary') && content.indexOf('Prague Airport') < content.indexOf('Karlovy Vary'))
      ).toBeInTheDocument()
      // Return: Karlovy Vary → Prague Airport
      expect(
        screen.getByText((content) => content.includes('Karlovy Vary') && content.includes('Prague Airport') && content.indexOf('Karlovy Vary') < content.indexOf('Prague Airport'))
      ).toBeInTheDocument()
    })

    it('SUM-RT-03: renders pickup and return date/time blocks', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText('2026-06-01 at 10:00')).toBeInTheDocument()
      expect(screen.getByText('2026-06-05 at 14:30')).toBeInTheDocument()
    })

    it('SUM-RT-04: renders three-line price breakdown labels: Outbound / Return leg (−N%) / Subtotal', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText('Outbound')).toBeInTheDocument()
      const returnLegNode = screen.getByText((_, node) =>
        !!node && node.textContent === 'Return leg −10%'
      )
      expect(returnLegNode).toBeInTheDocument()
      expect(screen.getByText('Subtotal')).toBeInTheDocument()
    })

    it('SUM-RT-05: Subtotal equals outbound + return (€100 + €90 = €190) with no extras', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText('€100')).toBeInTheDocument()
      expect(screen.getByText('€90')).toBeInTheDocument()
      expect(screen.getByText('€190')).toBeInTheDocument()
    })

    it('SUM-RT-06: no Promo or Final line when promoDiscount is 0', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.queryByText(/^Promo/)).not.toBeInTheDocument()
      expect(screen.queryByText('Final')).not.toBeInTheDocument()
    })

    it('SUM-RT-07: Promo and Final lines appear when promoDiscount > 0; Final = round(Subtotal × (1 − promo/100))', () => {
      useBookingStore.setState({ promoCode: 'SUMMER15', promoDiscount: 15 })
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText('Promo SUMMER15')).toBeInTheDocument()
      expect(screen.getByText('Final')).toBeInTheDocument()
      // Subtotal €190, 15% promo → round(190 × 0.85) = 162
      expect(screen.getByText('€162')).toBeInTheDocument()
    })

    it('SUM-RT-08: Promo line shows reduction amount (Subtotal − Final = €190 − €162 = €28)', () => {
      useBookingStore.setState({ promoCode: 'SUMMER15', promoDiscount: 15 })
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      // The minus character is U+2212 (−), not U+002D (-); the component uses &minus;
      expect(screen.getByText('−€28')).toBeInTheDocument()
    })

    it('SUM-RT-09: extras apply to outbound only — outbound €100, return still €90', () => {
      useBookingStore.setState({
        extras: { infantSeat: false, childSeat: true, boosterSeat: false, meetAndGreet: false, extraLuggage: false },
      })
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      // computeExtrasTotal always returns 0 (all extra prices are 0 in lib/extras.ts)
      // Outbound €100 base + €0 extras = €100
      expect(screen.getByText('€100')).toBeInTheDocument()
      // Return still €90 (extras do not apply)
      expect(screen.getByText('€90')).toBeInTheDocument()
      // Subtotal = 100 + 90 = 190
      expect(screen.getByText('€190')).toBeInTheDocument()
    })

    it('SUM-RT-10: selectedCurrency=czk shows CZK in Final line when promo applied', () => {
      useBookingStore.setState({ promoCode: 'SUMMER15', promoDiscount: 15 })
      render(<BookingSummaryBlock selectedCurrency="czk" />)
      // Final €162 → CZK = 162 × 25 = 4050 (formatCZK uses cs-CZ locale with NBSP thousand separator)
      expect(screen.getByText(/4\s*050\s*Kč/)).toBeInTheDocument()
    })
  })

  describe('SUM-OW: One-way layout regression', () => {
    beforeEach(() => {
      useBookingStore.setState({
        tripType: 'transfer',
        vehicleClass: 'business',
        origin: { address: 'Prague Airport', lat: 50.1, lng: 14.26, placeId: 'A' },
        destination: { address: 'Karlovy Vary', lat: 50.23, lng: 12.87, placeId: 'B' },
        pickupDate: '2026-06-01',
        pickupTime: '10:00',
        returnDate: null,
        returnTime: null,
        passengers: 2,
        luggage: 2,
        priceBreakdown: outboundBreakdown,
        roundTripPriceBreakdown: null,
        returnDiscountPercent: 10,
        extras: { infantSeat: false, childSeat: false, boosterSeat: false, meetAndGreet: false, extraLuggage: false },
        promoCode: null,
        promoDiscount: 0,
      })
    })

    it('SUM-OW-01: renders YOUR JOURNEY label (not OUTBOUND/RETURN)', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText('YOUR JOURNEY')).toBeInTheDocument()
      expect(screen.queryByText('OUTBOUND')).not.toBeInTheDocument()
      expect(screen.queryByText('RETURN')).not.toBeInTheDocument()
    })

    it('SUM-OW-02: renders single total (no three-line breakdown)', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText('€100')).toBeInTheDocument()
      expect(screen.queryByText('Subtotal')).not.toBeInTheDocument()
      expect(screen.queryByText(/Return leg/)).not.toBeInTheDocument()
    })

    it('SUM-OW-03: forward route rendered, no reversed route', () => {
      render(<BookingSummaryBlock selectedCurrency="eur" />)
      expect(screen.getByText(/Prague Airport.*Karlovy Vary/)).toBeInTheDocument()
      // No reversed route should be present
      expect(screen.queryAllByText(/Karlovy Vary.*Prague Airport/)).toHaveLength(0)
    })
  })
})
