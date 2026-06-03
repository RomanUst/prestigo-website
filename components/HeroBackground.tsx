'use client'

import Image from 'next/image'
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react'

/**
 * Parallax background for the Hero.
 *
 * The two cover images (desktop + mobile crop) drift slower than the page
 * scroll and gently zoom, creating depth behind the headline. The wrapper
 * clips with overflow-hidden; the motion layer is oversized (inset -20%) so
 * the translate/scale never reveals an edge.
 *
 * Images are still server-rendered (priority + fetchPriority high) so the
 * Hero LCP is unaffected — Motion only adds transforms on hydration.
 * Respects prefers-reduced-motion: parallax is disabled, image stays static.
 */
export default function HeroBackground() {
  const reduced = useReducedMotion()

  // Pixel-based window scroll — the most reliable hero parallax driver.
  // Maps the first ~viewport-height of scroll to a gentle drift + zoom.
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 800], ['0%', '10%'], { clamp: true })
  const scale = useTransform(scrollY, [0, 800], [1, 1.1], { clamp: true })

  const motionStyle = reduced ? undefined : { y, scale }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div className="absolute inset-[-20%] will-change-transform" style={motionStyle}>
        {/* Desktop (landscape) */}
        <Image
          src="/photohero.avif"
          alt="Prestigo premium chauffeur — Prague airport transfer"
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          className="hidden sm:block"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />

        {/* Mobile (portrait crop) */}
        <Image
          src="/photohero-mobile.avif"
          alt="Prestigo premium chauffeur — Prague airport transfer"
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          className="sm:hidden"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
      </motion.div>
    </div>
  )
}
