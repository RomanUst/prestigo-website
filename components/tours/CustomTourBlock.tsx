// Phase 93 (plan 93-14; D-13, D-16; UI-SPEC Surface 1.7): the custom-tour entry point in its two variants.
//   compact - a card under the booking box on a tour page, linked with the tour (customTourHref({ tour: slug }))
//   band    - a full-width section above the footer on tour pages (with the tour) and on the hub (without)
// The link always comes from customTourHref, so it follows CUSTOM_TOUR_REQUEST_LIVE (contact page until the request
// page ships) and validates the slug before it reaches a URL. All copy comes from the Tours.custom catalog.

import { MessageCircle } from 'lucide-react'
import { customTourHref } from '@/lib/tours/custom-tour-link'
import { localizedHref } from '@/lib/localized-href'
import { splitHref, type TourT } from '@/components/tours/tour-t'

/** Locale-resolves the path of an internal href and keeps its query. */
export function localizedCustomHref(locale: string, href: string): string {
  const { path, query } = splitHref(href)
  return `${localizedHref(locale, path) ?? path}${query}`
}

export default function CustomTourBlock({
  variant,
  tourSlug,
  locale,
  t,
}: {
  variant: 'compact' | 'band'
  /** Set on a tour page so the request opens prefilled with this tour; absent on the hub. */
  tourSlug?: string
  locale: string
  t: TourT
}) {
  const href = localizedCustomHref(locale, customTourHref(tourSlug ? { tour: tourSlug } : {}))

  if (variant === 'compact') {
    return (
      <div data-testid="custom-tour-compact" className="rounded-[4px] border border-anthracite-light bg-anthracite-mid p-6">
        <h2 className="flex items-start gap-2 font-body text-[14px] font-normal leading-[1.5] text-offwhite">
          <MessageCircle size={20} aria-hidden="true" className="mt-px shrink-0 text-copper-light" />
          {t('custom.heading')}
        </h2>
        <p className="mt-2 font-body text-[14px] font-light leading-[1.5] text-warmgrey">{t('custom.compactBody')}</p>
        <a href={href} className="cta-text mt-4">
          {t('custom.cta')}
        </a>
      </div>
    )
  }

  return (
    <section data-testid="custom-tour-band" className="bg-anthracite-mid py-12 sm:py-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <div className="max-w-2xl border-s-[3px] border-copper ps-6">
          <p className="label mb-4">{t('custom.bandLabel')}</p>
          <h2 className="font-display text-[24px] font-normal leading-[1.25] text-offwhite">{t('custom.heading')}</h2>
          <p className="mt-4 font-body text-[14px] font-light leading-[1.75] text-warmgrey">{t('custom.bandBody')}</p>
        </div>
        <a href={href} className="btn-primary self-start lg:self-center">
          {t('custom.cta')}
        </a>
      </div>
    </section>
  )
}
