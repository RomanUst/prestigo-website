export type TripType = 'transfer' | 'airport_pickup' | 'airport_dropoff' | 'hourly' | 'daily'

export interface PlaceResult {
  address: string
  placeId: string
  lat: number
  lng: number
}

export type VehicleClass = 'business' | 'first_class' | 'business_van'

export interface PassengerDetails {
  firstName: string
  lastName: string
  email: string
  phone: string
  flightNumber?: string
  terminal?: string
  specialRequests?: string
}

export interface PriceBreakdown {
  base: number
  extras: number
  total: number
  currency: string
}

export interface Extras {
  childSeat: boolean
  meetAndGreet: boolean
  extraLuggage: boolean
}

export interface BookingStore {
  // Step 1
  tripType: TripType
  origin: PlaceResult | null
  destination: PlaceResult | null
  hours: number
  passengers: number
  luggage: number
  // Navigation
  currentStep: number
  completedSteps: Set<number>
  // Actions
  setTripType: (type: TripType) => void
  setOrigin: (place: PlaceResult | null) => void
  setDestination: (place: PlaceResult | null) => void
  setHours: (h: number) => void
  setPassengers: (n: number) => void
  setLuggage: (n: number) => void
  nextStep: () => void
  prevStep: () => void
  swapOriginDestination: () => void
}

export const PRG_CONFIG = {
  placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec',
  address: 'Vaclav Havel Airport Prague (PRG)',
  lat: 50.1008,
  lng: 14.26,
} as const
