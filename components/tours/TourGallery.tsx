'use client'

// Phase 93 (plan 93-13; TRIP-02; D-09, D-15; UI-SPEC Surface 1.3): the gallery of a tour page.
// One list of photos serves both layouts, so every image exists once in the DOM: below 1024px it is a
// horizontal scroll-snap carousel (one photo per view, 4:3, no dots, no autoplay) with a "{n} of {count}" chip;
// from 1024px the same list is a 440px grid whose shape follows the photo count (1, 2, 3, 4, 5+). Photos beyond the
// fifth are hidden on desktop and reachable through "+{count}", "Show all {count} photos" and the lightbox.
// Alt text is generated per locale; the first image is priority, the rest lazy; a failed image keeps its
// --anthracite-mid box so the grid never collapses. Tiles are buttons that open the lightbox.

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Images } from 'lucide-react'
import { tourPhotoUrl } from '@/lib/tours/photo-url'
import type { TourPhotoRow } from '@/lib/tours/types'

export type TourGalleryPhoto = Pick<
  TourPhotoRow,
  'id' | 'storage_path' | 'position' | 'is_cover' | 'source' | 'credit_text' | 'license' | 'credit_url'
>

/** Photos shown on the desktop grid when there are five or more (the large one plus the 2x2). */
const DESKTOP_MAX = 5

/** Cover first, then by position; the store already does this, kept here so the component never relies on it. */
export function orderTourPhotos<T extends Pick<TourPhotoRow, 'is_cover' | 'position'>>(photos: readonly T[]): T[] {
  return [...photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)
}

// Tailwind needs literal class strings, so each layout is spelled out.
function gridClass(count: number): string {
  if (count <= 1) return 'lg:grid-cols-1'
  if (count === 2) return 'lg:grid-cols-2'
  if (count === 3) return 'lg:grid-cols-3 lg:grid-rows-2'
  if (count === 4) return 'lg:grid-cols-3 lg:grid-rows-3'
  return 'lg:grid-cols-6 lg:grid-rows-2'
}

function tileClass(count: number, index: number): string {
  if (count === 3 && index === 0) return 'lg:col-span-2 lg:row-span-2'
  if (count === 4 && index === 0) return 'lg:col-span-2 lg:row-span-3'
  if (count >= DESKTOP_MAX) {
    if (index === 0) return 'lg:col-span-4 lg:row-span-2'
    if (index >= DESKTOP_MAX) return 'lg:hidden'
  }
  return ''
}

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper'

export default function TourGallery({ title, photos }: { title: string; photos: readonly TourGalleryPhoto[] }) {
  const t = useTranslations('Tours.gallery')
  const ordered = orderTourPhotos(photos)
  const count = ordered.length

  const [openAt, setOpenAt] = useState<number | null>(null) // lightbox position (rendered from Task 2)
  const [current, setCurrent] = useState(0)
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const openerRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Focus goes back to the control that opened the lightbox once it closes.
  useEffect(() => {
    if (openAt === null) openerRef.current?.focus()
  }, [openAt])

  if (count === 0) return null

  function open(index: number, e: MouseEvent<HTMLElement>) {
    openerRef.current = e.currentTarget
    setOpenAt(index)
  }

  function onScroll() {
    const el = listRef.current
    if (!el || el.clientWidth === 0) return
    // scrollLeft is negative in RTL; the distance from the start edge is what counts.
    const index = Math.round(Math.abs(el.scrollLeft) / el.clientWidth)
    setCurrent(Math.min(count - 1, Math.max(0, index)))
  }

  const extra = count - DESKTOP_MAX

  return (
    <div role="region" aria-label={t('lightboxLabel', { title })} className="relative -mx-6 sm:-mx-8 lg:mx-0">
      <ul
        ref={listRef}
        onScroll={onScroll}
        className={`m-0 flex snap-x snap-mandatory list-none overflow-x-auto p-0 [scrollbar-width:none] lg:h-[440px] lg:snap-none lg:gap-2 lg:overflow-hidden lg:rounded-[4px] lg:grid ${gridClass(count)}`}
      >
        {ordered.map((photo, i) => {
          const src = tourPhotoUrl(photo.storage_path)
          const n = i + 1
          return (
            <li
              key={photo.id}
              className={`relative aspect-[4/3] min-h-0 min-w-0 shrink-0 basis-full snap-center bg-anthracite-mid lg:aspect-auto lg:basis-auto lg:shrink ${tileClass(count, i)}`}
            >
              <button
                type="button"
                aria-label={t('open', { n, count })}
                onClick={(e) => open(i, e)}
                className={`relative block h-full w-full cursor-pointer ${FOCUS_RING}`}
              >
                {src && !failed[photo.id] && (
                  <Image
                    src={src}
                    alt={t('alt', { title, n, count })}
                    fill
                    priority={i === 0}
                    loading={i === 0 ? undefined : 'lazy'}
                    sizes={
                      i === 0
                        ? '(min-width: 1024px) 66vw, 100vw'
                        : '(min-width: 1024px) 17vw, 100vw'
                    }
                    className="object-cover"
                    onError={() => setFailed((f) => ({ ...f, [photo.id]: true }))}
                  />
                )}
              </button>

              {i === DESKTOP_MAX - 1 && extra > 0 && (
                <button
                  type="button"
                  aria-label={t('open', { n: DESKTOP_MAX + 1, count })}
                  onClick={(e) => open(DESKTOP_MAX, e)}
                  className={`absolute inset-0 hidden cursor-pointer items-center justify-center bg-anthracite/60 font-display text-[24px] font-normal text-offwhite lg:flex ${FOCUS_RING}`}
                >
                  {t('more', { count: extra })}
                </button>
              )}

              {i === 0 && count >= 2 && (
                <button
                  type="button"
                  onClick={(e) => open(0, e)}
                  className={`absolute bottom-4 end-4 hidden items-center gap-2 rounded-[4px] bg-anthracite/80 px-3 py-2 text-[11px] font-normal text-offwhite lg:flex ${FOCUS_RING}`}
                >
                  <Images size={16} aria-hidden="true" />
                  {t('showAll', { count })}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {count >= 2 && (
        <span
          data-testid="tour-gallery-chip"
          className="pointer-events-none absolute bottom-4 end-4 rounded-[4px] bg-anthracite/80 px-2 py-1 text-[11px] font-normal text-offwhite lg:hidden"
        >
          {t('counter', { n: current + 1, count })}
        </span>
      )}

    </div>
  )
}
