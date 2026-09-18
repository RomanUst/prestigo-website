import type { Metadata } from 'next'
import { Fraunces, Inter, Noto_Sans_Arabic, Noto_Sans_Devanagari, Noto_Sans_SC } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import '../app/globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import AnalyticsPageView from '@/components/AnalyticsPageView'
import Clarity from '@/components/Clarity'
import MetaPixel from '@/components/MetaPixel'
import CookieBanner from '@/components/CookieBanner'
import EngagementTracker from '@/components/EngagementTracker'

// Display serif — Fraunces. High-contrast "old-style" cut with soft terminals,
// closest freely-hostable match to the Canela/Ogg look in the design references.
// Keeps the CSS var name --font-cormorant so the 500+ existing var() references
// need no changes. Optical-size axis exposed so display headings can request the
// delicate display cut (opsz 144) while body-sized serif stays readable.
const fraunces = Fraunces({
  variable: '--font-cormorant',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT'],
  display: 'swap',
})

// Body / UI grotesque — Inter (free stand-in for PP Neue Montreal until a
// licensed .woff2 is self-hosted via next/font/local). Keeps var --font-montserrat.
const inter = Inter({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
})

// Non-Latin script fonts (Phase 73, FONT-01/D-04) — loaded per-locale, not
// globally. Loaders MUST stay at module scope (next/font requires static,
// module-level calls); only the resulting variable's *application* on
// <body> is locale-conditional (see localeFontClassName below), so /en,
// /ru, /es, /fr ship zero Noto bytes.
const notoArabic = Noto_Sans_Arabic({
  variable: '--font-noto-arabic',
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  display: 'swap',
})
const notoDevanagari = Noto_Sans_Devanagari({
  variable: '--font-noto-devanagari',
  subsets: ['devanagari'],
  weight: ['400', '500', '600'],
  display: 'swap',
})
// CORRECTED vs UI-SPEC (73-RESEARCH.md Pitfall 2): 'chinese-simplified' is
// NOT a valid Noto Sans SC subset per Next.js's bundled font metadata
// (only cyrillic/latin/latin-ext/vietnamese are) — using it throws a
// build-time nextFontError. 'latin' is valid and harmless; the full CJK
// glyph set ships regardless of the subsets value chosen.
const notoSC = Noto_Sans_SC({
  variable: '--font-noto-sc',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const siteMetadata: Metadata = {
  metadataBase: new URL('https://rideprestigo.com'),
  title: {
    default: 'PRESTIGO — Premium Chauffeur Service Prague',
    template: '%s | PRESTIGO',
  },
  description:
    'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
  keywords: [
    'chauffeur Prague',
    'airport transfer Prague',
    'private driver Prague',
    'luxury transfer Prague',
    'Prague taxi service',
    'executive transfer Prague',
  ],
  authors: [{ name: 'PRESTIGO' }],
  creator: 'PRESTIGO',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'PRESTIGO',
    title: 'PRESTIGO — Premium Chauffeur Service Prague',
    description:
      'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'PRESTIGO — Premium Chauffeur Service Prague',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PRESTIGO — Premium Chauffeur Service Prague',
    description:
      'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
    images: ['/og-image.jpg'],
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
  other: {
    'facebook-domain-verification': 'ka67mchks8rv6d7vd0mxut21zt3lc5',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

// No headers()/cookies() read here on purpose: any dynamic API in the root
// layout opts the ENTIRE route tree into dynamic rendering, defeating the
// revalidate/force-static directives on the marketing pages below. The CSP
// nonce for dynamic routes is propagated automatically by Next.js from the
// Content-Security-Policy request header set in middleware — it reaches the
// analytics <Script> components without any manual prop wiring.
//
// Shared chrome for BOTH root layouts (app/[locale]/layout.tsx and
// app/(internal)/layout.tsx) so /admin and /driver chrome stays provably
// byte-for-byte identical to the localized public chrome (RESEARCH.md
// Pitfall 3 — extract once, don't hand-copy).
export default async function SiteChrome({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale()
  const messages = await getMessages()

  // D-04: per-locale Noto className application. Internal routes
  // (app/(internal)/layout.tsx, which shares this same SiteChrome) always
  // resolve getLocale() to 'en' (no [locale] segment in the URL), so this
  // stays '' for /admin and /driver with no extra branch needed.
  const localeFontClassName =
    locale === 'ar'
      ? notoArabic.variable
      : locale === 'hi'
        ? notoDevanagari.variable
        : locale === 'zh'
          ? notoSC.variable
          : ''

  return (
    <>
      <head>
        {/* Hero image LCP preload is handled by <Image priority fetchPriority="high">
            in Hero.tsx — Next.js auto-generates a preload with the correct
            /_next/image srcset that the browser actually requests.
            A manual preload here would target /photohero.avif (raw) while
            <Image> loads /_next/image?url=... causing a wasted preload. */}
        {/* Fonts are self-hosted via next/font — no Google Fonts connections needed. */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="preconnect" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://www.facebook.com" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
      </head>
      <body className={`${fraunces.variable} ${inter.variable} ${localeFontClassName}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a href="#main-content" className="skip-link btn-primary">
            Skip to content
          </a>
          {children}
          <GoogleAnalytics />
          <AnalyticsPageView />
          <Clarity />
          <MetaPixel />
          <CookieBanner />
          <EngagementTracker />
        </NextIntlClientProvider>
      </body>
    </>
  )
}
