import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

// A 404 must never be indexed. Overriding robots here replaces the site-wide
// "index, follow" default from the root layout so the page emits a single,
// unambiguous noindex directive instead of two conflicting robots tags.
//
// D-09 allowlisted exception (75-13): this `metadata` export is a static,
// build-time constant — Next.js's not-found.tsx metadata cannot be resolved
// per-request (there is no generateMetadata()/params hook for the special
// not-found file), so the title stays the single EN string below rather than
// attempting a per-locale translation. Everything the visitor actually reads
// on the page (heading, body, buttons) is fully localized via the NotFound
// catalog namespace.
export const metadata: Metadata = {
  title: 'Page Not Found — PRESTIGO',
  robots: { index: false, follow: false },
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
