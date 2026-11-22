// Phase 93 (plan 93-14; TRIP-01; D-25; UI-SPEC Surface 2.1, 2.3): the catalogue grid and the two sections built on it.
//   HubTourSection      - "At a glance" is followed by this on the hub: label, heading and the grid of every
//                         published tour of the locale, or the empty state with the custom-tour link.
//   RelatedToursSection - "You might also like" on a tour page: up to 3 other tours; nothing at all with 0.
// The grid is 1 / 2 / 3 columns with equal heights; a row with fewer cards than columns keeps the column width
// (a grid cell never stretches past its track), so one or two related tours stay card-sized.

import TourCard from '@/components/tours/TourCard'
import { localizedCustomHref } from '@/components/tours/CustomTourBlock'
import { customTourHref } from '@/lib/tours/custom-tour-link'
import type { TourT } from '@/components/tours/tour-t'
import type { TourCardView } from '@/lib/tours/store'

/** The most tours the related row shows. */
export const RELATED_MAX = 3

const GRID_CLASS = 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'

export default function TourCardGrid({ cards, locale, t }: { cards: readonly TourCardView[]; locale: string; t: TourT }) {
  return (
    <ul className={GRID_CLASS}>
      {cards.map((card) => (
        <li key={card.slug} className="flex">
          <TourCard card={card} locale={locale} t={t} />
        </li>
      ))}
    </ul>
  )
}

export function HubTourSection({ cards, locale, t }: { cards: readonly TourCardView[]; locale: string; t: TourT }) {
  return (
    <section className="bg-anthracite py-16" data-testid="tour-hub-grid" aria-labelledby="tour-hub-heading">
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        {cards.length > 0 ? (
          <>
            <p className="label mb-4">{t('hub.label')}</p>
            <h2 id="tour-hub-heading" className="mb-8 font-display text-[24px] font-normal leading-[1.25] text-offwhite">
              {t('hub.heading')}
            </h2>
            <TourCardGrid cards={cards} locale={locale} t={t} />
          </>
        ) : (
          <div className="max-w-2xl">
            <h2 id="tour-hub-heading" className="mb-4 font-display text-[24px] font-normal leading-[1.25] text-offwhite">
              {t('hub.emptyHeading')}
            </h2>
            <p className="mb-8 font-body text-[14px] font-light leading-[1.75] text-warmgrey">{t('hub.emptyBody')}</p>
            <a href={localizedCustomHref(locale, customTourHref({}))} className="btn-primary">
              {t('custom.cta')}
            </a>
          </div>
        )}
      </div>
    </section>
  )
}

/** Up to RELATED_MAX other tours of the locale, in the store's sort order; the current tour never appears. */
export function relatedCards(all: readonly TourCardView[], currentSlug: string): TourCardView[] {
  return all.filter((c) => c.slug !== currentSlug).slice(0, RELATED_MAX)
}

export function RelatedToursSection({ cards, locale, t }: { cards: readonly TourCardView[]; locale: string; t: TourT }) {
  if (cards.length === 0) return null
  return (
    <section className="bg-anthracite py-16" data-testid="tour-related" aria-labelledby="tour-related-heading">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
        <h2 id="tour-related-heading" className="mb-8 font-display text-[24px] font-normal leading-[1.25] text-offwhite">
          {t('sections.related')}
        </h2>
        <TourCardGrid cards={cards} locale={locale} t={t} />
      </div>
    </section>
  )
}
