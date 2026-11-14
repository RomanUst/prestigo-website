import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { normalizeSiteLocale } from '@/i18n/locales'
import ManageHeader from '../../manage/[token]/ManageHeader'

// Where Stripe sends the client after a 3-D Secure redirect (Phase 92, plan 92-17; QUOTE-03; T-92-54).
//
// The return URL of the deposit payment is /<locale>/quote/done: it carries NO quote token, because it travels to Stripe
// and the bank. Stripe appends its own query (payment_intent, payment_intent_client_secret, redirect_status); this page
// never reads or echoes any of it. It reads nothing from the database and takes no action: the bookings are created by
// the payment webhook, and the client opens the quote link from the email to see them.
//
// Localized route with params.locale + setRequestLocale (never the request-scoped getLocale helper). No data, so static
// rendering is fine. noindex and no-referrer like the quote page; the path is private (lib/private-link-path), so no
// analytics, banner or chat run here.

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale = normalizeSiteLocale(rawLocale)
  const t = await getTranslations({ locale, namespace: 'Quote.meta' })
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function QuoteDonePage({ params }: PageProps) {
  const { locale: rawLocale } = await params
  const locale = normalizeSiteLocale(rawLocale)
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Quote.done' })

  return (
    <>
      <ManageHeader locale={locale} homeLabel="Prestigo" />
      <main
        id="main-content"
        data-testid="quote-done"
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 560,
          margin: '0 auto',
          padding: '32px 24px 64px',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.2,
            color: 'var(--offwhite)',
            margin: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {t('title')}
        </h1>
        <p style={{ margin: '16px 0 0', fontSize: 14, fontWeight: 300, lineHeight: 1.6, color: 'var(--warmgrey)' }}>
          {t('body')}
        </p>
      </main>
    </>
  )
}
