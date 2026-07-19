'use client'

import { getImageProps } from 'next/image'
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react'

/**
 * Parallax background for the Hero.
 *
 * The two cover crops (desktop + mobile) are served through a single
 * <picture> element instead of two stacked <Image priority> components:
 * two priority Images both emit an unconditional preload, so every device
 * downloaded BOTH hero files at highest priority, competing with the real
 * LCP. Here each <link rel="preload"> carries a media condition, so a
 * device preloads exactly one crop.
 *
 * Motion only adds transforms on hydration; the <img> itself is
 * server-rendered. Respects prefers-reduced-motion: parallax is disabled.
 */

const HERO_ALT = 'Chauffeur driving a Mercedes-Benz S-Class toward the Prague skyline at sunset'
// Tailwind `sm` breakpoint — keep in sync with the class-based crop switch below.
const DESKTOP_MEDIA = '(min-width: 640px)'
const MOBILE_MEDIA = '(max-width: 639px)'

export default function HeroBackground() {
  const reduced = useReducedMotion()

  // Pixel-based window scroll — the most reliable hero parallax driver.
  // Maps the first ~viewport-height of scroll to a gentle drift + zoom.
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 800], ['0%', '10%'], { clamp: true })
  const scale = useTransform(scrollY, [0, 800], [1, 1.1], { clamp: true })

  const motionStyle = reduced ? undefined : { y, scale }

  const { props: desktop } = getImageProps({
    src: '/photohero.jpg',
    alt: HERO_ALT,
    fill: true,
    sizes: '100vw',
  })
  const { props: mobile } = getImageProps({
    src: '/photohero-mobile.jpg',
    alt: HERO_ALT,
    fill: true,
    sizes: '100vw',
  })

  return (
    <div className="absolute inset-0 overflow-hidden">
      <link
        rel="preload"
        as="image"
        imageSrcSet={desktop.srcSet}
        imageSizes="100vw"
        media={DESKTOP_MEDIA}
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        imageSrcSet={mobile.srcSet}
        imageSizes="100vw"
        media={MOBILE_MEDIA}
        fetchPriority="high"
      />
      <motion.div className="absolute inset-[-20%] will-change-transform" style={motionStyle}>
        <picture>
          <source media={DESKTOP_MEDIA} srcSet={desktop.srcSet} sizes="100vw" />
          <img
            {...mobile}
            alt={HERO_ALT}
            loading="eager"
            fetchPriority="high"
            style={{ ...mobile.style, objectFit: 'cover', objectPosition: 'center' }}
          />
        </picture>
      </motion.div>
    </div>
  )
}
