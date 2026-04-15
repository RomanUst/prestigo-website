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
        Consent-first page_view pattern (no arbitrary timeout):

        1. gtag('consent', 'default') is set BEFORE gtag('config') so Google
           knows the consent state before any event is processed.
        2. gtag('config') is called with send_page_view:false — GA4 does NOT
           auto-fire a page_view on load.
        3. Page_view is fired manually in two cases:
           a. Returning visitor (consent already in localStorage) — fired
              immediately at the bottom of ga-init, with consent already set.
           b. New visitor — fired by CookieBanner after the user clicks
              "Accept all" or "Necessary only", so consent is always resolved
              before the first hit is sent. No wait_for_update needed.

        This eliminates the race between page_view and consent state that
        caused 100% bounce rate for new visitors in cookieless mode.
      */}
      <Script id="ga-consent-default" strategy="afterInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          var __prestigoConsent;
          try { __prestigoConsent = localStorage.getItem('${CONSENT_KEY}'); } catch (e) {}
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: __prestigoConsent === 'granted' ? 'granted' : 'denied'
          });
        `}
      </Script>
      <Script id="ga-init" strategy="afterInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          // Skip tracking on admin pages to keep GA4 data clean.
          if (!window.location.pathname.startsWith('/admin')) {
            // send_page_view:false — page_view is fired manually below (returning
            // visitors) or by CookieBanner after consent interaction (new visitors).
            gtag('config', '${GA_ID}', { send_page_view: false });
            // Returning visitor: consent already resolved in localStorage —
            // fire page_view immediately with the correct consent state.
            var __c;
            try { __c = localStorage.getItem('${CONSENT_KEY}'); } catch(e) {}
            if (__c === 'granted' || __c === 'necessary') {
              gtag('event', 'page_view');
            }
          }
        `}
      </Script>
    </>
  )
}
