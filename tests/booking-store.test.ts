import { describe, it, expect, beforeEach } from 'vitest'
import { useBookingStore } from '@/lib/booking-store'

describe('booking-store', () => {
  describe('ARCH-01: Zustand store shape', () => {
    it.todo('initializes with default tripType "transfer"')
    it.todo('initializes with passengers=1, luggage=0, hours=2')
    it.todo('setTripType updates tripType')
    it.todo('setOrigin and setDestination update place fields')
    it.todo('setPassengers clamps between 1 and 8')
    it.todo('setLuggage clamps between 0 and 8')
    it.todo('nextStep increments currentStep and marks previous as completed')
    it.todo('prevStep decrements currentStep')
    it.todo('swapOriginDestination swaps origin and destination')
  })

  describe('ARCH-02: sessionStorage persistence', () => {
    it.todo('persists store state to sessionStorage')
    it.todo('rehydrates Set<number> from serialized array')
  })

  describe('airport auto-fill logic', () => {
    it.todo('airport_pickup sets destination to PRG_CONFIG')
    it.todo('airport_dropoff sets origin to PRG_CONFIG')
    it.todo('switching away from airport type clears PRG auto-fill')
  })
})

describe('round_trip store behavior', () => {
  beforeEach(() => {
    useBookingStore.setState({
      tripType: 'transfer',
      returnDate: null,
      returnTime: null,
      priceBreakdown: null,
      distanceKm: null,
      quoteMode: false,
    })
  })

  it('setTripType to round_trip stores tripType correctly', () => {
    useBookingStore.getState().setTripType('round_trip')
    expect(useBookingStore.getState().tripType).toBe('round_trip')
  })

  it('setTripType away from round_trip clears returnTime', () => {
    useBookingStore.setState({ tripType: 'round_trip', returnTime: '14:30' })
    useBookingStore.getState().setTripType('transfer')
    expect(useBookingStore.getState().returnTime).toBeNull()
  })

  it('setTripType to round_trip does NOT clear returnDate', () => {
    useBookingStore.setState({ tripType: 'daily', returnDate: '2026-05-01' })
    useBookingStore.getState().setTripType('round_trip')
    expect(useBookingStore.getState().returnDate).toBe('2026-05-01')
  })

  it('setReturnTime stores returnTime', () => {
    useBookingStore.getState().setReturnTime('14:30')
    expect(useBookingStore.getState().returnTime).toBe('14:30')
  })

  it('resetBooking clears returnTime to null', () => {
    useBookingStore.setState({ returnTime: '14:30' })
    useBookingStore.getState().resetBooking()
    expect(useBookingStore.getState().returnTime).toBeNull()
  })

  it('setTripType to daily also clears returnTime', () => {
    useBookingStore.setState({ tripType: 'round_trip', returnTime: '14:30' })
    useBookingStore.getState().setTripType('daily')
    expect(useBookingStore.getState().returnTime).toBeNull()
  })

  it('setTripType clears priceBreakdown and distanceKm', () => {
    useBookingStore.setState({
      tripType: 'transfer',
      priceBreakdown: { business: { base: 100, extras: 0, total: 100, currency: 'CZK' }, first_class: { base: 150, extras: 0, total: 150, currency: 'CZK' }, business_van: { base: 120, extras: 0, total: 120, currency: 'CZK' } },
      distanceKm: 25,
    })
    useBookingStore.getState().setTripType('round_trip')
    expect(useBookingStore.getState().priceBreakdown).toBeNull()
    expect(useBookingStore.getState().distanceKm).toBeNull()
  })
})

describe('STOP-03: stops mutations reset price and promo', () => {
  beforeEach(() => {
    useBookingStore.setState({
      stops: [],
      priceBreakdown: null,
      promoCode: null,
      promoDiscount: 0,
      tripType: 'transfer',
    })
  })

  it('initializes with stops as empty array', () => {
    useBookingStore.getState().resetBooking()
    expect(useBookingStore.getState().stops).toEqual([])
  })

  it('addStop appends a new stop with unique id and null place', () => {
    useBookingStore.getState().addStop()
    const stops = useBookingStore.getState().stops
    expect(stops).toHaveLength(1)
    expect(stops[0].place).toBeNull()
    expect(typeof stops[0].id).toBe('string')
    expect(stops[0].id.length).toBeGreaterThan(0)
  })

  it('addStop resets priceBreakdown, promoCode and promoDiscount', () => {
    useBookingStore.setState({
      priceBreakdown: { business: { base: 100, extras: 0, total: 100, currency: 'CZK' }, first_class: { base: 150, extras: 0, total: 150, currency: 'CZK' }, business_van: { base: 120, extras: 0, total: 120, currency: 'CZK' } },
      promoCode: 'SAVE10',
      promoDiscount: 10,
    })
    useBookingStore.getState().addStop()
    const s = useBookingStore.getState()
    expect(s.priceBreakdown).toBeNull()
    expect(s.promoCode).toBeNull()
    expect(s.promoDiscount).toBe(0)
  })

  it('addStop refuses to add a 6th stop', () => {
    for (let i = 0; i < 5; i++) useBookingStore.getState().addStop()
    expect(useBookingStore.getState().stops).toHaveLength(5)
    useBookingStore.getState().addStop()
    expect(useBookingStore.getState().stops).toHaveLength(5)
  })

  it('removeStop removes the stop with matching id', () => {
    useBookingStore.getState().addStop()
    useBookingStore.getState().addStop()
    const [a, b] = useBookingStore.getState().stops
    useBookingStore.getState().removeStop(a.id)
    const remaining = useBookingStore.getState().stops
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })

  it('removeStop resets priceBreakdown, promoCode and promoDiscount', () => {
    useBookingStore.getState().addStop()
    const id = useBookingStore.getState().stops[0].id
    useBookingStore.setState({
      priceBreakdown: { business: { base: 100, extras: 0, total: 100, currency: 'CZK' }, first_class: { base: 150, extras: 0, total: 150, currency: 'CZK' }, business_van: { base: 120, extras: 0, total: 120, currency: 'CZK' } },
      promoCode: 'SAVE10',
      promoDiscount: 10,
    })
    useBookingStore.getState().removeStop(id)
    const s = useBookingStore.getState()
    expect(s.priceBreakdown).toBeNull()
    expect(s.promoCode).toBeNull()
    expect(s.promoDiscount).toBe(0)
  })

  it('updateStop sets place on the matching stop', () => {
    useBookingStore.getState().addStop()
    const id = useBookingStore.getState().stops[0].id
    const place = { address: 'Prague 1', placeId: 'xyz', lat: 50.08, lng: 14.42 }
    useBookingStore.getState().updateStop(id, place)
    expect(useBookingStore.getState().stops[0].place).toEqual(place)
  })

  it('updateStop resets priceBreakdown, promoCode and promoDiscount', () => {
    useBookingStore.getState().addStop()
    const id = useBookingStore.getState().stops[0].id
    useBookingStore.setState({
      priceBreakdown: { business: { base: 100, extras: 0, total: 100, currency: 'CZK' }, first_class: { base: 150, extras: 0, total: 150, currency: 'CZK' }, business_van: { base: 120, extras: 0, total: 120, currency: 'CZK' } },
      promoCode: 'SAVE10',
      promoDiscount: 10,
    })
    useBookingStore.getState().updateStop(id, { address: 'X', placeId: 'y', lat: 50, lng: 14 })
    const s = useBookingStore.getState()
    expect(s.priceBreakdown).toBeNull()
    expect(s.promoCode).toBeNull()
    expect(s.promoDiscount).toBe(0)
  })

  it('setTripType to round_trip clears stops', () => {
    useBookingStore.getState().addStop()
    useBookingStore.getState().addStop()
    useBookingStore.getState().setTripType('round_trip')
    expect(useBookingStore.getState().stops).toEqual([])
  })

  it('setTripType to hourly clears stops', () => {
    useBookingStore.getState().addStop()
    useBookingStore.getState().setTripType('hourly')
    expect(useBookingStore.getState().stops).toEqual([])
  })

  it('setTripType to daily clears stops', () => {
    useBookingStore.getState().addStop()
    useBookingStore.getState().setTripType('daily')
    expect(useBookingStore.getState().stops).toEqual([])
  })

  it('setTripType to transfer does NOT clear stops', () => {
    useBookingStore.setState({ tripType: 'hourly', stops: [] })
    useBookingStore.getState().addStop()
    useBookingStore.setState({ stops: [...useBookingStore.getState().stops] })
    const before = useBookingStore.getState().stops.length
    useBookingStore.getState().setTripType('transfer')
    expect(useBookingStore.getState().stops).toHaveLength(before)
  })

  it('resetBooking clears stops to []', () => {
    useBookingStore.getState().addStop()
    useBookingStore.getState().addStop()
    useBookingStore.getState().resetBooking()
    expect(useBookingStore.getState().stops).toEqual([])
  })
})
