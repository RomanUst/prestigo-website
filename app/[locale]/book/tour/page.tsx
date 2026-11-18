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

  const query = parseTourCheckoutQuery(await searchParams)
  if (!query || !classesForPassengers(query.pax).includes(query.car)) notFound()

  const result = await getPublishedTourForLocale(query.tour, locale)
  if (result.status !== 'ok') notFound()
  const { tour, translation, settings, photos } = result.data

  let fareEur: number
  try {
    fareEur = tourFare(tour, settings, query.car, query.xh)
  } catch {
    notFound()
  }

  const t = await getTranslations({ locale, namespace: 'Tours.checkout' })
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
