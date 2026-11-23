// /[locale]/book/custom-tour: the custom-tour request page (Phase 93, plan 93-34; TRIP-06; D-16, D-17; UI-SPEC
// Surface 6). Dynamic (it reads the query string) and noindex. Public page: it reads params.locale and calls
// setRequestLocale, never the bare request-locale reader. The query (?tour, ?date, ?pax) is untrusted prefill:
// parseCustomTourQuery validates every value, the chip shows only for a published tour that is complete in this
// locale, and the server validates the whole request again (93-32).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import CustomTourForm from '@/components/tours/CustomTourForm'
import { locales, type AppLocale } from '@/i18n/locales'
import { getPragueTodayISO } from '@/lib/prague-date'
import { parseCustomTourQuery } from '@/lib/tours/custom-tour-link'
import { getPublishedTourForLocale } from '@/lib/tours/store'

export const dynamic = 'force-dynamic'

type Params = Promise<{ locale: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function isAppLocale(locale: string): locale is AppLocale {
  return (locales as readonly string[]).includes(locale)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return { robots: { index: false, follow: false } }
  const t = await getTranslations({ locale, namespace: 'Tours.request' })
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: false },
  }
}

export default async function CustomTourPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { locale } = await params
  setRequestLocale(locale)
  if (!isAppLocale(locale)) notFound()

  const t = await getTranslations({ locale, namespace: 'Tours.request' })
  const query = parseCustomTourQuery(await searchParams, getPragueTodayISO())

  // The starting tour: published and complete in this locale, else no chip (a failing store reads as no tour).
  let tour: { slug: string; title: string } | null = null
  if (query.tour) {
    try {
      const result = await getPublishedTourForLocale(query.tour, locale)
      if (result.status === 'ok') tour = { slug: result.data.tour.slug, title: result.data.translation.title }
    } catch {
      tour = null
    }
  }

  return (
    <>
      <Nav />
      <main id="main-content" className="mx-auto w-full max-w-[640px] px-6 pb-16 pt-24">
        <p className="label mb-3">{t('label')}</p>
        <h1 className="display mb-4 text-[length:clamp(28px,7vw,40px)] leading-[1.1]">{t('title')}</h1>
        <p className="mb-8 text-[14px] font-light leading-[1.75] text-warmgrey">{t('intro')}</p>
        <CustomTourForm tour={tour} initialDate={query.date} initialPax={query.pax} />
      </main>
      <Footer />
    </>
  )
}
