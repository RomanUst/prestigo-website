// Phase 93 (plan 93-13; D-15; T-93-36): which tour photos carry a visible credit, and whether its source link may be
// rendered. Shared by the lightbox and the photo credits disclosure so both apply the same rule.

import type { TourPhotoRow } from '@/lib/tours/types'

export type CreditablePhoto = Pick<TourPhotoRow, 'source' | 'credit_text' | 'license' | 'credit_url'>

/** https only: the database CHECK and the API already enforce it, this keeps a stray row from rendering javascript:. */
export function safeCreditUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** The credit of a photo, or null for an own photo (and for a row without credit text or licence). */
export function photoCredit(p: CreditablePhoto): { credit: string; license: string; url: string | null } | null {
  if (p.source === 'own') return null
  const credit = p.credit_text?.trim()
  const license = p.license?.trim()
  if (!credit || !license) return null
  return { credit, license, url: safeCreditUrl(p.credit_url) }
}
