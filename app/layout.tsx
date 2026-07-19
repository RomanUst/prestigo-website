import type { Metadata } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'
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

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // No headers()/cookies() read here on purpose: any dynamic API in the root
  // layout opts the ENTIRE route tree into dynamic rendering, defeating the
  // revalidate/force-static directives on the marketing pages below. The CSP
  // nonce for dynamic routes is propagated automatically by Next.js from the
  // Content-Security-Policy request header set in middleware — it reaches the
  // analytics <Script> components without any manual prop wiring.
  return (
    <html lang="en">
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
      <body className={`${fraunces.variable} ${inter.variable}`}>
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
      </body>
    </html>
  )
}
