'use client'

import Script from 'next/script'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID
const CONSENT_KEY = 'prestigo_cookie_consent'

/**
 * Google Analytics 4 + Consent Mode v2.
 *
 * Implements Google's Consent Mode v2 pattern:
 *   1. gtag.js is loaded unconditionally (no consent gate).
 *   2. `gtag('consent', 'default', ...)` is set BEFORE `gtag('config', ...)` so
 *      Google knows the consent state before any event is processed.
 *   3. Analytics storage is pre-granted for returning visitors who previously
 *      accepted cookies — we read that directly from localStorage inside the
 *      inline script to avoid a React-roundtrip race.
 *   4. Ad-related consent categories stay permanently 'denied' because the
 *      cookie banner copy explicitly promises "No advertising cookies".
 *      Flipping those on would contradict the banner and break GDPR
 *      compliance — to enable personalized ads the banner copy must be
 *      updated first.
 *
 * Without Consent Mode v2, GA4 tagged every hit with `non_personalized_ads=1`
 * and treated every user as unknown consent state, which breaks attribution
 * and conversion modeling downstream in Google Ads.
 */
export default function GoogleAnalytics() {
  if (!GA_ID) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <Script id="ga-consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          var __prestigoConsent;
          try { __prestigoConsent = localStorage.getItem('${CONSENT_KEY}'); } catch (e) {}
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: __prestigoConsent === 'granted' ? 'granted' : 'denied',
            wait_for_update: 500
          });
        `}
      </Script>
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  )
}
