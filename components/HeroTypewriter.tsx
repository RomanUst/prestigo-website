'use client'

import { useState, useEffect } from 'react'

const words = [
  'Chauffeur',
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
    <h1 className="display text-[52px] md:text-[68px] lg:text-[76px] animate-on-load delay-300 mb-2">
      <span
        style={{
          color: 'var(--copper)',
          display: 'inline-block',
          transition: reducedMotion ? 'none' : 'opacity 0.35s ease, transform 0.35s ease',
          opacity: visible ? 1 : 0,
          transform: reducedMotion || visible ? 'translateY(0px)' : 'translateY(-10px)',
        }}
      >
        {words[index]}
      </span>
      {' '}in Prague,
    </h1>
  )
}
