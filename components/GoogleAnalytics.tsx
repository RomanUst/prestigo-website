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
        Consent defaults must be pushed to dataLayer before gtag('config') fires.
        Using afterInteractive (not beforeInteractive) avoids React hydration
        mismatch: browsers strip nonce attributes from DOM elements after CSP
        processing ("nonce hiding"), so beforeInteractive scripts in the initial
        HTML cause React to see nonce="" vs the server-rendered value.
        afterInteractive scripts are injected by Next.js client-side runtime and
        never reconciled by React — no mismatch. Next.js guarantees execution
        order for same-strategy scripts in JSX order, so consent-default fires
        before ga-init. wait_for_update:2500 gives Google 2.5 s to receive the
        consent signal before processing events — enough time for a new visitor
        to read and click the cookie banner before the first pageview is sent.
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
            analytics_storage: __prestigoConsent === 'granted' ? 'granted' : 'denied',
            wait_for_update: 2500
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
            gtag('config', '${GA_ID}');
          }
        `}
      </Script>
    </>
  )
}
