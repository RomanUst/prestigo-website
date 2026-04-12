export type TripType = 'transfer' | 'hourly' | 'daily' | 'round_trip'

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
  infantSeat: boolean     // 0–9 kg, free
  childSeat: boolean      // 18–36 kg, free
  boosterSeat: boolean    // booster, free
  meetAndGreet: boolean   // always included, free
  extraLuggage: boolean   // kept for API compat, not shown in UI
}

export interface VehicleConfig {
  key: VehicleClass
  label: string
  maxPassengers: number
  maxLuggage: number
  image: string  // path relative to /public
}

export const VEHICLE_CONFIG: VehicleConfig[] = [
  { key: 'business', label: 'Business', maxPassengers: 3, maxLuggage: 3, image: '/e-class-photo.png' },
  { key: 'first_class', label: 'First Class', maxPassengers: 3, maxLuggage: 3, image: '/s-class-photo.png' },
  { key: 'business_van', label: 'Business Van', maxPassengers: 6, maxLuggage: 6, image: '/v-class-photo.png' },
]

export interface FlightCheckResult {
  flight_iata: string
  flight_status: string
  flight_estimated_arrival: string | null
  flight_delay_minutes: number | null
  flight_departure_airport: string
  flight_arrival_airport: string
  flight_terminal: string | null
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
  // Step 2
  pickupDate: string | null        // ISO date 'YYYY-MM-DD'
  pickupTime: string | null        // '08:15' format
  returnDate: string | null        // Daily Hire and Round Trip
  returnTime: string | null        // '14:30' format — Round Trip only
  // Step 3
  vehicleClass: VehicleClass | null
  distanceKm: number | null        // cached from API response
  priceBreakdown: Record<VehicleClass, PriceBreakdown> | null
  roundTripPriceBreakdown: Record<VehicleClass, PriceBreakdown> | null
  returnDiscountPercent: number    // admin-configurable round trip discount %
  quoteMode: boolean               // true when route cannot be priced
  // Step 4
  extras: Extras
  // Step 5
  passengerDetails: PassengerDetails | null
  flightCheckResult: FlightCheckResult | null
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
  setReturnTime: (time: string | null) => void
  setVehicleClass: (v: VehicleClass | null) => void
  setDistanceKm: (km: number | null) => void
  setPriceBreakdown: (p: Record<VehicleClass, PriceBreakdown> | null) => void
  setRoundTripPriceBreakdown: (p: Record<VehicleClass, PriceBreakdown> | null) => void
  setReturnDiscountPercent: (pct: number) => void
  setQuoteMode: (q: boolean) => void
  setExtras: (e: Extras) => void
  toggleExtra: (key: keyof Extras) => void
  setPassengerDetails: (d: PassengerDetails) => void
  setFlightCheckResult: (r: FlightCheckResult | null) => void
  // Step 6 / Payment
  paymentIntentClientSecret: string | null
  bookingReference: string | null
  setPaymentIntentClientSecret: (s: string | null) => void
  setBookingReference: (ref: string | null) => void
  // Promo
  promoCode: string | null
  promoDiscount: number          // percentage (0 = no discount)
  setPromoCode: (code: string | null) => void
  setPromoDiscount: (pct: number) => void
  resetBooking: () => void
}

export const PRG_CONFIG = {
  placeId: 'ChIJA_IVS6-UC0cRTZBQLvHG-ec',
  address: 'Vaclav Havel Airport Prague (PRG)',
  lat: 50.1008,
  lng: 14.26,
} as const
