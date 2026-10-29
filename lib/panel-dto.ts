// Client-safe DTO types and label maps for the Chatwoot Dashboard App (Phase 84).
// Pure: shared by the API route (server) and the iframe (client). No imports from lib/supabase
// and no node built-ins, because this file is bundled into the browser.

export type PaymentState = 'paid' | 'awaiting_payment' | 'quote' | 'cancelled'

export interface PanelBooking {
  id: string
  reference: string | null
  /** Raw booking status key; unknown keys are rendered in the neutral style by the iframe. */
  status: string
  paymentState: PaymentState
  isReturnLeg: boolean
  pickupUtc: string | null
  pickupDate: string
  pickupTime: string
  /** Pickup instant in ms since epoch, or null when neither pickup_utc nor the wall clock parses. */
  pickupMs: number | null
  origin: string
  destination: string | null
  hours: number | null
  vehicleClass: string
  passengers: number
  luggage: number
  amountEur: number | null
  driverName: string | null
  tripProgress: string | null
  flightNumber: string | null
  notes: string | null
  /** Only set for awaiting_payment bookings whose URL is https on buy.stripe.com (D-09). */
  paymentLinkUrl: string | null
  adminHref: string | null
}

export interface PanelResponse {
  state: 'ok' | 'no_contact'
  contact: {
    email: string | null
    phone: string | null
    verified: boolean
    phoneMismatch: boolean
  }
  counters: { trips: number; totalSpentEur: number }
  /** Ascending by pickup, every upcoming booking. */
  upcoming: PanelBooking[]
  /** Descending by pickup, every other loaded booking (the iframe shows the first 10). */
  past: PanelBooking[]
  /** True when the account has more eligible bookings than the 200 rows loaded. */
  pastTruncated: boolean
  leadUrl: string | null
  generatedAt: string
}

// Status vocabulary: the same words the admin bookings table uses (D-07).
export const STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  assigned: 'Assigned',
  en_route: 'En Route',
  on_location: 'On Location',
}

export const VEHICLE_CLASS_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

// Driver-reported trip progress, as shown in the admin driver section.
export const TRIP_PROGRESS_LABELS: Record<string, string> = {
  en_route: 'En Route',
  arrived: 'Arrived',
  on_board: 'On Board',
  completed: 'Completed',
  no_show: 'No-Show',
}

// A cancelled booking has no payment badge.
export const PAYMENT_STATE_LABELS: Record<Exclude<PaymentState, 'cancelled'>, string> = {
  paid: 'Paid',
  awaiting_payment: 'Awaiting payment',
  quote: 'Quote',
}

export const PANEL_ERROR_CODES = [
  'invalid_token',
  'no_access',
  'bad_request',
  'rate_limited',
  'unavailable',
  'not_configured',
  'internal',
] as const

export type PanelErrorCode = (typeof PANEL_ERROR_CODES)[number]
