'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const CONSENT_KEY = 'prestigo_cookie_consent'

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
  if (eventId) {
    window.fbq('track', eventName, params ?? {}, { eventID: eventId })
  } else {
    window.fbq('track', eventName, params ?? {})
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

  // Check stored consent on mount + listen for live grant
  useEffect(() => {
    try {
      if (localStorage.getItem(CONSENT_KEY) === 'granted') setConsented(true)
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
    window.fbq('track', 'PageView')
  }, [pathname, consented])

  if (!PIXEL_ID || !consented) return null

  return (
    <Script
      id="meta-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`,
      }}
    />
  )
}
