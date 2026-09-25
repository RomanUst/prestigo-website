// Fixture: fully i18n-clean equivalent — zero en_leak_static.mjs findings expected.
'use client'
import { useTranslations } from 'next-intl'
import { Link, getPathname } from '@/i18n/routing'

export default function Clean() {
  const t = useTranslations('Example')
  const path = getPathname({ href: '/about', locale: 'en' })
  return (
    <div>
      <p>{t('greeting')}</p>
      <p>PRESTIGO</p>
      <input placeholder={t('placeholderKey')} />
      <img alt={t('altKey')} />
      <Link href="/about">{t('learnMore')}</Link>
      <a href={path}>{t('viaPath')}</a>
      <a href="https://example.com">{t('external')}</a>
      <a href="mailto:info@rideprestigo.com">{t('email')}</a>
    </div>
  )
}
