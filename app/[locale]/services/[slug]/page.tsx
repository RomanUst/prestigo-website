// /services/<slug>: a landing page (lib/landing-pages.ts, e.g. the hub day-trips-from-prague, D-25) or, since
// Phase 93 (D-07), a published day-trip tour from the database under the same URL. Resolution order:
// landing page first, else getPublishedTourForLocale, else notFound(). A tour whose translation for the
// requested locale is not complete answers 307 to the EN URL (D-08 / D-23): English text must never render
// under another locale prefix. Public page: params.locale + setRequestLocale, never the bare request-locale reader.

import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import LandingView from '@/components/LandingView'
import TourPageView from '@/components/tours/TourPageView'
import TourGallery from '@/components/tours/TourGallery'
import TourBookingArea from '@/components/tours/TourBookingArea'
import PhotoCredits from '@/components/tours/PhotoCredits'
import CustomTourBlock from '@/components/tours/CustomTourBlock'
import { HubTourSection, RelatedToursSection, relatedCards } from '@/components/tours/TourCardGrid'
import type { TourT } from '@/components/tours/tour-t'
import { getPageContent } from '@/lib/page-content'
import { interpolate } from '@/lib/content-interpolate'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { getStaticAggregateRating } from '@/lib/google-reviews'
import { findLandingPage, getLandingPrices, landingPagesFor, type LandingContent } from '@/lib/landing-pages'
import { getPublishedTourForLocale, getPublishedTourLocales, listPublishedTours, type TourCardView } from '@/lib/tours/store'
import { tourPhotoUrl } from '@/lib/tours/photo-url'
import { TOUR_SLUG_MAX_LENGTH, TOUR_SLUG_PATTERN } from '@/lib/tours/types'
import { ROUTES_BY_SLUG } from '@/lib/routes'
import { getPathname, routing } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'

// ISR safety net; admin writes revalidate the layout (93-07).
export const revalidate = 3600
// Landing slugs are prerendered; published tour slugs are prerendered too, and a tour published after the
// build renders on first request (success criterion: admin-created tours work without a redeploy).
export const dynamicParams = true

type Params = Promise<{ locale: string; slug: string }>

// The one landing page that lists the database tours (D-25): a grid after "At a glance", a custom-tour band before the CTA.
const HUB_SLUG = 'day-trips-from-prague'

// One database read per request for both generateMetadata and the page.
const loadTour = cache(getPublishedTourForLocale)

function isAppLocale(locale: string): locale is AppLocale {
  return (routing.locales as readonly string[]).includes(locale)
}

// The store never throws (it returns [] without Supabase env); the catch keeps a page render from failing on any surprise.
async function loadCards(locale: AppLocale): Promise<TourCardView[]> {
  try {
    return await listPublishedTours(locale)
  } catch {
    return []
  }
}

function isTourSlug(slug: string): boolean {
  return slug.length <= TOUR_SLUG_MAX_LENGTH && TOUR_SLUG_PATTERN.test(slug)
}

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const landing = landingPagesFor('services').map((p) => ({ slug: p.slug }))
  try {
    const tours = await getPublishedTourLocales()
    const seen = new Set(landing.map((p) => p.slug))
    return [...landing, ...tours.filter((t) => !seen.has(t.slug)).map((t) => ({ slug: t.slug }))]
  } catch {
    // No Supabase env (Vercel Preview, local build): landing pages only, never a throw.
    return landing
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params
  const page = findLandingPage('services', slug)
  if (page) {
    const key = `services/${slug}`
    const content = getPageContent(key, locale) as LandingContent
    const prices = await getLandingPrices()
    const description = interpolate(content.metadata.description, prices)
    const alternates = getAlternates(`/services/${slug}`, { indexable: true, content: { kind: 'page', key }, locale })
    return {
      title: interpolate(content.metadata.title, prices),
      description,
      alternates,
      openGraph: {
        url: toAbsoluteUrl(alternates.canonical),
        title: interpolate(content.metadata.ogTitle, prices),
        description,
        images: [{ url: `https://rideprestigo.com${page.heroImage ?? '/og-image.jpg'}`, width: 1200, height: 630 }],
      },
    }
  }

  if (!isTourSlug(slug) || !isAppLocale(locale)) return {}
  const result = await loadTour(slug, locale)
  if (result.status !== 'ok') return {}
  const { translation, photos, completeLocales } = result.data
  // hreflang and canonical list only the locales whose translation is complete (en always, as x-default).
  const alternates = getAlternates(`/services/${slug}`, { indexable: true, locale, availableLocales: completeLocales })
  const cover = photos[0] ? tourPhotoUrl(photos[0].storage_path) : ''
  const image = cover
    ? { url: cover, ...(photos[0].width && photos[0].height ? { width: photos[0].width, height: photos[0].height } : {}) }
    : { url: 'https://rideprestigo.com/og-image.jpg', width: 1200, height: 630 }
  return {
    title: translation.seo_title,
    description: translation.seo_description,
    alternates,
    openGraph: {
      url: toAbsoluteUrl(alternates.canonical),
      title: translation.seo_title,
      description: translation.seo_description,
      images: [image],
    },
  }
}

export default async function ServicePage({ params }: { params: Params }) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  const page = findLandingPage('services', slug)
  if (page) {
    const content = getPageContent(`services/${slug}`, locale) as LandingContent
    const prices = await getLandingPrices()
    if (slug === HUB_SLUG && isAppLocale(locale)) {
      const t = (await getTranslations({ locale, namespace: 'Tours' })) as unknown as TourT
      const cards = await loadCards(locale)
      return (
        <LandingView
          page={page}
          content={content}
          locale={locale}
          prices={prices}
          rating={getStaticAggregateRating()}
          afterGlance={<HubTourSection cards={cards} locale={locale} t={t} />}
          beforeCta={<CustomTourBlock variant="band" locale={locale} t={t} />}
        />
      )
    }
    return <LandingView page={page} content={content} locale={locale} prices={prices} rating={getStaticAggregateRating()} />
  }

  // Only a well-formed tour slug in a real locale ever reaches the database or a redirect (T-93-30).
  if (!isTourSlug(slug) || !isAppLocale(locale)) notFound()

  const result = await loadTour(slug, locale)
  if (result.status === 'locale_incomplete') {
    redirect(getPathname({ locale: 'en', href: `/services/${slug}` }))
  }
  if (result.status !== 'ok') notFound()

  // "<dest>-day-trip" -> the one-way route page "prague-<dest>" when it exists (SEO map rule 2).
  const routeSlug = `prague-${slug.slice(0, -'-day-trip'.length)}`
  const oneWayRoute = ROUTES_BY_SLUG[routeSlug]
    ? {
        href: getPathname({ locale, href: `/routes/${routeSlug}` }),
        destination: result.data.tour.destination_label,
      }
    : null

  // The box and the gallery read only the tour row, its translation and tour_settings (D-01): no amount is typed here.
  const { tour, translation, settings, photos } = result.data
  // Only the fields the gallery needs cross to the client (no tour id or timestamps).
  const galleryPhotos = photos.map((p) => ({
    id: p.id,
    storage_path: p.storage_path,
    position: p.position,
    is_cover: p.is_cover,
    source: p.source,
    credit_text: p.credit_text,
    license: p.license,
    credit_url: p.credit_url,
  }))
  const t = (await getTranslations({ locale, namespace: 'Tours' })) as unknown as TourT
  // "You might also like": up to 3 other tours complete in this locale; the section renders nothing with none.
  const related = relatedCards(await loadCards(locale), tour.slug)
  const slots = {
    gallery: galleryPhotos.length > 0 ? <TourGallery title={translation.title} photos={galleryPhotos} /> : undefined,
    bookingBox: (
      <TourBookingArea
        slug={tour.slug}
        title={translation.title}
        hoursIncluded={tour.hours_included}
        prices={{ business: tour.price_e_eur, first_class: tour.price_s_eur, business_van: tour.price_v_eur }}
        extraHourPrices={{
          business: settings.extra_hour_e_eur,
          first_class: settings.extra_hour_s_eur,
          business_van: settings.extra_hour_v_eur,
        }}
        startMin={tour.start_time_min}
        startMax={tour.start_time_max}
        freeCancelHours={settings.free_cancel_hours}
      />
    ),
    compactCustom: <CustomTourBlock variant="compact" tourSlug={tour.slug} locale={locale} t={t} />,
    related: <RelatedToursSection cards={related} locale={locale} t={t} />,
    band: <CustomTourBlock variant="band" tourSlug={tour.slug} locale={locale} t={t} />,
    credits: <PhotoCredits photos={galleryPhotos} t={t} />,
  }

  return <TourPageView data={result.data} locale={locale} oneWayRoute={oneWayRoute} slots={slots} />
}
