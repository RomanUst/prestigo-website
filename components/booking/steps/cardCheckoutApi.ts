// Shared, side-effect free helpers for the card-on-file checkout (Phase 88, plan 88-10).
// Step6Checkout re-exports buildCardCheckoutBody / fetchCardInit; they live here so
// Step6CardOnFile can use them without a circular import through Step6Checkout.

import { isAirportPlace } from '@/types/booking'
import { useBookingStore } from '@/lib/booking-store'
import type { BookingStore } from '@/types/booking'

export type CardMode = 'setup' | 'hold_now'
export type CardCurrency = 'eur' | 'czk'

export interface InitEligible {
  eligible: true
  mode: CardMode
  holdAtIso: string | null
  holdDateIso: string | null
  amountMinor: number
  currency: CardCurrency
}

export type InitResult = InitEligible | { eligible: false }

/** The slice of the booking store the checkout request body is built from. */
export type CheckoutStoreState = Pick<
  BookingStore,
  | 'tripType'
  | 'vehicleClass'
  | 'origin'
  | 'destination'
  | 'hours'
  | 'passengers'
  | 'luggage'
  | 'pickupDate'
  | 'pickupTime'
  | 'returnDate'
  | 'returnTime'
  | 'distanceKm'
  | 'extras'
  | 'passengerDetails'
>

/**
 * Same field mapping as Step6Payment's create-payment-intent body, so the
 * server prices exactly the booking the legacy flow would have priced.
 */
export function buildCardCheckoutBody(
  state: CheckoutStoreState,
  opts: { attemptId: string; currency: CardCurrency; promoCode: string | null; locale: string },
) {
  const { origin, destination, extras, passengerDetails } = state
  return {
    bookingData: {
      attemptId: opts.attemptId,
      tripType: state.tripType,
      vehicleClass: state.vehicleClass ?? '',
      originAddress: origin?.address ?? '',
      originLat: origin?.lat != null ? String(origin.lat) : '',
      originLng: origin?.lng != null ? String(origin.lng) : '',
      destinationAddress: destination?.address ?? '',
      destinationLat: destination?.lat != null ? String(destination.lat) : '',
      destinationLng: destination?.lng != null ? String(destination.lng) : '',
      hours: String(state.hours),
      passengers: String(state.passengers),
      luggage: String(state.luggage),
      pickupDate: state.pickupDate ?? '',
      pickupTime: state.pickupTime ?? '',
      returnDate: state.returnDate ?? '',
      returnTime: state.returnTime ?? '',
      distanceKm: state.distanceKm != null ? String(state.distanceKm) : '',
      extraChildSeat: String(extras.childSeat),
      extraMeetGreet: String(extras.meetAndGreet),
      extraLuggage: String(extras.extraLuggage),
      isAirport: String(isAirportPlace(origin) || isAirportPlace(destination)),
      firstName: passengerDetails?.firstName ?? '',
      lastName: passengerDetails?.lastName ?? '',
      email: passengerDetails?.email ?? '',
      phone: passengerDetails?.phone ?? '',
      flightNumber: passengerDetails?.flightNumber ?? '',
      terminal: passengerDetails?.terminal ?? '',
      specialRequests: (passengerDetails?.specialRequests ?? '').slice(0, 490),
      currency: opts.currency,
      promoCode: opts.promoCode || '',
      locale: opts.locale,
    },
  }
}

/**
 * POST /api/card-checkout/init. Resolves null on ANY failure (network, non-2xx,
 * malformed body): the caller then renders the legacy payment step, so the card
 * flow can never block checkout (UI-SPEC E1).
 */
export async function fetchCardInit(
  body: ReturnType<typeof buildCardCheckoutBody> & { currency: CardCurrency },
): Promise<InitResult | null> {
  try {
    const res = await fetch('/api/card-checkout/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<InitEligible> & { eligible?: unknown }
    if (data.eligible !== true) return { eligible: false }
    if (
      (data.mode !== 'setup' && data.mode !== 'hold_now') ||
      typeof data.amountMinor !== 'number' ||
      (data.currency !== 'eur' && data.currency !== 'czk')
    ) {
      return null
    }
    return {
      eligible: true,
      mode: data.mode,
      holdAtIso: data.holdAtIso ?? null,
      holdDateIso: data.holdDateIso ?? null,
      amountMinor: data.amountMinor,
      currency: data.currency,
    }
  } catch {
    return null
  }
}

/** sessionStorage marker: this attemptId has been used by the card flow (see Step6Checkout). */
export const CARD_ATTEMPT_MARKER = 'prestigo-card-attempt'

export function markCardAttempt(attemptId: string): void {
  try {
    window.sessionStorage.setItem(CARD_ATTEMPT_MARKER, attemptId)
  } catch {
    /* storage unavailable: the fallback still rotates on an explicit onFallback */
  }
}

export function wasCardAttempt(attemptId: string | null): boolean {
  if (!attemptId) return false
  try {
    return window.sessionStorage.getItem(CARD_ATTEMPT_MARKER) === attemptId
  } catch {
    return false
  }
}

/**
 * The attempt id is generated lazily and persisted by the store (sessionStorage), like Step6Payment.
 * Read fresh from the store so a just-generated id is visible to every caller.
 */
export function ensureAttemptId(): string {
  const state = useBookingStore.getState()
  if (state.attemptId) return state.attemptId
  const id = crypto.randomUUID()
  state.setAttemptId(id)
  return id
}

/**
 * One flow per attempt: a pay-now POST for an attemptId that already went through the card flow would
 * overwrite that booking row without resetting payment_mode (known follow-up from 88-08). Before the legacy
 * step takes over, rotate the attemptId if the card flow touched it. Returns the id the legacy step will use.
 */
export function rotateAttemptIfCardUsed(): void {
  const state = useBookingStore.getState()
  if (wasCardAttempt(state.attemptId)) {
    state.setAttemptId(crypto.randomUUID())
    try {
      window.sessionStorage.removeItem(CARD_ATTEMPT_MARKER)
    } catch {
      /* ignore */
    }
  }
}

/**
 * 88-REVIEW B-WR-02 / B-WR-03: the server answered 409 ATTEMPT_CLOSED (the attempt was cancelled or belongs to the
 * pay-now flow). The next submit starts a brand-new attempt (and so a new booking row).
 */
export function startNewAttempt(): string {
  const id = crypto.randomUUID()
  useBookingStore.getState().setAttemptId(id)
  try {
    window.sessionStorage.removeItem(CARD_ATTEMPT_MARKER)
  } catch {
    /* ignore */
  }
  return id
}
