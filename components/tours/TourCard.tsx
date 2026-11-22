// Phase 93 (plan 93-14; TRIP-01; UI-SPEC Surface 2.2): one tour in the catalogue (hub grid and "You might also like").
// A server component: the whole card is clickable through the title link (a stretched ::after), so the article holds
// exactly one interactive element. Every figure comes from the TourCardView the store built from the tour row (hours,
// lowest class price); nothing is typed here. No badge, rating, popularity or count: the card states facts only.

import Image from 'next/image'
import { ChevronRight, Clock, Hourglass } from 'lucide-react'
import { formatEUR } from '@/lib/currency'
import { localizedHref } from '@/lib/localized-href'
import { tourPhotoUrl } from '@/lib/tours/photo-url'
import type { TourCardView } from '@/lib/tours/store'
import type { TourT } from '@/components/tours/tour-t'

export default function TourCard({ card, locale, t }: { card: TourCardView; locale: string; t: TourT }) {
  const href = localizedHref(locale, `/services/${card.slug}`) ?? `/services/${card.slug}`
  // '' without the Supabase URL: the navy box stays, no broken image.
  const src = card.cover ? tourPhotoUrl(card.cover.storage_path) : ''

  return (
    <article className="group relative flex h-full w-full flex-col overflow-hidden rounded-[4px] border border-anthracite-light bg-anthracite-mid transition-colors hover:border-copper has-[a:focus-visible]:border-copper has-[a:focus-visible]:outline has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-copper">
      <div className="relative aspect-[4/3] overflow-hidden bg-anthracite">
        {src && (
          <Image
            src={src}
            alt={card.title}
            fill
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
            className="object-cover transition-transform duration-[400ms] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-6">
        <p className="label">{t('hub.cardEyebrow')}</p>
        <h3 className="font-display text-[24px] font-normal leading-[1.25] text-offwhite">
          <a href={href} className="outline-none after:absolute after:inset-0 after:content-['']">
            {card.title}
          </a>
        </h3>
        <p className="line-clamp-2 font-body text-[14px] font-light leading-[1.5] text-warmgrey">{card.shortDescription}</p>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-body text-[14px] font-light text-warmgrey">
          {card.totalHours !== null && (
            <li className="flex items-center gap-2">
              <Clock size={16} aria-hidden="true" className="shrink-0" />
              {t('facts.total', { hours: card.totalHours })}
            </li>
          )}
          <li className="flex items-center gap-2">
            <Hourglass size={16} aria-hidden="true" className="shrink-0" />
            {t('facts.atDestination', { hours: card.hoursIncluded })}
          </li>
        </ul>

        <div className="mt-auto flex items-end justify-between gap-4 border-t border-anthracite-light pt-4">
          {card.lowestPrice !== null ? (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-body text-[11px] font-normal uppercase tracking-[0.12em] text-warmgrey">{t('box.from')}</span>
              <bdi className="font-display text-[24px] font-normal leading-none text-offwhite">{formatEUR(card.lowestPrice)}</bdi>
              <span className="font-body text-[11px] font-normal text-warmgrey">{t('box.perCar')}</span>
            </p>
          ) : (
            <span />
          )}
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-copper-light rtl:-scale-x-100" />
        </div>
      </div>
    </article>
  )
}
