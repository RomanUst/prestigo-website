'use client'

// Phase 93 (plan 93-11; UI-SPEC 1.5 "About this trip"): below 640px a long description is clamped to six
// lines with a "Read more" button. The button is shown only for long text (the server decides with a length
// heuristic so markup is identical on server and client); from 640px the full text always shows.

import { useId, useState, type ReactNode } from 'react'

export default function TourReadMore({
  children,
  long,
  readMore,
  showLess,
}: {
  children: ReactNode
  /** True when the text is long enough to need the clamp below 640px. */
  long: boolean
  readMore: string
  showLess: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const clamped = long && !open
  return (
    <div>
      <div
        id={id}
        className={clamped ? 'flex flex-col gap-4 max-sm:max-h-[10.5em] max-sm:overflow-hidden' : 'flex flex-col gap-4'}
        data-clamped={clamped ? 'true' : 'false'}
      >
        {children}
      </div>
      {long && (
        <button
          type="button"
          className="cta-text mt-4 sm:hidden"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? showLess : readMore}
        </button>
      )}
    </div>
  )
}
