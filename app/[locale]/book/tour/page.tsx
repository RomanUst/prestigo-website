// /[locale]/book/tour: the tour checkout (Phase 93, plan 93-18; TRIP-04; D-09, D-10; UI-SPEC Surface 4).
// Dynamic (it reads the query string) and noindex. Public page: it reads params.locale and calls setRequestLocale,
// never the bare request-locale reader. The server loads the tour (published and complete in this locale) and
// tour_settings, computes the client fare with the shared pure tourFare, and hands prices, the pickup radius and the
// trip to the client checkout as props. The query is untrusted: parseTourCheckoutQuery validates every value, and
// the server re-validates and re-prices at init and intent (93-16 / 93-17).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import TourCheckout from '@/components/tours/TourCheckout'
import { locales, type AppLocale } from '@/i18n/locales'
import { Link } from '@/i18n/routing'
import { customTourHref } from '@/lib/tours/custom-tour-link'
import { parseTourCheckoutQuery } from '@/lib/tours/checkout-query'
import { classesForPassengers, tourFare } from '@/lib/tours/pricing'
import { getPublishedTourForLocale } from '@/lib/tours/store'
import { tourPhotoUrl } from '@/lib/tours/photo-url'

export const dynamic = 'force-dynamic'

type Params = Promise<{ locale: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function isAppLocale(locale: string): locale is AppLocale {
  return (locales as readonly string[]).includes(locale)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return { robots: { index: false, follow: false } }
  const t = await getTranslations({ locale, namespace: 'Tours.checkout' })
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

const HUB_HREF = '/services/day-trips-from-prague'

/** The error pages of the checkout (UI-SPEC 4.5): a heading, one line and the way on. */
function StatePage({
  title,
  body,
  primary,
  secondary,
}: {
  title: string
  body: string
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
}) {
  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto w-full max-w-[640px] px-6 pb-24 pt-24">
        <h1 className="display mb-4 text-[length:clamp(28px,7vw,40px)] leading-[1.1]">{title}</h1>
        <p className="mb-8 text-[14px] font-light leading-[1.75] text-warmgrey">{body}</p>
        <div className="flex flex-wrap gap-4">
          <Link href={primary.href} className="btn-primary inline-flex min-h-[44px] items-center">
            {primary.label}
          </Link>
          {secondary ? (
            <Link href={secondary.href} className="btn-secondary inline-flex min-h-[44px] items-center">
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  )
}

export default async function TourCheckoutPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { locale } = await params
  setRequestLocale(locale)
  if (!isAppLocale(locale)) notFound()

  const t = await getTranslations({ locale, namespace: 'Tours.checkout' })

  // Missing or invalid query (any value, or a car that cannot seat the party).
  const query = parseTourCheckoutQuery(await searchParams)
  if (!query || !classesForPassengers(query.pax).includes(query.car)) {
    return (
      <StatePage
        title={t('missingTitle')}
        body={t('missingBody')}
        primary={{ href: HUB_HREF, label: t('seeAll') }}
      />
    )
  }

  // Unknown, unpublished or this-locale-incomplete tour, or a class / extra hour without a price.
  const unavailable = (
    <StatePage
      title={t('unavailableTitle')}
      body={t('unavailableBody')}
      primary={{ href: HUB_HREF, label: t('seeAll') }}
      secondary={{ href: customTourHref({ tour: query.tour, date: query.date, pax: query.pax }), label: t('refusalCta') }}
    />
  )
  const result = await getPublishedTourForLocale(query.tour, locale)
  if (result.status !== 'ok') return unavailable
  const { tour, translation, settings, photos } = result.data

  let fareEur: number
  try {
    fareEur = tourFare(tour, settings, query.car, query.xh)
  } catch {
    return unavailable
  }

  const cover = photos[0] ? tourPhotoUrl(photos[0].storage_path) : ''

  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto w-full max-w-[640px] px-6 pb-24 pt-24 lg:max-w-7xl lg:px-12">
        <h1 className="display mb-8 text-[length:clamp(28px,7vw,40px)] leading-[1.1]">{t('title')}</h1>
        <TourCheckout
          tour={{
            slug: tour.slug,
            title: translation.title,
            hoursIncluded: tour.hours_included,
            driveMinutesEachWay: tour.drive_minutes_each_way,
            coverUrl: cover || null,
          }}
          query={query}
          fareEur={fareEur}
          pickupRadiusKm={settings.pickup_radius_km}
        />
      </main>
      <Footer />
    </>
  )
}
