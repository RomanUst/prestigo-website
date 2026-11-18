// Client-safe view of a resolved quote (Phase 92, plan 92-09; QUOTE-02, T-92-31).
//
// An allow-list builder: the public page and its client islands receive THIS object and never the rows. It carries the
// first name only; no email, phone, last name, billing data, notes, special requests or
// ids exist in it. A trip shows ONE price (owner rule 2026-11-12): stop waiting fees are not in the view at all, only
// the waiting minutes. Pure and client-safe (type import only from the server resolver).

import { firstPickupMs } from '@/lib/quotes/status'
import { quoteFreeUntilMs, termsFromSnapshot } from '@/lib/quotes/terms'
import type { ResolvedQuote } from '@/lib/quotes/resolve'
import type { QuoteCurrency, RemainderMethod } from '@/lib/quotes/vocabulary'

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
    tripType: 'transfer' | 'hourly' | 'daily'
    pickupDate: string
    pickupTime: string
    landingTime: string | null
    origin: string
    destination: string | null
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
  terms: { freeUntilMs: number | null; feePercent: number; freePassed: boolean }
  bookingReferences: string[]
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
      pickupDate: l.pickup_date,
      pickupTime: l.pickup_time,
      landingTime: l.landing_time,
      origin: l.origin_address,
      destination: l.destination_address,
      stops: l.stops.map((s) => ({ address: s.address, waitMinutes: s.wait_minutes })),
      vehicleClass: l.vehicle_class,
      passengers: l.passengers,
      luggage: l.luggage,
      hours: l.hours,
      totalMinor: l.amount_minor,
    })),
    totalMinor,
    depositMinor,
    remainderMinor: totalMinor - depositMinor,
    // A frozen version always has a method (quote_versions_frozen_complete); 'saved_card' is never reached in practice.
    remainderMethod: version.remainder_method ?? 'saved_card',
    terms: { freeUntilMs, feePercent, freePassed: freeUntilMs === null ? true : nowMs > freeUntilMs },
    bookingReferences: r.bookings.map((b) => b.booking_reference),
  }
}
