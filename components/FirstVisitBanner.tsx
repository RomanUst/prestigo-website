'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname, routing, type AppLocale } from '@/i18n/routing'
import { LOCALE_ENDONYMS } from '@/i18n/locales'
import { getConsent } from '@/components/CookieBanner'

/**
 * First-visit language-suggestion banner (UX-02).
 *
 * Crawler-safe by construction: the component always starts in the same
 * not-yet-decided (null) render state — the suggest/hide decision runs
 * exclusively inside a client `useEffect` after hydration, reading
 * navigator.language/navigator.languages (never headers()/cookies()), so
 * server-rendered HTML is byte-identical regardless of Accept-Language
 * (D-04). There is NO automatic URL redirect, ever (D-05) — every
 * navigation fires only from an explicit click on "Switch to {endonym}".
 *
 * Sequencing: never shows while CookieBanner's consent modal is still
 * unresolved — polls getConsent() (from components/CookieBanner.tsx) until
 * it resolves non-null, mirroring CookieBanner's own dismiss-once
 * structure without editing that file.
 */

const NEXT_LOCALE_COOKIE = 'NEXT_LOCALE'
const CONSENT_POLL_INTERVAL_MS = 300

function hasNextLocaleCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(`${NEXT_LOCALE_COOKIE}=`))
}

/** Base subtag before any hyphen, lowercased — zh-Hans/zh-CN/en-US -> zh/zh/en. */
function baseSubtag(tag: string | undefined | null): string {
  if (!tag) return ''
  return tag.split('-')[0]?.toLowerCase() ?? ''
}

/**
 * Deterministic, top-preference-only match: only navigator.languages[0]
 * (falling back to navigator.language, then to no suggestion at all) is
 * ever considered — never a scan through the whole preference list for
 * any acceptable entry further down.
 */
function detectSuggestedLocale(currentLocale: string): AppLocale | null {
  let top: string | undefined
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      top = navigator.languages[0]
    } else if (navigator.language) {
      top = navigator.language
    }
  }

  const base = baseSubtag(top)
  if (!base || base === currentLocale) return null
  if (!(routing.locales as readonly string[]).includes(base)) return null
  return base as AppLocale
}

export default function FirstVisitBanner() {
  const currentLocale = useLocale() as AppLocale
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('Common.firstVisitBanner')

  const [suggestedLocale, setSuggestedLocale] = useState<AppLocale | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    function evaluate() {
      if (cancelled) return
      if (hasNextLocaleCookie()) {
        setVisible(false)
        return
      }
      const suggestion = detectSuggestedLocale(currentLocale)
      if (suggestion) {
        setSuggestedLocale(suggestion)
        setVisible(true)
      } else {
        setVisible(false)
      }
    }

    function tryResolveConsent(): boolean {
      if (!getConsent()) return false
      evaluate()
      return true
    }

    if (!tryResolveConsent()) {
      intervalId = setInterval(() => {
        if (tryResolveConsent() && intervalId) {
          clearInterval(intervalId)
        }
      }, CONSENT_POLL_INTERVAL_MS)
    }

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [currentLocale])

  if (!visible || !suggestedLocale) return null

  const suggestedEndonym = LOCALE_ENDONYMS[suggestedLocale] ?? suggestedLocale
  const currentEndonym = LOCALE_ENDONYMS[currentLocale] ?? currentLocale

  function handleSwitch() {
    router.replace(pathname, { locale: suggestedLocale as AppLocale })
  }

  function handleStay() {
    document.cookie = `${NEXT_LOCALE_COOKIE}=${currentLocale}; path=/; sameSite=lax; max-age=31536000`
    setVisible(false)
  }

  return (
    <div
      className="fixed inset-inline-0 bottom-0 z-40 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6"
      style={{
        backgroundColor: 'var(--anthracite-mid)',
        borderTop: '1px solid var(--anthracite-light)',
      }}
    >
      <p className="font-body font-light text-[12px] leading-relaxed text-offwhite">
        {t('suggestion', { endonym: suggestedEndonym })}
      </p>
      <div className="flex flex-shrink-0 gap-3">
        <button
          type="button"
          onClick={handleSwitch}
          className="btn-primary"
          style={{ padding: '10px 20px', fontSize: '10px' }}
        >
          {t('switchTo', { endonym: suggestedEndonym })}
        </button>
        <button
          type="button"
          onClick={handleStay}
          className="font-body font-light text-[10px] tracking-[0.15em] uppercase text-warmgrey transition-colors hover:text-offwhite hover:underline underline-offset-2"
        >
          {t('stayIn', { endonym: currentEndonym })}
        </button>
      </div>
    </div>
  )
}
