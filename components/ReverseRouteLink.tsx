import { getPathname } from '@/i18n/routing'
import { getRouteContent } from '@/lib/route-content'
import { MIRROR_ROUTES_BY_SLUG, MIRROR_SLUG_BY_SOURCE } from '@/lib/routes'

/**
 * Cross-link between an outbound route (prague-vienna) and its inbound
 * mirror (vienna-prague). The card label is the target page's own localized
 * hero label ("Vienna → Prague"), so no city names live in the catalogs.
 * Renders nothing when the slug has no counterpart.
 */
export default function ReverseRouteLink({
  slug,
  locale,
  heading,
  cta,
}: {
  slug: string
  locale: string
  /** RoutePage.otherDirection — passed in so this stays a sync component. */
  heading: string
  cta: string
}) {
  const target = MIRROR_SLUG_BY_SOURCE[slug] ?? MIRROR_ROUTES_BY_SLUG[slug]?.sourceSlug
  if (!target) return null
  const label = getRouteContent(target, locale).hero.label
  return (
    <section className="bg-anthracite py-10">
      <div className="max-w-4xl mx-auto px-6 md:px-12">
        <a
          href={getPathname({ locale, href: `/routes/${target}` })}
          className="border border-anthracite-light p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:border-[var(--copper)] transition-colors"
        >
          <div>
            <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{heading}</p>
            <p className="font-display font-light text-[20px] text-offwhite">{label}</p>
          </div>
          <span className="font-body font-light text-[10px] tracking-[0.2em] uppercase text-warmgrey">{cta} →</span>
        </a>
      </div>
    </section>
  )
}
