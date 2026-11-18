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
import { TourAdminError } from '@/lib/tours/admin-store'
import { invalidPayload, notFound, tourErrorResponse } from '@/lib/tours/admin-http'
import { TOUR_PHOTOS_BUCKET, TOUR_PHOTO_SOURCES, type TourPhotoRow } from '@/lib/tours/types'

export type TourPhotoErrorCode = 'INVALID_PATH' | 'OBJECT_MISSING' | 'PHOTO_EXISTS' | 'PHOTO_LIMIT' | 'DB'

/** A photo failure with a fixed, client-safe code; a database or Storage message never reaches a response. */
export class TourPhotoError extends Error {
  constructor(readonly code: TourPhotoErrorCode) {
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

/** The tour id (as the database spells it); NOT_FOUND when unknown. */
async function readTourId(db: Db, tourId: string): Promise<string> {
  const { data, error } = await db.from('tours').select('id').eq('id', tourId).maybeSingle()
  if (error) dbFail()
  if (!data) throw new TourAdminError('NOT_FOUND')
  return (data as { id: string }).id
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
      default:
        break
    }
    console.error(`[admin/${scope}] failed`)
    return NextResponse.json({ error: 'Request failed' }, { status: 500, headers: NO_STORE })
  }
  if (e instanceof TourAdminError && e.code === 'NOT_FOUND') return notFound()
  return tourErrorResponse(e, scope)
}
