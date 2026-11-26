'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Inbox, User } from 'lucide-react'
import type { ComponentType } from 'react'

// Phase 94 plan 94-06 (D-02, UI-SPEC "Bottom tab bar"): Rides / Offers / You. English only, light theme tokens only.
// The Offers badge is aria-hidden; the link's own accessible name carries the count ("Offers, 3 new").

interface Tab {
  href: string
  label: string
  Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

const TABS: Tab[] = [
  { href: '/driver/rides', label: 'Rides', Icon: CalendarDays },
  { href: '/driver/offers', label: 'Offers', Icon: Inbox },
  { href: '/driver/you', label: 'You', Icon: User },
]

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function CabinetTabBar({ offersCount }: { offersCount: number }) {
  const pathname = usePathname()
  const count = Number.isFinite(offersCount) && offersCount > 0 ? Math.floor(offersCount) : 0

  return (
    <nav
      aria-label="Cabinet"
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        display: 'flex',
        flexShrink: 0,
        background: 'var(--admin-surface)',
        borderTop: '1px solid var(--admin-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href)
        const showBadge = href === '/driver/offers' && count > 0
        return (
          <Link
            key={href}
            href={href}
            className="driver-tab-link"
            data-driver-focus
            aria-current={active ? 'page' : undefined}
            aria-label={showBadge ? `${label}, ${count} new` : undefined}
            style={{
              position: 'relative',
              flex: 1,
              minHeight: '64px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              textDecoration: 'none',
              color: active ? 'var(--admin-accent-text)' : 'var(--admin-text-muted)',
              fontSize: 'var(--driver-fs-label)',
              fontWeight: 500,
            }}
          >
            {active && (
              <span
                aria-hidden="true"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--admin-accent)' }}
              />
            )}
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon size={24} aria-hidden="true" />
              {showBadge && (
                <span
                  data-offers-badge
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '14px',
                    minWidth: '20px',
                    height: '20px',
                    padding: '0 4px',
                    boxSizing: 'border-box',
                    borderRadius: '10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--admin-accent)',
                    color: 'var(--admin-on-accent)',
                    fontSize: 'var(--driver-fs-label)',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}
                >
                  {count > 9 ? '9+' : String(count)}
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
