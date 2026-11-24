// What a quote line still misses before the quote can be sent (migration 097, owner request 2026-11-24).
//
// A draft line may leave its pickup date, time, address, price and the fields its trip type needs empty: the builder
// shows them as TBC and the operator fills them in as the client confirms. Sending freezes the version, and a frozen
// version must be complete; this is the one list of what "complete" means, shared by the builder (the TBC list next
// to Send), the send action (lib/quotes/lifecycle.ts) and mirrored by the version guard in the database.
//
// Pure and client-safe.

import type { QuoteLineTripType } from '@/lib/quotes/vocabulary'

export const QUOTE_LINE_REQUIRED_FIELDS = [
  'pickup_date',
  'pickup_time',
  'origin',
  'destination',
  'hours',
  'return_date',
  'title',
  'amount',
] as const
export type QuoteLineRequiredField = (typeof QUOTE_LINE_REQUIRED_FIELDS)[number]

export interface CompletenessInput {
  trip_type: QuoteLineTripType
  pickup_date: string | null | undefined
  pickup_time: string | null | undefined
  /** The pickup address (empty or null = not chosen yet). */
  origin: string | null | undefined
  destination: string | null | undefined
  hours: number | null | undefined
  return_date: string | null | undefined
  title: string | null | undefined
  /** The line amount in minor units; null when not entered. */
  amount: number | null | undefined
}

const blank = (v: string | null | undefined): boolean => v == null || v.trim() === ''

/** The fields this line still needs before the quote can be sent, in a stable order. Empty = complete. */
export function lineMissingFields(line: CompletenessInput): QuoteLineRequiredField[] {
  const out: QuoteLineRequiredField[] = []
  if (blank(line.pickup_date)) out.push('pickup_date')
  if (blank(line.pickup_time)) out.push('pickup_time')
  if (blank(line.origin)) out.push('origin')
  if (line.trip_type === 'transfer' && blank(line.destination)) out.push('destination')
  if ((line.trip_type === 'hourly' || line.trip_type === 'tour') && line.hours == null) out.push('hours')
  if (line.trip_type === 'daily' && blank(line.return_date)) out.push('return_date')
  if (line.trip_type === 'tour' && blank(line.title)) out.push('title')
  if (line.amount == null || !(line.amount > 0)) out.push('amount')
  return out
}

/** The plain label of a missing field in the admin (English, like the rest of the builder). */
export const MISSING_FIELD_LABEL: Record<QuoteLineRequiredField, string> = {
  pickup_date: 'pickup date',
  pickup_time: 'pickup time',
  origin: 'pickup address',
  destination: 'destination',
  hours: 'hours',
  return_date: 'return date',
  title: 'tour title',
  amount: 'price',
}
