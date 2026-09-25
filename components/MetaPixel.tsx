'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { locales, siteLocaleFromPathname } from '@/i18n/locales'

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
// Static locale allow-list serialized into the inline init script below
// (T-75-12 pattern, mirrors GoogleAnalytics.tsx) — only this constant
// literal is interpolated, no request-derived value.
const LOCALES_JSON = JSON.stringify(locales)
// Legacy single-enum key is still mirrored by CookieBanner for backwards compat.
const LEGACY_CONSENT_KEY = 'prestigo_cookie_consent'
// New per-category key. Marketing === true required to load the pixel.
const CONSENT_V2_KEY = 'prestigo_consent_v2'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

/**
 * Fire a Meta Pixel event from any client component.
 * Pass eventId to enable server-side deduplication via CAPI.
 *
 * Example:
 *   trackMetaEvent('InitiateCheckout')
 *   trackMetaEvent('Purchase', { value: 120, currency: 'EUR' }, bookingRef)
 */
export function trackMetaEvent(
  eventName: string,
  params?: Record<string, unknown>,
  eventId?: string,
) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  // D-12: every Pixel event carries site_locale, derived from the pathname
  // (same helper GA4 uses) — unless the caller already supplied one, which
  // is never overwritten.
  const site_locale =
    params && 'site_locale' in params
      ? params.site_locale
      : siteLocaleFromPathname(window.location.pathname)
  const finalParams = { ...(params ?? {}), site_locale }
  if (eventId) {
    window.fbq('track', eventName, finalParams, { eventID: eventId })
  } else {
    window.fbq('track', eventName, finalParams)
  }
}

/**
 * Meta Pixel — consent-gated.
 *
 * Renders nothing until the user clicks "Accept all" in CookieBanner.
 * On consent: loads fbevents.js and fires the first PageView.
 * On soft navigation: fires additional PageViews via usePathname.
 *
 * Server-side deduplication: pair trackMetaEvent('Purchase', ..., eventId)
 * with a POST to /api/meta-capi using the same eventId.
 */
export default function MetaPixel() {
  const [consented, setConsented] = useState(false)
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  // Check stored consent on mount + listen for live grant.
  // Prefer the per-category v2 key (marketing flag), fall back to legacy enum.
  useEffect(() => {
    try {
      const v2 = localStorage.getItem(CONSENT_V2_KEY)
      if (v2) {
        const parsed = JSON.parse(v2) as { marketing?: boolean }
        if (parsed?.marketing) setConsented(true)
      } else if (localStorage.getItem(LEGACY_CONSENT_KEY) === 'granted') {
        setConsented(true)
      }
    } catch {}

    const handler = () => setConsented(true)
    window.addEventListener('prestigo:consent-granted', handler)
    return () => window.removeEventListener('prestigo:consent-granted', handler)
  }, [])

  // Fire PageView on soft navigation (skip first render — Script already fires it)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (!consented || typeof window.fbq !== 'function') return
    window.fbq('track', 'PageView', { site_locale: siteLocaleFromPathname(pathname) })
  }, [pathname, consented])

  if (!PIXEL_ID || !consented) return null

  return (
    <Script
      id="meta-pixel"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{
        __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');var __locs=${LOCALES_JSON};var __seg=window.location.pathname.split('/').filter(Boolean)[0];var __siteLocale=(__seg&&__locs.indexOf(__seg)!==-1)?__seg:'en';fbq('track','PageView',{site_locale:__siteLocale});`,
      }}
    />
  )
}
