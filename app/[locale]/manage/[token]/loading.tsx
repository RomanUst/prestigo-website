import { getLocale, getTranslations } from 'next-intl/server'
import { normalizeSiteLocale } from '@/i18n/locales'
import ManageHeader from './ManageHeader'

// E1 loading: the header and three reserved blocks (reference, details, panel) while the page streams, so the layout
// does not jump when the booking arrives. No booking data here, only shapes.
const blockStyle = {
  backgroundColor: 'var(--anthracite-mid)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: 4,
  marginBottom: 24,
} as const

export default async function ManageLoading() {
  const t = await getTranslations('Manage')
  // loading.tsx receives no params; the route is force-dynamic, so reading the request locale costs nothing extra.
  const locale = normalizeSiteLocale(await getLocale())
  return (
    <>
      <ManageHeader locale={locale} homeLabel={t('header.homeAriaLabel')} />
      <main
        id="main-content"
        aria-busy="true"
        aria-label={t('loading')}
        style={{ boxSizing: 'border-box', width: '100%', maxWidth: 560, margin: '0 auto', padding: '32px 24px 64px' }}
      >
        <div data-testid="manage-loading-block" style={{ ...blockStyle, height: 96 }} />
        <div data-testid="manage-loading-block" style={{ ...blockStyle, height: 240 }} />
        <div data-testid="manage-loading-block" style={{ ...blockStyle, height: 160 }} />
      </main>
    </>
  )
}
