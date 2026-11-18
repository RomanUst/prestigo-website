// Phase 93 (plan 93-21; TRIP-01, TRIP-02; D-01, D-08, D-21, D-24): seeds the launch tour catalogue.
//
//   npx tsx scripts/seed-tours.ts                      dry run (default): prints the price proposal and completeness, writes nothing
//   npx tsx scripts/seed-tours.ts --apply              inserts draft tours, translations, photos and the extra-hour prices
//   npx tsx scripts/seed-tours.ts --apply --force      also updates tours that already exist (photos are only added to a tour that has none)
//   npx tsx scripts/seed-tours.ts --publish=a,b        checks publishChecklist for those tours; with --apply it publishes the ones that pass
//   npx tsx scripts/seed-tours.ts --prices=file.json   owner-approved overrides: { tours: { <slug>: { e, s, v, hours_included? } }, extra_hour: { e, s, v } }
//
// Run by the orchestrator or the owner only (plan 93-28), after the owner approved the price table (D-21).
// Reads .env.local itself and never prints a value from it. Insert-only by design (T-93-58): a slug that
// already exists is skipped unless --force, so admin edits are never overwritten by a second run.
// Run from the repo root.

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { locales } from '../i18n/locales'
import { buildSeedRows, loadSeedTours, type SeedTour } from '../lib/tours/seed'
import { publishChecklist } from '../lib/tours/publish-checklist'
import { TOUR_PHOTOS_BUCKET, type TourPhotoRow, type TourRow } from '../lib/tours/types'
import { proposeExtraHourPrices, proposeTourPrices, type ClassPrices, type TourPriceProposal } from './lib/tour-price-proposal'

// ---------------------------------------------------------------------------------------------
// Types

export interface PricingInputs {
  returnDiscountPct: number
  ratePerKm: ClassPrices
  hourlyRate: ClassPrices
}

export interface PhotoEntry {
  source: 'commons' | 'unsplash' | 'own'
  title: string
  download_url: string | null
  local_path: string | null
  credit_text: string | null
  license: string | null
  credit_url: string | null
  cover: boolean
  alt_hint?: string
}

export interface ExistingTour {
  id: string
  slug: string
  status: string
  photoCount: number
}

export interface TourWrite {
  slug: string
  status: 'draft'
  sort_order: number
  hours_included: number
  drive_minutes_each_way: number
  start_time_min: string
  start_time_max: string
  destination_label: string
  price_e_eur: number | null
  price_s_eur: number | null
  price_v_eur: number | null
}

/** Everything the runner needs from the database and the bucket; the CLI backs it with Supabase, tests with fakes. */
export interface SeedStore {
  getPricing(): Promise<PricingInputs>
  getRouteFares(slugs: string[]): Promise<Record<string, ClassPrices>>
  getExistingTours(): Promise<ExistingTour[]>
  insertTour(row: TourWrite): Promise<string>
  updateTour(id: string, row: Omit<TourWrite, 'slug' | 'status'>): Promise<void>
  upsertTranslation(tourId: string, row: Record<string, unknown>): Promise<void>
  getExtraHourPrices(): Promise<{ e: number | null; s: number | null; v: number | null }>
  setExtraHourPrices(p: Partial<ClassPrices>): Promise<void>
  uploadPhoto(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void>
  removePhotoObjects(storagePaths: string[]): Promise<void>
  insertPhoto(row: Omit<TourPhotoRow, 'created_at'>): Promise<void>
  deleteTourPhotos(tourId: string): Promise<void>
  loadPublishInput(slug: string): Promise<{ tour: TourRow; enComplete: boolean; photos: TourPhotoRow[] } | null>
  publishTour(tourId: string, firstPublishedAt: string | null): Promise<void>
}

export interface SeedDeps {
  argv: string[]
  root: string
  log: (line: string) => void
  /** True when the Supabase service env is available. */
  hasEnv: () => boolean
  createStore: () => Promise<SeedStore>
  fetchImpl: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => Date
}

interface Flags {
  apply: boolean
  force: boolean
  publish: string[]
  pricesFile: string | null
}

interface PriceOverrides {
  tours: Record<string, { e: number; s: number; v: number; hours_included?: number }>
  extra_hour?: ClassPrices
}

// ---------------------------------------------------------------------------------------------
// Small pure helpers

const ALLOWED_PHOTO_HOSTS = new Set(['thumb.wikimedia.org', 'upload.wikimedia.org', 'images.unsplash.com'])
const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const PHOTO_PACE_MS = 1500
const USER_AGENT = 'prestigo-tour-seed/1.0'
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' }
const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }

export function parseFlags(argv: string[]): Flags | { error: string } {
  const flags: Flags = { apply: false, force: false, publish: [], pricesFile: null }
  let dry = false
  for (const arg of argv) {
    if (arg === '--apply') flags.apply = true
    else if (arg === '--dry-run') dry = true
    else if (arg === '--force') flags.force = true
    else if (arg.startsWith('--publish=')) flags.publish = arg.slice('--publish='.length).split(',').map((s) => s.trim()).filter(Boolean)
    else if (arg.startsWith('--prices=')) flags.pricesFile = arg.slice('--prices='.length) || null
    else return { error: `unknown flag ${arg}` }
  }
  if (flags.apply && dry) return { error: '--apply and --dry-run cannot be combined' }
  if (flags.force && !flags.apply) return { error: '--force needs --apply' }
  return flags
}

function isPositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export function parsePriceOverrides(raw: unknown): PriceOverrides {
  if (raw === null || typeof raw !== 'object') throw new Error('prices file must be a JSON object')
  const o = raw as Record<string, unknown>
  const toursRaw = o.tours
  if (toursRaw === null || typeof toursRaw !== 'object') throw new Error('prices file needs a "tours" object')
  const tours: PriceOverrides['tours'] = {}
  for (const [slug, v] of Object.entries(toursRaw as Record<string, unknown>)) {
    const t = v as Record<string, unknown>
    if (!t || !isPositive(t.e) || !isPositive(t.s) || !isPositive(t.v)) throw new Error(`prices for ${slug}: e, s and v must be positive numbers`)
    const hours = t.hours_included
    if (hours !== undefined && !(Number.isInteger(hours) && (hours as number) >= 1 && (hours as number) <= 12)) {
      throw new Error(`prices for ${slug}: hours_included must be a whole number from 1 to 12`)
    }
    tours[slug] = { e: t.e, s: t.s, v: t.v, ...(hours !== undefined ? { hours_included: hours as number } : {}) }
  }
  let extra_hour: ClassPrices | undefined
  if (o.extra_hour !== undefined) {
    const x = o.extra_hour as Record<string, unknown>
    if (!x || !isPositive(x.e) || !isPositive(x.s) || !isPositive(x.v)) throw new Error('extra_hour: e, s and v must be positive numbers')
    extra_hour = { e: x.e, s: x.s, v: x.v }
  }
  return { tours, extra_hour }
}

function eur(n: number | null): string {
  return n === null ? 'n/a' : `${n} EUR`
}

function readManifest(root: string): Record<string, PhotoEntry[]> {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'content', 'tours-seed', 'photos.json'), 'utf8')) as { tours?: Record<string, PhotoEntry[]> }
  if (!raw.tours || typeof raw.tours !== 'object') throw new Error('photos.json has no "tours" object')
  return raw.tours
}

// ---------------------------------------------------------------------------------------------
// Price table

interface PriceRow {
  tour: SeedTour
  hours: number
  price: TourPriceProposal | null
  note: string
  e: number | null
  s: number | null
  v: number | null
}

function buildPriceRows(
  tours: SeedTour[],
  pricing: PricingInputs | null,
  fares: Record<string, ClassPrices>,
  overrides: PriceOverrides | null,
): PriceRow[] {
  return tours.map((tour) => {
    const ov = overrides?.tours[tour.slug]
    if (ov) {
      return { tour, hours: ov.hours_included ?? tour.hours_included, price: null, note: 'owner override', e: ov.e, s: ov.s, v: ov.v }
    }
    if (!pricing) return { tour, hours: tour.hours_included, price: null, note: 'no pricing available', e: null, s: null, v: null }
    try {
      const routeFares = tour.route_slug ? (fares[tour.route_slug] ?? null) : null
      const price = proposeTourPrices({ routeFares, returnDiscountPct: pricing.returnDiscountPct, ratePerKm: pricing.ratePerKm, distanceKm: tour.distance_km_one_way })
      const note =
        price.basis === 'route'
          ? `route fare ${tour.route_slug} + discounted return leg`
          : `ESTIMATE from ${tour.distance_km_one_way} km x rate per km${tour.route_slug ? ` (route ${tour.route_slug} has no fare)` : ' (no route page)'}: owner to confirm`
      return { tour, hours: tour.hours_included, price, note, e: price.e, s: price.s, v: price.v }
    } catch (err) {
      return { tour, hours: tour.hours_included, price: null, note: `cannot propose: ${(err as Error).message}`, e: null, s: null, v: null }
    }
  })
}

function printPriceTable(log: (l: string) => void, rows: PriceRow[], extra: ClassPrices | null, extraNote: string): void {
  log('')
  log('## Proposed initial prices (per car, round trip, hours at the destination included)')
  log('')
  log('| Tour | Hours included | E-Class | S-Class | V-Class | Basis |')
  log('|------|----------------|---------|---------|---------|-------|')
  for (const r of rows) log(`| ${r.tour.slug} | ${r.hours} | ${eur(r.e)} | ${eur(r.s)} | ${eur(r.v)} | ${r.note} |`)
  log('')
  log('## Extra hour price per car class (one price for all tours)')
  log('')
  if (extra) {
    log('| E-Class | S-Class | V-Class | Basis |')
    log('|---------|---------|---------|-------|')
    log(`| ${eur(extra.e)} | ${eur(extra.s)} | ${eur(extra.v)} | ${extraNote} |`)
  } else {
    log(`not available: ${extraNote}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Photos

async function fetchPhoto(entry: PhotoEntry, deps: SeedDeps): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (entry.local_path) {
    const rel = entry.local_path
    const abs = path.resolve(deps.root, rel)
    const allowedRoot = path.resolve(deps.root, 'public') + path.sep
    if (!abs.startsWith(allowedRoot)) throw new Error(`own photo path must be inside public/: ${rel}`)
    const ext = path.extname(abs).slice(1).toLowerCase()
    const contentType = MIME_BY_EXT[ext]
    if (!contentType) throw new Error(`unsupported own photo type: ${rel}`)
    const bytes = new Uint8Array(fs.readFileSync(abs))
    if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error(`own photo over 8 MB: ${rel}`)
    return { bytes, contentType }
  }
  if (!entry.download_url) throw new Error(`photo has neither download_url nor local_path: ${entry.title}`)
  const url = new URL(entry.download_url)
  if (url.protocol !== 'https:' || !ALLOWED_PHOTO_HOSTS.has(url.hostname)) throw new Error(`photo host not allowed: ${url.hostname}`)
  let lastStatus = 0
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await deps.sleep(PHOTO_PACE_MS * attempt * 2)
    // generic client name only: no personal data in the request
    const res = await deps.fetchImpl(url.toString(), { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
    lastStatus = res.status
    if (res.status === 429 || res.status >= 500) continue
    if (!res.ok) throw new Error(`photo download failed (HTTP ${res.status}): ${entry.title}`)
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!EXT_BY_MIME[contentType]) throw new Error(`photo has an unsupported content type (${contentType || 'none'}): ${entry.title}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) throw new Error(`photo size out of range: ${entry.title}`)
    return { bytes, contentType }
  }
  throw new Error(`photo download failed after retries (HTTP ${lastStatus}): ${entry.title}`)
}

/** Uploads and registers the photos of one tour; on any failure removes what this run created for it and rethrows. */
async function seedPhotos(store: SeedStore, deps: SeedDeps, tourId: string, entries: PhotoEntry[]): Promise<number> {
  const uploaded: string[] = []
  let position = 0
  try {
    for (const entry of entries) {
      if (position > 0 && entry.download_url) await deps.sleep(PHOTO_PACE_MS)
      const { bytes, contentType } = await fetchPhoto(entry, deps)
      const id = randomUUID()
      const storagePath = `tours/${tourId}/${id}.${EXT_BY_MIME[contentType]}`
      await store.uploadPhoto(storagePath, bytes, contentType)
      uploaded.push(storagePath)
      position += 1
      await store.insertPhoto({
        id,
        tour_id: tourId,
        storage_path: storagePath,
        position,
        is_cover: entry.cover,
        source: entry.source,
        credit_text: entry.source === 'own' ? null : entry.credit_text,
        license: entry.source === 'own' ? null : entry.license,
        credit_url: entry.source === 'own' ? null : entry.credit_url,
        width: null,
        height: null,
      })
    }
    return position
  } catch (err) {
    await store.deleteTourPhotos(tourId).catch(() => undefined)
    await store.removePhotoObjects(uploaded).catch(() => undefined)
    throw err
  }
}

// ---------------------------------------------------------------------------------------------
// Main

export async function main(deps: SeedDeps): Promise<number> {
  const { log } = deps
  const flags = parseFlags(deps.argv)
  if ('error' in flags) {
    log(`seed-tours: ${flags.error}`)
    return 1
  }

  // 1. content: pure, no database
  const seed = loadSeedTours(deps.root)
  const built = buildSeedRows(seed, { locales })
  const manifest = readManifest(deps.root)

  log(flags.apply ? '# Tour seed: APPLY' : '# Tour seed: dry run (nothing is written)')

  // 2. completeness of every tour x locale
  log('')
  log('## Completeness (tour x locale)')
  log('')
  log(`| Tour | ${locales.join(' | ')} |`)
  log(`|------|${locales.map(() => '---').join('|')}|`)
  for (const tour of seed.tours) {
    const cells = locales.map((l) => {
      const r = built.reports.find((x) => x.slug === tour.slug && x.locale === l)
      if (!r || !r.present) return 'none'
      if (r.overflow.length) return `too long: ${r.overflow.join(', ')}`
      if (r.complete) return 'complete'
      return `incomplete: ${r.leak ? `leak ${r.leak}` : r.missing.join(', ')}`
    })
    log(`| ${tour.slug} | ${cells.join(' | ')} |`)
  }

  if (!deps.hasEnv()) {
    log('')
    log('Supabase env not available: live prices, existing tours and the write step are skipped.')
    return 0
  }

  // 3. live inputs: route fares and tariffs
  const store = await deps.createStore()
  const pricing = await store.getPricing().catch(() => null)
  const fares = await store.getRouteFares(seed.tours.flatMap((t) => (t.route_slug ? [t.route_slug] : [])))
  let overrides: PriceOverrides | null = null
  if (flags.pricesFile) overrides = parsePriceOverrides(JSON.parse(fs.readFileSync(path.resolve(deps.root, flags.pricesFile), 'utf8')))
  const priceRows = buildPriceRows(seed.tours, pricing, fares, overrides)

  let extra: ClassPrices | null = null
  let extraNote = 'current hourly rate of the class'
  if (overrides?.extra_hour) {
    extra = overrides.extra_hour
    extraNote = 'owner override'
  } else if (pricing) {
    try {
      extra = proposeExtraHourPrices(pricing.hourlyRate)
    } catch (err) {
      extraNote = `cannot propose: ${(err as Error).message}`
    }
  } else {
    extraNote = 'no pricing available'
  }
  printPriceTable(log, priceRows, extra, extraNote)

  const existing = new Map((await store.getExistingTours()).map((t) => [t.slug, t]))
  log('')
  log('## Existing tours')
  log('')
  log(
    seed.tours
      .map((t) => `${t.slug}: ${existing.has(t.slug) ? (flags.apply && flags.force ? 'exists, will be updated (--force)' : 'exists, skipped') : 'new'}`)
      .join('\n'),
  )

  // 4. apply
  let failures = 0
  if (flags.apply) {
    const overflow = built.reports.filter((r) => r.overflow.length)
    if (overflow.length) {
      log('')
      log(`Refusing to apply: fields over the database limit in ${overflow.map((r) => `${r.locale}/${r.slug}`).join(', ')}`)
      return 1
    }
    log('')
    log('## Apply')
    log('')
    for (const row of priceRows) {
      const slug = row.tour.slug
      const en = built.reports.find((r) => r.slug === slug && r.locale === 'en')
      if (!en?.complete) {
        log(`${slug}: skipped, the English content is not complete`)
        continue
      }
      const have = existing.get(slug)
      if (have && !flags.force) {
        log(`${slug}: exists, skipped`)
        continue
      }
      const base = built.tours.find((t) => t.slug === slug)!
      const write: TourWrite = { ...base, hours_included: row.hours, price_e_eur: row.e, price_s_eur: row.s, price_v_eur: row.v }
      let tourId: string
      if (have) {
        const { slug: _slug, status: _status, ...rest } = write
        void _slug
        void _status
        await store.updateTour(have.id, rest)
        tourId = have.id
        log(`${slug}: updated`)
      } else {
        tourId = await store.insertTour(write)
        log(`${slug}: inserted as draft`)
      }
      const rows = built.translations.filter((t) => t.slug === slug)
      for (const tr of rows) {
        const { slug: _s, ...fields } = tr
        void _s
        await store.upsertTranslation(tourId, { ...fields, tour_id: tourId, updated_at: deps.now().toISOString() })
      }
      log(`${slug}: ${rows.length} translation row(s), ${rows.filter((r) => r.is_complete).length} complete`)

      if (have && have.photoCount > 0) {
        log(`${slug}: photos kept (the tour already has ${have.photoCount})`)
      } else {
        try {
          const n = await seedPhotos(store, deps, tourId, manifest[slug] ?? [])
          log(`${slug}: ${n} photo(s) uploaded and registered with credits`)
        } catch (err) {
          failures += 1
          log(`${slug}: PHOTOS FAILED, none kept (${(err as Error).message}); rerun with --force to retry`)
        }
      }
    }

    // extra-hour prices: only fill what is empty unless --force
    if (extra) {
      const current = await store.getExtraHourPrices()
      const patch: Partial<ClassPrices> = {}
      for (const c of ['e', 's', 'v'] as const) if (flags.force || current[c] === null) patch[c] = extra[c]
      if (Object.keys(patch).length) {
        await store.setExtraHourPrices(patch)
        log(`extra-hour prices set for: ${Object.keys(patch).join(', ')}`)
      } else {
        log('extra-hour prices already set, kept')
      }
    }
  }

  // 5. publish (a check without --apply)
  if (flags.publish.length) {
    log('')
    log(flags.apply ? '## Publish' : '## Publish check (nothing is published without --apply)')
    log('')
    for (const slug of flags.publish) {
      const input = await store.loadPublishInput(slug)
      if (!input) {
        log(`${slug}: not found`)
        failures += 1
        continue
      }
      const verdict = publishChecklist(input)
      if (!verdict.ok) {
        log(`${slug}: blocked (${verdict.failures.join(', ')})`)
        failures += 1
        continue
      }
      if (flags.apply) {
        await store.publishTour(input.tour.id, input.tour.first_published_at ?? deps.now().toISOString())
        log(`${slug}: published`)
      } else {
        log(`${slug}: ready to publish`)
      }
    }
  }

  return failures > 0 ? 1 : 0
}

// ---------------------------------------------------------------------------------------------
// Supabase-backed store and CLI (not exercised by tests; the runner above is)

async function createSupabaseStore(): Promise<SeedStore> {
  const { createSupabaseServiceClient } = await import('../lib/supabase')
  const sb = createSupabaseServiceClient()
  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
  const must = <T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
    if (res.error || res.data === null || res.data === undefined) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
    return res.data as NonNullable<T>
  }

  return {
    async getPricing() {
      const rates = must(await sb.from('pricing_config').select('vehicle_class, rate_per_km, hourly_rate'), 'pricing_config')
      const globals = must(await sb.from('pricing_globals').select('return_discount_percent').eq('id', 1).single(), 'pricing_globals')
      const by = (cls: string, key: 'rate_per_km' | 'hourly_rate') => Number(rates.find((r) => r.vehicle_class === cls)?.[key])
      return {
        returnDiscountPct: Number(globals.return_discount_percent ?? 10),
        ratePerKm: { e: by('business', 'rate_per_km'), s: by('first_class', 'rate_per_km'), v: by('business_van', 'rate_per_km') },
        hourlyRate: { e: by('business', 'hourly_rate'), s: by('first_class', 'hourly_rate'), v: by('business_van', 'hourly_rate') },
      }
    },
    async getRouteFares(slugs) {
      if (!slugs.length) return {}
      const rows = must(await sb.from('route_prices').select('slug, e_class_eur, s_class_eur, v_class_eur').in('slug', slugs), 'route_prices')
      return Object.fromEntries(rows.map((r) => [r.slug, { e: Number(r.e_class_eur), s: Number(r.s_class_eur), v: Number(r.v_class_eur) }]))
    },
    async getExistingTours() {
      const tours = must(await sb.from('tours').select('id, slug, status'), 'tours')
      const photos = must(await sb.from('tour_photos').select('tour_id'), 'tour_photos')
      return tours.map((t) => ({ id: t.id, slug: t.slug, status: t.status, photoCount: photos.filter((p) => p.tour_id === t.id).length }))
    },
    async insertTour(row) {
      return must(await sb.from('tours').insert(row).select('id').single(), 'insert tour').id
    },
    async updateTour(id, row) {
      const { error } = await sb.from('tours').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(`update tour: ${error.message}`)
    },
    async upsertTranslation(tourId, row) {
      const { error } = await sb.from('tour_translations').upsert({ ...row, tour_id: tourId }, { onConflict: 'tour_id,locale' })
      if (error) throw new Error(`upsert translation: ${error.message}`)
    },
    async getExtraHourPrices() {
      const row = must(await sb.from('tour_settings').select('extra_hour_e_eur, extra_hour_s_eur, extra_hour_v_eur').eq('id', 1).single(), 'tour_settings')
      return { e: num(row.extra_hour_e_eur), s: num(row.extra_hour_s_eur), v: num(row.extra_hour_v_eur) }
    },
    async setExtraHourPrices(p) {
      const patch: Record<string, number | string> = { updated_at: new Date().toISOString() }
      if (p.e !== undefined) patch.extra_hour_e_eur = p.e
      if (p.s !== undefined) patch.extra_hour_s_eur = p.s
      if (p.v !== undefined) patch.extra_hour_v_eur = p.v
      const { error } = await sb.from('tour_settings').update(patch).eq('id', 1)
      if (error) throw new Error(`update tour_settings: ${error.message}`)
    },
    async uploadPhoto(storagePath, bytes, contentType) {
      const { error } = await sb.storage.from(TOUR_PHOTOS_BUCKET).upload(storagePath, bytes, { contentType, upsert: false })
      if (error) throw new Error(`upload photo: ${error.message}`)
    },
    async removePhotoObjects(paths) {
      if (paths.length) await sb.storage.from(TOUR_PHOTOS_BUCKET).remove(paths)
    },
    async insertPhoto(row) {
      const { error } = await sb.from('tour_photos').insert(row)
      if (error) throw new Error(`insert photo: ${error.message}`)
    },
    async deleteTourPhotos(tourId) {
      await sb.from('tour_photos').delete().eq('tour_id', tourId)
    },
    async loadPublishInput(slug) {
      const { data: tour } = await sb.from('tours').select('*').eq('slug', slug).maybeSingle()
      if (!tour) return null
      const { data: en } = await sb.from('tour_translations').select('is_complete').eq('tour_id', tour.id).eq('locale', 'en').maybeSingle()
      const { data: photos } = await sb.from('tour_photos').select('*').eq('tour_id', tour.id)
      const asNum = (v: unknown) => num(v)
      return {
        tour: { ...(tour as unknown as TourRow), price_e_eur: asNum(tour.price_e_eur), price_s_eur: asNum(tour.price_s_eur), price_v_eur: asNum(tour.price_v_eur) },
        enComplete: en?.is_complete === true,
        photos: (photos ?? []) as unknown as TourPhotoRow[],
      }
    },
    async publishTour(tourId, firstPublishedAt) {
      const { error } = await sb
        .from('tours')
        .update({ status: 'published', first_published_at: firstPublishedAt, updated_at: new Date().toISOString() })
        .eq('id', tourId)
      if (error) throw new Error(`publish tour: ${error.message}`)
    },
  }
}

function runCli(): void {
  try {
    process.loadEnvFile('.env.local')
  } catch {
    // no .env.local here: the dry run still prints content completeness
  }
  main({
    argv: process.argv.slice(2),
    root: process.cwd(),
    log: (line) => console.log(line),
    hasEnv: () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    createStore: createSupabaseStore,
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((err: unknown) => {
      // never print env values: only the error message
      console.error('seed-tours failed:', err instanceof Error ? err.message : 'unknown error')
      process.exitCode = 1
    })
}

if (process.argv[1] && /seed-tours\.(ts|js|mjs|cjs)$/.test(process.argv[1])) runCli()
