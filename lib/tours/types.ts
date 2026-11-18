// Phase 93 (plan 93-01; TRIP-03, TRIP-04, TRIP-05): row types and constants that mirror migration 092_tours.sql.
// Pure types and constants, no server imports, so client components may import this file.
// supabase/migrations/092_tours.sql is the schema; tests/migration-092.test.ts pins the two together.

import type { AppLocale } from '@/i18n/locales'

/** Mirrors the tours_slug_check CHECK: every tour URL is /services/<slug>, and the slug ends in -day-trip (D-07). */
export const TOUR_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*-day-trip$/

/** Longest slug the tours_slug_check accepts. */
export const TOUR_SLUG_MAX_LENGTH = 80

/** The three car classes of a tour price (price_e_eur, price_s_eur, price_v_eur). */
export const TOUR_CAR_KEYS = ['business', 'first_class', 'business_van'] as const
export type TourCarKey = (typeof TOUR_CAR_KEYS)[number]

/** Most extra hours one tour booking can add (D-20); mirrors the bookings.tour_extra_hours CHECK 0..12. */
export const MAX_EXTRA_HOURS = 12

/** Where a tour photo came from (D-15); mirrors tour_photos_source_check. */
export const TOUR_PHOTO_SOURCES = ['own', 'commons', 'unsplash', 'other'] as const
export type TourPhotoSource = (typeof TOUR_PHOTO_SOURCES)[number]

export const TOUR_STATUSES = ['draft', 'published'] as const
export type TourStatus = (typeof TOUR_STATUSES)[number]

/** Public storage bucket that holds tour photos (8 MB, jpeg/png/webp/avif). */
export const TOUR_PHOTOS_BUCKET = 'tour-photos'

/** public.tours: one row per tour; prices are per car class and stay null until the admin sets them (D-01). */
export interface TourRow {
  id: string
  slug: string
  status: TourStatus
  sort_order: number
  hours_included: number
  drive_minutes_each_way: number | null
  /** 'HH:00' or 'HH:30'. */
  start_time_min: string
  start_time_max: string
  price_e_eur: number | null
  price_s_eur: number | null
  price_v_eur: number | null
  destination_label: string
  first_published_at: string | null
  created_at: string
  updated_at: string
}

export interface TourItineraryItem {
  title: string
  body: string
}

export interface TourFaqItem {
  q: string
  a: string
}

/** public.tour_translations: one row per (tour, locale); is_complete is set by the server (D-23). */
export interface TourTranslationRow {
  tour_id: string
  locale: AppLocale
  title: string
  short_description: string
  description: string
  pickup_info: string
  important_info: string
  seo_title: string
  seo_description: string
  highlights: string[]
  itinerary: TourItineraryItem[]
  includes: string[]
  excludes: string[]
  faq: TourFaqItem[]
  is_complete: boolean
  updated_at: string
}

/** public.tour_photos: a photo of a tour with its credit (D-15); exactly one cover per tour. */
export interface TourPhotoRow {
  id: string
  tour_id: string
  /** tours/<tour uuid>/<photo uuid>.<jpg|png|webp|avif> inside the tour-photos bucket. */
  storage_path: string
  position: number
  is_cover: boolean
  source: TourPhotoSource
  credit_text: string | null
  license: string | null
  /** https only (CHECK). */
  credit_url: string | null
  width: number | null
  height: number | null
  created_at: string
}

/** public.tour_settings: the single row (id = 1) with the extra-hour prices and the tour rules (D-02, D-12, D-22). */
export interface TourSettingsRow {
  id: 1
  extra_hour_e_eur: number | null
  extra_hour_s_eur: number | null
  extra_hour_v_eur: number | null
  free_cancel_hours: number
  pickup_radius_km: number
  updated_at: string
}
