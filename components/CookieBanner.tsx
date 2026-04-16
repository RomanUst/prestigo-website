'use client'

import { useState, useEffect } from 'react'

const CONSENT_KEY = 'prestigo_cookie_consent'

export type ConsentValue = 'granted' | 'denied' | 'necessary'

export function getConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CONSENT_KEY) as ConsentValue | null
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!getConsent()) setVisible(true)
  }, [])

  function handleAccept() {
    localStorage.setItem(CONSENT_KEY, 'granted')
    setVisible(false)
    if (typeof window !== 'undefined') {
      const w = window as typeof window & {
        dataLayer?: unknown[]
        gtag?: (...args: unknown[]) => void
      }
      // Consent Mode v2 — flip analytics_storage to granted in-place so
      // gtag.js retroactively unlocks analytics cookies without a page reload.
      if (typeof w.gtag === 'function') {
        w.gtag('consent', 'update', { analytics_storage: 'granted' })
      } else {
        w.dataLayer = w.dataLayer || []
        w.dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }])
      }
      // Notify MetaPixel component to initialise
      window.dispatchEvent(new Event('prestigo:consent-granted'))
    }
  }

  function handleNecessary() {
    localStorage.setItem(CONSENT_KEY, 'necessary')
    setVisible(false)
    // analytics_storage stays 'denied' — cookieless modeled measurement.
    // No gtag update needed; default is already 'denied'.
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-[300] border-t border-anthracite-light bg-anthracite-mid/95 backdrop-blur-md"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-3 sm:py-5 flex items-center justify-between gap-3 sm:gap-4">
        {/* Mobile: only Privacy Policy link. Desktop: full description. */}
        <p className="font-body font-light text-[11px] sm:text-[12px] text-warmgrey leading-relaxed min-w-0">
          <span className="hidden sm:inline">
            We use cookies for analytics (Google Analytics) and advertising (Meta Pixel) to improve our service and show relevant ads.{' '}
          </span>
          <a
            href="/privacy"
            className="text-offwhite hover:text-copper transition-colors"
          >
            Privacy&nbsp;Policy
          </a>
        </p>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <button
            onClick={handleNecessary}
            className="font-body font-light text-[10px] tracking-[0.15em] uppercase px-3 sm:px-5 py-2 sm:py-2.5 border border-anthracite-light text-warmgrey hover:text-offwhite hover:border-offwhite/30 transition-colors whitespace-nowrap"
          >
            {/* Shorter label on mobile to keep banner single-line */}
            <span className="sm:hidden">Decline</span>
            <span className="hidden sm:inline">Necessary only</span>
          </button>
          <button
            onClick={handleAccept}
            className="btn-primary text-[10px] px-3 sm:px-5 py-2 sm:py-2.5 whitespace-nowrap"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}
