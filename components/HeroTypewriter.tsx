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

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (reducedMotion) return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % words.length)
        setVisible(true)
      }, 350)
    }, 2500)
    return () => clearInterval(interval)
  }, [reducedMotion])

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
