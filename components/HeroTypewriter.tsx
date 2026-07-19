'use client'

import { useState, useEffect } from 'react'

// words[0] must stay the visually widest phrase: the rotator renders as its
// own block line, so every later swap paints a line no wider than the first.
// A wider later paint would register as a new, later LCP candidate and
// inflate the reported LCP by many seconds (observed 11.9 s in lab runs).
const words = [
  'Chauffeur Service',
  'Airport Transfer',
  'Private Driver',
  'Luxury Transport',
  'Business Travel',
]

export default function HeroTypewriter() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [interacted, setInteracted] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Rotation only starts after the first user interaction. The LCP metric
  // stops updating at the first input/scroll, so a post-interaction rotation
  // can never register as a new LCP candidate — while a rotation that runs
  // before any input re-paints the (briefly opacity-0) span and Chrome
  // records the swapped word as a fresh, later LCP (observed 10.5 s in lab).
  useEffect(() => {
    if (interacted) return
    const start = () => setInteracted(true)
    const events: Array<keyof WindowEventMap> = ['scroll', 'pointerdown', 'keydown', 'touchstart', 'wheel']
    events.forEach(e => window.addEventListener(e, start, { once: true, passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, start))
  }, [interacted])

  useEffect(() => {
    if (reducedMotion || !interacted) return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % words.length)
        setVisible(true)
      }, 350)
    }, 2500)
    return () => clearInterval(interval)
  }, [reducedMotion, interacted])

  return (
    <span
      style={{
        color: 'var(--offwhite)',
        display: 'block',
        whiteSpace: 'nowrap',
        transition: reducedMotion ? 'none' : 'opacity 0.35s ease, transform 0.35s ease',
        opacity: visible ? 1 : 0,
        transform: reducedMotion || visible ? 'translateY(0px)' : 'translateY(-10px)',
      }}
    >
      {words[index]}
    </span>
  )
}
