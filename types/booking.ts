export type TripType = 'transfer' | 'hourly' | 'daily'

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

export interface VehicleConfig {
  key: VehicleClass
  label: string
  maxPassengers: number
  maxLuggage: number
  image: string  // path relative to /public
}

export const VEHICLE_CONFIG: VehicleConfig[] = [
  { key: 'business', label: 'Business', maxPassengers: 3, maxLuggage: 3, image: '/vehicles/business.jpg' },
  { key: 'first_class', label: 'First Class', maxPassengers: 3, maxLuggage: 3, image: '/vehicles/first-class.jpg' },
  { key: 'business_van', label: 'Business Van', maxPassengers: 7, maxLuggage: 7, image: '/vehicles/business-van.jpg' },
]

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
  // Step 2
  pickupDate: string | null        // ISO date 'YYYY-MM-DD'
  pickupTime: string | null        // '08:15' format
  returnDate: string | null        // Daily Hire only
  // Step 3
  vehicleClass: VehicleClass | null
  distanceKm: number | null        // cached from API response
  priceBreakdown: Record<VehicleClass, PriceBreakdown> | null
  quoteMode: boolean               // true when route cannot be priced
  // Step 4
  extras: Extras
  // Step 5
  passengerDetails: PassengerDetails | null
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
  setPickupDate: (date: string | null) => void
  setPickupTime: (time: string | null) => void
  setReturnDate: (date: string | null) => void
  setVehicleClass: (v: VehicleClass | null) => void
  setDistanceKm: (km: number | null) => void
  setPriceBreakdown: (p: Record<VehicleClass, PriceBreakdown> | null) => void
  setQuoteMode: (q: boolean) => void
  setExtras: (e: Extras) => void
  toggleExtra: (key: keyof Extras) => void
  setPassengerDetails: (d: PassengerDetails) => void
}

export const PRG_CONFIG = {
  placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec',
  address: 'Vaclav Havel Airport Prague (PRG)',
  lat: 50.1008,
  lng: 14.26,
} as const
