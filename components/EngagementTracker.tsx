'use client'

/**
 * EngagementTracker — GA4 engagement event instrumentation.
 *
 * Problem: GA4 Enhanced Measurement fires scroll only at 90% depth and
 * user_engagement only when the page becomes hidden. On a bounce, this
 * often means the engagement ping never leaves — especially on mobile where
 * the OS kills the tab mid-scroll. Result: 100% bounce rate even for
 * genuine visitors who read the page.
 *
 * Solution: client-side scroll milestones (25 / 50 / 75 %), time milestones
 * (10 s / 30 s), and CTA click tracking. Each event explicitly includes
 * engagement_time_msec so GA4 counts the session as "engaged" before the
 * page is hidden.
 *
 * Events fired:
 *   scroll_depth   { percent: 25 | 50 | 75, page_path }
 *   time_on_page   { seconds: 10 | 30, page_path }
 *   cta_click      { label, destination, page_path }
 */

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function send(event: string, params: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', event, params)
}

export default function EngagementTracker() {
  const pathname = usePathname()
  const startRef = useRef<number>(Date.now())

  // Reset timer on route change
  useEffect(() => {
    startRef.current = Date.now()
  }, [pathname])

  // ── Scroll depth milestones ─────────────────────────────────────────────
  useEffect(() => {
    const fired = new Set<number>()
    const THRESHOLDS = [25, 50, 75]

    function onScroll() {
      const el = document.documentElement
      const scrolled = el.scrollTop + el.clientHeight
      const total = el.scrollHeight
      if (total <= el.clientHeight) return // page doesn't scroll

      const pct = Math.floor((scrolled / total) * 100)

      for (const threshold of THRESHOLDS) {
        if (pct >= threshold && !fired.has(threshold)) {
          fired.add(threshold)
          send('scroll_depth', {
            percent: threshold,
            page_path: pathname,
            engagement_time_msec: Date.now() - startRef.current,
          })
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])

  // ── Time-on-page milestones ─────────────────────────────────────────────
  useEffect(() => {
    const MILESTONES = [10_000, 30_000] // ms
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const ms of MILESTONES) {
      const t = setTimeout(() => {
        send('time_on_page', {
          seconds: ms / 1000,
          page_path: pathname,
          engagement_time_msec: ms,
        })
      }, ms)
      timers.push(t)
    }

    return () => timers.forEach(clearTimeout)
  }, [pathname])

  // ── CTA click tracking ──────────────────────────────────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('a[href], button')
      if (!target) return

      const href = (target as HTMLAnchorElement).href ?? ''
      const text = target.textContent?.trim().slice(0, 60) ?? ''

      // Track any link to /book or buttons with booking-related classes
      const isBookingCTA =
        href.includes('/book') ||
        target.classList.contains('btn-primary') ||
        target.classList.contains('btn-secondary')

      if (!isBookingCTA) return

      send('cta_click', {
        label: text,
        destination: href || 'button',
        page_path: pathname,
        engagement_time_msec: Date.now() - startRef.current,
      })
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [pathname])

  return null
}
