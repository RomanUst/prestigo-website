// Phase 93 (plan 93-07; TRIP-03, TRIP-05; D-07, D-08, D-23): service-role reads and writes behind the admin tour API.
// Server only. The service client is built inside every call (never at module load), errors are mapped to a fixed
// TourAdminError code and never echo SQL or the database message (T-93-17). Completeness of a translation is decided
// here with isLocaleComplete on every save; the caller can never set it (T-93-19).

import { createSupabaseServiceClient } from '@/lib/supabase'
import { locales, type AppLocale } from '@/i18n/locales'
import { isLocaleComplete } from '@/lib/tours/completeness'
import { publishChecklist, type PublishFailure } from '@/lib/tours/publish-checklist'
import type { TourBasicsInput, TourTranslationInput } from '@/lib/tours/admin-schemas'
import type { TourPhotoRow, TourRow, TourTranslationRow } from '@/lib/tours/types'

export type TourAdminErrorCode =
  | 'NOT_FOUND'
  | 'SLUG_TAKEN'
  | 'SLUG_LOCKED'
  | 'ZH_INCOMPLETE'
  | 'INVALID_WINDOW'
  | 'INVALID_ORDER'
  | 'DB'

/** A business or database failure with a fixed, client-safe code. */
export class TourAdminError extends Error {
  constructor(readonly code: TourAdminErrorCode) {
    super(code)
    this.name = 'TourAdminError'
  }
}

export type AdminTourListItem = {
  id: string
  slug: string
  status: TourRow['status']
  sort_order: number
  hours_included: number
  price_e_eur: number | null
  price_s_eur: number | null
  price_v_eur: number | null
  /** English title (empty until the English content is saved). */
  title: string
  /** storage_path of the cover photo, null when the tour has none. */
  cover_path: string | null
  completeness: Record<AppLocale, boolean>
}

export type AdminTourDetail = {
  tour: TourRow
  translations: Record<AppLocale, TourTranslationRow | null>
  photos: TourPhotoRow[]
  checklist: { ok: boolean; failures: PublishFailure[] }
}

const TOUR_COLS =
  'id, slug, status, sort_order, hours_included, drive_minutes_each_way, start_time_min, start_time_max, price_e_eur, price_s_eur, price_v_eur, destination_label, first_published_at, created_at, updated_at'
const TRANSLATION_COLS =
  'tour_id, locale, title, short_description, description, pickup_info, important_info, seo_title, seo_description, highlights, itinerary, includes, excludes, faq, is_complete, updated_at'
const PHOTO_COLS =
  'id, tour_id, storage_path, position, is_cover, source, credit_text, license, credit_url, width, height, created_at'

type Raw = Record<string, unknown>

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toTour(raw: Raw): TourRow {
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

function toPhoto(raw: Raw): TourPhotoRow {
  return { ...(raw as unknown as TourPhotoRow), position: Number(raw.position ?? 0) }
}

function emptyLocaleMap<T>(value: T): Record<AppLocale, T> {
  return Object.fromEntries(locales.map((l) => [l, value])) as Record<AppLocale, T>
}

/** A fixed failure; the database message is dropped here so it can never reach a response. */
function dbFail(): never {
  throw new TourAdminError('DB')
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

function client() {
  try {
    return createSupabaseServiceClient()
  } catch {
    return dbFail()
  }
}

type Db = ReturnType<typeof client>

async function readTourRow(db: Db, id: string): Promise<TourRow> {
  const { data, error } = await db.from('tours').select(TOUR_COLS).eq('id', id).maybeSingle()
  if (error) dbFail()
  if (!data) throw new TourAdminError('NOT_FOUND')
  return toTour(data as Raw)
}

async function readTranslations(db: Db, tourId: string): Promise<TourTranslationRow[]> {
  const { data, error } = await db.from('tour_translations').select(TRANSLATION_COLS).eq('tour_id', tourId)
  if (error) dbFail()
  return (data ?? []) as unknown as TourTranslationRow[]
}

/** Entries of a text list with a value; blank rows from the editor are dropped. */
function cleanTexts(list: string[]): string[] {
  return list.map((s) => s.trim()).filter((s) => s.length > 0)
}

/** The translation row a payload would store (without is_complete / updated_at, which the server sets). */
function buildTranslationRow(
  tourId: string,
  locale: AppLocale,
  input: TourTranslationInput,
): Omit<TourTranslationRow, 'is_complete' | 'updated_at'> {
  return {
    tour_id: tourId,
    locale,
    title: input.title.trim(),
    short_description: input.short_description.trim(),
    description: input.description.trim(),
    pickup_info: input.pickup_info.trim(),
    important_info: input.important_info.trim(),
    seo_title: input.seo_title.trim(),
    seo_description: input.seo_description.trim(),
    highlights: cleanTexts(input.highlights),
    itinerary: input.itinerary
      .map((i) => ({ title: i.title.trim(), body: i.body.trim() }))
      .filter((i) => i.title.length > 0 || i.body.length > 0),
    includes: cleanTexts(input.includes),
    excludes: cleanTexts(input.excludes),
    faq: input.faq
      .map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
      .filter((f) => f.q.length > 0 || f.a.length > 0),
  }
}

/** All tours for the admin list, in sort order, with the English title, the cover and per-locale completeness. */
export async function listAdminTours(): Promise<AdminTourListItem[]> {
  const db = client()
  const { data: toursRaw, error } = await db.from('tours').select(TOUR_COLS).order('sort_order', { ascending: true })
  if (error) dbFail()
  const tours = ((toursRaw ?? []) as Raw[]).map(toTour)
  if (tours.length === 0) return []
  const ids = tours.map((t) => t.id)

  const [trRes, photoRes] = await Promise.all([
    db.from('tour_translations').select('tour_id, locale, title, is_complete').in('tour_id', ids),
    db.from('tour_photos').select('tour_id, storage_path, is_cover').in('tour_id', ids).eq('is_cover', true),
  ])
  if (trRes.error || photoRes.error) dbFail()

  const translations = (trRes.data ?? []) as Array<Pick<TourTranslationRow, 'tour_id' | 'locale' | 'title' | 'is_complete'>>
  const covers = new Map(((photoRes.data ?? []) as Array<{ tour_id: string; storage_path: string }>).map((p) => [p.tour_id, p.storage_path]))

  return tours.map((t) => {
    const completeness = emptyLocaleMap(false)
    let title = ''
    for (const tr of translations) {
      if (tr.tour_id !== t.id) continue
      completeness[tr.locale] = tr.is_complete === true
      if (tr.locale === 'en') title = tr.title
    }
    return {
      id: t.id,
      slug: t.slug,
      status: t.status,
      sort_order: t.sort_order,
      hours_included: t.hours_included,
      price_e_eur: t.price_e_eur,
      price_s_eur: t.price_s_eur,
      price_v_eur: t.price_v_eur,
      title,
      cover_path: covers.get(t.id) ?? null,
      completeness,
    }
  })
}

/** One tour with its 8 locale slots, its photos and the publish checklist; NOT_FOUND when the id is unknown. */
export async function getAdminTour(id: string): Promise<AdminTourDetail> {
  const db = client()
  const tour = await readTourRow(db, id)
  const [rows, photoRes] = await Promise.all([
    readTranslations(db, id),
    db.from('tour_photos').select(PHOTO_COLS).eq('tour_id', id),
  ])
  if (photoRes.error) dbFail()
  const photos = ((photoRes.data ?? []) as Raw[]).map(toPhoto).sort((a, b) => a.position - b.position)

  const translations = emptyLocaleMap<TourTranslationRow | null>(null)
  for (const row of rows) translations[row.locale] = row

  const checklist = publishChecklist({ tour, enComplete: translations.en?.is_complete === true, photos })
  return { tour, translations, photos, checklist }
}

/** Inserts a draft tour (sort_order = max + 1) and its English row with the title; SLUG_TAKEN when the slug exists. */
export async function createTourDraft(input: { slug: string; title: string }): Promise<{ id: string }> {
  const db = client()
  const { data: last, error: lastErr } = await db
    .from('tours')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  if (lastErr) dbFail()
  const lastOrder = Number(((last ?? []) as Raw[])[0]?.sort_order ?? -1)

  const { data, error } = await db
    .from('tours')
    .insert({ slug: input.slug, status: 'draft', sort_order: lastOrder + 1 })
    .select('id')
    .single()
  if (error) {
    if (isUniqueViolation(error)) throw new TourAdminError('SLUG_TAKEN')
    dbFail()
  }
  const id = (data as { id: string }).id

  const { error: trErr } = await db
    .from('tour_translations')
    .insert({ tour_id: id, locale: 'en', title: input.title.trim(), is_complete: false })
  if (trErr) {
    // keep the table free of a half-created tour: the draft without its English row is removed again
    await db.from('tours').delete().eq('id', id)
    dbFail()
  }
  return { id }
}

export type SaveTranslationResult = {
  translation: TourTranslationRow
  complete: boolean
  missing: Array<keyof TourTranslationRow>
  leak: 'english' | 'script' | null
}

/** Upserts one locale of a tour and sets is_complete from isLocaleComplete (never from the caller). */
export async function saveTourTranslation(
  tourId: string,
  locale: AppLocale,
  input: TourTranslationInput,
): Promise<SaveTranslationResult> {
  const db = client()
  await readTourRow(db, tourId)

  const existing = await readTranslations(db, tourId)
  const enRow = locale === 'en' ? null : (existing.find((r) => r.locale === 'en') ?? null)

  const row = buildTranslationRow(tourId, locale, input)
  const now = new Date().toISOString()
  const verdict = isLocaleComplete(locale, { ...row, is_complete: false, updated_at: now }, enRow)

  const { data, error } = await db
    .from('tour_translations')
    .upsert({ ...row, is_complete: verdict.complete, updated_at: now }, { onConflict: 'tour_id,locale' })
    .select(TRANSLATION_COLS)
    .single()
  if (error) dbFail()
  const translation = data as unknown as TourTranslationRow

  // es / fr are judged against the English row (copy guard): a changed English text can flip them.
  if (locale === 'en') await recheckEnglishDependents(db, tourId, translation, existing)

  await touchTour(db, tourId, now)
  return { translation, complete: verdict.complete, missing: verdict.missing, leak: verdict.leak }
}

async function recheckEnglishDependents(
  db: Db,
  tourId: string,
  en: TourTranslationRow,
  existing: TourTranslationRow[],
): Promise<void> {
  for (const row of existing) {
    if (row.locale !== 'es' && row.locale !== 'fr') continue
    const verdict = isLocaleComplete(row.locale, row, en)
    if (verdict.complete === row.is_complete) continue
    const { error } = await db
      .from('tour_translations')
      .update({ is_complete: verdict.complete })
      .eq('tour_id', tourId)
      .eq('locale', row.locale)
    if (error) dbFail()
  }
}

async function touchTour(db: Db, tourId: string, now: string): Promise<void> {
  const { error } = await db.from('tours').update({ updated_at: now }).eq('id', tourId)
  if (error) dbFail()
}
