import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PlaceResult, VehicleClass } from '@/types/booking'

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
export const STORAGE_KEY = 'prestigo:quote:v1'

export type QuoteServiceType = 'transfer' | 'hourly' | 'daily'

export type CalculatorState = {
  from: PlaceResult | null
  to: PlaceResult | null
  serviceType: QuoteServiceType
  date: string | null          // 'YYYY-MM-DD'
  time: string | null          // 'HH:MM'
  hours: number                // for hourly service, default 2
  passengers: number           // 1–7 (CALC-05)
  childSeats: number           // 0–3, +€15 each
  extraStops: number           // 0–5, +€20 each
  vehicleClass: VehicleClass | null
  expiresAt: number | null     // UNIX ms
  // Non-persisted (runtime only)
  priceBreakdown: Record<VehicleClass, { base: number; extras: number; total: number; currency: string }> | null
  distanceKm: number | null
  quoteMode: boolean
  matchedRouteSlug: string | null
  // Actions
  setFrom: (p: PlaceResult | null) => void
  setTo: (p: PlaceResult | null) => void
  setServiceType: (t: QuoteServiceType) => void
  setDate: (d: string | null) => void
  setTime: (t: string | null) => void
  setHours: (h: number) => void
  setPassengers: (n: number) => void
  setChildSeats: (n: number) => void
  setExtraStops: (n: number) => void
  setVehicleClass: (v: VehicleClass | null) => void
  setPriceBreakdown: (p: CalculatorState['priceBreakdown']) => void
  setDistanceKm: (d: number | null) => void
  setQuoteMode: (q: boolean) => void
  setMatchedRouteSlug: (s: string | null) => void
  touchSession: () => void
  resetQuote: () => void
}

const defaultState = {
  from: null as PlaceResult | null,
  to: null as PlaceResult | null,
  serviceType: 'transfer' as QuoteServiceType,
  date: null as string | null,
  time: null as string | null,
  hours: 2,
  passengers: 1,
  childSeats: 0,
  extraStops: 0,
  vehicleClass: null as VehicleClass | null,
  expiresAt: null as number | null,
  priceBreakdown: null as CalculatorState['priceBreakdown'],
  distanceKm: null as number | null,
  quoteMode: false,
  matchedRouteSlug: null as string | null,
}

export const useCalculatorStore = create<CalculatorState>()(
  persist(
    (set) => ({
      ...defaultState,

      setFrom: (p) =>
        set({
          from: p,
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setTo: (p) =>
        set({
          to: p,
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setServiceType: (t) =>
        set({
          serviceType: t,
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setDate: (d) =>
        set({
          date: d,
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setTime: (t) =>
        set({
          time: t,
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setHours: (h) =>
        set({
          hours: Math.max(1, Math.min(24, h)),
        }),

      setPassengers: (n) =>
        set({
          passengers: Math.max(1, Math.min(7, n)),
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setChildSeats: (n) =>
        set({
          childSeats: Math.max(0, Math.min(3, n)),
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setExtraStops: (n) =>
        set({
          extraStops: Math.max(0, Math.min(5, n)),
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setVehicleClass: (v) =>
        set({
          vehicleClass: v,
          priceBreakdown: null,
          distanceKm: null,
          quoteMode: false,
          matchedRouteSlug: null,
          expiresAt: Date.now() + SEVEN_DAYS_MS,
        }),

      setPriceBreakdown: (p) => set({ priceBreakdown: p }),

      setDistanceKm: (d) => set({ distanceKm: d }),

      setQuoteMode: (q) => set({ quoteMode: q }),

      setMatchedRouteSlug: (s) => set({ matchedRouteSlug: s }),

      touchSession: () => set({ expiresAt: Date.now() + SEVEN_DAYS_MS }),

      resetQuote: () =>
        set({
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
        }),
    }),
    {
      name: STORAGE_KEY,  // 'prestigo:quote:v1'
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : (undefined as unknown as Storage)
      ),
      partialize: (state) => ({
        from: state.from,
        to: state.to,
        serviceType: state.serviceType,
        date: state.date,
        time: state.time,
        hours: state.hours,
        passengers: state.passengers,
        childSeats: state.childSeats,
        extraStops: state.extraStops,
        vehicleClass: state.vehicleClass,
        expiresAt: state.expiresAt,
        // NEVER: priceBreakdown, distanceKm, quoteMode, matchedRouteSlug
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.expiresAt && Date.now() > state.expiresAt) {
          state.from = null
          state.to = null
          state.date = null
          state.time = null
          state.vehicleClass = null
          state.expiresAt = null
        }
      },
    }
  )
)
