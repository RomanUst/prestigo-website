// Phase 93 (plan 93-05; TRIP-01, TRIP-02, TRIP-04): guarded readers for tour pages, the sitemap and checkout.
// Server only (service client). Every reader builds the client INSIDE the try and degrades to
// null / [] / not_found: createSupabaseServiceClient() throws when SUPABASE_URL is absent (Vercel Preview,
// local build), and a throw here would fail a static export or a render. Public readers return only
// status = 'published' tours and only translations the server marked is_complete (D-23). Nothing is logged:
// rows can hold unpublished copy.

import { createSupabaseServiceClient } from '@/lib/supabase'
import { lowestFittingPrice, totalTripHours } from '@/lib/tours/pricing'
import { isSeasonOver } from '@/lib/tours/season'
import { getPragueTodayISO } from '@/lib/prague-date'
import type { AppLocale } from '@/i18n/locales'
import type { TourPhotoRow, TourRow, TourSettingsRow, TourTranslationRow } from '@/lib/tours/types'

export type TourPageData = {
  tour: TourRow
  translation: TourTranslationRow
  completeLocales: AppLocale[]
  /** Cover first, then by position. */
  photos: TourPhotoRow[]
  settings: TourSettingsRow
}

export type TourCardView = {
  slug: string
  title: string
  shortDescription: string
  hoursIncluded: number
  totalHours: number | null
  lowestPrice: number | null
  cover: TourPhotoRow | null
}

export type TourPageResult =
  | { status: 'ok'; data: TourPageData }
  | { status: 'locale_incomplete'; completeLocales: AppLocale[] }
  | { status: 'not_found' }

const TOUR_COLS =
  'id, slug, status, sort_order, hours_included, drive_minutes_each_way, start_time_min, start_time_max, price_e_eur, price_s_eur, price_v_eur, destination_label, bookable_from, bookable_until, first_published_at, created_at, updated_at'
const TRANSLATION_COLS =
  'tour_id, locale, title, short_description, description, pickup_info, important_info, seo_title, seo_description, highlights, itinerary, includes, excludes, faq, is_complete, updated_at'
const PHOTO_COLS =
  'id, tour_id, storage_path, position, is_cover, source, credit_text, license, credit_url, width, height, created_at'
const SETTINGS_COLS =
  'id, extra_hour_e_eur, extra_hour_s_eur, extra_hour_v_eur, free_cancel_hours, pickup_radius_km, updated_at'

// numeric columns can arrive as strings from PostgREST; null stays null.
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toTour(raw: Record<string, unknown>): TourRow {
  return {
    ...(raw as unknown as TourRow),
    sort_order: Number(raw.sort_order ?? 0),
    hours_included: Number(raw.hours_included),
    drive_minutes_each_way: num(raw.drive_minutes_each_way),
    price_e_eur: num(raw.price_e_eur),
    price_s_eur: num(raw.price_s_eur),
    price_v_eur: num(raw.price_v_eur),
  }
}

function toSettings(raw: Record<string, unknown>): TourSettingsRow {
  return {
    ...(raw as unknown as TourSettingsRow),
    extra_hour_e_eur: num(raw.extra_hour_e_eur),
    extra_hour_s_eur: num(raw.extra_hour_s_eur),
    extra_hour_v_eur: num(raw.extra_hour_v_eur),
    free_cancel_hours: Number(raw.free_cancel_hours),
    pickup_radius_km: Number(raw.pickup_radius_km),
  }
}

function toPhoto(raw: Record<string, unknown>): TourPhotoRow {
  return { ...(raw as unknown as TourPhotoRow), position: Number(raw.position ?? 0) }
}

function sortPhotos(photos: TourPhotoRow[]): TourPhotoRow[] {
  return [...photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)
}

async function readSettings(supabase: ReturnType<typeof createSupabaseServiceClient>): Promise<TourSettingsRow | null> {
  const { data, error } = await supabase.from('tour_settings').select(SETTINGS_COLS).eq('id', 1).maybeSingle()
  if (error || !data) return null
  return toSettings(data as Record<string, unknown>)
}

/** The singleton tour_settings row (extra-hour prices, free-cancel hours, pickup radius); null on any problem. */
export async function getTourSettings(): Promise<TourSettingsRow | null> {
  try {
    return await readSettings(createSupabaseServiceClient())
  } catch {
    return null
  }
}

/** One published tour for a locale: ok, locale_incomplete (published, but not translated for this locale) or not_found. */
export async function getPublishedTourForLocale(slug: string, locale: AppLocale): Promise<TourPageResult> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data: tourRaw, error: tourErr } = await supabase
      .from('tours')
      .select(TOUR_COLS)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    if (tourErr || !tourRaw) return { status: 'not_found' }
    const tour = toTour(tourRaw as Record<string, unknown>)

    const { data: trRaw, error: trErr } = await supabase
      .from('tour_translations')
      .select(TRANSLATION_COLS)
      .eq('tour_id', tour.id)
    if (trErr || !trRaw) return { status: 'not_found' }
    const complete = (trRaw as TourTranslationRow[]).filter((t) => t.is_complete === true)
    const completeLocales = complete.map((t) => t.locale)
    const translation = complete.find((t) => t.locale === locale)
    if (!translation) return { status: 'locale_incomplete', completeLocales }

    const [photosRes, settings] = await Promise.all([
      supabase.from('tour_photos').select(PHOTO_COLS).eq('tour_id', tour.id),
      readSettings(supabase),
    ])
    if (photosRes.error || !settings) return { status: 'not_found' }
    const photos = sortPhotos(((photosRes.data ?? []) as Record<string, unknown>[]).map(toPhoto))
    return { status: 'ok', data: { tour, translation, completeLocales, photos, settings } }
  } catch {
    return { status: 'not_found' }
  }
}

/** Cards for the tours list: published tours that are complete in this locale, in sort order. */
export async function listPublishedTours(locale: AppLocale): Promise<TourCardView[]> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data: toursRaw, error } = await supabase
      .from('tours')
      .select(TOUR_COLS)
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
    if (error || !toursRaw || toursRaw.length === 0) return []
    // A seasonal tour whose window has passed leaves the listings (its page stays, with no bookable date).
    const today = getPragueTodayISO()
    const tours = (toursRaw as Record<string, unknown>[])
      .map(toTour)
      .filter((t) => !isSeasonOver({ from: t.bookable_from, until: t.bookable_until }, today))
    if (tours.length === 0) return []
    const ids = tours.map((t) => t.id)

    const [trRes, photoRes] = await Promise.all([
      supabase
        .from('tour_translations')
        .select('tour_id, locale, title, short_description, is_complete')
        .in('tour_id', ids)
        .eq('locale', locale)
        .eq('is_complete', true),
      supabase.from('tour_photos').select(PHOTO_COLS).in('tour_id', ids),
    ])
    if (trRes.error || !trRes.data) return []
    const translations = new Map(
      (trRes.data as Array<Pick<TourTranslationRow, 'tour_id' | 'title' | 'short_description'>>).map((t) => [t.tour_id, t]),
    )
    const covers = new Map<string, TourPhotoRow>()
    if (!photoRes.error && photoRes.data) {
      for (const p of sortPhotos((photoRes.data as Record<string, unknown>[]).map(toPhoto))) {
        if (!covers.has(p.tour_id)) covers.set(p.tour_id, p)
      }
    }

    const cards: TourCardView[] = []
    for (const tour of tours) {
      const tr = translations.get(tour.id)
      if (!tr) continue
      cards.push({
        slug: tour.slug,
        title: tr.title,
        shortDescription: tr.short_description,
        hoursIncluded: tour.hours_included,
        totalHours: totalTripHours(tour),
        lowestPrice: lowestFittingPrice(tour),
        cover: covers.get(tour.id) ?? null,
      })
    }
    return cards
  } catch {
    return []
  }
}

/** Published tours with the locales that are complete, for the sitemap and hreflang. */
export async function getPublishedTourLocales(): Promise<Array<{ slug: string; locales: AppLocale[]; updatedAt: string }>> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data: toursRaw, error } = await supabase
      .from('tours')
      .select('id, slug, updated_at')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
    if (error || !toursRaw || toursRaw.length === 0) return []
    const tours = toursRaw as Array<{ id: string; slug: string; updated_at: string }>

    const { data: trRaw, error: trErr } = await supabase
      .from('tour_translations')
      .select('tour_id, locale, updated_at')
      .in(
        'tour_id',
        tours.map((t) => t.id),
      )
      .eq('is_complete', true)
    if (trErr || !trRaw) return []
    const rows = trRaw as Array<{ tour_id: string; locale: AppLocale; updated_at: string }>

    const out: Array<{ slug: string; locales: AppLocale[]; updatedAt: string }> = []
    for (const tour of tours) {
      const mine = rows.filter((r) => r.tour_id === tour.id)
      if (mine.length === 0) continue
      const updatedAt = [tour.updated_at, ...mine.map((r) => r.updated_at)].reduce((a, b) => (a >= b ? a : b))
      out.push({ slug: tour.slug, locales: mine.map((r) => r.locale), updatedAt })
    }
    return out
  } catch {
    return []
  }
}

/** Checkout read: a published tour with its EN title (shown on the booking and the consent) and the settings. */
export async function getPublishedTourBySlug(
  slug: string,
): Promise<{ tour: TourRow; enTitle: string; settings: TourSettingsRow } | null> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data: tourRaw, error } = await supabase
      .from('tours')
      .select(TOUR_COLS)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    if (error || !tourRaw) return null
    const tour = toTour(tourRaw as Record<string, unknown>)

    const { data: enRaw, error: enErr } = await supabase
      .from('tour_translations')
      .select('title')
      .eq('tour_id', tour.id)
      .eq('locale', 'en')
      .maybeSingle()
    if (enErr || !enRaw) return null
    const settings = await readSettings(supabase)
    if (!settings) return null
    return { tour, enTitle: (enRaw as { title: string }).title, settings }
  } catch {
    return null
  }
}
