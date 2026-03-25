import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BookingStore, PlaceResult } from '@/types/booking'
import { PRG_CONFIG } from '@/types/booking'

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

      setTripType: (type) => {
        const updates: Partial<BookingStore> = { tripType: type }
        const current = get()
        if (type === 'airport_pickup') {
          updates.destination = PRG_CONFIG as PlaceResult
          if (current.origin?.placeId === PRG_CONFIG.placeId) updates.origin = null
        } else if (type === 'airport_dropoff') {
          updates.origin = PRG_CONFIG as PlaceResult
          if (current.destination?.placeId === PRG_CONFIG.placeId) updates.destination = null
        } else {
          if (current.destination?.placeId === PRG_CONFIG.placeId) updates.destination = null
          if (current.origin?.placeId === PRG_CONFIG.placeId) updates.origin = null
        }
        set(updates)
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.completedSteps = new Set(state.completedSteps as unknown as number[])
        }
      },
    }
  )
)
