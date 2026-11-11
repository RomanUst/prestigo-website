import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { isValidStopWait } from '@/lib/stops'
import { DEFAULT_LANDING_OFFSET, isLandingOffset, pickupFromLanding } from '@/lib/airport-pickup'
import { isAirportPickupPlace } from '@/types/booking'
import type { BookingStore, PlaceResult, Stop, FlightCheckResult } from '@/types/booking'

/** The pickup that follows from a landing, or null while the landing is incomplete / invalid. */
function derivedPickup(
  landingDate: string | null,
  landingTime: string | null,
  offsetMin: number,
): { pickupDate: string; pickupTime: string } | null {
  if (!landingDate || !landingTime) return null
  const derived = pickupFromLanding(landingDate, landingTime, offsetMin)
  return derived ? { pickupDate: derived.pickupDate, pickupTime: derived.pickupTime } : null
}

export const useBookingStore = create<BookingStore>()(
  persist(
    (set, get) => ({
      tripType: 'transfer',
      origin: null,
      destination: null,
      hours: 2,
      passengers: 1,
      luggage: 0,
      stops: [],
      currentStep: 1,
      completedSteps: new Set<number>(),
      pickupDate: null,
      pickupTime: null,
      landingDate: null,
      landingTime: null,
      pickupOffsetMin: DEFAULT_LANDING_OFFSET,
      returnDate: null,
      returnTime: null,
      vehicleClass: null,
      distanceKm: null,
      durationMin: null,
      priceBreakdown: null,
      roundTripPriceBreakdown: null,
      returnDiscountPercent: 10,
      quoteMode: false,
      extras: { infantSeat: false, childSeat: false, boosterSeat: false, meetAndGreet: true, extraLuggage: false },
      passengerDetails: null,
      flightCheckResult: null,
      paymentIntentClientSecret: null,
      bookingReference: null,
      promoCode: null,
      promoDiscount: 0,
      guestMode: false,
      attemptId: null,

      setTripType: (type) => {
        const state = get()
        const prev = state.tripType
        const clearReturn = type !== 'round_trip'
        const clearStops = type === 'round_trip' || type === 'hourly' || type === 'daily'
        const willClearStops = clearStops && state.stops.length > 0
        // transfer ↔ round_trip share the SAME one-way distance-based price map;
        // only the return leg differs. Preserve priceBreakdown across that toggle
        // so the one-way price doesn't vanish forever when the user switches
        // One Way / Round Trip (there is no re-fetch until a return time is set).
        // Still reset pricing when the model actually changes (hourly/daily) or
        // when clearing populated stops would make the cached distance stale.
        const group = (t: typeof type) => (t === 'transfer' || t === 'round_trip' ? 'transfer' : t)
        const keepPrice = group(prev) === group(type) && !willClearStops
        set({
          tripType: type,
          ...(keepPrice ? {} : { priceBreakdown: null, distanceKm: null, durationMin: null, quoteMode: false }),
          ...(clearReturn ? { returnTime: null } : {}),
          ...(clearStops ? { stops: [] } : {}),
        })
      },
      // A landing only exists for an airport pickup: moving the pickup away from the airport drops the landing and
      // keeps the pickup as entered (D-18: the pickup stays the stored operational time).
      setOrigin: (place) => set({
        origin: place,
        ...(isAirportPickupPlace(place) ? {} : { landingDate: null, landingTime: null }),
        priceBreakdown: null,
        distanceKm: null,
        durationMin: null,
        quoteMode: false,
      }),
      setDestination: (place) => set({ destination: place, priceBreakdown: null, distanceKm: null, durationMin: null, quoteMode: false }),
      setHours: (h) => set({ hours: h }),
      setPassengers: (n) => set({ passengers: Math.max(1, Math.min(8, n)) }),
      setLuggage: (n) => set({ luggage: Math.max(0, Math.min(8, n)) }),
      nextStep: () =>
        set((s) => ({
          completedSteps: new Set([...s.completedSteps, s.currentStep]),
          currentStep: Math.min(6, s.currentStep + 1),
        })),
      prevStep: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
      goToStep: (step) => set({ currentStep: Math.max(1, Math.min(6, Math.trunc(step))) }),
      swapOriginDestination: () => {
        const { origin, destination } = get()
        set({
          origin: destination,
          destination: origin,
          ...(isAirportPickupPlace(destination) ? {} : { landingDate: null, landingTime: null }),
        })
      },
      addStop: () => set((s) => {
        if (s.stops.length >= 5) return s  // STOP-01 max 5 enforcement
        return {
          stops: [...s.stops, { id: crypto.randomUUID(), place: null, waitMinutes: 0 } as Stop],
          priceBreakdown: null,
          promoCode: null,
          promoDiscount: 0,
        }
      }),
      removeStop: (id: string) => set((s) => ({
        stops: s.stops.filter((stop) => stop.id !== id),
        priceBreakdown: null,
        promoCode: null,
        promoDiscount: 0,
      })),
      updateStop: (id: string, place: PlaceResult | null) => set((s) => ({
        stops: s.stops.map((stop) => (stop.id === id ? { ...stop, place } : stop)),
        priceBreakdown: null,
        promoCode: null,
        promoDiscount: 0,
      })),
      setStopWait: (id: string, minutes: number) => set((s) => {
        if (!isValidStopWait(minutes)) return s
        return {
          stops: s.stops.map((stop) => (stop.id === id ? { ...stop, waitMinutes: minutes } : stop)),
          priceBreakdown: null,
          promoCode: null,
          promoDiscount: 0,
        }
      }),
      moveStop: (id: string, direction: -1 | 1) => set((s) => {
        const from = s.stops.findIndex((stop) => stop.id === id)
        const to = from + direction
        if (from < 0 || to < 0 || to >= s.stops.length) return s
        const stops = [...s.stops]
        ;[stops[from], stops[to]] = [stops[to], stops[from]]
        return { stops, priceBreakdown: null, promoCode: null, promoDiscount: 0 }
      }),
      setPickupDate: (date) => set({ pickupDate: date }),
      setPickupTime: (time) => set({ pickupTime: time }),
      // Phase 91 (STOP-05, D-07, D-18): each landing setter stores its value and rewrites the pickup from landing +
      // offset (Prague, DST-safe via pickupFromLanding). While the landing is incomplete the pickup is cleared, so a
      // stale pickup can never travel with a landing that no longer matches it.
      setLandingDate: (date) => set((s) => {
        const d = derivedPickup(date, s.landingTime, s.pickupOffsetMin)
        return { landingDate: date, ...(d ?? { pickupDate: null, pickupTime: null }) }
      }),
      setLandingTime: (time) => set((s) => {
        const d = derivedPickup(s.landingDate, time, s.pickupOffsetMin)
        return { landingTime: time, ...(d ?? { pickupDate: null, pickupTime: null }) }
      }),
      setPickupOffset: (minutes) => set((s) => {
        if (!isLandingOffset(minutes)) return s
        const d = derivedPickup(s.landingDate, s.landingTime, minutes)
        return { pickupOffsetMin: minutes, ...(d ?? {}) }
      }),
      setReturnDate: (date) => set({ returnDate: date }),
      setReturnTime: (time) => set({ returnTime: time }),
      setVehicleClass: (v) => set({ vehicleClass: v }),
      setDistanceKm: (km) => set({ distanceKm: km }),
      setDurationMin: (min) => set({ durationMin: min }),
      setPriceBreakdown: (p) => set({ priceBreakdown: p }),
      setRoundTripPriceBreakdown: (p) => set({ roundTripPriceBreakdown: p }),
      setReturnDiscountPercent: (pct) => set({ returnDiscountPercent: pct }),
      setQuoteMode: (q) => set({ quoteMode: q }),
      setExtras: (e) => set({ extras: e }),
      toggleExtra: (key) => set((s) => ({
        extras: { ...s.extras, [key]: !s.extras[key] }
      })),
      setPassengerDetails: (d) => set({ passengerDetails: d }),
      setFlightCheckResult: (r: FlightCheckResult | null) => set({ flightCheckResult: r }),
      setPaymentIntentClientSecret: (s) => set({ paymentIntentClientSecret: s }),
      setBookingReference: (ref) => set({ bookingReference: ref }),
      setPromoCode: (code) => set({ promoCode: code }),
      setPromoDiscount: (pct) => set({ promoDiscount: pct }),
      setGuestMode: (g) => set({ guestMode: g }),
      setAttemptId: (id) => set({ attemptId: id }),
      resetBooking: () => set({
        tripType: 'transfer',
        origin: null,
        destination: null,
        hours: 2,
        passengers: 1,
        luggage: 0,
        stops: [],
        currentStep: 1,
        completedSteps: new Set<number>(),
        pickupDate: null,
        pickupTime: null,
        landingDate: null,
        landingTime: null,
        pickupOffsetMin: DEFAULT_LANDING_OFFSET,
        returnDate: null,
        returnTime: null,
        vehicleClass: null,
        distanceKm: null,
        durationMin: null,
        priceBreakdown: null,
        roundTripPriceBreakdown: null,
        returnDiscountPercent: 10,
        quoteMode: false,
        extras: { infantSeat: false, childSeat: false, boosterSeat: false, meetAndGreet: true, extraLuggage: false },
        passengerDetails: null,
        flightCheckResult: null,
        paymentIntentClientSecret: null,
        bookingReference: null,
        promoCode: null,
        promoDiscount: 0,
        guestMode: false,
        attemptId: null,
      }),
    }),
    {
      name: 'prestigo-booking',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        tripType: state.tripType,
        origin: state.origin,
        destination: state.destination,
        hours: state.hours,
        passengers: state.passengers,
        luggage: state.luggage,
        stops: state.stops,
        currentStep: state.currentStep,
        completedSteps: [...state.completedSteps],
        pickupDate: state.pickupDate,
        pickupTime: state.pickupTime,
        landingDate: state.landingDate,
        landingTime: state.landingTime,
        pickupOffsetMin: state.pickupOffsetMin,
        returnDate: state.returnDate,
        returnTime: state.returnTime,
        vehicleClass: state.vehicleClass,
        // distanceKm, priceBreakdown, quoteMode intentionally NOT persisted —
        // prices are always re-fetched on Step 3 mount so admin changes reflect
        // immediately. Persisting stale breakdowns caused airport_fee / night
        // coefficient updates to be ignored.
        extras: state.extras,
        passengerDetails: state.passengerDetails,
        // Phase 33: persist flight check result so the "RE-CHECK FLIGHT" label
        // and status block survive page reload. The flight number is already
        // persisted via passengerDetails; the result must match to avoid
        // showing "CHECK FLIGHT" after reload even when a check was done.
        flightCheckResult: state.flightCheckResult,
        // Phase 26: persist promo across 3DS redirect / tab reload so an
        // applied promo doesn't silently drop on the client. The server's
        // claim_promo_code RPC will reject any stale code on the next POST.
        promoCode: state.promoCode,
        promoDiscount: state.promoDiscount,
        guestMode: state.guestMode,
        // Phase 62 D-06: persist attemptId across the 3DS redirect / same-tab
        // reload so a retry re-POST carries the SAME dedup key (otherwise a
        // fresh id would be generated and the retry would insert a second
        // unpaid row instead of updating the existing one in place).
        attemptId: state.attemptId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.completedSteps = new Set(state.completedSteps as unknown as number[])
        }
      },
    }
  )
)
