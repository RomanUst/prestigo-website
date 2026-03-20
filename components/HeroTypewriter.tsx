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

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % words.length)
        setVisible(true)
      }, 350)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <h1 className="display text-[52px] md:text-[68px] lg:text-[76px] animate-on-load delay-300 mb-2">
      <span
        style={{
          color: 'var(--copper)',
          display: 'inline-block',
          transition: 'opacity 0.35s ease, transform 0.35s ease',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0px)' : 'translateY(-10px)',
        }}
      >
        {words[index]}
      </span>
      {' '}in Prague,
    </h1>
  )
}
