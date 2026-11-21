'use client'

// Phase 93 (plan 93-12; TRIP-04; D-09; UI-SPEC 3.9): the mobile sticky booking bar of a tour page (below 1024px).
// Shown only while the in-page booking box is out of view; hidden it is aria-hidden and holds no focusable element.
// The amounts are props computed by the box from server prices; nothing is calculated or typed here.

import { useEffect, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { formatEUR } from '@/lib/currency'

export interface StickyBookBarProps {
  /** The in-page booking box (its section element). */
  targetRef: RefObject<HTMLElement | null>
  fromEur: number | null
  /** The chosen car's total; null until a car is chosen. */
  totalEur: number | null
  /** Date, start time and car are all chosen. */
  complete: boolean
  /** Goes to the checkout (the box's own 'Book this trip' action). */
  onBook(): void
  /** Optional: focuses the first missing field of the box; without it the tap falls back to onBook(), which does the same. */
  focusFirstMissing?: () => void
}

export default function StickyBookBar({ targetRef, fromEur, totalEur, complete, onBook, focusFirstMissing }: StickyBookBarProps) {
  const t = useTranslations('Tours.box')
  // True until the observer says otherwise, so the bar never flashes in before the first measurement.
  const [boxInView, setBoxInView] = useState(true)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setBoxInView(false)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1]
      if (last) setBoxInView(last.isIntersecting)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [targetRef])

  function handleClick() {
    if (complete) {
      onBook()
      return
    }
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    targetRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    if (focusFirstMissing) focusFirstMissing()
    else onBook()
  }

  const hidden = boxInView
  const showTotal = totalEur !== null
  const amount = showTotal ? totalEur : fromEur

  return (
    <div
      aria-hidden={hidden}
      data-testid="tour-sticky-bar"
      className={`fixed inset-x-0 bottom-0 z-40 min-h-[calc(72px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] flex items-center justify-between gap-3 border-t border-anthracite-light bg-anthracite-mid px-4 transition-[opacity,transform,visibility] duration-200 motion-reduce:transition-none lg:hidden ${
        hidden ? 'pointer-events-none invisible translate-y-full opacity-0' : 'visible translate-y-0 opacity-100'
      }`}
    >
      {amount !== null ? (
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-normal uppercase text-warmgrey">{showTotal ? t('barTotal') : t('from')}</span>
          <bdi className="font-display text-[24px] font-normal leading-none text-offwhite">{formatEUR(amount)}</bdi>
          <span className="text-[11px] font-normal text-warmgrey">{t('perCar')}</span>
        </div>
      ) : (
        <span />
      )}
      <button
        type="button"
        tabIndex={hidden ? -1 : undefined}
        onClick={handleClick}
        className="btn-primary shrink-0 !px-6 !py-[14px] text-center"
      >
        {t('cta')}
      </button>
    </div>
  )
}
