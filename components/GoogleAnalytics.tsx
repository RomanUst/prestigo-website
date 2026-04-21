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
export default function GoogleAnalytics({ nonce }: { nonce?: string }) {
  if (!GA_ID) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
      {/*
        Consent Mode v2 with wait_for_update:2500.

        GA4 waits 2.5 s before processing the first pageview, giving new
        visitors enough time to interact with the cookie banner. Returning
        visitors already have analytics_storage:'granted' in localStorage so
        their pageview fires immediately with full cookie attribution.

        Data from Apr 13–14 confirms this approach produces realistic
        bounce rates (~30%). The more complex consent-first / visibilitychange
        pattern was reverted: it introduced mobile double-counting (switching
        apps triggers visibilitychange:hidden before the user accepts consent)
        and 0 engaged sessions on deploy days due to mid-session JS reloads.
      */}
      <Script id="ga-consent-default" strategy="afterInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'granted',
            wait_for_update: 20000
          });
        `}
      </Script>
      <Script id="ga-init" strategy="afterInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          // Skip tracking on admin pages to keep GA4 data clean.
          // send_page_view: false — AnalyticsPageView fires page_view on every
          // client-side route change (including the initial load) so we don't
          // double-count.
          if (!window.location.pathname.startsWith('/admin')) {
            gtag('config', '${GA_ID}', { send_page_view: false });
          }
        `}
      </Script>
    </>
  )
}
