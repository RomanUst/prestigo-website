'use client'

// Phase 93 (plan 93-11; UI-SPEC 1.5 "Questions and answers"): FAQ accordion. Every answer stays in the DOM:
// a closed answer collapses with height 0 + overflow hidden + `inert` (never `hidden` or conditional
// rendering), so crawlers and the FAQPage JSON-LD read the same text. Every item starts closed.

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function TourFaq({ items }: { items: Array<{ q: string; a: string }> }) {
  const base = useId()
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="border-b border-anthracite-light">
      {items.map((item, i) => {
        const isOpen = open.has(i)
        const panelId = `${base}-panel-${i}`
        const buttonId = `${base}-button-${i}`
        return (
          <div key={i} className="border-t border-anthracite-light first:border-t-0">
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(i)}
                className="flex min-h-[44px] w-full items-center justify-between gap-4 py-3 text-start font-body text-[14px] font-normal leading-[1.5] text-offwhite"
              >
                <span>{item.q}</span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={`shrink-0 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!isOpen}
              className={isOpen ? '' : 'h-0 overflow-hidden'}
            >
              <p className="pb-6 font-body text-[14px] font-light leading-[1.75] text-warmgrey">{item.a}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
