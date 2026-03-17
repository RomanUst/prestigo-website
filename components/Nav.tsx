'use client'

import { useState, useEffect } from 'react'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-anthracite/95 backdrop-blur-sm border-b border-anthracite-light'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">

        {/* Wordmark */}
        <a href="/" className="wordmark tracking-[0.6em]">
          <span className="wordmark-presti">PRESTI</span>
          <span className="wordmark-go">GO</span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: 'Services', href: '#services' },
            { label: 'Fleet', href: '#fleet' },
            { label: 'Routes', href: '#routes' },
            { label: 'Corporate', href: '/corporate' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-body font-light text-[10px] tracking-[0.2em] uppercase text-warmgrey hover:text-offwhite transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a href="#book" className="btn-primary" style={{ padding: '10px 24px', fontSize: '9px' }}>
            Book now
          </a>
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden flex flex-col gap-[5px] p-2"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          <span className={`w-5 h-px bg-offwhite transition-all ${open ? 'rotate-45 translate-y-[6px]' : ''}`} />
          <span className={`w-5 h-px bg-offwhite transition-all ${open ? 'opacity-0' : ''}`} />
          <span className={`w-5 h-px bg-offwhite transition-all ${open ? '-rotate-45 -translate-y-[6px]' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-anthracite-mid border-t border-anthracite-light px-6 py-6 flex flex-col gap-5">
          {[
            { label: 'Services', href: '#services' },
            { label: 'Fleet', href: '#fleet' },
            { label: 'Routes', href: '#routes' },
            { label: 'Corporate', href: '/corporate' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="font-body font-light text-[11px] tracking-[0.2em] uppercase text-warmgrey hover:text-offwhite transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a href="#book" onClick={() => setOpen(false)} className="btn-primary text-center mt-2">
            Book now
          </a>
        </div>
      )}
    </nav>
  )
}
