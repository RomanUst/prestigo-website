// Slim header of the private manage-booking pages (UI-SPEC Surface 1, "Chrome"): the wordmark as a link home and
// nothing else. No site navigation, no footer, so a link opened from an email shows the booking and not the website.
// Shared by the page, the invalid-link view and the route loading state, so all three look the same.

import { localizedHref } from '@/lib/localized-href'
import type { AppLocale } from '@/i18n/locales'

export default function ManageHeader({ locale, homeLabel }: { locale: AppLocale; homeLabel: string }) {
  return (
    <header
      style={{
        boxSizing: 'border-box',
        height: 64,
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <a
        href={localizedHref(locale, '/')}
        className="wordmark tracking-[0.6em] inline-flex items-center"
        aria-label={homeLabel}
        style={{ minHeight: 44 }}
      >
        <span className="wordmark-presti">PRESTI</span>
        <span className="wordmark-go">GO</span>
      </a>
    </header>
  )
}
