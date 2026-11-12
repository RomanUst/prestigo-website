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

  it('setTripType PRESERVES priceBreakdown across transfer <-> round_trip (no stops)', () => {
    // transfer and round_trip share the same one-way distance-based price map,
    // so toggling One Way / Round Trip must NOT wipe the price (it would vanish
    // forever — there is no re-fetch until a return time is chosen).
    const pb = { business: { base: 100, extras: 0, total: 100, currency: 'CZK' }, first_class: { base: 150, extras: 0, total: 150, currency: 'CZK' }, business_van: { base: 120, extras: 0, total: 120, currency: 'CZK' } }
    useBookingStore.setState({ tripType: 'transfer', stops: [], priceBreakdown: pb, distanceKm: 25 })
    useBookingStore.getState().setTripType('round_trip')
    expect(useBookingStore.getState().priceBreakdown).toEqual(pb)
    expect(useBookingStore.getState().distanceKm).toBe(25)
    // and back to one-way
    useBookingStore.getState().setTripType('transfer')
    expect(useBookingStore.getState().priceBreakdown).toEqual(pb)
    expect(useBookingStore.getState().distanceKm).toBe(25)
  })

  it('setTripType clears priceBreakdown and distanceKm when switching to a different pricing model', () => {
    useBookingStore.setState({
      tripType: 'transfer',
      priceBreakdown: { business: { base: 100, extras: 0, total: 100, currency: 'CZK' }, first_class: { base: 150, extras: 0, total: 150, currency: 'CZK' }, business_van: { base: 120, extras: 0, total: 120, currency: 'CZK' } },
      distanceKm: 25,
    })
    useBookingStore.getState().setTripType('hourly')
    expect(useBookingStore.getState().priceBreakdown).toBeNull()
    expect(useBookingStore.getState().distanceKm).toBeNull()
  })

  it('setTripType clears priceBreakdown when entering round_trip clears populated stops', () => {
    // Clearing real stops changes the distance, so the cached price is stale.
    useBookingStore.setState({
      tripType: 'transfer',
      stops: [{ id: 's1', place: { lat: 50, lng: 14, label: 'Stop', placeId: 'x' } }] as never,
      priceBreakdown: { business: { base: 100, extras: 0, total: 100, currency: 'CZK' }, first_class: { base: 150, extras: 0, total: 150, currency: 'CZK' }, business_van: { base: 120, extras: 0, total: 120, currency: 'CZK' } },
      distanceKm: 25,
    })
    useBookingStore.getState().setTripType('round_trip')
    expect(useBookingStore.getState().priceBreakdown).toBeNull()
    expect(useBookingStore.getState().distanceKm).toBeNull()
    expect(useBookingStore.getState().stops).toEqual([])
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

describe('Phase 91 STOP-03: per-stop waiting in the store', () => {
  const pb = {
    business: { base: 100, extras: 0, total: 100, currency: 'EUR' },
    first_class: { base: 150, extras: 0, total: 150, currency: 'EUR' },
    business_van: { base: 120, extras: 0, total: 120, currency: 'EUR' },
  }

  beforeEach(() => {
    useBookingStore.setState({
      stops: [{ id: 's1', place: null, waitMinutes: 0 }],
      priceBreakdown: pb,
      promoCode: 'SAVE10',
      promoDiscount: 10,
      tripType: 'transfer',
    })
  })

  it('addStop gives the new stop waitMinutes 0', () => {
    useBookingStore.setState({ stops: [] })
    useBookingStore.getState().addStop()
    expect(useBookingStore.getState().stops[0].waitMinutes).toBe(0)
  })

  it('setStopWait stores the wait and clears price and promo', () => {
    useBookingStore.getState().setStopWait('s1', 45)
    const s = useBookingStore.getState()
    expect(s.stops[0].waitMinutes).toBe(45)
    expect(s.priceBreakdown).toBeNull()
    expect(s.promoCode).toBeNull()
    expect(s.promoDiscount).toBe(0)
  })

  it('setStopWait ignores a value that is not a 15-minute step in 0..120', () => {
    for (const bad of [20, -15, 135, 7.5, Number.NaN]) {
      useBookingStore.getState().setStopWait('s1', bad)
    }
    const s = useBookingStore.getState()
    expect(s.stops[0].waitMinutes).toBe(0)
    expect(s.priceBreakdown).toEqual(pb)
    expect(s.promoCode).toBe('SAVE10')
  })

  it('stops with waitMinutes survive the sessionStorage persist round trip', async () => {
    useBookingStore.getState().setStopWait('s1', 60)
    const raw = sessionStorage.getItem('prestigo-booking')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string).state.stops[0].waitMinutes).toBe(60)
    await useBookingStore.persist.rehydrate()
    expect(useBookingStore.getState().stops[0].waitMinutes).toBe(60)
  })
})

describe('Phase 91 STOP-01: moveStop reorders and resets price', () => {
  const pb = {
    business: { base: 100, extras: 0, total: 100, currency: 'EUR' },
    first_class: { base: 150, extras: 0, total: 150, currency: 'EUR' },
    business_van: { base: 120, extras: 0, total: 120, currency: 'EUR' },
  }

  beforeEach(() => {
    useBookingStore.setState({
      stops: [
        { id: 's1', place: null, waitMinutes: 0 },
        { id: 's2', place: null, waitMinutes: 30 },
        { id: 's3', place: null, waitMinutes: 60 },
      ],
      priceBreakdown: pb,
      promoCode: 'SAVE10',
      promoDiscount: 10,
      tripType: 'transfer',
    })
  })

  const ids = () => useBookingStore.getState().stops.map((s) => s.id)

  it('moveStop(s2, -1) gives [s2, s1, s3] and clears price and promo', () => {
    useBookingStore.getState().moveStop('s2', -1)
    expect(ids()).toEqual(['s2', 's1', 's3'])
    const s = useBookingStore.getState()
    expect(s.priceBreakdown).toBeNull()
    expect(s.promoCode).toBeNull()
    expect(s.promoDiscount).toBe(0)
  })

  it('moveStop(s2, +1) gives [s1, s3, s2]; the wait travels with its stop', () => {
    useBookingStore.getState().moveStop('s2', 1)
    expect(ids()).toEqual(['s1', 's3', 's2'])
    expect(useBookingStore.getState().stops[2].waitMinutes).toBe(30)
  })

  it('moving the first stop up or the last stop down changes nothing (price kept)', () => {
    useBookingStore.getState().moveStop('s1', -1)
    useBookingStore.getState().moveStop('s3', 1)
    expect(ids()).toEqual(['s1', 's2', 's3'])
    expect(useBookingStore.getState().priceBreakdown).toEqual(pb)
    expect(useBookingStore.getState().promoCode).toBe('SAVE10')
  })

  it('moveStop with an unknown id changes nothing', () => {
    useBookingStore.getState().moveStop('nope', 1)
    expect(ids()).toEqual(['s1', 's2', 's3'])
  })
})

describe('Phase 91 STOP-05: landing fields derive the pickup (D-07, D-18)', () => {
  const airport = { address: 'Vaclav Havel Airport Prague (PRG)', placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec', lat: 50.1008, lng: 14.26 }
  const city = { address: 'Wenceslas Square, Prague', placeId: 'city-1', lat: 50.0813, lng: 14.4274 }

  beforeEach(() => {
    useBookingStore.getState().resetBooking()
    useBookingStore.setState({ origin: airport })
  })

  it('starts with no landing and the default offset 30', () => {
    const s = useBookingStore.getState()
    expect(s.landingDate).toBeNull()
    expect(s.landingTime).toBeNull()
    expect(s.pickupOffsetMin).toBe(30)
  })

  it('landing 14:00 + default 30 gives pickup 14:30 the same day', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    const s = useBookingStore.getState()
    expect(s.pickupDate).toBe('2027-06-10')
    expect(s.pickupTime).toBe('14:30')
  })

  it('setPickupOffset(90) moves the pickup to 15:30; an offset outside the list is ignored', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().setPickupOffset(90)
    expect(useBookingStore.getState().pickupTime).toBe('15:30')
    useBookingStore.getState().setPickupOffset(20)
    expect(useBookingStore.getState().pickupOffsetMin).toBe(90)
    expect(useBookingStore.getState().pickupTime).toBe('15:30')
  })

  it('the order of the setters does not matter (time first, then date)', () => {
    useBookingStore.getState().setLandingTime('14:00')
    expect(useBookingStore.getState().pickupTime).toBeNull()
    useBookingStore.getState().setLandingDate('2027-06-10')
    expect(useBookingStore.getState().pickupTime).toBe('14:30')
  })

  it('spring DST day: landing 2027-03-28 01:50 + 30 gives pickup 03:20', () => {
    useBookingStore.getState().setLandingDate('2027-03-28')
    useBookingStore.getState().setLandingTime('01:50')
    expect(useBookingStore.getState().pickupDate).toBe('2027-03-28')
    expect(useBookingStore.getState().pickupTime).toBe('03:20')
  })

  it('midnight roll-over: landing 2027-06-10 23:50 + 30 gives pickup 2027-06-11 00:20', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('23:50')
    const s = useBookingStore.getState()
    expect(s.pickupDate).toBe('2027-06-11')
    expect(s.pickupTime).toBe('00:20')
  })

  it('clearing the landing time clears the derived pickup (no stale pickup)', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().setLandingTime(null)
    const s = useBookingStore.getState()
    expect(s.pickupDate).toBeNull()
    expect(s.pickupTime).toBeNull()
  })

  it('moving the pickup address away from the airport clears the landing and keeps the pickup', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().setOrigin(city)
    const s = useBookingStore.getState()
    expect(s.landingDate).toBeNull()
    expect(s.landingTime).toBeNull()
    expect(s.pickupDate).toBe('2027-06-10')
    expect(s.pickupTime).toBe('14:30')
  })

  it('keeps the landing when the new origin is still an airport', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().setOrigin({ ...airport, placeId: 'other' })
    expect(useBookingStore.getState().landingTime).toBe('14:00')
  })

  it('swapping an airport pickup with a city destination clears the landing', () => {
    useBookingStore.setState({ destination: city })
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().swapOriginDestination()
    expect(useBookingStore.getState().landingDate).toBeNull()
    expect(useBookingStore.getState().landingTime).toBeNull()
  })

  it('switching tripType to hourly keeps the landing fields', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().setTripType('hourly')
    const s = useBookingStore.getState()
    expect(s.landingDate).toBe('2027-06-10')
    expect(s.landingTime).toBe('14:00')
  })

  it('the three landing fields survive the sessionStorage persist round trip', async () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().setPickupOffset(45)
    const raw = sessionStorage.getItem('prestigo-booking')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw as string).state
    expect(persisted.landingDate).toBe('2027-06-10')
    expect(persisted.landingTime).toBe('14:00')
    expect(persisted.pickupOffsetMin).toBe(45)
    await useBookingStore.persist.rehydrate()
    expect(useBookingStore.getState().pickupOffsetMin).toBe(45)
  })

  it('resetBooking clears the landing and restores the default offset', () => {
    useBookingStore.getState().setLandingDate('2027-06-10')
    useBookingStore.getState().setLandingTime('14:00')
    useBookingStore.getState().setPickupOffset(90)
    useBookingStore.getState().resetBooking()
    const s = useBookingStore.getState()
    expect(s.landingDate).toBeNull()
    expect(s.landingTime).toBeNull()
    expect(s.pickupOffsetMin).toBe(30)
  })
})
