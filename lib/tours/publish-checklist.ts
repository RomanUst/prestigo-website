// Phase 93 (plan 93-05; TRIP-01, TRIP-03; UI-SPEC 7.3 A): what blocks publishing a tour.
// Pure and client-safe. Only English content blocks publishing; the other languages go live one by one
// as they become complete (D-08). The admin API (93-07) enforces this server-side; the editor mirrors it.

import type { TourPhotoRow, TourRow } from '@/lib/tours/types'

export type PublishFailure =
  | 'EN_INCOMPLETE'
  | 'NO_PHOTO'
  | 'NO_COVER'
  | 'MISSING_CREDIT'
  | 'MISSING_PRICE'
  | 'MISSING_BASICS'

function filled(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

function validPrice(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

/** Own photos need no credit; every other source needs a credit text and a licence (D-15). */
function creditMissing(p: TourPhotoRow): boolean {
  if (p.source === 'own') return false
  return !filled(p.credit_text) || !filled(p.license)
}

export function publishChecklist(input: {
  tour: TourRow
  enComplete: boolean
  photos: TourPhotoRow[]
}): { ok: boolean; failures: PublishFailure[] } {
  const { tour, enComplete, photos } = input
  const failures: PublishFailure[] = []
  if (!enComplete) failures.push('EN_INCOMPLETE')
  if (photos.length === 0) failures.push('NO_PHOTO')
  else if (!photos.some((p) => p.is_cover)) failures.push('NO_COVER')
  if (photos.some(creditMissing)) failures.push('MISSING_CREDIT')
  if (![tour.price_e_eur, tour.price_s_eur, tour.price_v_eur].every(validPrice)) failures.push('MISSING_PRICE')
  if (typeof tour.drive_minutes_each_way !== 'number' || !filled(tour.destination_label)) failures.push('MISSING_BASICS')
  return { ok: failures.length === 0, failures }
}
