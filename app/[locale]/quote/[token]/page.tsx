import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { resolveQuoteToken, type ResolvedQuote } from '@/lib/quotes/resolve'
import { renderQuoteTerms } from '@/lib/quotes/consent'
import { buildQuoteView, type QuoteView } from '@/lib/quotes/view'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { formatMinor } from '@/lib/payments/money'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { VEHICLE_CLASS_KEY } from '@/types/booking'
import { getPathname } from '@/i18n/routing'
import { normalizeSiteLocale, type AppLocale } from '@/i18n/locales'
import ManageHeader from '../../manage/[token]/ManageHeader'
import InvalidQuoteLinkView, { QUOTE_CONTACT_EMAIL } from './InvalidQuoteLinkView'
import QuoteViewedPing from './QuoteViewedPing'
import QuoteAcceptPay, { type QuoteAcceptPayCopy } from './QuoteAcceptPay'

// The client's quote page (Phase 92, plan 92-09; QUOTE-02, QUOTE-06; D-02, D-05, D-09, D-10; T-92-29..T-92-32).
//
// - Localized route (not under (internal)), so ar, hi, zh and zh-hant keep their fonts and dir from the locale layout.
// - Dynamic rendering (the export below): the quote is read per request with the service client created inside the
//   request, never at build time and never at module load. The locale comes from params.locale + setRequestLocale,
//   never from the request-scoped getLocale helper (it reads headers and makes every locale render per request).
// - GET changes nothing. Mail scanners prefetch links, so "viewed" is a separate POST sent by QuoteViewedPing.
// - The token is resolved FIRST (resolveQuoteToken); every failure, in any step, renders the one invalid view, which
//   knows only the locale. A rate-limit denial renders the same view.
// - D-09: the page renders in the quote's language; a request on another locale prefix redirects to the quote's prefix.
// - The page receives the client-safe QuoteView only: first name, one price per trip, no waiting amount, no ids.
// - Plan 92-17 adds the accept area (QuoteAcceptPay) under the terms for a quote that is not paid yet: the consent and
//   terms text is rendered HERE, on the server (renderQuoteTerms, the same text the accept route stores and hashes), and
//   handed to the island with the ready button label; a failed render shows no accept area (fail closed). A paid quote
//   shows the booking references instead. The PDF button and the remainder payment area are added by plan 92-27.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ locale: string; token: string }>
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

const cardStyle = {
  boxSizing: 'border-box',
  backgroundColor: 'var(--anthracite-mid)',
  padding: 24,
} as const

const sectionStyle = {
  ...cardStyle,
  border: '1px solid var(--anthracite-light)',
  borderInlineStart: '3px solid var(--copper)',
  borderRadius: 4,
  marginTop: 24,
} as const

const headingStyle = {
  fontFamily: 'var(--font-cormorant)',
  fontSize: 20,
  fontWeight: 400,
  lineHeight: 1.3,
  color: 'var(--offwhite)',
  margin: 0,
  overflowWrap: 'anywhere',
} as const

const bodyStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.6,
  color: 'var(--offwhite)',
  overflowWrap: 'anywhere',
} as const

const mutedStyle = { ...bodyStyle, color: 'var(--warmgrey)' } as const

// The catalog placeholders are plain, so dates, times and references are isolated left-to-right with Unicode isolates
// (the text equivalent of <bdi dir="ltr">); digits and percents are weakly directional and need none.
const ltr = (value: string | number): string => `\u2066${value}\u2069`

function DetailRow({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div>
      <span className="label" style={{ display: 'block' }}>
        {label}
      </span>
      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: strong ? 400 : 300,
          lineHeight: 1.5,
          color: 'var(--offwhite)',
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SummaryRow({ label, amount, strong, testId }: { label: string; amount: string; strong?: boolean; testId: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
        fontSize: strong ? 18 : 14,
        fontWeight: strong ? 400 : 300,
        color: 'var(--offwhite)',
      }}
    >
      <span>{label}</span>
      <bdi dir="ltr" data-testid={testId} style={{ whiteSpace: 'nowrap' }}>
        {amount}
      </bdi>
    </div>
  )
}

/** The quote, rendered. An async function (called by the page), so a test can await the element. */
async function QuoteOfferView({
  view,
  locale,
  token,
  consentText,
}: {
  view: QuoteView
  locale: AppLocale
  token: string
  consentText: string | null
}) {
  const t = await getTranslations({ locale, namespace: 'Quote' })
  const ta = await getTranslations({ locale, namespace: 'Quote.accept' })
  const vt = await getTranslations({ locale, namespace: 'Booking.vehicleClasses' })

  const money = (minor: number) => formatMinor(minor, view.currency)

  const terms = view.terms
  const freeUntil = terms.freeUntilMs !== null ? formatLocaleDateTime(terms.freeUntilMs, locale) : ''
  const showFree = !terms.freePassed && freeUntil !== ''

  // Ready strings for the accept island (it translates nothing). The amount in the label is isolated left-to-right.
  const acceptCopy: QuoteAcceptPayCopy = {
    heading: ta('heading'),
    button: ta('button', { amount: ltr(money(view.depositMinor)) }),
    consentRequired: ta('consentRequired'),
    processing: ta('processing'),
    confirming: ta('confirming'),
    declined: ta('declined'),
    error: ta('error'),
    changed: ta('changed'),
    unavailable: ta('unavailable'),
  }

  return (
    <>
      <ManageHeader locale={locale} homeLabel="Prestigo" />
      <main
        id="main-content"
        data-testid="quote-page"
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 640,
          margin: '0 auto',
          padding: '32px 24px 64px',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        <span className="label" style={{ display: 'block' }}>
          {t('eyebrow')}
        </span>
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.2,
            color: 'var(--offwhite)',
            margin: '8px 0 0',
            overflowWrap: 'anywhere',
          }}
        >
          {t('title', { reference: ltr(view.reference) })}
        </h1>
        <p style={{ ...mutedStyle, marginTop: 8 }}>
          {t('version', { number: view.versionNo })}
          {' · '}
          {t('preparedFor', { name: view.clientFirstName })}
        </p>

        <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 0', fontSize: 14, fontWeight: 400, color: 'var(--offwhite)' }}>
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              flex: 'none',
              backgroundColor: view.state === 'paid' ? 'var(--warmgrey)' : 'var(--copper-light)',
            }}
          />
          <span>{t(`status.${view.state}`)}</span>
        </p>

        {view.state === 'paid' ? (
          <section data-testid="quote-paid" style={sectionStyle}>
            <h2 style={headingStyle}>{t('paid.heading')}</h2>
            <p style={{ ...bodyStyle, marginTop: 12 }}>{t('paid.body')}</p>
            <ul style={{ ...bodyStyle, margin: '8px 0 0', paddingInlineStart: 20 }}>
              {view.bookingReferences.map((reference) => (
                <li key={reference}>{t('paid.booking', { reference: ltr(reference) })}</li>
              ))}
            </ul>
          </section>
        ) : (
          <p style={{ ...bodyStyle, marginTop: 16 }}>{t('intro')}</p>
        )}

        {view.expiresAt ? (
          <p style={{ ...mutedStyle, marginTop: 8 }}>
            {t('validUntil', { date: ltr(formatLocaleDateTime(Date.parse(view.expiresAt), locale)) })}
          </p>
        ) : null}
        <p style={{ ...mutedStyle, marginTop: 8, fontSize: 12 }}>{t('pragueTime')}</p>

        <section data-testid="quote-lines" aria-labelledby="quote-lines-heading" style={{ marginTop: 32 }}>
          <h2 id="quote-lines-heading" style={headingStyle}>
            {t('lines.heading')}
          </h2>
          <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {view.lines.map((line) => {
              const classKey = VEHICLE_CLASS_KEY[line.vehicleClass]
              return (
                <li
                  key={line.position}
                  data-testid="quote-line"
                  style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}
                >
                  <h3 style={{ ...headingStyle, fontSize: 16 }}>
                    {t('lines.trip', { number: line.position })}
                    {' · '}
                    {t(`lines.tripType.${line.tripType}`)}
                  </h3>
                  <DetailRow label={t('lines.date')} strong>
                    <bdi dir="ltr">{formatLocaleDate(line.pickupDate, locale)}</bdi>
                  </DetailRow>
                  <DetailRow label={t('lines.pickupTime')} strong>
                    <bdi dir="ltr">{line.pickupTime}</bdi>
                    {line.landingTime ? (
                      <div style={{ fontSize: 12, fontWeight: 300, color: 'var(--warmgrey)' }}>
                        {t('lines.landing', { time: ltr(line.landingTime) })}
                      </div>
                    ) : null}
                    {line.hours !== null ? (
                      <div style={{ fontSize: 12, fontWeight: 300, color: 'var(--warmgrey)' }}>
                        {t('lines.duration', { hours: line.hours })}
                      </div>
                    ) : null}
                  </DetailRow>
                  <DetailRow label={t('lines.from')}>
                    <bdi dir="auto">{line.origin}</bdi>
                  </DetailRow>
                  {line.stops.length > 0 ? (
                    <DetailRow label={t('lines.stops')}>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {line.stops.map((stop, i) => (
                          <li key={i}>
                            <bdi dir="auto">{stop.address}</bdi>
                            {stop.waitMinutes > 0 ? (
                              <span style={{ color: 'var(--warmgrey)' }}>
                                {' · '}
                                {t('lines.stopWait', { minutes: stop.waitMinutes })}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </DetailRow>
                  ) : null}
                  {line.destination ? (
                    <DetailRow label={t('lines.to')}>
                      <bdi dir="auto">{line.destination}</bdi>
                    </DetailRow>
                  ) : null}
                  <DetailRow label={t('lines.vehicle')}>{vt(`${classKey}.label`)}</DetailRow>
                  <DetailRow label={t('lines.passengers')}>
                    <bdi dir="ltr">{line.passengers}</bdi>
                  </DetailRow>
                  {line.luggage > 0 ? (
                    <DetailRow label={t('lines.luggage')}>
                      <bdi dir="ltr">{line.luggage}</bdi>
                    </DetailRow>
                  ) : null}
                  <DetailRow label={t('lines.price')} strong>
                    <bdi dir="ltr" data-testid="quote-line-price">
                      {money(line.totalMinor)}
                    </bdi>
                  </DetailRow>
                </li>
              )
            })}
          </ol>
        </section>

        <section data-testid="quote-summary" aria-labelledby="quote-summary-heading" style={sectionStyle}>
          <h2 id="quote-summary-heading" style={headingStyle}>
            {t('summary.heading')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <SummaryRow label={t('summary.total')} amount={money(view.totalMinor)} strong testId="quote-total" />
            <SummaryRow label={t('summary.deposit')} amount={money(view.depositMinor)} testId="quote-deposit" />
            <SummaryRow label={t('summary.remainder')} amount={money(view.remainderMinor)} testId="quote-remainder" />
          </div>
          <p data-testid="quote-remainder-method" style={{ ...bodyStyle, marginTop: 16 }}>
            {t(`remainder.${view.remainderMethod}`)}
          </p>
        </section>

        <section data-testid="quote-terms" aria-labelledby="quote-terms-heading" style={sectionStyle}>
          <h2 id="quote-terms-heading" style={headingStyle}>
            {t('terms.heading')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <p style={bodyStyle}>{showFree ? t('terms.free', { freeUntil: ltr(freeUntil) }) : t('terms.noFree')}</p>
            <p style={bodyStyle}>
              {terms.feePercent >= 100
                ? t('terms.lateAll')
                : t('terms.latePercent', { percent: terms.feePercent })}
            </p>
            <p style={bodyStyle}>{t('terms.cap')}</p>
            <p style={bodyStyle}>{t('terms.howToCancel')}</p>
          </div>
        </section>

        {view.state !== 'paid' && consentText !== null ? (
          <QuoteAcceptPay
            token={token}
            locale={locale}
            versionNo={view.versionNo}
            depositMinor={view.depositMinor}
            currency={view.currency}
            consentText={consentText}
            copy={acceptCopy}
          />
        ) : null}

        <section
          aria-labelledby="quote-contact-label"
          style={{ marginTop: 40, fontSize: 14, fontWeight: 300, lineHeight: 1.6, color: 'var(--warmgrey)' }}
        >
          <span id="quote-contact-label" className="label" style={{ display: 'block' }}>
            {t('contact.heading')}
          </span>
          <p style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }}>
            <a href={`mailto:${QUOTE_CONTACT_EMAIL}`} style={{ color: 'var(--copper-light)', textDecoration: 'underline' }}>
              <bdi dir="ltr">{QUOTE_CONTACT_EMAIL}</bdi>
            </a>
            <a href={BUSINESS_TEL_URL} style={{ color: 'var(--copper-light)', textDecoration: 'underline' }}>
              <bdi dir="ltr">{BUSINESS_PHONE_DISPLAY}</bdi>
            </a>
          </p>
        </section>

        <QuoteViewedPing token={token} />
      </main>
    </>
  )
}

/** The consent and terms text of the accept area, or null when there is nothing to accept (paid) or it cannot be built. */
async function acceptanceText(resolved: ResolvedQuote, view: QuoteView, nowMs: number): Promise<string | null> {
  if (view.state === 'paid') return null
  try {
    return (await renderQuoteTerms({ resolved, nowMs })).text
  } catch {
    // Fail closed: a client is never asked to accept a text the server could not render. The quote itself still shows.
    return null
  }
}

export default async function QuotePage({ params }: PageProps) {
  const { locale: rawLocale, token } = await params
  const locale = normalizeSiteLocale(rawLocale)
  setRequestLocale(locale)

  // A lookup that throws is an invalid link, never a stack trace. Rate limit first, then token, then the quote.
  let view: QuoteView | null = null
  let consentText: string | null = null
  try {
    const h = await headers()
    const { allowed } = await checkRateLimit('/quote', getClientIp(new Request('https://localhost', { headers: h })))
    if (allowed) {
      const resolved = await resolveQuoteToken(token)
      if (resolved) {
        const nowMs = Date.now()
        view = buildQuoteView(resolved, nowMs)
        consentText = await acceptanceText(resolved, view, nowMs)
      }
    }
  } catch {
    view = null
  }

  if (!view) return InvalidQuoteLinkView({ locale })

  // D-09: the quote has one language. redirect() throws, so it stays outside the try block above.
  const quoteLocale = normalizeSiteLocale(view.locale)
  if (quoteLocale !== locale) redirect(getPathname({ locale: quoteLocale, href: `/quote/${token}` }))

  return QuoteOfferView({ view, locale, token, consentText })
}
