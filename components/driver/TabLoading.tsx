'use client'

import { usePathname } from 'next/navigation'

// Phase 94 plan 94-10 (UI-SPEC "Loading and error"): the page title plus three static placeholder cards while a tab loads.
// No animation (reduced-motion safe). One component for all tabs: the title comes from the current path.

const TABS: Array<{ prefix: string; title: string; label: string }> = [
  { prefix: '/driver/rides', title: 'Rides', label: 'Loading rides' },
  { prefix: '/driver/offers', title: 'Offers', label: 'Loading offers' },
  { prefix: '/driver/you', title: 'You', label: 'Loading profile' },
]

export default function TabLoading() {
  const pathname = usePathname() ?? ''
  const tab = TABS.find((t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`)) ?? TABS[0]

  return (
    <div
      role="region"
      aria-busy="true"
      aria-label={tab.label}
      style={{ flex: 1, fontFamily: 'var(--font-montserrat)', color: 'var(--admin-text)' }}
    >
      <h1
        style={{
          margin: '8px 24px 16px',
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-display)',
          fontWeight: 500,
        }}
      >
        {tab.title}
      </h1>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-placeholder
          aria-hidden="true"
          style={{
            height: '80px',
            margin: '0 24px 8px',
            background: 'var(--admin-hover)',
            borderRadius: 'var(--admin-radius-md)',
          }}
        />
      ))}
    </div>
  )
}
