'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { customerSignOut } from '@/app/login/actions'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Memoize so the browser client isn't re-instantiated on every render.
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Auth state subscription — client-side only (D-09: no server auth call)
  useEffect(() => {
    let active = true
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  // Close dropdown on navigation
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Close dropdown on Escape key
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 bg-anthracite/95 backdrop-blur-sm ${
        scrolled ? 'border-b border-anthracite-light' : ''
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

          {/* Auth affordance + Book now wrapper */}
          <div className="flex items-center gap-3">
            {!user ? (
              /* NAV-01: Guest Sign in button */
              <Link
                href="/login"
                className="btn-ghost"
                style={{ padding: '10px 20px', fontSize: '10px' }}
              >
                Sign in
              </Link>
            ) : (
              /* NAV-02: Signed-in account trigger + dropdown */
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-1.5 min-h-[44px]"
                >
                  {/* Initial circle */}
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '9999px',
                      background: 'var(--anthracite-mid)',
                      border: `1px solid var(--anthracite-light)`,
                      color: 'var(--offwhite)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      letterSpacing: '0.1em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {user.email?.[0]?.toUpperCase() ?? '?'}
                  </span>
                  {/* Chevron */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                    style={{
                      color: 'var(--warmgrey)',
                      transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Dropdown panel */}
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: '8px',
                    minWidth: '160px',
                    background: 'var(--anthracite-mid)',
                    border: '1px solid var(--anthracite-light)',
                    borderRadius: '4px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    padding: '8px',
                    opacity: menuOpen ? 1 : 0,
                    pointerEvents: menuOpen ? 'auto' : 'none',
                    transition: 'opacity 0.15s ease-out',
                  }}
                >
                  <Link
                    href="/account/trips"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 16px',
                      minHeight: '44px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--warmgrey)',
                      textDecoration: 'none',
                      transition: 'background 0.15s, color 0.15s',
                      borderRadius: '2px',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.color = 'var(--offwhite)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--warmgrey)'
                    }}
                  >
                    My trips
                  </Link>
                  <Link
                    href="/account/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 16px',
                      minHeight: '44px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--warmgrey)',
                      textDecoration: 'none',
                      transition: 'background 0.15s, color 0.15s',
                      borderRadius: '2px',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.color = 'var(--offwhite)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--warmgrey)'
                    }}
                  >
                    Profile
                  </Link>
                  {/* Divider */}
                  <div style={{ height: '1px', background: 'var(--anthracite-light)', margin: '4px 8px' }} />
                  <form action={customerSignOut}>
                    <button
                      type="submit"
                      role="menuitem"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        padding: '12px 16px',
                        minHeight: '44px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-montserrat)',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: 'var(--warmgrey)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s, color 0.15s',
                        borderRadius: '2px',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                        e.currentTarget.style.color = 'var(--offwhite)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--warmgrey)'
                      }}
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            )}

            <Link href="/book" className="btn-primary" style={{ padding: '10px 24px', fontSize: '10px' }}>
              Book now
            </Link>
          </div>
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
          open ? 'max-h-[600px] py-4 border-t opacity-100' : 'max-h-0 py-0 opacity-0 pointer-events-none'
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

        {/* Mobile auth affordance */}
        {!user ? (
          /* NAV-01 mobile: full-width Sign in above Book now */
          <Link
            href="/login"
            className="btn-ghost text-center mt-2 mb-1"
            onClick={() => setOpen(false)}
          >
            Sign in
          </Link>
        ) : open ? (
          /* NAV-02 mobile: My trips, Profile, Sign out rows — only rendered when menu is open */
          <>
            <Link
              href="/account/trips"
              onClick={() => setOpen(false)}
              className="font-body font-light text-[11px] tracking-[0.2em] uppercase transition-colors text-warmgrey hover:text-offwhite min-h-[44px] flex items-center"
            >
              My trips
            </Link>
            <Link
              href="/account/profile"
              onClick={() => setOpen(false)}
              className="font-body font-light text-[11px] tracking-[0.2em] uppercase transition-colors text-warmgrey hover:text-offwhite min-h-[44px] flex items-center"
            >
              Profile
            </Link>
            <form action={customerSignOut}>
              <button
                type="submit"
                className="font-body font-light text-[11px] tracking-[0.2em] uppercase transition-colors text-warmgrey hover:text-offwhite min-h-[44px] flex items-center w-full text-left bg-transparent border-none cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </>
        ) : null}

        <Link href="/book" onClick={() => setOpen(false)} className="btn-primary text-center mt-3">
          Book now
        </Link>
      </div>
    </nav>
  )
}
