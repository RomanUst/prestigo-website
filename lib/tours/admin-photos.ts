// Phase 93 (plan 93-08; TRIP-02, TRIP-05; D-15): photo management behind the admin tour API.
// Server only. The browser uploads straight to the public tour-photos bucket with a signed upload URL (Vercel's
// 4.5 MB request body limit rules out a function upload). The server owns every storage path: tours/<tourId>/<uuid>.<ext>
// with the extension taken from an allow-list matched to the declared content type, never from a client file name
// (T-93-21). A photo row is registered only after the object exists in the bucket (T-93-22: the path must belong to the
// tour and match the 092 CHECK). The bucket itself enforces the MIME list and the 8 MB limit.

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NO_LINE_BREAKS } from '@/lib/request-guards'
import { TourAdminError, getAdminTour } from '@/lib/tours/admin-store'
import { invalidPayload, notFound, tourErrorResponse } from '@/lib/tours/admin-http'
import { TOUR_PHOTOS_BUCKET, TOUR_PHOTO_SOURCES, type TourPhotoRow, type TourRow } from '@/lib/tours/types'
import { publishChecklist, type PublishFailure } from '@/lib/tours/publish-checklist'

export type TourPhotoErrorCode =
  | 'INVALID_PATH'
  | 'OBJECT_MISSING'
  | 'PHOTO_EXISTS'
  | 'PHOTO_LIMIT'
  | 'LAST_PHOTO'
  | 'CHECKLIST_FAILED'
  | 'DB'

/** A photo / publish failure with a fixed, client-safe code; a database or Storage message never reaches a response. */
export class TourPhotoError extends Error {
  constructor(
    readonly code: TourPhotoErrorCode,
    /** Set for CHECKLIST_FAILED: the reasons the tour cannot be published. */
    readonly failures: PublishFailure[] = [],
  ) {
    super(code)
    this.name = 'TourPhotoError'
  }
}

/** Largest accepted upload, equal to the bucket limit in 092_tours.sql. */
export const TOUR_PHOTO_MAX_BYTES = 8 * 1024 * 1024
/** tour_photos.position is CHECK 1..50. */
export const TOUR_PHOTO_MAX_COUNT = 50

/** Declared content type to the file extension the 092 CHECK allows. */
const EXT_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
} as const
const CONTENT_TYPES = Object.keys(EXT_BY_CONTENT_TYPE) as [keyof typeof EXT_BY_CONTENT_TYPE, ...Array<keyof typeof EXT_BY_CONTENT_TYPE>]

// -- schemas -------------------------------------------------------------------------------------------------------

/** An https link; the stored value must match the 092 CHECK (^https://). */
const httpsUrl = z
  .string()
  .max(500)
  .regex(NO_LINE_BREAKS, 'Invalid format')
  .refine((v) => {
    if (!v.startsWith('https://')) return false
    try {
      return new URL(v).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Only https links are accepted')

const creditText = z.string().trim().max(200).regex(NO_LINE_BREAKS, 'Invalid format')
const licenseText = z.string().trim().max(80).regex(NO_LINE_BREAKS, 'Invalid format')
const photoSource = z.enum(TOUR_PHOTO_SOURCES)

/** POST .../photos/sign: what the browser is about to upload. */
export const tourPhotoSignSchema = z.strictObject({
  contentType: z.enum(CONTENT_TYPES),
  size: z.number().int().min(1).max(TOUR_PHOTO_MAX_BYTES),
})

/** POST .../photos: register an uploaded object with its credit. */
export const tourPhotoRegisterSchema = z.strictObject({
  path: z.string().min(1).max(200),
  source: photoSource,
  credit_text: creditText.optional(),
  license: licenseText.optional(),
  credit_url: httpsUrl.optional(),
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
})

/** PATCH .../photos/[photoId]: make it the cover, move it one place, and / or edit its credit (null clears a field). */
export const tourPhotoPatchSchema = z
  .strictObject({
    is_cover: z.literal(true).optional(),
    move: z.enum(['up', 'down']).optional(),
    source: photoSource.optional(),
    credit_text: creditText.nullable().optional(),
    license: licenseText.nullable().optional(),
    credit_url: httpsUrl.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change')

/** POST .../publish. */
export const tourPublishSchema = z.strictObject({ action: z.enum(['publish', 'unpublish']) })

export type TourPhotoPatchInput = z.infer<typeof tourPhotoPatchSchema>
export type TourPublishAction = z.infer<typeof tourPublishSchema>['action']
export type TourPhotoSignInput = z.infer<typeof tourPhotoSignSchema>
export type TourPhotoRegisterInput = z.infer<typeof tourPhotoRegisterSchema>

// -- store ---------------------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>

const PHOTO_COLS =
  'id, tour_id, storage_path, position, is_cover, source, credit_text, license, credit_url, width, height, created_at'

function dbFail(): never {
  throw new TourPhotoError('DB')
}

function client() {
  try {
    return createSupabaseServiceClient()
  } catch {
    return dbFail()
  }
}

type Db = ReturnType<typeof client>

function toPhoto(raw: Raw): TourPhotoRow {
  return { ...(raw as unknown as TourPhotoRow), position: Number(raw.position ?? 0) }
}

/** The tour id (as the database spells it) and its status; NOT_FOUND when unknown. */
async function readTour(db: Db, tourId: string): Promise<{ id: string; status: TourRow['status'] }> {
  const { data, error } = await db.from('tours').select('id, status').eq('id', tourId).maybeSingle()
  if (error) dbFail()
  if (!data) throw new TourAdminError('NOT_FOUND')
  return data as { id: string; status: TourRow['status'] }
}

async function readTourId(db: Db, tourId: string): Promise<string> {
  return (await readTour(db, tourId)).id
}

/** The photos of a tour in display order. */
async function readPhotos(db: Db, tourId: string): Promise<TourPhotoRow[]> {
  const { data, error } = await db.from('tour_photos').select(PHOTO_COLS).eq('tour_id', tourId).order('position', { ascending: true })
  if (error) dbFail()
  return ((data ?? []) as Raw[]).map(toPhoto)
}

/** Mints a signed upload URL for a new photo of the tour; the path and extension are decided here, never by the client. */
export async function mintTourPhotoUpload(
  tourId: string,
  input: TourPhotoSignInput,
): Promise<{ path: string; token: string; signedUrl: string }> {
  const parsed = tourPhotoSignSchema.safeParse(input)
  if (!parsed.success) throw new TourPhotoError('INVALID_PATH')
  const db = client()
  const id = await readTourId(db, tourId)
  if ((await readPhotos(db, id)).length >= TOUR_PHOTO_MAX_COUNT) throw new TourPhotoError('PHOTO_LIMIT')

  const path = `tours/${id}/${randomUUID()}.${EXT_BY_CONTENT_TYPE[parsed.data.contentType]}`
  const { data, error } = await db.storage.from(TOUR_PHOTOS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) dbFail()
  return { path, token: data.token, signedUrl: data.signedUrl }
}

/**
 * Registers an uploaded object as a photo of the tour. The path must be tours/<this tour>/<uuid>.<ext> (no traversal,
 * no other tour) and the object must exist in the bucket; the photo goes last, and the first photo becomes the cover.
 */
export async function registerTourPhoto(tourId: string, input: TourPhotoRegisterInput): Promise<TourPhotoRow> {
  const db = client()
  const id = await readTourId(db, tourId)

  const pathPattern = new RegExp(`^tours/${id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp|avif)$`)
  if (!pathPattern.test(input.path)) throw new TourPhotoError('INVALID_PATH')

  const existing = await readPhotos(db, id)
  if (existing.length >= TOUR_PHOTO_MAX_COUNT) throw new TourPhotoError('PHOTO_LIMIT')
  if (existing.some((p) => p.storage_path === input.path)) throw new TourPhotoError('PHOTO_EXISTS')

  const { data: exists } = await db.storage.from(TOUR_PHOTOS_BUCKET).exists(input.path)
  if (exists !== true) throw new TourPhotoError('OBJECT_MISSING')

  const position = existing.reduce((max, p) => Math.max(max, p.position), 0) + 1
  const { data, error } = await db
    .from('tour_photos')
    .insert({
      tour_id: id,
      storage_path: input.path,
      position,
      is_cover: !existing.some((p) => p.is_cover),
      source: input.source,
      credit_text: input.credit_text?.trim() ? input.credit_text.trim() : null,
      license: input.license?.trim() ? input.license.trim() : null,
      credit_url: input.credit_url ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
    })
    .select(PHOTO_COLS)
    .single()
  if (error) {
    if (error.code === '23505') throw new TourPhotoError('PHOTO_EXISTS')
    dbFail()
  }
  return toPhoto(data as Raw)
}

/** Writes position = index + 1 for every photo whose stored position differs, so positions stay 1..n. */
async function renumber(db: Db, ordered: TourPhotoRow[]): Promise<void> {
  for (let i = 0; i < ordered.length; i += 1) {
    if (ordered[i].position === i + 1) continue
    const { error } = await db.from('tour_photos').update({ position: i + 1 }).eq('id', ordered[i].id)
    if (error) dbFail()
  }
}

/** Swaps the photo with its neighbour; a no-op at either end. */
async function movePhoto(db: Db, photos: TourPhotoRow[], photoId: string, direction: 'up' | 'down'): Promise<void> {
  const from = photos.findIndex((p) => p.id === photoId)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= photos.length) return
  const ordered = [...photos]
  ;[ordered[from], ordered[to]] = [ordered[to], ordered[from]]
  await renumber(db, ordered)
}

function nullIfBlank(v: string | null): string | null {
  const t = v?.trim()
  return t ? t : null
}

/**
 * Edits one photo: the credit fields, the cover and / or its place, in that order. A new cover clears the old one first
 * (a unique index allows one cover per tour). NOT_FOUND when the photo is not a photo of this tour.
 */
export async function updateTourPhoto(tourId: string, photoId: string, patch: TourPhotoPatchInput): Promise<TourPhotoRow[]> {
  const db = client()
  const id = await readTourId(db, tourId)
  const photos = await readPhotos(db, id)
  const target = photos.find((p) => p.id === photoId)
  if (!target) throw new TourAdminError('NOT_FOUND')

  const fields: Record<string, unknown> = {}
  if (patch.source !== undefined) fields.source = patch.source
  if (patch.credit_text !== undefined) fields.credit_text = nullIfBlank(patch.credit_text)
  if (patch.license !== undefined) fields.license = nullIfBlank(patch.license)
  if (patch.credit_url !== undefined) fields.credit_url = patch.credit_url
  if (Object.keys(fields).length > 0) {
    const { error } = await db.from('tour_photos').update(fields).eq('id', photoId).eq('tour_id', id)
    if (error) dbFail()
  }

  if (patch.is_cover === true && !target.is_cover) {
    const { error: clearErr } = await db.from('tour_photos').update({ is_cover: false }).eq('tour_id', id).eq('is_cover', true)
    if (clearErr) dbFail()
    const { error: setErr } = await db.from('tour_photos').update({ is_cover: true }).eq('id', photoId).eq('tour_id', id)
    if (setErr) dbFail()
  }

  if (patch.move) await movePhoto(db, photos, photoId, patch.move)
  return readPhotos(db, id)
}

/** Moves a photo one place up or down; a no-op at the ends. Returns the photos in their new order. */
export async function moveTourPhoto(tourId: string, photoId: string, direction: 'up' | 'down'): Promise<TourPhotoRow[]> {
  const db = client()
  const id = await readTourId(db, tourId)
  const photos = await readPhotos(db, id)
  if (!photos.some((p) => p.id === photoId)) throw new TourAdminError('NOT_FOUND')
  await movePhoto(db, photos, photoId, direction)
  return readPhotos(db, id)
}

/**
 * Deletes a photo: the row first, then the Storage object (a leftover object is harmless, a row pointing at a missing
 * object is not). The next photo becomes the cover when the cover is deleted. The last photo of a published tour stays
 * (LAST_PHOTO), because a published tour needs a cover.
 */
export async function deleteTourPhoto(tourId: string, photoId: string): Promise<TourPhotoRow[]> {
  const db = client()
  const tour = await readTour(db, tourId)
  const photos = await readPhotos(db, tour.id)
  const target = photos.find((p) => p.id === photoId)
  if (!target) throw new TourAdminError('NOT_FOUND')
  if (tour.status === 'published' && photos.length === 1) throw new TourPhotoError('LAST_PHOTO')

  const { error } = await db.from('tour_photos').delete().eq('id', photoId).eq('tour_id', tour.id)
  if (error) dbFail()

  const rest = photos.filter((p) => p.id !== photoId)
  if (target.is_cover && rest.length > 0) {
    const { error: coverErr } = await db.from('tour_photos').update({ is_cover: true }).eq('id', rest[0].id)
    if (coverErr) dbFail()
  }
  await renumber(db, rest)

  try {
    const { error: removeErr } = await db.storage.from(TOUR_PHOTOS_BUCKET).remove([target.storage_path])
    if (removeErr) console.error('[admin/tour-photos] storage object not removed')
  } catch {
    console.error('[admin/tour-photos] storage object not removed')
  }
  return readPhotos(db, tour.id)
}

/**
 * Publishes or unpublishes a tour. Publishing runs publishChecklist and refuses with CHECKLIST_FAILED (the failure codes
 * travel with the error, the status stays); first_published_at is set once and kept for good (it locks the slug, D-07).
 * Unpublishing needs no checklist and keeps first_published_at.
 */
export async function setTourStatus(tourId: string, action: TourPublishAction): Promise<TourRow> {
  const detail = await getAdminTour(tourId)
  const now = new Date().toISOString()

  const patch: Record<string, unknown> = { updated_at: now }
  if (action === 'publish') {
    const check = publishChecklist({
      tour: detail.tour,
      enComplete: detail.translations.en?.is_complete === true,
      photos: detail.photos,
    })
    if (!check.ok) throw new TourPhotoError('CHECKLIST_FAILED', check.failures)
    patch.status = 'published'
    patch.first_published_at = detail.tour.first_published_at ?? now
  } else {
    patch.status = 'draft'
  }

  const db = client()
  const { error } = await db.from('tours').update(patch).eq('id', detail.tour.id)
  if (error) dbFail()
  return (await getAdminTour(detail.tour.id)).tour
}

// -- HTTP mapping --------------------------------------------------------------------------------------------------

const NO_STORE = { 'Cache-Control': 'no-store' } as const

/** Maps a photo / publish failure to a fixed response; anything else goes through the shared tour mapping. */
export function photoErrorResponse(e: unknown, scope: string): NextResponse {
  if (e instanceof TourPhotoError) {
    switch (e.code) {
      case 'INVALID_PATH':
        return invalidPayload()
      case 'OBJECT_MISSING':
        return NextResponse.json(
          { error: 'The uploaded file was not found in storage', code: 'OBJECT_MISSING' },
          { status: 422, headers: NO_STORE },
        )
      case 'PHOTO_EXISTS':
        return NextResponse.json({ error: 'Photo already registered', code: 'PHOTO_EXISTS' }, { status: 409, headers: NO_STORE })
      case 'PHOTO_LIMIT':
        return NextResponse.json({ error: 'Too many photos', code: 'PHOTO_LIMIT' }, { status: 422, headers: NO_STORE })
      case 'LAST_PHOTO':
        return NextResponse.json(
          { error: 'A published tour keeps at least one photo', code: 'LAST_PHOTO' },
          { status: 409, headers: NO_STORE },
        )
      case 'CHECKLIST_FAILED':
        return NextResponse.json(
          { error: 'The tour is not ready to publish', code: 'CHECKLIST_FAILED', failures: e.failures },
          { status: 422, headers: NO_STORE },
        )
      default:
        break
    }
    console.error(`[admin/${scope}] failed`)
    return NextResponse.json({ error: 'Request failed' }, { status: 500, headers: NO_STORE })
  }
  if (e instanceof TourAdminError && e.code === 'NOT_FOUND') return notFound()
  return tourErrorResponse(e, scope)
}
