import type { Metadata } from 'next'

// Third root layout, beside app/[locale] and app/(internal): /embed is the Chatwoot Dashboard App
// iframe. It is English-only and deliberately carries no site chrome, no analytics, no cookie
// banner, no chat launcher, no webfont and no i18n provider, because it runs under the strict
// embed CSP (default-src 'none', nonce scripts) and must not touch any visitor-facing code.
export const metadata: Metadata = {
  title: 'Bookings · Prestigo',
  robots: { index: false, follow: false },
}

export default function EmbedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
