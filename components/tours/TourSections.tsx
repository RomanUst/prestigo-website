// Phase 93 (plan 93-11; TRIP-02; UI-SPEC 1.5): the content sections of a tour page, in the contract order:
// Highlights, About this trip, Itinerary, What's included / Not included, Pickup, Important information,
// Cancellation, Questions and answers (+ the one-way transfer link when a route page exists).
// All tour text is rendered as React text; paragraph fields keep their blank-line breaks as separate <p>.
// No tour field is ever injected as raw HTML.

import type { ReactNode } from 'react'
import { Check, MapPin, X } from 'lucide-react'
import { localizedHref } from '@/lib/localized-href'
import { customTourHref } from '@/lib/tours/custom-tour-link'
import type { TourPageData } from '@/lib/tours/store'
import TourFaq from '@/components/tours/TourFaq'
import TourReadMore from '@/components/tours/TourReadMore'
import { splitHref, splitParagraphs, type TourT } from '@/components/tours/tour-t'

/** Descriptions longer than this are clamped below 640px (about six lines of a 360px column). */
const READ_MORE_MIN_CHARS = 300

const LINK_CLASS = 'text-offwhite underline decoration-copper underline-offset-4 hover:text-copper-light'

function localizedWithQuery(locale: string, href: string): string {
  const { path, query } = splitHref(href)
  return `${localizedHref(locale, path) ?? path}${query}`
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const headingId = `tour-${id}-heading`
  return (
    <section id={`tour-${id}`} aria-labelledby={headingId} className="border-t border-anthracite-light py-8">
      <h2 id={headingId} className="mb-4 font-display text-[24px] font-normal leading-[1.25] text-offwhite">
        {title}
      </h2>
      {children}
    </section>
  )
}

const BODY = 'font-body text-[14px] font-light leading-[1.75] text-warmgrey max-w-[640px]'

export default function TourSections({
  data,
  locale,
  t,
  oneWayRoute,
}: {
  data: TourPageData
  locale: string
  t: TourT
  oneWayRoute: { href: string; destination: string } | null
}) {
  const { tour, translation, settings } = data
  const description = splitParagraphs(translation.description)
  const pickup = splitParagraphs(translation.pickup_info)
  const important = splitParagraphs(translation.important_info)
  const descriptionLength = description.join('').length
  const customHref = localizedWithQuery(locale, customTourHref({ tour: tour.slug }))
  const termsHref = localizedHref(locale, '/terms') ?? '/terms'

  return (
    <div data-testid="tour-sections">
      {translation.highlights.length > 0 && (
        <Section id="highlights" title={t('sections.highlights')}>
          <ul className="flex flex-col gap-2">
            {translation.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check size={16} aria-hidden="true" className="mt-1 shrink-0 text-copper-light" />
                <span className="font-body text-[14px] font-light leading-[1.75] text-offwhite">{h}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {description.length > 0 && (
        <Section id="about" title={t('sections.about')}>
          <TourReadMore
            long={descriptionLength > READ_MORE_MIN_CHARS}
            readMore={t('page.readMore')}
            showLess={t('page.showLess')}
          >
            {description.map((p, i) => (
              <p key={i} className={BODY}>
                {p}
              </p>
            ))}
          </TourReadMore>
        </Section>
      )}

      {translation.itinerary.length > 0 && (
        <Section id="itinerary" title={t('sections.itinerary')}>
          <ol className="ms-1 border-s border-anthracite-light" data-testid="tour-itinerary">
            {translation.itinerary.map((step, i) => (
              <li key={i} className="relative ps-6 pb-6 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute -start-[4.5px] top-[7px] block size-2 rounded-full bg-copper"
                />
                <p className="font-body text-[14px] font-normal leading-[1.5] text-offwhite">{step.title}</p>
                {splitParagraphs(step.body).map((p, j) => (
                  <p key={j} className={`${BODY} mt-1`}>
                    {p}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(translation.includes.length > 0 || translation.excludes.length > 0) && (
        <section
          id="tour-included"
          aria-labelledby="tour-included-heading"
          className="border-t border-anthracite-light py-8"
        >
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <h3 id="tour-included-heading" className="label mb-4">
                {t('sections.included')}
              </h3>
              <ul className="flex flex-col gap-2">
                {translation.includes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check size={16} aria-hidden="true" className="mt-1 shrink-0 text-copper-light" />
                    <span className="font-body text-[14px] font-light leading-[1.75] text-offwhite">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="label mb-4">{t('sections.notIncluded')}</h3>
              <ul className="flex flex-col gap-2">
                {translation.excludes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <X size={16} aria-hidden="true" className="mt-1 shrink-0 text-warmgrey" />
                    <span className="font-body text-[14px] font-light leading-[1.75] text-offwhite">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <Section id="pickup" title={t('sections.pickup')}>
        <div className="flex items-start gap-3">
          <MapPin size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-copper-light" />
          <div className="flex flex-col gap-3">
            {pickup.map((p, i) => (
              <p key={i} className={BODY}>
                {p}
              </p>
            ))}
            <p className={BODY} data-testid="tour-pickup-fixed">
              {t.rich('page.pickupFixed', {
                link: (chunks) => (
                  <a href={customHref} className={LINK_CLASS}>
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
        </div>
      </Section>

      <Section id="important" title={t('sections.important')}>
        {important.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {important.map((p, i) => (
              <li key={i} className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-[10px] block size-1 shrink-0 rounded-full bg-copper" />
                <span className={BODY}>{p}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={BODY} data-testid="tour-important-fixed">
          {t('page.importantFixed')}
        </p>
      </Section>

      <Section id="cancellation" title={t('sections.cancellation')}>
        <div className="flex flex-col gap-3" data-testid="tour-cancellation">
          <p className={BODY}>{t('page.cancelFree', { hours: settings.free_cancel_hours })}</p>
          <p className={BODY}>{t('page.cancelAfter')}</p>
          <p className={BODY}>{t('page.cancelOverrun')}</p>
          <p>
            <a href={termsHref} target="_blank" rel="noopener noreferrer" className={`${LINK_CLASS} font-body text-[14px] font-light`}>
              {t('page.cancelTermsLink')}
            </a>
          </p>
        </div>
      </Section>

      {translation.faq.length > 0 && (
        <Section id="faq" title={t('sections.faq')}>
          <TourFaq items={translation.faq.map((f) => ({ q: f.q, a: f.a }))} />
        </Section>
      )}

      {oneWayRoute && (
        <div className="border-t border-anthracite-light py-8" data-testid="tour-oneway">
          <p className={BODY}>
            {t.rich('page.oneWayLink', {
              destination: oneWayRoute.destination,
              link: (chunks) => (
                <a href={oneWayRoute.href} className={LINK_CLASS}>
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      )}
    </div>
  )
}
