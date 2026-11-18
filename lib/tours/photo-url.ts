// Phase 93 (plan 93-05; D-15): public URL of a tour photo in the public tour-photos bucket.
// Pure and client-safe: reads only NEXT_PUBLIC_SUPABASE_URL (inlined at build time).

import { TOUR_PHOTOS_BUCKET } from '@/lib/tours/types'

/** '' when the Supabase URL is absent, so a missing env renders no image instead of a broken one. */
export function tourPhotoUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return ''
  return `${base}/storage/v1/object/public/${TOUR_PHOTOS_BUCKET}/${storagePath}`
}
