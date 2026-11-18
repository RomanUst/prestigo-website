// Request schemas of the admin quote API (Phase 92, plan 92-08; QUOTE-01, QUOTE-06; D-04, D-09).
//
// One shape for a quote line, shared by the draft save (PATCH /api/admin/quotes/[id]) and the price suggestion
// (POST /api/admin/quotes/price). Every object is strict, so an unknown key is a 400: in particular a client can never
// send a distance or a suggested amount (the server computes both, T-92-26). Shape errors are 400; the business rules
// that need the stored quote (frozen version, deposit above total, expiry in the past) are answered by the store as
// 422 / 409.
//
// Client-safe in principle (zod and pure helpers only), used by the server routes and the store.

import { z } from 'zod'
import { locales } from '@/i18n/locales'
import { LANDING_OFFSETS, pickupFromLanding } from '@/lib/airport-pickup'
import { NO_LINE_BREAKS } from '@/lib/request-guards'
import { MAX_STOPS, isValidStopWait } from '@/lib/stops'
import {
  DEPOSIT_KINDS,
  QUOTE_CURRENCIES,
  QUOTE_MAX_LINES,
  REMAINDER_METHODS,
} from '@/lib/quotes/vocabulary'

/** The five lead channels of a manual booking and of a quote (bookings.lead_channel CHECK). */
export const QUOTE_LEAD_CHANNELS = ['whatsapp', 'phone', 'email', 'partner', 'other'] as const

/** Largest amount one line may carry, in minor units (1 000 000 in the quote currency). A typo guard, not a business cap. */
export const QUOTE_LINE_AMOUNT_CEILING_MINOR = 100_000_000

/** Largest deposit value of a fixed deposit, in minor units. */
const DEPOSIT_VALUE_CEILING = QUOTE_LINE_AMOUNT_CEILING_MINOR * QUOTE_MAX_LINES

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date: 2027-02-31 is refused. */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const dateString = z.string().refine(isRealDate, 'Invalid date')
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time')

/** One line of text, 1..max characters, no CR / LF (the value can reach an email subject or a PDF line). */
const singleLine = (min: number, max: number) => z.string().min(min).max(max).regex(NO_LINE_BREAKS, 'Invalid format')

const lat = z.number().min(-90).max(90)
const lng = z.number().min(-180).max(180)

const place = z.strictObject({ address: singleLine(1, 500), lat, lng })

const stop = z.strictObject({
  address: singleLine(1, 500),
  lat,
  lng,
  wait_minutes: z.number().refine(isValidStopWait, 'Waiting is 0 to 120 minutes in steps of 15'),
})

const landing = z.strictObject({
  date: dateString,
  time: timeString,
  offset_min: z.number().refine((n) => (LANDING_OFFSETS as readonly number[]).includes(n), 'Invalid landing offset'),
})

/** The line fields both the draft save and the price suggestion accept. No amount, no distance, no suggestion. */
const lineShape = {
  trip_type: z.enum(['transfer', 'hourly', 'daily']),
  pickup_date: dateString,
  pickup_time: timeString,
  origin: place,
  destination: place.nullish(),
  stops: z.array(stop).max(MAX_STOPS).default([]),
  landing: landing.nullish(),
  vehicle_class: z.enum(['business', 'first_class', 'business_van']),
  passengers: z.number().int().min(1).max(20),
  luggage: z.number().int().min(0).max(20),
  hours: z.number().int().min(1).max(24).nullish(),
  return_date: dateString.nullish(),
  flight_number: singleLine(0, 20).nullish(),
  terminal: singleLine(0, 20).nullish(),
  special_requests: z.string().max(1000).nullish(),
  extra_child_seat: z.boolean().default(false),
  extra_meet_greet: z.boolean().default(false),
  extra_luggage: z.boolean().default(false),
}

type LineCheckInput = {
  trip_type: 'transfer' | 'hourly' | 'daily'
  pickup_date: string
  pickup_time: string
  destination?: unknown
  stops: unknown[]
  landing?: { date: string; time: string; offset_min: number } | null
  hours?: number | null
  return_date?: string | null
}

/** The rules that tie the fields of one line together (each is a shape error: 400). */
function checkLine(line: LineCheckInput, ctx: z.RefinementCtx): void {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

  if (line.trip_type === 'transfer') {
    if (!line.destination) issue('destination', 'A transfer needs a destination')
    if (line.hours != null) issue('hours', 'Hours belong to an hourly trip')
    if (line.return_date != null) issue('return_date', 'A return date belongs to a daily trip')
  } else {
    if (line.stops.length > 0) issue('stops', 'Stops belong to a transfer')
    if (line.landing != null) issue('landing', 'A landing belongs to a transfer')
    if (line.trip_type === 'hourly') {
      if (line.hours == null) issue('hours', 'An hourly trip needs hours')
      if (line.return_date != null) issue('return_date', 'A return date belongs to a daily trip')
    } else {
      if (!line.return_date) issue('return_date', 'A daily trip needs a return date')
      else if (line.return_date <= line.pickup_date) issue('return_date', 'The return date is after the pickup date')
      if (line.hours != null) issue('hours', 'Hours belong to an hourly trip')
    }
  }

  // D-18 of Phase 91: the pickup of an airport arrival is the landing plus the offset, derived on the server.
  if (line.landing) {
    const derived = pickupFromLanding(line.landing.date, line.landing.time, line.landing.offset_min)
    if (!derived) issue('landing', 'Invalid landing time')
    else if (derived.pickupDate !== line.pickup_date || derived.pickupTime !== line.pickup_time) {
      issue('pickup_time', 'The pickup does not match the landing time')
    }
  }
}

const baseLineSchema = z.strictObject(lineShape)

/** A line without an amount: the body of the price suggestion. */
export const quotePriceLineSchema = baseLineSchema.superRefine(checkLine)

/** A line of a draft: the same fields plus the operator's amount (positive whole minor units). */
export const quoteLineSchema = z
  .strictObject({
    ...lineShape,
    amount_minor: z.number().int().min(1).max(QUOTE_LINE_AMOUNT_CEILING_MINOR),
  })
  .superRefine(checkLine)

export type QuoteLinePayload = z.infer<typeof quoteLineSchema>
export type QuotePriceLinePayload = z.infer<typeof quotePriceLineSchema>

export const quoteCurrencySchema = z.enum(QUOTE_CURRENCIES)
export const quoteLocaleSchema = z.enum(locales)

const clientSchema = z.strictObject({
  first_name: singleLine(1, 100),
  last_name: singleLine(1, 100),
  email: z.string().email().min(3).max(200).regex(NO_LINE_BREAKS, 'Invalid format'),
  phone: singleLine(0, 50).nullish(),
})

/** POST /api/admin/quotes */
export const quoteCreateSchema = z.strictObject({
  client: clientSchema,
  lead_channel: z.enum(QUOTE_LEAD_CHANNELS),
  currency: quoteCurrencySchema,
})
export type QuoteCreatePayload = z.infer<typeof quoteCreateSchema>

const billingText = (max: number) => singleLine(0, max).nullish()

/**
 * PATCH /api/admin/quotes/[id]. Every key is optional: a missing key leaves the stored value alone, an explicit null
 * clears it. `lines` replaces all lines of the draft (the builder always sends the full list); `expires_at` is the last
 * calendar day of the link (Prague time). The deposit value may be 0 here on purpose: a zero deposit is a refusal the
 * store answers as 422 deposit_zero (D-07), not a malformed body.
 */
export const quoteDraftSchema = z.strictObject({
  client: clientSchema.optional(),
  lead_channel: z.enum(QUOTE_LEAD_CHANNELS).optional(),
  locale: quoteLocaleSchema.optional(),
  currency: quoteCurrencySchema.optional(),
  expires_at: dateString.nullable().optional(),
  deposit: z
    .strictObject({
      kind: z.enum(DEPOSIT_KINDS),
      value: z.number().int().min(0).max(DEPOSIT_VALUE_CEILING),
    })
    .nullable()
    .optional(),
  remainder_method: z.enum(REMAINDER_METHODS).nullable().optional(),
  cancel_free_hours: z.number().int().min(0).max(720).nullable().optional(),
  cancel_fee_percent: z.number().int().min(1).max(100).nullable().optional(),
  billing: z
    .strictObject({
      name: billingText(200),
      address: billingText(500),
      company_id: billingText(40),
      vat_id: billingText(40),
      note: billingText(300),
    })
    .nullable()
    .optional(),
  lines: z.array(quoteLineSchema).max(QUOTE_MAX_LINES).optional(),
})
export type QuoteDraftPayload = z.infer<typeof quoteDraftSchema>

/** POST /api/admin/quotes/price */
export const quotePriceSchema = z.strictObject({
  line: quotePriceLineSchema,
  currency: quoteCurrencySchema,
})
