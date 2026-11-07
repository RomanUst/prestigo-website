import { getTranslations } from 'next-intl/server'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { localizedHref } from '@/lib/localized-href'
import type { AppLocale } from '@/i18n/locales'
import ManageHeader from './ManageHeader'

/** The one public contact mailbox, as on the contact page and in the emails. */
export const MANAGE_CONTACT_EMAIL = 'info@rideprestigo.com'

// E7: ONE view for EVERY invalid reason (malformed, unknown, revoked, anonymised, partner, expired, read problem).
// It takes the locale and nothing else, no reason and no booking fact, so the markup is identical for all of them and
// the link can not be used to find out which bookings exist (T-89-11; same pattern as InvalidTripLinkView).
export default async function InvalidManageLinkView({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Manage' })
  return (
    <>
      <ManageHeader locale={locale} homeLabel={t('header.homeAriaLabel')} />
      <main
        id="main-content"
        data-testid="manage-invalid"
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a href={`mailto:${MANAGE_CONTACT_EMAIL}`} className="btn-secondary" style={{ width: '100%', boxSizing: 'border-box' }}>
            {t('emailUs')}
          </a>
          <a href={BUSINESS_TEL_URL} className="btn-secondary" style={{ width: '100%', boxSizing: 'border-box', gap: 8 }}>
            <span>{t('callUs')}</span>
            <bdi dir="ltr" style={{ letterSpacing: 'normal' }}>
              {BUSINESS_PHONE_DISPLAY}
            </bdi>
          </a>
          <a href={localizedHref(locale, '/book')} className="btn-primary" style={{ width: '100%', boxSizing: 'border-box' }}>
            {t('bookRide')}
          </a>
        </div>
      </main>
    </>
  )
}
