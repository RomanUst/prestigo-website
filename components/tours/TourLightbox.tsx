'use client'

// Phase 93 (plan 93-13; TRIP-02; D-15; UI-SPEC Surface 1.3 "Lightbox"): the full-screen photo viewer of a tour page.
// A modal dialog: focus moves in on open and is trapped (Tab cycles), Escape closes, ArrowLeft / ArrowRight move
// (swapped in RTL), a horizontal swipe moves, body scroll is locked while open, and the opener gets focus back
// (done by the gallery, which knows the opener). Below the image: the credit line of the current photo with its
// source link, nothing for own photos. No zoom, no download.

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { photoCredit, type CreditablePhoto } from '@/components/tours/tour-credit'
import { rtlLocales, type AppLocale } from '@/i18n/locales'
import { tourPhotoUrl } from '@/lib/tours/photo-url'
import type { TourPhotoRow } from '@/lib/tours/types'

export type LightboxPhoto = CreditablePhoto & Pick<TourPhotoRow, 'storage_path'>

const SWIPE_MIN_PX = 50

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

const CONTROL =
  'flex h-11 w-11 items-center justify-center rounded-[4px] text-offwhite transition-colors duration-200 hover:bg-anthracite-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

export default function TourLightbox({
  title,
  photos,
  startIndex,
  onClose,
}: {
  title: string
  photos: readonly LightboxPhoto[]
  startIndex: number
  onClose: () => void
}) {
  const t = useTranslations('Tours.gallery')
  const locale = useLocale()
  const rtl = rtlLocales.includes(locale as AppLocale)
  const count = photos.length
  const [index, setIndex] = useState(() => Math.min(count - 1, Math.max(0, startIndex)))
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef<number | null>(null)

  // Logical step: +1 is "next" in reading order, which is the end side (right in LTR, left in RTL). Wraps around.
  const step = useCallback(
    (delta: number) => setIndex((i) => (((i + delta) % count) + count) % count),
    [count]
  )

  // Initial focus on Close, body scroll lock.
  useEffect(() => {
    closeRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Keys: Escape, arrows (swapped in RTL) and the Tab trap. One document listener so it keeps working
  // even if focus is lost to the backdrop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        step(rtl ? -1 : 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step(rtl ? 1 : -1)
      } else if (e.key === 'Tab') {
        const root = dialogRef.current
        if (!root) return
        const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        const inside = active instanceof HTMLElement && root.contains(active)
        if (e.shiftKey && (!inside || active === first)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (!inside || active === last)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, rtl, step])

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function onTouchEnd(e: TouchEvent) {
    const from = touchStartX.current
    const to = e.changedTouches[0]?.clientX
    touchStartX.current = null
    if (from === null || to === undefined) return
    const dx = to - from
    if (Math.abs(dx) < SWIPE_MIN_PX) return
    // Swiping toward the start edge reveals the next photo: leftwards in LTR, rightwards in RTL.
    step((dx < 0 ? 1 : -1) * (rtl ? -1 : 1))
  }

  const photo = photos[index]
  if (!photo) return null
  const src = tourPhotoUrl(photo.storage_path)
  const credit = photoCredit(photo)
  const creditLine = credit ? t('credit', { credit: credit.credit, license: credit.license }) : null

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightboxLabel', { title })}
      dir={rtl ? 'rtl' : 'ltr'}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-[100] flex flex-col bg-anthracite/95"
    >
      <div className="flex items-center justify-between px-4 py-2">
        <p aria-live="polite" className="text-[14px] font-normal text-offwhite">
          {t('counter', { n: index + 1, count })}
        </p>
        <button ref={closeRef} type="button" aria-label={t('close')} onClick={onClose} className={CONTROL}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16">
        <div className="relative h-[calc(100dvh-160px)] w-full">
          {src && (
            <Image
              key={photo.storage_path}
              src={src}
              alt={t('alt', { title, n: index + 1, count })}
              fill
              sizes="100vw"
              className="object-contain"
            />
          )}
        </div>
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label={t('prev')}
              onClick={() => step(-1)}
              className={`${CONTROL} absolute start-2 top-1/2 -translate-y-1/2`}
            >
              <ChevronLeft size={24} aria-hidden="true" className="rtl:-scale-x-100" />
            </button>
            <button
              type="button"
              aria-label={t('next')}
              onClick={() => step(1)}
              className={`${CONTROL} absolute end-2 top-1/2 -translate-y-1/2`}
            >
              <ChevronRight size={24} aria-hidden="true" className="rtl:-scale-x-100" />
            </button>
          </>
        )}
      </div>

      <div className="min-h-[48px] px-4 py-3 text-center text-[11px] font-light text-warmgrey">
        {creditLine &&
          (credit?.url ? (
            <a href={credit.url} target="_blank" rel="noopener noreferrer nofollow" className="underline hover:text-offwhite">
              {creditLine}
            </a>
          ) : (
            <span>{creditLine}</span>
          ))}
      </div>
    </div>,
    document.body
  )
}
