'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/admin/login/actions'

const navItems = [
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/zones', label: 'Zones' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/stats', label: 'Stats' },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside
      style={{
        width: '240px',
        minHeight: '100vh',
        backgroundColor: 'var(--anthracite)',
        borderRight: '1px solid var(--anthracite-light)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div
        style={{
          padding: '24px 20px',
          borderBottom: '1px solid var(--anthracite-light)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '20px',
            color: 'var(--offwhite)',
            letterSpacing: '0.12em',
          }}
        >
          PRESTIGO
        </span>
        <span
          style={{
            display: 'block',
            fontSize: '11px',
            color: 'var(--warmgrey)',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginTop: '4px',
          }}
        >
          Admin
        </span>
      </div>

      <nav style={{ flex: 1, padding: '16px 0' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: 'block',
                    padding: '10px 20px',
                    fontSize: '13px',
                    color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
                    textDecoration: 'none',
                    letterSpacing: '0.08em',
                    borderLeft: isActive ? '3px solid var(--copper)' : '3px solid transparent',
                    paddingLeft: isActive ? '17px' : '20px',
                    transition: 'color 150ms ease',
                  }}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--anthracite-light)',
        }}
      >
        <form action={signOut}>
          <button
            type="submit"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--warmgrey)',
              fontSize: '11px',
              fontFamily: 'var(--font-montserrat)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: '8px 0',
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
