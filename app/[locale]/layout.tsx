import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing, rtlLocales, type AppLocale } from '@/i18n/routing'
import SiteChrome, { siteMetadata } from '@/components/SiteChrome'

export const metadata = siteMetadata

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
      <SiteChrome>{children}</SiteChrome>
    </html>
  )
}
