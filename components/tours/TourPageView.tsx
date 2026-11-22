// Phase 93 (plan 93-11; TRIP-01, TRIP-02; UI-SPEC Surface 1.1, 1.2): the DB-backed tour page layout.
// The only async component of the page: it builds the `Tours` translator once and hands it to the
// synchronous sub-components. The grid areas of later plans exist now as `slots` (gallery 93-12, booking box
// and sticky bar 93-13, related / band / credits 93-14); an absent slot renders nothing.
// DOM order equals the mobile visual order (lead, box, body); from 1024px the box sits in the second column.

import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { ChevronRight } from 'lucide-react'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import Testimonials from '@/components/Testimonials'
import TourKeyFacts from '@/components/tours/TourKeyFacts'
import TourSections from '@/components/tours/TourSections'
import type { TourT } from '@/components/tours/tour-t'
import { localizedHref } from '@/lib/localized-href'
import { buildTourJsonLd, safeJsonLd } from '@/lib/tours/jsonld'
import { tourPhotoUrl } from '@/lib/tours/photo-url'
import type { TourPageData } from '@/lib/tours/store'
import type { AppLocale } from '@/i18n/locales'

export type TourPageSlots = {
  gallery?: ReactNode
  bookingBox?: ReactNode
  stickyBar?: ReactNode
  compactCustom?: ReactNode
  related?: ReactNode
  band?: ReactNode
  credits?: ReactNode
}

export default async function TourPageView({
  data,
  locale,
  oneWayRoute,
  slots = {},
}: {
  data: TourPageData
  locale: AppLocale
  oneWayRoute: { href: string; destination: string } | null
  slots?: TourPageSlots
}) {
  const t = (await getTranslations({ locale, namespace: 'Tours' })) as unknown as TourT
  const { tour, translation, settings, photos } = data
  const cover = photos[0] ? tourPhotoUrl(photos[0].storage_path) : ''
  // Offer prices come from the same tour row the page renders (D-01). safeJsonLd escapes tour text.
  const jsonLd = safeJsonLd(
    buildTourJsonLd({
      slug: tour.slug,
      locale,
      translation,
      tour,
      coverUrl: cover || null,
      breadcrumb: {
        home: t('page.breadcrumbHome'),
        services: t('page.breadcrumbServices'),
        hub: t('page.breadcrumbHub'),
      },
    }),
  )

  const crumbs = [
    { href: localizedHref(locale, '/') ?? '/', label: t('page.breadcrumbHome') },
    { href: localizedHref(locale, '/services') ?? '/services', label: t('page.breadcrumbServices') },
    {
      href: localizedHref(locale, '/services/day-trips-from-prague') ?? '/services/day-trips-from-prague',
      label: t('page.breadcrumbHub'),
    },
  ]
  const hasAside = Boolean(slots.bookingBox || slots.compactCustom)

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Nav />

      <div className="mx-auto max-w-7xl px-6 pt-24 sm:px-8 lg:px-12">
        <nav aria-label={t('page.breadcrumbLabel')}>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-[11px] font-normal text-warmgrey">
            {crumbs.map((c) => (
              <li key={c.href} className="flex items-center gap-2">
                <a href={c.href} className="hover:underline">
                  {c.label}
                </a>
                <ChevronRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
              </li>
            ))}
            <li aria-current="page">{translation.title}</li>
          </ol>
        </nav>

        <header className="mt-8">
          <p className="label mb-4">{t('page.eyebrow')}</p>
          <h1 className="display max-w-3xl text-[length:clamp(28px,7vw,40px)] leading-[1.1]">{translation.title}</h1>
          <p className="mt-4 max-w-2xl font-body text-[14px] font-light leading-[1.75] text-warmgrey">
            {translation.short_description}
          </p>
        </header>

        {slots.gallery && <div className="mt-8">{slots.gallery}</div>}

        <div className="mt-8 grid grid-cols-1 gap-x-12 lg:grid-cols-12">
          <div data-area="lead" className="lg:col-span-8 lg:col-start-1 lg:row-start-1">
            <TourKeyFacts tour={tour} settings={settings} t={t} />
          </div>

          {hasAside && (
            <aside
              data-area="box"
              className="mt-8 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:mt-0"
            >
              <div className="lg:[@media(min-height:800px)]:sticky lg:[@media(min-height:800px)]:top-[88px]">
                {slots.bookingBox}
                {slots.compactCustom && <div className="mt-4">{slots.compactCustom}</div>}
              </div>
            </aside>
          )}

          <div data-area="body" className="lg:col-span-8 lg:col-start-1 lg:row-start-2">
            <TourSections data={data} locale={locale} t={t} oneWayRoute={oneWayRoute} />
          </div>
        </div>

        {slots.credits}
      </div>

      <Divider />
      <Testimonials />
      {slots.related}
      {slots.band}

      <div className="bg-anthracite max-lg:pb-[calc(72px+env(safe-area-inset-bottom))]">
        <Footer />
      </div>
      {slots.stickyBar}
    </main>
  )
}
