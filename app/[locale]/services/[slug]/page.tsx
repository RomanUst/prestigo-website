import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import LandingView from '@/components/LandingView'
import { getPageContent } from '@/lib/page-content'
import { interpolate } from '@/lib/content-interpolate'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'
import { findLandingPage, getLandingPrices, landingPagesFor, type LandingContent } from '@/lib/landing-pages'

export const revalidate = 120
// Only the configured landing slugs (lib/landing-pages.ts) are served here;
// the existing static /services/* folders take precedence over this segment.
export const dynamicParams = false

type Params = Promise<{ locale: string; slug: string }>

export function generateStaticParams(): Array<{ slug: string }> {
  return landingPagesFor('services').map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params
  const page = findLandingPage('services', slug)
  if (!page) return {}
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

export default async function LandingPage({ params }: { params: Params }) {
  const { locale, slug } = await params
  const page = findLandingPage('services', slug)
  if (!page) notFound()
  setRequestLocale(locale)
  const content = getPageContent(`services/${slug}`, locale) as LandingContent
  const prices = await getLandingPrices()
  return <LandingView page={page} content={content} locale={locale} prices={prices} />
}
