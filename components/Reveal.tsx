'use client'

import { useEffect, useRef, useState } from 'react'

type RevealVariant = 'up' | 'fade' | 'left' | 'right' | 'clip'

interface RevealProps {
  children: React.ReactNode
  /** Animation variant */
  variant?: RevealVariant
  /** Extra delay in ms — use for stagger effects */
  delay?: number
  /** Additional classes forwarded to the wrapper div */
  className?: string
}

/**
 * Reveals children with a scroll-triggered animation.
 * Fires once via IntersectionObserver, then disconnects.
 * Respects prefers-reduced-motion via CSS.
 */
export default function Reveal({
  children,
  variant = 'up',
  delay = 0,
  className = '',
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      // Trigger slightly before the element fully enters the viewport
      { threshold: 0.1, rootMargin: '0px 0px -48px 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${visible ? `reveal-${variant}` : 'reveal-hidden'} ${className}`.trim()}
      style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
