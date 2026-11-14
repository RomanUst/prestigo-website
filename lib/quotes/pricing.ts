// The live-tariff suggestion for one quote line (Phase 92, plan 92-08; QUOTE-01; D-04, Phase 91 rules).
//
// The operator's amount is the authority of a quote line; this module only proposes it. Everything it needs is
// computed here on the server: the distance is the Google Routes distance through origin, ALL stops and destination
// (never a number from the browser, T-92-26), the airport flag comes from the coordinates, the waiting uses the
// per-class admin rate with the first 15 minutes of every stop free, and the line has one total that already includes
// the waiting (owner decision 2026-11-12: no waiting breakdown for the client). No price is typed in this file: every
// rate comes from `rates` (the admin pricing config).
//
// Server only (route-distance reads the Google key). Logs carry reasons only, never an address or a coordinate.

import { eurToCzk } from '@/lib/currency'
import { computeExtrasTotal } from '@/lib/extras'
import { isAirportTrip } from '@/lib/airport'
import type { PricingRates } from '@/lib/pricing-config'
import { dateDiffDays } from '@/lib/pricing'
import { computeRouteDistance } from '@/lib/route-distance'
import { computeOutboundLegTotal } from '@/lib/server-pricing'
import { priceStops, totalWaitingBlocks, waitingFeeEur, type PricedStop } from '@/lib/stops'
import type { QuoteCurrency } from '@/lib/quotes/vocabulary'

interface Point {
  lat: number
  lng: number
  address?: string
}

/** The fields of a line that decide its price. The operator's amount and the free-text fields are not here. */
export interface QuotePricingLine {
  trip_type: 'transfer' | 'hourly' | 'daily'
  pickup_date: string
  pickup_time: string
  origin: Point
  destination?: Point | null
  stops: ReadonlyArray<Point & { wait_minutes: number }>
  vehicle_class: 'business' | 'first_class' | 'business_van'
  hours?: number | null
  return_date?: string | null
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
}

export type LinePriceSuggestion =
  | { ok: true; distanceKm: number | null; suggestedMinor: number; waitingUnavailable: boolean }
  | { ok: false; reason: 'route_unavailable' | 'pricing_unavailable' }

/** EUR per started 15 minutes of waiting for the class, or null when the admin set none (D-05: no paid waiting). */
export function waitingRateFor(rates: PricingRates, vehicleClass: string): number | null {
  const rate = rates.waitingRate?.[vehicleClass]
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null
}

/**
 * The per-stop rows of a line for storage: blocks and the fee snapshot taken at the current rate. A class without a
 * waiting rate gets blocks counted but no fee (the suggestion then reports waitingUnavailable).
 */
export function priceLineStops(line: Pick<QuotePricingLine, 'stops' | 'vehicle_class'>, rates: PricingRates): PricedStop[] {
  return priceStops(
    line.stops.map((s) => ({ address: s.address, lat: s.lat, lng: s.lng, waitMinutes: s.wait_minutes })),
    waitingRateFor(rates, line.vehicle_class),
  )
}

/** Hundredths of the quote currency for a EUR total: euros to the cent, crowns converted once and whole. */
function toMinor(totalEur: number, currency: QuoteCurrency): number {
  return currency === 'czk' ? eurToCzk(totalEur) * 100 : Math.round(totalEur * 100)
}

/**
 * The suggested amount of one line in minor units of `currency`, plus the server distance it was computed with.
 *   route_unavailable   - a transfer whose route Google could not compute (no fallback distance, ever)
 *   pricing_unavailable - the line cannot be priced from the tariffs (no tariff for the class, no destination, a
 *                         total that is not a positive number)
 */
export async function suggestLinePrice(
  line: QuotePricingLine,
  input: { rates: PricingRates; currency: QuoteCurrency },
): Promise<LinePriceSuggestion> {
  const { rates, currency } = input
  const vehicleClass = line.vehicle_class

  const waitingRate = waitingRateFor(rates, vehicleClass)
  const stops = line.trip_type === 'transfer' ? line.stops : []
  const blocks = totalWaitingBlocks(stops.map((s) => ({ waitMinutes: s.wait_minutes })))
  const waitingUnavailable = blocks > 0 && waitingRate === null
  const waitingFee = blocks > 0 && waitingRate !== null ? waitingFeeEur(blocks, waitingRate) : 0

  // The airport flag comes from the coordinates only, never from the browser (T-91-05).
  const isAirport = isAirportTrip(line.origin, line.destination ?? null)

  let distanceKm: number | null = null
  if (line.trip_type === 'transfer') {
    if (!line.destination) return { ok: false, reason: 'pricing_unavailable' }
    // Fail closed before spending routing quota when the class has no tariff at all.
    if (!(rates.ratePerKm?.[vehicleClass] > 0)) return { ok: false, reason: 'pricing_unavailable' }
    const route = await computeRouteDistance({
      origin: { lat: line.origin.lat, lng: line.origin.lng },
      destination: { lat: line.destination.lat, lng: line.destination.lng },
      intermediates: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    })
    if (!route.ok) {
      console.error('[quotes/pricing] route distance failed:', route.reason)
      return { ok: false, reason: 'route_unavailable' }
    }
    distanceKm = route.distanceKm
  }

  const days = line.return_date ? dateDiffDays(line.pickup_date, line.return_date) : 1
  let outboundEur: number
  try {
    outboundEur = computeOutboundLegTotal(
      vehicleClass,
      distanceKm,
      line.hours ?? 2,
      days,
      line.trip_type,
      line.pickup_date,
      line.pickup_time,
      isAirport,
      rates,
    )
  } catch {
    return { ok: false, reason: 'pricing_unavailable' }
  }

  const extrasEur = computeExtrasTotal(
    {
      infantSeat: false,
      childSeat: line.extra_child_seat,
      boosterSeat: false,
      meetAndGreet: line.extra_meet_greet,
      extraLuggage: line.extra_luggage,
    },
    {
      infantSeat: 0,
      childSeat: rates.globals.extraChildSeat,
      boosterSeat: 0,
      meetAndGreet: 0,
      extraLuggage: rates.globals.extraLuggage,
    },
  )

  const totalEur = outboundEur + extrasEur + waitingFee
  if (!Number.isFinite(totalEur) || totalEur <= 0) return { ok: false, reason: 'pricing_unavailable' }

  return { ok: true, distanceKm, suggestedMinor: toMinor(totalEur, currency), waitingUnavailable }
}
