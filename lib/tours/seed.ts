// Phase 93 (plan 93-21; TRIP-01, TRIP-02; D-06, D-08, D-24): the launch content of the tour catalogue.
// Pure and DB-free: loadSeedTours reads content/tours-seed (structure in tours.json, text per locale in
// <locale>/<slug>.json) and buildSeedRows turns it into the rows the seed script (scripts/seed-tours.ts) inserts.
// Money never lives here: prices are proposed and approved separately (D-01, D-21).
// Server and script use only; relative imports so a plain `npx tsx` run resolves it the same as vitest does.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { locales as ALL_LOCALES, type AppLocale } from '../../i18n/locales'
import { isLocaleComplete, type LocaleLeak } from './completeness'
import type { TourFaqItem, TourItineraryItem, TourTranslationRow } from './types'

/** Structure of one tour as kept in content/tours-seed/tours.json. No money values. */
export interface SeedTour {
  slug: string
  sort_order: number
  /** A proposal: the owner reviews it with the price table (D-21). */
  hours_included: number
  drive_minutes_each_way: number
  start_time_min: string
  start_time_max: string
  destination_label: string
  /** Slug in route_prices whose fare is the base of the initial price; null when no route page exists. */
  route_slug: string | null
  /** One-way road distance, the source of the estimate when route_slug is null. */
  distance_km_one_way: number
  /** Seasonal window (migration 095), inclusive 'YYYY-MM-DD'; absent = all year. */
  bookable_from?: string
  bookable_until?: string
}

/** The text of one tour in one locale: the fields the admin edits (D-08). */
export interface SeedTranslation {
  title: string
  short_description: string
  description: string
  highlights: string[]
  itinerary: TourItineraryItem[]
  includes: string[]
  excludes: string[]
  pickup_info: string
  important_info: string
  faq: TourFaqItem[]
  seo_title: string
  seo_description: string
}

export interface SeedData {
  tours: SeedTour[]
  /** locale -> slug -> text. A locale or a slug with no file is simply absent. */
  translations: Partial<Record<AppLocale, Record<string, SeedTranslation>>>
}

/** Row for public.tours; id and created_at come from the database. Prices are added by the runner. */
export interface SeedTourRow {
  slug: string
  status: 'draft'
  sort_order: number
  hours_included: number
  drive_minutes_each_way: number
  start_time_min: string
  start_time_max: string
  destination_label: string
  bookable_from?: string
  bookable_until?: string
}

/** Row for public.tour_translations keyed by slug; the runner swaps the slug for the tour id after the tour insert. */
export interface SeedTranslationRow extends SeedTranslation {
  slug: string
  locale: AppLocale
  is_complete: boolean
}

export interface SeedReport {
  slug: string
  locale: AppLocale
  /** False when there is no seed content for this tour in this locale. */
  present: boolean
  complete: boolean
  missing: string[]
  leak: LocaleLeak
  /** Fields longer than the tour_translations CHECK allows (migration 092); apply refuses these. */
  overflow: string[]
}

const TEXT_FIELDS = ['title', 'short_description', 'description', 'pickup_info', 'important_info', 'seo_title', 'seo_description'] as const

/** Mirrors the char_length CHECKs of public.tour_translations. */
const FIELD_LIMITS: Record<(typeof TEXT_FIELDS)[number], number> = {
  title: 120,
  short_description: 400,
  description: 8000,
  pickup_info: 2000,
  important_info: 4000,
  seo_title: 120,
  seo_description: 300,
}

const SEED_DIR = path.join('content', 'tours-seed')

/** zh-hant is generated from zh (D-24), never read from a file. */
const FILE_LOCALES = ALL_LOCALES.filter((l) => l !== 'zh-hant')

function fail(where: string, what: string): never {
  throw new Error(`tour seed: ${where}: ${what}`)
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key]
  if (typeof v !== 'string') fail(where, `"${key}" must be a string`)
  return v
}

function strList(o: Record<string, unknown>, key: string, where: string): string[] {
  const v = o[key]
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) fail(where, `"${key}" must be a list of strings`)
  return v as string[]
}

function pairList<A extends string, B extends string>(o: Record<string, unknown>, key: string, a: A, b: B, where: string): Array<Record<A | B, string>> {
  const v = o[key]
  if (!Array.isArray(v)) fail(where, `"${key}" must be a list`)
  return v.map((item, i) => {
    if (item === null || typeof item !== 'object') fail(where, `"${key}[${i}]" must be an object`)
    const r = item as Record<string, unknown>
    return { [a]: str(r, a, `${where} ${key}[${i}]`), [b]: str(r, b, `${where} ${key}[${i}]`) } as Record<A | B, string>
  })
}

function parseTranslation(raw: unknown, where: string): SeedTranslation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail(where, 'must be a JSON object')
  const o = raw as Record<string, unknown>
  return {
    title: str(o, 'title', where),
    short_description: str(o, 'short_description', where),
    description: str(o, 'description', where),
    highlights: strList(o, 'highlights', where),
    itinerary: pairList(o, 'itinerary', 'title', 'body', where),
    includes: strList(o, 'includes', where),
    excludes: strList(o, 'excludes', where),
    pickup_info: str(o, 'pickup_info', where),
    important_info: str(o, 'important_info', where),
    faq: pairList(o, 'faq', 'q', 'a', where),
    seo_title: str(o, 'seo_title', where),
    seo_description: str(o, 'seo_description', where),
  }
}

function parseTour(raw: unknown, i: number): SeedTour {
  const where = `tours.json[${i}]`
  if (raw === null || typeof raw !== 'object') fail(where, 'must be an object')
  const o = raw as Record<string, unknown>
  const num = (key: string): number => {
    const v = o[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `"${key}" must be a number`)
    return v
  }
  const route = o.route_slug
  if (route !== null && typeof route !== 'string') fail(where, '"route_slug" must be a string or null')
  return {
    slug: str(o, 'slug', where),
    sort_order: num('sort_order'),
    hours_included: num('hours_included'),
    drive_minutes_each_way: num('drive_minutes_each_way'),
    start_time_min: str(o, 'start_time_min', where),
    start_time_max: str(o, 'start_time_max', where),
    destination_label: str(o, 'destination_label', where),
    route_slug: route,
    distance_km_one_way: num('distance_km_one_way'),
    ...seasonOf(o, where),
  }
}

function seasonOf(o: Record<string, unknown>, where: string): Pick<SeedTour, 'bookable_from' | 'bookable_until'> {
  const out: Pick<SeedTour, 'bookable_from' | 'bookable_until'> = {}
  for (const key of ['bookable_from', 'bookable_until'] as const) {
    const v = o[key]
    if (v === undefined || v === null) continue
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(where, `"${key}" must be YYYY-MM-DD`)
    out[key] = v
  }
  if (out.bookable_from && out.bookable_until && out.bookable_from > out.bookable_until) fail(where, 'bookable_from is after bookable_until')
  return out
}

/** Reads the seed files under `<rootDir>/content/tours-seed`. Throws on malformed content so a bad file never reaches the database. */
export function loadSeedTours(rootDir: string): SeedData {
  const seedRoot = path.join(rootDir, SEED_DIR)
  const rawTours: unknown = JSON.parse(fs.readFileSync(path.join(seedRoot, 'tours.json'), 'utf8'))
  if (!Array.isArray(rawTours)) fail('tours.json', 'must be a list')
  const tours = rawTours.map(parseTour)

  const translations: SeedData['translations'] = {}
  for (const locale of FILE_LOCALES) {
    const dir = path.join(seedRoot, locale)
    if (!fs.existsSync(dir)) continue
    const bySlug: Record<string, SeedTranslation> = {}
    for (const tour of tours) {
      const file = path.join(dir, `${tour.slug}.json`)
      if (!fs.existsSync(file)) continue
      bySlug[tour.slug] = parseTranslation(JSON.parse(fs.readFileSync(file, 'utf8')), `${locale}/${tour.slug}.json`)
    }
    translations[locale] = bySlug
  }
  return { tours, translations }
}

type Converter = (s: string) => string
let converter: Converter | null = null

/** Simplified -> Traditional (Taiwan phrasing), the converter of scripts/zh-hant-sync.mjs. opencc-js ships no types, so it is required untyped. */
function toTraditional(s: string): string {
  if (!converter) {
    const req = createRequire(path.join(process.cwd(), 'package.json'))
    const openCC = req('opencc-js') as { Converter: (o: { from: string; to: string }) => Converter }
    converter = openCC.Converter({ from: 'cn', to: 'twp' })
  }
  return converter(s)
}

function convertTranslation(t: SeedTranslation): SeedTranslation {
  return {
    title: toTraditional(t.title),
    short_description: toTraditional(t.short_description),
    description: toTraditional(t.description),
    highlights: t.highlights.map(toTraditional),
    itinerary: t.itinerary.map((i) => ({ title: toTraditional(i.title), body: toTraditional(i.body) })),
    includes: t.includes.map(toTraditional),
    excludes: t.excludes.map(toTraditional),
    pickup_info: toTraditional(t.pickup_info),
    important_info: toTraditional(t.important_info),
    faq: t.faq.map((f) => ({ q: toTraditional(f.q), a: toTraditional(f.a) })),
    seo_title: toTraditional(t.seo_title),
    seo_description: toTraditional(t.seo_description),
  }
}

/** The shape isLocaleComplete judges; ids and timestamps are placeholders (the seed never stores them from here). */
function asRow(locale: AppLocale, t: SeedTranslation): TourTranslationRow {
  return { tour_id: '', locale, ...t, is_complete: false, updated_at: '' }
}

function overflowOf(t: SeedTranslation): string[] {
  return TEXT_FIELDS.filter((f) => t[f].length > FIELD_LIMITS[f])
}

export interface BuiltSeedRows {
  tours: SeedTourRow[]
  translations: SeedTranslationRow[]
  reports: SeedReport[]
}

/**
 * Turns the seed into insertable rows for the requested locales. zh-hant is generated from zh when both are
 * requested (D-24). is_complete comes from isLocaleComplete, with the English row of the same tour as the
 * reference for the es / fr copy guard (D-23).
 */
export function buildSeedRows(seed: SeedData, opts: { locales: readonly AppLocale[] }): BuiltSeedRows {
  const tours: SeedTourRow[] = seed.tours.map((t) => ({
    slug: t.slug,
    status: 'draft',
    sort_order: t.sort_order,
    hours_included: t.hours_included,
    drive_minutes_each_way: t.drive_minutes_each_way,
    start_time_min: t.start_time_min,
    start_time_max: t.start_time_max,
    destination_label: t.destination_label,
    ...(t.bookable_from ? { bookable_from: t.bookable_from } : {}),
    ...(t.bookable_until ? { bookable_until: t.bookable_until } : {}),
  }))

  const translations: SeedTranslationRow[] = []
  const reports: SeedReport[] = []

  for (const tour of seed.tours) {
    const en = seed.translations.en?.[tour.slug]
    const enRow = en ? asRow('en', en) : null
    for (const locale of opts.locales) {
      let text: SeedTranslation | undefined =
        locale === 'zh-hant'
          ? seed.translations.zh?.[tour.slug] && convertTranslation(seed.translations.zh[tour.slug])
          : seed.translations[locale]?.[tour.slug]
      if (!text) {
        reports.push({ slug: tour.slug, locale, present: false, complete: false, missing: ['no seed content'], leak: null, overflow: [] })
        continue
      }
      text = { ...text }
      const verdict = isLocaleComplete(locale, asRow(locale, text), enRow)
      translations.push({ slug: tour.slug, locale, ...text, is_complete: verdict.complete })
      reports.push({
        slug: tour.slug,
        locale,
        present: true,
        complete: verdict.complete,
        missing: verdict.missing.map(String),
        leak: verdict.leak,
        overflow: overflowOf(text),
      })
    }
  }
  return { tours, translations, reports }
}
