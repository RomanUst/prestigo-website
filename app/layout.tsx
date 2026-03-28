import type { Metadata } from 'next'
import { Cormorant_Garamond, Montserrat } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const GA_ID = 'G-SX98ZT7YRN'

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
  metadataBase: new URL('https://prestigo-site.vercel.app'),
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
    title: 'PRESTIGO — Premium Chauffeur Service Prague',
    description:
      'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
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
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body className={`${cormorant.variable} ${montserrat.variable}`}>
        <a href="#main-content" className="skip-link btn-primary">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
