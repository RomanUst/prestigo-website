import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { locales } from '@/i18n/locales'
import { buildShareMetadata } from '@/lib/site-metadata'

// /login is a utility auth screen with no search value. The page itself is a
// client component and cannot export metadata, so the noindex directive lives
// here in a server-component layout wrapper.
const ROBOTS: Metadata['robots'] = { index: false, follow: true }

// 75-28 (GAP-4d) + 75-31: localized <title>, description and openGraph per
// locale (previously every locale fell back to the EN site default). The X
// card mirrors og:title/og:description through the locale layout default
// (lib/site-metadata.ts), so no per-page X block is set here. CR-01: the
// locale comes from the route's own dynamic segment, never from the
// request-scoped next-intl locale helper. The title is absolute so the root
// template does not append the brand a second time.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(locales, locale)) return { robots: ROBOTS }
  const t = await getTranslations({ locale, namespace: 'Auth.login' })
  return {
    ...buildShareMetadata(locale, t('metaTitle'), t('metaDescription')),
    robots: ROBOTS,
  }
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
