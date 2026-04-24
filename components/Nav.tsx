'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

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
        <Link href="/" className="wordmark tracking-[0.6em] inline-flex items-center h-16" aria-label="PRESTIGO — home">
          <span className="wordmark-presti">PRESTI</span>
          <span className="wordmark-go">GO</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: 'Services', href: '/services' },
            { label: 'Fleet', href: '/fleet' },
            { label: 'Routes', href: '/routes' },
            { label: 'Multi-day', href: '/book/multi-day', isNew: true },
            { label: 'Corporate', href: '/corporate' },
            { label: 'Contact', href: '/contact' },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`font-body font-light text-[10px] tracking-[0.2em] uppercase transition-colors flex items-center gap-2 ${
                pathname === link.href ? 'text-offwhite' : 'text-warmgrey hover:text-offwhite'
              }`}
            >
              {link.label}
              {link.isNew && (
                <span className="font-body font-light text-[9px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
              )}
            </Link>
          ))}
          <Link
            href="/calculator"
            className={`font-body font-light text-[10px] tracking-[0.2em] uppercase transition-colors flex items-center gap-2 ${
              pathname === '/calculator' ? 'text-offwhite' : 'text-warmgrey hover:text-offwhite'
            }`}
          >
            Get instant quote
          </Link>
          <Link href="/book" className="btn-primary" style={{ padding: '10px 24px', fontSize: '10px' }}>
            Book now
          </Link>
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden flex flex-col justify-center gap-[5px] p-3 -mr-1 min-h-[44px] min-w-[44px]"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <span className={`w-5 h-px bg-offwhite transition-all ${open ? 'rotate-45 translate-y-[6px]' : ''}`} />
          <span className={`w-5 h-px bg-offwhite transition-all ${open ? 'opacity-0' : ''}`} />
          <span className={`w-5 h-px bg-offwhite transition-all ${open ? '-rotate-45 -translate-y-[6px]' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        aria-hidden={!open}
        className={`md:hidden bg-anthracite-mid border-anthracite-light px-6 flex flex-col overflow-hidden transition-all duration-300 ease-out ${
          open ? 'max-h-[500px] py-4 border-t opacity-100' : 'max-h-0 py-0 opacity-0 pointer-events-none'
        }`}
      >
        {[
          { label: 'Services', href: '/services' },
          { label: 'Fleet', href: '/fleet' },
          { label: 'Routes', href: '/routes' },
          { label: 'Multi-day', href: '/book/multi-day', isNew: true },
          { label: 'Corporate', href: '/corporate' },
          { label: 'Contact', href: '/contact' },
        ].map((link) => (
          <Link
            key={link.label}
            href={link.href}
            onClick={() => setOpen(false)}
            className={`font-body font-light text-[11px] tracking-[0.2em] uppercase transition-colors flex items-center gap-2 min-h-[44px] ${
              pathname === link.href ? 'text-offwhite' : 'text-warmgrey hover:text-offwhite'
            }`}
          >
            {link.label}
            {link.isNew && (
              <span className="font-body font-light text-[9px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
            )}
          </Link>
        ))}
        <Link
          href="/calculator"
          onClick={() => setOpen(false)}
          className={`font-body font-light text-[11px] tracking-[0.2em] uppercase transition-colors flex items-center gap-2 min-h-[44px] ${
            pathname === '/calculator' ? 'text-offwhite' : 'text-warmgrey hover:text-offwhite'
          }`}
        >
          Get instant quote
        </Link>
        <Link href="/book" onClick={() => setOpen(false)} className="btn-primary text-center mt-3">
          Book now
        </Link>
      </div>
    </nav>
  )
}
