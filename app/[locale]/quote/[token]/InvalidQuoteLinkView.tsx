import { getTranslations } from 'next-intl/server'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'
import type { AppLocale } from '@/i18n/locales'
import ManageHeader from '../../manage/[token]/ManageHeader'
import { MANAGE_CONTACT_EMAIL } from '../../manage/[token]/InvalidManageLinkView'

/** The one public contact mailbox, as on the manage page and in the emails. */
export const QUOTE_CONTACT_EMAIL = MANAGE_CONTACT_EMAIL

// ONE view for EVERY invalid reason (malformed, unknown, revoked, superseded, draft, voided, cancelled, expired,
// past the first pickup, rate limited, read problem). It takes the locale and nothing else: no reason, no amount, no
// name, no address, so the markup is identical for all of them and the link is no oracle (T-92-30; same pattern as
// InvalidManageLinkView).
export default async function InvalidQuoteLinkView({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Quote' })
  return (
    <>
      <ManageHeader locale={locale} homeLabel="Prestigo" />
      <main
        id="main-content"
        data-testid="quote-invalid"
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
          {t('invalid.title')}
        </h1>
        <p style={{ margin: '16px 0 32px', fontSize: 14, fontWeight: 300, lineHeight: 1.6, color: 'var(--warmgrey)' }}>
          {t('invalid.body')}
        </p>
        <span className="label" style={{ display: 'block', marginBottom: 12 }}>
          {t('contact.heading')}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a href={`mailto:${QUOTE_CONTACT_EMAIL}`} className="btn-secondary" style={{ width: '100%', boxSizing: 'border-box' }}>
            {t('contact.email')}
          </a>
          <a href={BUSINESS_TEL_URL} className="btn-secondary" style={{ width: '100%', boxSizing: 'border-box', gap: 8 }}>
            <span>{t('contact.call')}</span>
            <bdi dir="ltr" style={{ letterSpacing: 'normal' }}>
              {BUSINESS_PHONE_DISPLAY}
            </bdi>
          </a>
        </div>
      </main>
    </>
  )
}
