import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BookingStore, PlaceResult } from '@/types/booking'

export const useBookingStore = create<BookingStore>()(
  persist(
    (set, get) => ({
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
      returnDate: null,
      vehicleClass: null,
      distanceKm: null,
      priceBreakdown: null,
      quoteMode: false,

      setTripType: (type) => {
        set({ tripType: type })
      },
      setOrigin: (place) => set({ origin: place }),
      setDestination: (place) => set({ destination: place }),
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
      setPickupDate: (date) => set({ pickupDate: date }),
      setPickupTime: (time) => set({ pickupTime: time }),
      setReturnDate: (date) => set({ returnDate: date }),
      setVehicleClass: (v) => set({ vehicleClass: v }),
      setDistanceKm: (km) => set({ distanceKm: km }),
      setPriceBreakdown: (p) => set({ priceBreakdown: p }),
      setQuoteMode: (q) => set({ quoteMode: q }),
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
        currentStep: state.currentStep,
        completedSteps: [...state.completedSteps],
        pickupDate: state.pickupDate,
        pickupTime: state.pickupTime,
        returnDate: state.returnDate,
        vehicleClass: state.vehicleClass,
        distanceKm: state.distanceKm,
        priceBreakdown: state.priceBreakdown,
        quoteMode: state.quoteMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.completedSteps = new Set(state.completedSteps as unknown as number[])
        }
      },
    }
  )
)
