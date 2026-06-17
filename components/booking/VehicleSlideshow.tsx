'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import type { VehicleClass } from '@/types/booking'

// ---------------------------------------------------------------------------
// Slide manifest — interior/luggage images per class (from plan 59-01)
// ---------------------------------------------------------------------------
const SLIDES_BY_CLASS: Record<string, { src: string; alt: string }[]> = {
  business: [
    { src: '/vehicles/business-int-1.jpg', alt: 'Business interior view 1' },
    { src: '/vehicles/business-int-2.jpg', alt: 'Business interior view 2' },
    { src: '/vehicles/business-int-3.jpg', alt: 'Business interior view 3' },
  ],
  first_class: [
    { src: '/vehicles/first-int-1.jpg', alt: 'First Class interior view 1' },
    { src: '/vehicles/first-int-2.jpg', alt: 'First Class interior view 2' },
    { src: '/vehicles/first-int-3.jpg', alt: 'First Class interior view 3' },
  ],
  business_van: [
    { src: '/vehicles/van-int-1.jpg', alt: 'Business Van interior view 1' },
    { src: '/vehicles/van-int-2.jpg', alt: 'Business Van interior view 2' },
    { src: '/vehicles/van-int-3.jpg', alt: 'Business Van interior view 3' },
  ],
}

const CLASS_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

// Check prefers-reduced-motion synchronously (safe: runs only client-side in useEffect)
function checkReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface VehicleSlideshowProps {
  activeClass?: VehicleClass | null
}

export default function VehicleSlideshow({ activeClass }: VehicleSlideshowProps = {}) {
  const resolvedClass = activeClass ?? 'business'
  const slides = SLIDES_BY_CLASS[resolvedClass] ?? SLIDES_BY_CLASS.business

  const [activeIndex, setActiveIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Use ref for pause-on-hover — avoids triggering setInterval re-creation
  const pausedRef = useRef(false)

  // Reset index when class changes
  useEffect(() => {
    setActiveIndex(0)
  }, [resolvedClass])

  // Auto-play setInterval with cleanup (T-59-11)
  // Reduced-motion check runs synchronously at effect time to avoid async state race
  useEffect(() => {
    const reducedMotion = checkReducedMotion()
    if (reducedMotion) return

    const slidesLen = slides.length
    intervalRef.current = setInterval(() => {
      if (!pausedRef.current) {
        setActiveIndex((prev) => (prev + 1) % slidesLen)
      }
    }, 4000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [slides.length])

  function handlePrev() {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length)
  }

  function handleNext() {
    setActiveIndex((prev) => (prev + 1) % slides.length)
  }

  const classLabel = CLASS_LABELS[resolvedClass] ?? resolvedClass
  // Derive for rendering transition (no state needed — check each render)
  const reducedMotionRender =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  return (
    <div
      style={{ marginTop: 32, position: 'relative' }}
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
    >
      {/* Slideshow container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3/2',
          overflow: 'hidden',
          borderRadius: 4,
          background: 'var(--anthracite-mid)',
        }}
        aria-label={`${classLabel} interior slideshow`}
        aria-live="polite"
      >
        {/* All slides rendered; only the active one is visible */}
        {slides.map((slide, index) => (
          <div
            key={slide.src}
            data-index={index}
            data-active={index === activeIndex ? 'true' : undefined}
            aria-current={index === activeIndex ? 'true' : undefined}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: index === activeIndex ? 1 : 0,
              transition: reducedMotionRender ? 'none' : 'opacity 0.5s ease-in-out',
            }}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              style={{ objectFit: 'cover' }}
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        ))}

        {/* Prev button — 32px hit area, copper, aria-labelled */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={handlePrev}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            color: 'var(--copper)',
            zIndex: 2,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Next button — 32px hit area, copper, aria-labelled */}
        <button
          type="button"
          aria-label="Next slide"
          onClick={handleNext}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            color: 'var(--copper)',
            zIndex: 2,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Dot indicators */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 6,
            zIndex: 2,
          }}
        >
          {slides.map((_, index) => (
            <span
              key={index}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: index === activeIndex ? 'var(--copper)' : 'rgba(255,255,255,0.5)',
                display: 'block',
              }}
            />
          ))}
        </div>
      </div>

      {/* Caption */}
      <p
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: 11,
          fontWeight: 400,
          color: 'var(--warmgrey)',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          marginTop: 8,
          textAlign: 'center',
        }}
      >
        {classLabel} interior
      </p>
    </div>
  )
}
