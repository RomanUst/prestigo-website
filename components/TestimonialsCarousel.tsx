'use client'

import { useEffect, useState } from 'react'
import type { Review } from '@/lib/google-reviews'

interface Props {
  reviews: Review[]
  intervalMs?: number
}

function StarBadge({ rating }: { rating: number }) {
  const stars = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${stars} out of 5 stars`}>
      {Array.from({ length: stars }).map((_, i) => (
        <span key={i} data-testid="star-filled" aria-hidden="true" style={{ color: 'var(--copper)' }}>★</span>
      ))}
      <span className="font-body font-light text-[10px] tracking-[0.08em] ml-2" style={{ color: 'var(--copper)' }}>
        Google Review
      </span>
    </span>
  )
}

function ReviewCard({ review }: { review: Review }) {
  const isGoogle = review.source === 'google'
  const quote = isGoogle ? review.text : review.quote
  const name = isGoogle ? review.author : review.name
  const role = isGoogle ? review.relativeTime : review.role
  return (
    <div className="border-l-2 border-anthracite-light pl-6 py-2 max-w-3xl mx-auto">
      <p className="font-display font-light italic text-lg text-offwhite leading-snug mb-6">
        &ldquo;{quote}&rdquo;
      </p>
      <div>
        <p className="font-body font-light text-[11px] tracking-[0.1em] text-offwhite">{name}</p>
        <p className="label mt-1" style={{ color: 'var(--warmgrey)' }}>{role}</p>
        <div className="mt-2">
          {isGoogle ? (
            <StarBadge rating={review.rating} />
          ) : (
            <p className="font-body font-light text-[10px] tracking-[0.08em]" style={{ color: 'var(--copper)' }}>
              {review.sourceLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TestimonialsCarousel({ reviews, intervalMs = 5000 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [tick, setTick] = useState(0) // bump to reset timer on manual nav
  const len = reviews.length

  useEffect(() => {
    if (len < 2) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % len)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [len, intervalMs, tick])

  if (len === 0) return null

  const goTo = (i: number) => {
    setActiveIndex(((i % len) + len) % len)
    setTick((t) => t + 1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(activeIndex + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(activeIndex - 1)
    }
  }

  const active = reviews[activeIndex]

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Testimonials"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="outline-none"
    >
      <div aria-live="polite" aria-atomic="true">
        <ReviewCard review={active} />
      </div>

      {len > 1 && (
        <div className="flex justify-center mt-8" role="tablist" aria-label="Testimonial pagination">
          {reviews.map((_, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={isActive ? 'true' : 'false'}
                onClick={() => goTo(i)}
                className="w-2 h-2 rounded-full mx-1 transition-colors"
                style={{ backgroundColor: isActive ? 'var(--copper)' : 'var(--anthracite-light)' }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
