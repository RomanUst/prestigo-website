'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link, usePathname, useRouter, type AppLocale } from '@/i18n/routing'
import { LOCALE_ENDONYMS } from '@/i18n/locales'
import { detectSuggestedLocale } from '@/i18n/suggest-locale'
import { isPrivateLinkPath } from '@/lib/private-link-path'

/**
 * Granular consent bar — non-blocking, docked to the bottom of the viewport.
 *
 * The page stays usable while the bar is open (no backdrop, no scroll lock):
 * a full-screen modal on first visit was blocking the first click on route
 * and booking pages (Clarity, Nov 2026).
 *
 * Two equal-weight actions: "Accept all" (analytics + marketing) and
 *   "Accept necessary" (essential only). Refusing is as easy as accepting
 *   (GDPR); nothing optional is enabled without a click.
 *
 * Storage migration:
 *   Legacy key 'prestigo_cookie_consent' stored a single enum ('granted'|'necessary'|'denied').
 *   New key 'prestigo_consent_v2' stores per-category { analytics, marketing }.
 *   Legacy values are auto-migrated on first read so returning visitors don't
 *   see the modal again.
 *
 * Consent Mode v2 mapping:
 *   analytics  → analytics_storage
 *   marketing  → ad_storage, ad_user_data, ad_personalization
 *
 * ChatLauncher listens for 'prestigo:consent-answered' (fired on every answer)
 * to show its greeting card once the modal is gone.
 * MetaPixel listens for the 'prestigo:consent-granted' CustomEvent (fired only
 * when marketing is granted) to initialise fbevents.js in-place without reload.
 *
 * Language suggestion (UX-02): when the browser's top language is a supported
 * locale other than the page's, the modal header offers a one-click switch to
 * the same page in that locale, so the consent text itself can be read in the
 * visitor's language. The decision runs client-side after hydration only
 * (server HTML identical for every Accept-Language); it never redirects on its
 * own and is independent of the consent choice. After switching, the modal
 * re-renders on the new locale (consent still unanswered) and the row
 * disappears because the suggestion now equals the current locale.
 */

const CONSENT_KEY = 'prestigo_consent_v2'
const LEGACY_KEY = 'prestigo_cookie_consent'

export interface ConsentState {
  analytics: boolean
  marketing: boolean
}

export function getConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (stored) return JSON.parse(stored) as ConsentState

    // One-time migration from the single-enum legacy key.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy === 'granted') {
      const state: ConsentState = { analytics: true, marketing: true }
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
      return state
    }
    if (legacy === 'necessary' || legacy === 'denied') {
      const state: ConsentState = { analytics: false, marketing: false }
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
      return state
    }
    return null
  } catch {
    return null
  }
}

export default function CookieBanner() {
  const pathname = usePathname()
  // Phase 89 (D-02): no consent modal (and no locale suggestion) on private link paths (/admin,
  // /driver, /manage); the guard wraps the hook-bearing body so hook order stays stable.
  if (isPrivateLinkPath(pathname)) return null
  return <CookieBannerInner />
}

function CookieBannerInner() {
  const t = useTranslations('CookieBanner')
  const tLang = useTranslations('Common.firstVisitBanner')
  const currentLocale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [suggestedLocale, setSuggestedLocale] = useState<AppLocale | null>(null)

  useEffect(() => {
    if (!getConsent()) {
      setVisible(true)
      setSuggestedLocale(detectSuggestedLocale(currentLocale))
    }
  }, [currentLocale])

  function applyConsent(state: ConsentState) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
      // Mirror into legacy key so any downstream code still reading the old
      // single-enum format keeps working during transition.
      localStorage.setItem(
        LEGACY_KEY,
        state.analytics && state.marketing ? 'granted' : 'necessary',
      )
    } catch {
      /* storage blocked — best effort */
    }

    setVisible(false)

    if (typeof window === 'undefined') return
    const w = window as typeof window & {
      dataLayer?: unknown[]
      gtag?: (...args: unknown[]) => void
    }

    const update = {
      analytics_storage: state.analytics ? 'granted' : 'denied',
      ad_storage: state.marketing ? 'granted' : 'denied',
      ad_user_data: state.marketing ? 'granted' : 'denied',
      ad_personalization: state.marketing ? 'granted' : 'denied',
    }

    if (typeof w.gtag === 'function') {
      w.gtag('consent', 'update', update)
    } else {
      w.dataLayer = w.dataLayer || []
      w.dataLayer.push(['consent', 'update', update])
    }

    if (state.marketing) {
      window.dispatchEvent(
        new CustomEvent('prestigo:consent-granted', { detail: state }),
      )
    }

    // Fired for every answer (incl. necessary-only): the modal is gone, so
    // ChatLauncher may show its greeting card. Carries no tracking.
    window.dispatchEvent(new CustomEvent('prestigo:consent-answered'))
  }

  const handleAcceptAll = () => applyConsent({ analytics: true, marketing: true })
  const handleNecessaryOnly = () => applyConsent({ analytics: false, marketing: false })

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-[400] flex justify-center sm:justify-start sm:p-4 pointer-events-none"
    >
      {/* Bar — no backdrop: the page underneath stays clickable. */}
      <div
        className="pointer-events-auto relative w-full sm:max-w-md bg-anthracite border border-anthracite-light shadow-2xl flex flex-col max-h-[70vh] sm:max-h-[80vh] sm:rounded-sm"
        style={{ animation: 'fadeUp 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
      >
        {/* Header — wordmark + welcome copy. Mirrors the site's own brand
            presentation so the first touchpoint feels consistent. */}
        {suggestedLocale && (
          <div className="px-6 py-3 border-b border-anthracite-light flex-shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
            <p className="font-body font-light text-[12px] text-offwhite leading-relaxed">
              {tLang('suggestion', { endonym: LOCALE_ENDONYMS[suggestedLocale] })}
            </p>
            <button
              type="button"
              onClick={() => router.replace(pathname, { locale: suggestedLocale })}
              className="min-h-[44px] px-4 font-body font-light text-[10px] tracking-[0.2em] uppercase text-copper-light hover:text-offwhite underline underline-offset-4 transition-colors"
            >
              {tLang('switchTo', { endonym: LOCALE_ENDONYMS[suggestedLocale] })}
            </button>
          </div>
        )}

        <div className="px-5 pt-4 pb-3 border-b border-anthracite-light flex-shrink-0">
          <h2
            id="consent-title"
            className="font-display font-light italic text-[18px] text-offwhite leading-tight"
          >
            {t('heading')}
          </h2>
          <p className="mt-1.5 font-body font-light text-[11.5px] text-warmgrey leading-relaxed">
            {t.rich('consentBody', {
              privacy: (chunks) => (
                <Link
                  href="/privacy"
                  className="text-copper-light hover:text-copper underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
              terms: (chunks) => (
                <Link
                  href="/terms"
                  className="text-copper-light hover:text-copper underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-anthracite-light flex flex-col gap-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="btn-primary w-full text-[10px] py-3"
            >
              {t('acceptAll')}
            </button>
            <button
              type="button"
              onClick={handleNecessaryOnly}
              className="btn-primary w-full text-[10px] py-3"
            >
              {t('acceptNecessary')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
