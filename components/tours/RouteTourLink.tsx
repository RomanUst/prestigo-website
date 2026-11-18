import { getTranslations } from 'next-intl/server'
import { getPathname } from '@/i18n/routing'
import { ROUTES_BY_SLUG } from '@/lib/routes'
import { getPublishedTourLocales } from '@/lib/tours/store'
import { tourSlugForRoute } from '@/lib/tours/route-links'
import type { AppLocale } from '@/i18n/locales'

const LINK_CLASS = 'text-offwhite underline decoration-copper underline-offset-4 hover:text-copper-light'

/**
 * Phase 93-15: one line in the day-trip section of a route page pointing to the published tour page
 * of the same destination. Renders nothing when that tour is not published or the store is unreachable.
 * A locale whose translation is incomplete links to the EN tour page (the tour route redirects there anyway).
 */
export default async function RouteTourLink({ locale, routeSlug }: { locale: string; routeSlug: string }) {
  let published: Awaited<ReturnType<typeof getPublishedTourLocales>> = []
  try {
    published = await getPublishedTourLocales()
  } catch {
    return null
  }
  const tourSlug = tourSlugForRoute(
    routeSlug,
    published.map((p) => p.slug),
  )
  const destination = ROUTES_BY_SLUG[routeSlug]?.city
  if (!tourSlug || !destination) return null

  const complete = published.find((p) => p.slug === tourSlug)?.locales ?? []
  const linkLocale: AppLocale = complete.includes(locale as AppLocale) ? (locale as AppLocale) : 'en'
  const href = getPathname({ locale: linkLocale, href: `/services/${tourSlug}` })
  const t = await getTranslations({ locale, namespace: 'Tours' })

  return (
    <p className="body-text text-[13px] mt-6 max-w-2xl" style={{ lineHeight: '1.9' }} data-testid="route-to-tour">
      {t.rich('page.routeToTour', {
        destination,
        link: (chunks) => (
          <a href={href} className={LINK_CLASS}>
            {chunks}
          </a>
        ),
      })}
    </p>
  )
}
