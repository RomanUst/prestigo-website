import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getNotFoundMetadata } from '@/lib/site-metadata'

// A 404 must never be indexed. Overriding robots here replaces the site-wide
// "index, follow" default from the root layout so the page emits a single,
// unambiguous noindex directive instead of two conflicting robots tags.
//
// 75-33 (IN-05, supersedes the 75-13 D-09 static-title exception): the title,
// description and share tags are localized per request. When Next.js renders
// the not-found error shell it resolves the layout metadata plus THIS module's
// generateMetadata, called with the [locale] segment params — so the raw 404
// HTML carries the locale's absolute NotFound.metaTitle (no brand-doubling
// template) and localized og/twitter, matching the hydrated page. robots
// stays noindex/nofollow. The locale is read defensively: missing, rejected
// or unknown params fall back to EN — a throwing not-found metadata function
// would turn every 404 into a 500 (T-75-G42).
export async function generateMetadata({
  params,
}: {
  params?: Promise<{ locale?: string }>
} = {}): Promise<Metadata> {
  let locale = 'en'
  try {
    const resolved = await params
    if (typeof resolved?.locale === 'string') locale = resolved.locale
  } catch {
    // keep the EN fallback
  }
  return getNotFoundMetadata(locale)
}

export default function NotFound() {
  const t = useTranslations('NotFound')
  return (
    <main id="main-content">
      <Nav />

      <section className="bg-anthracite min-h-[70vh] flex items-center pt-16">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-24 md:py-32">
          <p className="label mb-6">{t('eyebrow')}</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[60px] max-w-xl mb-6">
            {t('headingLine1')}<br />
            <span className="display-italic">{t('headingItalic')}</span>
          </h1>
          <p className="body-text text-[13px] max-w-md mb-12" style={{ lineHeight: '1.9' }}>
            {t('body')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn-primary">{t('bookButton')}</Link>
            <Link href="/services" className="btn-ghost">{t('servicesButton')}</Link>
            <Link href="/" className="btn-ghost">{t('homeButton')}</Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
