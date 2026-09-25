'use client'

import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { siteLocaleFromPathname } from '@/i18n/locales'

/**
 * SPA page_view tracker for GA4.
 *
 * Why this exists: Next.js App Router performs client-side navigation — a
 * <Link> click swaps the route without a full reload. GA4's gtag('config')
 * fires exactly one page_view on initial load; subsequent in-app navigations
 * are invisible to analytics. That single-pageview-per-session was the root
 * cause of 80–100% page-level bounce rates despite high cta_click volume:
 * users clicked through the funnel but GA4 saw one-page sessions.
 *
 * On every pathname or search-param change we fire `page_view` manually with
 * an up-to-date page_location and page_title, matching what gtag.js does for
 * multi-page sites.
 *
 * Skips /admin paths (kept consistent with GoogleAnalytics.tsx which already
 * skips admin from gtag('config', ...)).
 */
function PageViewInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    if (pathname.startsWith('/admin')) return
    if (typeof window === 'undefined') return

    const w = window as typeof window & {
      gtag?: (...args: unknown[]) => void
      dataLayer?: unknown[]
    }

    const qs = searchParams?.toString()
    const page_location = qs
      ? `${window.location.origin}${pathname}?${qs}`
      : `${window.location.origin}${pathname}`

    // D-10: site_locale is derived from the pathname (never browser
    // language) and set as a persistent GA4 param BEFORE page_view fires,
    // so every later gtag event in this session (begin_checkout,
    // select_item, purchase, etc.) inherits it automatically via
    // gtag('set', ...) scope — no per-call-site edits needed.
    const site_locale = siteLocaleFromPathname(pathname)

    const payload = {
      page_location,
      page_path: pathname,
      page_title: document.title,
      site_locale,
    }

    if (typeof w.gtag === 'function') {
      w.gtag('set', { site_locale })
      w.gtag('event', 'page_view', payload)
    } else {
      w.dataLayer = w.dataLayer || []
      w.dataLayer.push(['set', { site_locale }])
      w.dataLayer.push(['event', 'page_view', payload])
    }
  }, [pathname, searchParams])

  return null
}

export default function AnalyticsPageView() {
  // useSearchParams requires a Suspense boundary in Next.js App Router to
  // avoid de-opting the entire app to client rendering at build time.
  return (
    <Suspense fallback={null}>
      <PageViewInner />
    </Suspense>
  )
}
