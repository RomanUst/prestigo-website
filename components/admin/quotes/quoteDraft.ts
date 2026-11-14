// The in-browser draft of a quote and of one quote line (Phase 92, plan 92-15; QUOTE-01, D-04).
//
// The builder (QuoteBuilder, plan 92-19) holds a QuoteDraft; QuoteLineEditor edits one QuoteLineDraft. Money is typed by
// the operator as text (`amountInput`) and only turned into integer minor units at the edge (parseAmountToMinor), so no
// amount is ever computed or typed in code. The server prices and validates again (92-08): the payload of a line never
// carries a distance or a suggestion, only the operator's amount.
//
// Pure and client-safe: no I/O.

import { parseAmountToMinor, minorToInput, CURRENCY_DECIMALS } from '@/components/admin/paymentShared'
import type { QuoteLinePayload, QuotePriceLinePayload } from '@/lib/quotes/schemas'
import type { QuoteLineRow, QuoteStopRow } from '@/lib/quotes/types'
import type { QuoteCurrency, DepositKind, RemainderMethod } from '@/lib/quotes/vocabulary'

export type QuoteTripType = 'transfer' | 'hourly' | 'daily'
export type QuoteVehicleClass = 'business' | 'first_class' | 'business_van'

export interface QuotePlace {
  address: string
  lat: number
  lng: number
}

export interface QuoteStopDraft {
  key: string
  /** Empty address means no place chosen yet (lat / lng are then 0 and meaningless). */
  address: string
  lat: number
  lng: number
  wait_minutes: number
}

export interface QuoteLandingDraft {
  date: string
  time: string
  offset_min: number
}

export interface QuoteLineDraft {
  key: string
  trip_type: QuoteTripType
  pickup_date: string
  pickup_time: string
  origin: QuotePlace | null
  destination: QuotePlace | null
  stops: QuoteStopDraft[]
  landing: QuoteLandingDraft | null
  vehicle_class: QuoteVehicleClass
  passengers: number
  luggage: number
  hours: number | null
  return_date: string | null
  flight_number: string
  terminal: string
  special_requests: string
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
  /** The operator's amount as typed ("324.00"); the authority for the price (D-04). */
  amountInput: string
  /** What the live tariffs proposed, in minor units; shown, never sent. */
  suggestedMinor: number | null
  /** Server distance of the last suggestion, for display only; never sent. */
  distanceKm: number | null
}

export interface QuoteDraft {
  client: { first_name: string; last_name: string; email: string; phone: string }
  lead_channel: string
  locale: string
  currency: QuoteCurrency
  expires_at: string | null
  deposit: { kind: DepositKind; valueInput: string } | null
  remainder_method: RemainderMethod | null
  cancel_free_hours: string
  cancel_fee_percent: string
  billing: { name: string; address: string; company_id: string; vat_id: string; note: string }
  lines: QuoteLineDraft[]
}

let keyCounter = 0
/** A stable React key for a line or a stop that has no database id yet. */
export function newKey(prefix = 'k'): string {
  keyCounter += 1
  return `${prefix}${Date.now().toString(36)}${keyCounter}`
}

export function emptyLine(): QuoteLineDraft {
  return {
    key: newKey('line'),
    trip_type: 'transfer',
    pickup_date: '',
    pickup_time: '',
    origin: null,
    destination: null,
    stops: [],
    landing: null,
    vehicle_class: 'business',
    passengers: 1,
    luggage: 0,
    hours: null,
    return_date: null,
    flight_number: '',
    terminal: '',
    special_requests: '',
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    amountInput: '',
    suggestedMinor: null,
    distanceKm: null,
  }
}

/** The operator's amount in minor units, or null while the text is empty or not a valid positive amount. */
export function lineAmountMinor(line: QuoteLineDraft, currency: QuoteCurrency): number | null {
  const parsed = parseAmountToMinor(line.amountInput, CURRENCY_DECIMALS[currency])
  return parsed.ok ? parsed.minor : null
}

/** True when the operator's amount is a valid amount that differs from the live-tariff suggestion (D-04). */
export function isManualPrice(line: QuoteLineDraft, currency: QuoteCurrency): boolean {
  const minor = lineAmountMinor(line, currency)
  return line.suggestedMinor !== null && minor !== null && minor !== line.suggestedMinor
}

const trimmedOrNull = (value: string): string | null => {
  const t = value.trim()
  return t === '' ? null : t
}

const NO_PLACE: QuotePlace = { address: '', lat: 0, lng: 0 }

/**
 * The line as the price route and the draft save accept it, without the amount. Fields that do not belong to the trip
 * type are left out (the server schema refuses them). A missing place becomes an empty placeholder the server rejects;
 * the editor does not offer "Suggest price" until the places are chosen.
 */
export function lineToPriceRequest(line: QuoteLineDraft): QuotePriceLinePayload {
  const transfer = line.trip_type === 'transfer'
  const place = (p: QuotePlace | null): QuotePlace => (p ? { address: p.address, lat: p.lat, lng: p.lng } : NO_PLACE)
  return {
    trip_type: line.trip_type,
    pickup_date: line.pickup_date,
    pickup_time: line.pickup_time,
    origin: place(line.origin),
    destination: transfer && line.destination ? place(line.destination) : null,
    stops: transfer
      ? line.stops.map((s) => ({ address: s.address, lat: s.lat, lng: s.lng, wait_minutes: s.wait_minutes }))
      : [],
    landing:
      transfer && line.landing
        ? { date: line.landing.date, time: line.landing.time, offset_min: line.landing.offset_min }
        : null,
    vehicle_class: line.vehicle_class,
    passengers: line.passengers,
    luggage: line.luggage,
    hours: line.trip_type === 'hourly' ? line.hours : null,
    return_date: line.trip_type === 'daily' ? line.return_date : null,
    flight_number: trimmedOrNull(line.flight_number),
    terminal: trimmedOrNull(line.terminal),
    special_requests: trimmedOrNull(line.special_requests),
    extra_child_seat: line.extra_child_seat,
    extra_meet_greet: line.extra_meet_greet,
    extra_luggage: line.extra_luggage,
  }
}

/**
 * One line of the draft save. `amount_minor` comes from the operator's text by parseAmountToMinor; an empty or invalid
 * amount becomes 0, which the server refuses (amount_minor is at least 1), so it can never be saved by accident. There
 * is no distance and no suggestion key (T-92-48).
 */
export function lineToPayload(line: QuoteLineDraft, currency: QuoteCurrency): QuoteLinePayload {
  return { ...lineToPriceRequest(line), amount_minor: lineAmountMinor(line, currency) ?? 0 }
}

const clock = (value: string | null | undefined): string => (typeof value === 'string' ? value.slice(0, 5) : '')

const placeOf = (address: string | null, lat: number | null, lng: number | null): QuotePlace | null =>
  address ? { address, lat: lat ?? 0, lng: lng ?? 0 } : null

/** A stored line (with its stops) as an editable draft. */
export function lineFromDetail(
  row: QuoteLineRow & { stops: QuoteStopRow[] },
  currency: QuoteCurrency,
): QuoteLineDraft {
  const landing =
    row.landing_date && row.landing_time
      ? { date: row.landing_date, time: clock(row.landing_time), offset_min: row.pickup_offset_min ?? 0 }
      : null
  return {
    key: row.id || newKey('line'),
    trip_type: row.trip_type,
    pickup_date: row.pickup_date,
    pickup_time: clock(row.pickup_time),
    origin: placeOf(row.origin_address, row.origin_lat, row.origin_lng),
    destination: placeOf(row.destination_address, row.destination_lat, row.destination_lng),
    stops: [...row.stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        key: s.id || newKey('stop'),
        address: s.address,
        lat: s.lat ?? 0,
        lng: s.lng ?? 0,
        wait_minutes: s.wait_minutes,
      })),
    landing,
    vehicle_class: row.vehicle_class,
    passengers: row.passengers,
    luggage: row.luggage,
    hours: row.hours,
    return_date: row.return_date,
    flight_number: row.flight_number ?? '',
    terminal: row.terminal ?? '',
    special_requests: row.special_requests ?? '',
    extra_child_seat: row.extra_child_seat,
    extra_meet_greet: row.extra_meet_greet,
    extra_luggage: row.extra_luggage,
    amountInput: minorToInput(Number(row.amount_minor), CURRENCY_DECIMALS[currency]),
    suggestedMinor: row.suggested_amount_minor === null ? null : Number(row.suggested_amount_minor),
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
  }
}
