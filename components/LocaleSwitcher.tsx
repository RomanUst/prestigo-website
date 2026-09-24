'use client'

/**
 * LocaleSwitcher — UX-01, Phase 74 Plan 05.
 *
 * A header dropdown listing all 7 locale endonyms (structural labels from
 * i18n/locales.ts, never messages/*.json — D-02). Selecting a row navigates
 * to the SAME page in the target locale via the @/i18n/routing navigation
 * bridge (router.replace(pathname, { locale })) — never string-concatenated,
 * never a home-jump (D-03). NEXT_LOCALE cookie persistence is handled
 * automatically by next-intl's own middleware on that navigation (verified
 * live in 74-05 Task 1 — RESEARCH Pattern 5 / Q3); this component never
 * hand-writes the cookie.
 *
 * Two variants:
 *   - 'dropdown' (default, desktop header): popover menu, below.
 *   - 'inline' (mobile menu): all 7 endonyms rendered in-flow as wrapping
 *     chips. The mobile menu clips overflow, so a popover there could not be
 *     scrolled to the lower languages (reported on iPhone, 2026-09-24).
 *
 * Modeled on Nav.tsx's existing account-menu dropdown: outside-click close,
 * Escape close, arrow-key menu navigation, RTL-safe `insetInlineEnd`
 * positioning, and the same chevron SVG (horizontally symmetric, no RTL
 * mirror needed).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/routing'
import { locales, LOCALE_ENDONYMS, type AppLocale } from '@/i18n/locales'

export default function LocaleSwitcher({ variant = 'dropdown' }: { variant?: 'dropdown' | 'inline' }) {
  const activeLocale = useLocale() as AppLocale
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const triggerId = `locale-switcher-trigger-${reactId}`
  const menuId = `locale-switcher-menu-${reactId}`

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close dropdown on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Arrow-key navigation for the ARIA menu role (matches Nav.tsx account-menu)
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      dropdownRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    )
    if (!items.length) return
    const idx = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(idx + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(idx - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    }
  }

  const selectLocale = (target: AppLocale) => {
    setOpen(false)
    // D-03: router.replace to the SAME pathname (usePathname() is already
    // locale-stripped) — only the locale changes. Never jump to home, never
    // build the URL via string concatenation. next-intl writes NEXT_LOCALE
    // automatically on this navigation (RESEARCH Pattern 5) — no
    // document.cookie write here.
    router.replace(pathname, { locale: target })
  }

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap gap-2 py-2">
        {locales.map((loc) => {
          const isActive = loc === activeLocale
          return (
            <button
              key={loc}
              type="button"
              lang={loc}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => selectLocale(loc)}
              className={`min-h-[44px] px-4 border font-body font-light text-[12px] transition-colors ${
                isActive
                  ? 'border-copper/60 text-copper-light'
                  : 'border-anthracite-light text-warmgrey hover:text-offwhite hover:border-warmgrey/40'
              }`}
            >
              {LOCALE_ENDONYMS[loc]}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        id={triggerId}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] font-body font-light text-[10px] tracking-[0.18em] uppercase text-warmgrey hover:text-offwhite transition-colors"
      >
        {activeLocale.toUpperCase()}
        {/* Chevron — same path as Nav.tsx's account-menu chevron. Horizontally
            symmetric about x=6, so it needs no RTL mirror (matches CR-01). */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{
            color: 'var(--warmgrey)',
            transform: `rotate(${open ? 180 : 0}deg)`,
            transition: 'transform 0.2s ease',
          }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        id={menuId}
        role="menu"
        aria-labelledby={triggerId}
        onKeyDown={handleMenuKeyDown}
        style={{
          position: 'absolute',
          insetInlineEnd: 0,
          top: '100%',
          marginTop: '8px',
          minWidth: '200px',
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '4px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          padding: '8px',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.15s ease-out',
        }}
      >
        {/* Fixed display order — never reorders to put the active locale
            first; only the active row's styling changes. */}
        {locales.map((loc) => {
          const isActive = loc === activeLocale
          return (
            <button
              key={loc}
              type="button"
              role="menuitem"
              aria-current={isActive ? 'true' : undefined}
              onClick={() => selectLocale(loc)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                width: '100%',
                padding: '12px 16px',
                minHeight: '44px',
                fontSize: '11px',
                fontFamily: 'var(--font-montserrat)',
                fontWeight: 400,
                // No text-transform: uppercase — endonyms are proper nouns
                // and uppercasing is meaningless for non-Latin scripts.
                color: isActive ? 'var(--copper-light)' : 'var(--warmgrey)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'start',
                transition: 'background 0.15s, color 0.15s',
                borderRadius: '2px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                if (!isActive) e.currentTarget.style.color = 'var(--offwhite)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                if (!isActive) e.currentTarget.style.color = 'var(--warmgrey)'
              }}
            >
              {LOCALE_ENDONYMS[loc]}
              {isActive && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M2.5 6l2.5 2.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
