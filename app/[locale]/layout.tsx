import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing, rtlLocales, type AppLocale } from '@/i18n/routing'
import type { Metadata } from 'next'
import SiteChrome from '@/components/SiteChrome'
import ChatLauncher from '@/components/ChatLauncher'
import { getLocaleSiteMetadata } from '@/lib/site-metadata'

// 75-31 (WR-02 / GAP-4): locale-aware site default. Localized default
// title/description/keywords/og on every locale, and a twitter block with only
// card + images so Next.js mirrors each page's own og:title/og:description into
// twitter:*. CR-01: the locale comes from params, never the request scope.
// Invalid segments fall back to the EN default (never throws).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return getLocaleSiteMetadata(locale)
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    <html lang={locale} dir={rtlLocales.includes(locale as AppLocale) ? 'rtl' : 'ltr'}>
      <SiteChrome>
        {children}
        {/* Phase 77 (INBOX-02): server-rendered launcher; loads nothing third-party
            until the visitor clicks "Chat on site". Public layout only — the
            internal layout (/admin, /driver) never mounts it. */}
        <ChatLauncher />
      </SiteChrome>
    </html>
  )
}
