// Phase 93 (plan 93-07; TRIP-03, TRIP-05; D-01, D-02, D-07, D-08, D-12, D-22): request schemas of the admin tour API.
//
// Every object is strict, so an unknown key is a 400: a client can never send is_complete, status, first_published_at
// or sort_order through a content / basics payload (T-93-19) - completeness is computed by the server, status changes only
// through the publish route (93-08). Length caps mirror the 092_tours.sql CHECKs (T-93-18, T-93-20); no HTML is accepted
// by any rule because tour copy is rendered as React text and JSON-LD through safeJsonLd, never as markup.
//
// Pure (zod only): the routes and the store import it; shape errors are 400, business rules that need the stored row
// (slug lock, start window against the stored values) are answered by the store.

import { z } from 'zod'
import { NO_LINE_BREAKS } from '@/lib/request-guards'
import { TOUR_SLUG_MAX_LENGTH, TOUR_SLUG_PATTERN } from '@/lib/tours/types'

/** One line of text, min..max characters, no CR / LF. */
const singleLine = (min: number, max: number) => z.string().min(min).max(max).regex(NO_LINE_BREAKS, 'Invalid format')

const slug = z
  .string()
  .max(TOUR_SLUG_MAX_LENGTH)
  .regex(TOUR_SLUG_PATTERN, 'Invalid slug')

/** True when value has at most two decimals (12.34 yes, 12.345 no); tolerant of binary float noise. */
function hasAtMostTwoDecimals(value: number): boolean {
  const scaled = value * 100
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

/** A price in EUR: > 0, <= 100000, two decimals (numeric(10,2) in the schema). */
const price = z
  .number()
  .positive()
  .max(100_000)
  .refine(hasAtMostTwoDecimals, 'At most two decimals')

/** HH:MM in 30-minute steps from 05:00 to 14:00 (UI-SPEC 7.2 start window). */
const startTime = z.string().refine((v) => {
  const m = /^(\d{2}):(00|30)$/.exec(v)
  if (!m) return false
  const minutes = Number(m[1]) * 60 + Number(m[2])
  return minutes >= 5 * 60 && minutes <= 14 * 60
}, 'Start time must be HH:00 or HH:30 between 05:00 and 14:00')

/** A calendar date 'YYYY-MM-DD' (seasonal tour window, migration 095). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

/** POST /api/admin/tours: a new draft needs only the slug and the English title (UI-SPEC 7.1). */
export const tourCreateSchema = z.strictObject({
  slug,
  title: singleLine(1, 120),
})

/** PATCH /api/admin/tours/[id]: the basics of a tour; every key optional, at least one required. */
export const tourBasicsSchema = z
  .strictObject({
    slug: slug.optional(),
    destination_label: singleLine(0, 120).optional(),
    hours_included: z.number().int().min(1).max(12).optional(),
    drive_minutes_each_way: z.number().int().min(10).max(600).optional(),
    start_time_min: startTime.optional(),
    start_time_max: startTime.optional(),
    bookable_from: isoDate.nullable().optional(),
    bookable_until: isoDate.nullable().optional(),
    price_e_eur: price.optional(),
    price_s_eur: price.optional(),
    price_v_eur: price.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .refine(
    (v) => !v.bookable_from || !v.bookable_until || v.bookable_from <= v.bookable_until,
    { message: 'The last bookable date must be on or after the first', path: ['bookable_until'] },
  )
  .refine(
    (v) => v.start_time_min === undefined || v.start_time_max === undefined || v.start_time_max > v.start_time_min,
    { message: 'Latest start must be after the earliest start', path: ['start_time_max'] },
  )

const listText = z.string().max(300)

/** PUT /api/admin/tours/[id]/translations/[locale]: the content of one locale. No is_complete: the server decides. */
export const tourTranslationSchema = z.strictObject({
  title: singleLine(0, 120),
  short_description: singleLine(0, 400),
  description: z.string().max(8000),
  pickup_info: z.string().max(2000),
  important_info: z.string().max(4000),
  seo_title: singleLine(0, 120),
  seo_description: singleLine(0, 300),
  highlights: z.array(listText).max(20),
  includes: z.array(listText).max(20),
  excludes: z.array(listText).max(20),
  itinerary: z
    .array(z.strictObject({ title: singleLine(0, 200), body: z.string().max(2000) }))
    .max(15),
  faq: z.array(z.strictObject({ q: singleLine(0, 300), a: z.string().max(2000) })).max(20),
})

/** POST /api/admin/tours/reorder: the ids of every tour in the new order. */
export const tourReorderSchema = z.strictObject({
  ids: z
    .array(z.string().uuid())
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate id'),
})

/** PATCH /api/admin/tour-settings: extra-hour prices (D-02), free-cancellation hours (D-12), pickup radius (D-22). */
export const tourSettingsSchema = z
  .strictObject({
    extra_hour_e_eur: price.optional(),
    extra_hour_s_eur: price.optional(),
    extra_hour_v_eur: price.optional(),
    free_cancel_hours: z.number().int().min(0).max(72).optional(),
    pickup_radius_km: z
      .number()
      .min(1)
      .max(50)
      .refine((v) => Number.isInteger(v * 2), 'Step is 0.5 km')
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export type TourCreateInput = z.infer<typeof tourCreateSchema>
export type TourBasicsInput = z.infer<typeof tourBasicsSchema>
export type TourTranslationInput = z.infer<typeof tourTranslationSchema>
export type TourReorderInput = z.infer<typeof tourReorderSchema>
export type TourSettingsInput = z.infer<typeof tourSettingsSchema>
