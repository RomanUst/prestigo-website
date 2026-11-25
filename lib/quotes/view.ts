// Client-safe view of a resolved quote (Phase 92, plan 92-09; QUOTE-02, T-92-31).
//
// An allow-list builder: the public page and its client islands receive THIS object and never the rows. It carries the
// first name only; no email, phone, last name, billing data, notes, special requests or
// ids exist in it. The line title and description (migration 096) are operator text written FOR the client. A trip shows ONE price (owner rule 2026-11-12): stop waiting fees are not in the view at all, only
// the waiting minutes. Pure and client-safe (type import only from the server resolver).

import { firstPickupMs } from '@/lib/quotes/status'
import { quoteFreeUntilMs, termsFromSnapshot } from '@/lib/quotes/terms'
import type { ResolvedQuote } from '@/lib/quotes/resolve'
import type { QuoteCurrency, QuoteLineTripType, RemainderMethod } from '@/lib/quotes/vocabulary'

export interface QuoteView {
  reference: string
  versionNo: number
  state: 'offer' | 'accepted' | 'paid'
  locale: string
  currency: QuoteCurrency
  clientFirstName: string
  expiresAt: string | null
  lines: Array<{
    position: number
    tripType: QuoteLineTripType
    /** A tour's headline, shown instead of the trip-type label; null for every other line. */
    title: string | null
    /** The operator's client-visible text of the line (plain text, line breaks kept); null when none. */
    description: string | null
    /** Null = to be confirmed (migration 099: a quote may be sent with TBC fields). */
    pickupDate: string | null
    pickupTime: string | null
    landingTime: string | null
    origin: string | null
    destination: string | null
    /** A transfer whose destination is still to be confirmed. */
    destinationTbc: boolean
    stops: Array<{ address: string; waitMinutes: number }>
    vehicleClass: 'business' | 'first_class' | 'business_van'
    passengers: number
    luggage: number
    hours: number | null
    totalMinor: number
  }>
  totalMinor: number
  depositMinor: number
  remainderMinor: number
  remainderMethod: RemainderMethod
  /** freeHours: the stored free window, for the "until N hours before the first trip" wording while no pickup is known. */
  terms: { freeUntilMs: number | null; feePercent: number; freePassed: boolean; freeHours: number; pickupKnown: boolean }
  bookingReferences: string[]
  /** Migration 099: paid while a trip is still TBC; the booking references follow when the details are set. */
  bookingsPending: boolean
}

export function buildQuoteView(r: ResolvedQuote, nowMs: number): QuoteView {
  const { quote, version } = r
  const totalMinor = version.total_minor
  const depositMinor = version.deposit_minor ?? 0
  const { freeHours, feePercent } = termsFromSnapshot(version.cancel_policy)
  const first = firstPickupMs(r.lines)
  const freeUntilMs = first === null ? null : quoteFreeUntilMs(first, freeHours)

  const state: QuoteView['state'] = r.state === 'paid' ? 'paid' : quote.status === 'accepted' ? 'accepted' : 'offer'

  return {
    reference: quote.reference,
    versionNo: version.version_no,
    state,
    locale: version.locale,
    currency: version.currency,
    clientFirstName: quote.client_first_name,
    expiresAt: quote.expires_at,
    lines: r.lines.map((l) => ({
      position: l.position,
      tripType: l.trip_type,
      title: l.trip_type === 'tour' && l.title ? l.title : null,
      description: l.description ? l.description : null,
      pickupDate: l.pickup_date ?? null,
      pickupTime: l.pickup_time ?? null,
      landingTime: l.landing_time,
      origin: l.origin_address ?? null,
      destination: l.destination_address,
      destinationTbc: l.trip_type === 'transfer' && !l.destination_address,
      stops: l.stops.map((s) => ({ address: s.address, waitMinutes: s.wait_minutes })),
      vehicleClass: l.vehicle_class,
      passengers: l.passengers,
      luggage: l.luggage,
      hours: l.hours,
      totalMinor: l.amount_minor ?? 0,
    })),
    totalMinor,
    depositMinor,
    remainderMinor: totalMinor - depositMinor,
    // A frozen version always has a method (quote_versions_frozen_complete); 'saved_card' is never reached in practice.
    remainderMethod: version.remainder_method ?? 'saved_card',
    terms: {
      freeUntilMs,
      feePercent,
      freePassed: freeUntilMs === null ? first !== null : nowMs > freeUntilMs,
      freeHours,
      pickupKnown: first !== null,
    },
    bookingReferences: r.bookings.map((b) => b.booking_reference),
    bookingsPending: quote.bookings_pending === true,
  }
}
