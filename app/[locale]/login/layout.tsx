import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { locales } from '@/i18n/locales'

// /login is a utility auth screen with no search value. The page itself is a
// client component and cannot export metadata, so the noindex directive lives
// here in a server-component layout wrapper.
const ROBOTS: Metadata['robots'] = { index: false, follow: true }

// 75-28 (GAP-4d): localized <title>/description per locale (previously every
// locale fell back to the EN site default). CR-01: the locale comes from the
// route's own dynamic segment, never from the request-scoped next-intl
// locale helper. The title is absolute so the root template does not
// append the brand a second time.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(locales, locale)) return { robots: ROBOTS }
  const t = await getTranslations({ locale, namespace: 'Auth.login' })
  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    robots: ROBOTS,
  }
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
