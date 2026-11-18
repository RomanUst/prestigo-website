'use client'

// Phase 93 (plan 93-13; TRIP-04; D-09; UI-SPEC Surface 1.1; T-93-35): the booking area of a tour page, one client
// island that owns the box state. It renders the booking box once (id="book", the sticky bar's scroll target) and the
// mobile sticky bar that follows it, and routes the bar's button to the box's own 'Book this trip' action.
// Every amount comes from the props the server page took from the tour row and tour_settings; none is typed here.
// 'Change trip details' on the checkout returns here: the box then restores its choices from sessionStorage
// (tour-box:<slug>, written by the box on 'Book this trip'). Storage is user-editable, so the value is validated with
// the same rules as the checkout query and ignored unless all six values hold up; the server re-validates at checkout.
// The sticky-aside behaviour (lg:[@media(min-height:800px)]:sticky and top-[88px]: from 1024px, only when the viewport
// is at least 800px high) lives on the aside wrapper in TourPageView, because that wrapper spans both grid rows.

import { useCallback, useEffect, useRef, useState } from 'react'
import StickyBookBar from '@/components/tours/StickyBookBar'
import TourBookingBox, { type TourBookingBoxHandle, type TourBookingBoxProps, type TourBoxState } from '@/components/tours/TourBookingBox'
import { parseTourCheckoutQuery, tourBoxStorageKey } from '@/lib/tours/checkout-query'

export type TourBookingAreaProps = Pick<
  TourBookingBoxProps,
  'slug' | 'title' | 'hoursIncluded' | 'prices' | 'extraHourPrices' | 'startMin' | 'startMax' | 'freeCancelHours'
>

type Restored = NonNullable<TourBookingBoxProps['initial']>

/** The stored choices of this tour when they are all valid, else null. Never throws. */
function readStoredBox(slug: string): Restored | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(tourBoxStorageKey(slug))
  } catch {
    return null // storage blocked
  }
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  // Same validation as the checkout URL: every value is checked, the slug is always this page's own.
  const parsed = parseTourCheckoutQuery(
    new URLSearchParams({
      tour: slug,
      date: String(v.date),
      time: String(v.time),
      pax: String(v.pax),
      car: String(v.car),
      xh: String(v.xh),
    })
  )
  if (!parsed) return null
  return { date: parsed.date, time: parsed.time, pax: parsed.pax, car: parsed.car, xh: parsed.xh }
}

export default function TourBookingArea(props: TourBookingAreaProps) {
  const boxRef = useRef<HTMLElement>(null)
  const handleRef = useRef<TourBookingBoxHandle>(null)
  const [state, setState] = useState<TourBoxState>({ complete: false, totalEur: null, fromEur: null })
  const [restored, setRestored] = useState<Restored | null>(null)

  const { slug } = props
  // After mount only: the server render and the first client render are identical (empty box), then a valid stored
  // state remounts the box (and the bar, which observes the box element) with those values.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestored(readStoredBox(slug))
  }, [slug])

  const onBook = useCallback(() => handleRef.current?.book(), [])
  const focusFirstMissing = useCallback(() => handleRef.current?.focusFirstMissing(), [])
  const mountKey = restored ? 'restored' : 'fresh'

  return (
    <div id="book" className="scroll-mt-24">
      <TourBookingBox
        key={`box-${mountKey}`}
        ref={handleRef}
        boxRef={boxRef}
        onStateChange={setState}
        initial={restored ?? undefined}
        {...props}
      />
      <StickyBookBar
        key={`bar-${mountKey}`}
        targetRef={boxRef}
        fromEur={state.fromEur}
        totalEur={state.totalEur}
        complete={state.complete}
        onBook={onBook}
        focusFirstMissing={focusFirstMissing}
      />
    </div>
  )
}
