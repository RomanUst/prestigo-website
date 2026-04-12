import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BookingStore, PlaceResult, Stop, FlightCheckResult } from '@/types/booking'

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
      returnDate: null,
      returnTime: null,
      vehicleClass: null,
      distanceKm: null,
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

      setTripType: (type) => {
        const clearReturn = type !== 'round_trip'
        const clearStops = type === 'round_trip' || type === 'hourly' || type === 'daily'
        set({
          tripType: type,
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          ...(clearReturn ? { returnTime: null } : {}),
          ...(clearStops ? { stops: [] } : {}),
        })
      },
      setOrigin: (place) => set({ origin: place, priceBreakdown: null, distanceKm: null, quoteMode: false }),
      setDestination: (place) => set({ destination: place, priceBreakdown: null, distanceKm: null, quoteMode: false }),
      setHours: (h) => set({ hours: h }),
      setPassengers: (n) => set({ passengers: Math.max(1, Math.min(8, n)) }),
      setLuggage: (n) => set({ luggage: Math.max(0, Math.min(8, n)) }),
      nextStep: () =>
        set((s) => ({
          completedSteps: new Set([...s.completedSteps, s.currentStep]),
          currentStep: Math.min(6, s.currentStep + 1),
        })),
      prevStep: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
      swapOriginDestination: () => {
        const { origin, destination } = get()
        set({ origin: destination, destination: origin })
      },
      addStop: () => set((s) => {
        if (s.stops.length >= 5) return s  // STOP-01 max 5 enforcement
        return {
          stops: [...s.stops, { id: crypto.randomUUID(), place: null } as Stop],
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
      setPickupDate: (date) => set({ pickupDate: date }),
      setPickupTime: (time) => set({ pickupTime: time }),
      setReturnDate: (date) => set({ returnDate: date }),
      setReturnTime: (time) => set({ returnTime: time }),
      setVehicleClass: (v) => set({ vehicleClass: v }),
      setDistanceKm: (km) => set({ distanceKm: km }),
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
        returnDate: null,
        returnTime: null,
        vehicleClass: null,
        distanceKm: null,
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.completedSteps = new Set(state.completedSteps as unknown as number[])
        }
      },
    }
  )
)
