import type { Metadata } from 'next'
import { Cormorant_Garamond, Montserrat } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import MetaPixel from '@/components/MetaPixel'
import CookieBanner from '@/components/CookieBanner'

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
})

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600'],
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
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/photohero.png'],
  },
  icons: {
    apple: '/apple-touch-icon.png',
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read the per-request nonce injected by middleware so we can pass it to
  // <Script nonce={nonce}> components. Falls back to empty string on paths
  // that bypass middleware (e.g. static file serving).
  const nonce = (await headers()).get('x-nonce') ?? ''

  return (
    <html lang="en">
      <head>
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://rideprestigo.com/photohero.png" />
        {/* Hero image is the LCP element — preload the 24 KB AVIF directly
            rather than the 1.42 MB PNG. AVIF is supported by ~96% of global
            traffic in 2026; the remaining clients still get the Image
            component's negotiated fallback via /_next/image. */}
        <link rel="preload" as="image" href="/photohero.avif" fetchPriority="high" type="image/avif" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://connect.facebook.net" />
      </head>
      <body className={`${cormorant.variable} ${montserrat.variable}`}>
        <a href="#main-content" className="skip-link btn-primary">
          Skip to content
        </a>
        {children}
        <GoogleAnalytics nonce={nonce} />
        <MetaPixel nonce={nonce} />
        <CookieBanner />
      </body>
    </html>
  )
}
