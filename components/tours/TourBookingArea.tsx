'use client'

// Phase 93 (plan 93-13; TRIP-04; D-09; UI-SPEC Surface 1.1): the booking area of a tour page, one client island that
// owns the box state. It renders the booking box once (id="book", the sticky bar's scroll target) and the mobile
// sticky bar that follows it, and routes the bar's button to the box's own 'Book this trip' action.
// Every amount comes from the props the server page took from the tour row and tour_settings; none is typed here.
// The sticky-aside behaviour (top 88px from 1024px when the viewport is at least 800px high) lives on the aside
// wrapper in TourPageView, because that wrapper spans both grid rows of the page.

import { useCallback, useRef, useState } from 'react'
import StickyBookBar from '@/components/tours/StickyBookBar'
import TourBookingBox, { type TourBookingBoxHandle, type TourBookingBoxProps, type TourBoxState } from '@/components/tours/TourBookingBox'

export type TourBookingAreaProps = Pick<
  TourBookingBoxProps,
  'slug' | 'title' | 'hoursIncluded' | 'prices' | 'extraHourPrices' | 'startMin' | 'startMax' | 'freeCancelHours'
>

export default function TourBookingArea(props: TourBookingAreaProps) {
  const boxRef = useRef<HTMLElement>(null)
  const handleRef = useRef<TourBookingBoxHandle>(null)
  const [state, setState] = useState<TourBoxState>({ complete: false, totalEur: null, fromEur: null })

  const onBook = useCallback(() => handleRef.current?.book(), [])
  const focusFirstMissing = useCallback(() => handleRef.current?.focusFirstMissing(), [])

  return (
    <div id="book" className="scroll-mt-24">
      <TourBookingBox ref={handleRef} boxRef={boxRef} onStateChange={setState} {...props} />
      <StickyBookBar
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
