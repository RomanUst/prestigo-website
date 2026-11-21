// Phase 93 (plan 93-13; TRIP-02; D-15; UI-SPEC Surface 1.3 block 8): the "Photo credits" disclosure of a tour page.
// One line per credited photo, "Photo {n}: {credit}, {license}", numbered in gallery order (cover first). Own photos
// are not listed; with none to list nothing is rendered. Server component, the translator comes from the page.

import type { TourT } from '@/components/tours/tour-t'
import { photoCredit, type CreditablePhoto } from '@/components/tours/tour-credit'
import type { TourPhotoRow } from '@/lib/tours/types'

type Photo = CreditablePhoto & Pick<TourPhotoRow, 'is_cover' | 'position'>

export default function PhotoCredits({ photos, t }: { photos: readonly Photo[]; t: TourT }) {
  // Same order as the gallery: cover first, then by position.
  const ordered = [...photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)
  const items = ordered.flatMap((p, i) => {
    const credit = photoCredit(p)
    return credit ? [{ n: i + 1, ...credit }] : []
  })
  if (items.length === 0) return null

  return (
    <details className="mt-8 border-t border-anthracite-light pt-2">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-[11px] font-normal text-warmgrey underline">
        {t('sections.credits')}
      </summary>
      <ul className="m-0 list-none p-0 pb-4">
        {items.map((item) => {
          const line = t('gallery.creditItem', { n: item.n, credit: item.credit, license: item.license })
          return (
            <li key={item.n} className="py-1 text-[11px] font-light text-warmgrey">
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="underline hover:text-offwhite">
                  {line}
                </a>
              ) : (
                line
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
