'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { signOut } from '@/app/admin/login/actions'

const navItems = [
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/zones', label: 'Zones' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/promo-codes', label: 'Promos' },
  { href: '/admin/stats', label: 'Stats' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        className="md:hidden"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 60,
          minWidth: 44,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1C1C1E',
          border: '1px solid #3A3A3F',
          borderRadius: 4,
          color: '#F5F2EE',
          cursor: 'pointer',
        }}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop overlay — mobile only when open */}
      {open && (
        <div
          className="md:hidden"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 40,
          }}
        />
      )}

      {/* Sidebar — always visible on desktop, toggle on mobile */}
      <aside
        className={open ? 'flex' : 'hidden md:flex'}
        style={{
          width: 280,
          minHeight: '100vh',
          backgroundColor: '#1C1C1E',
          borderRight: '1px solid #3A3A3F',
          flexDirection: 'column',
          fontFamily: 'var(--font-montserrat)',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 50,
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #3A3A3F' }}>
          <span style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '20px',
            color: '#F5F2EE',
            letterSpacing: '0.12em',
          }}>PRESTIGO</span>
          <span style={{
            display: 'block',
            fontSize: '11px',
            color: '#9A958F',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginTop: '4px',
          }}>Admin</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 0' }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 44,
                      padding: '0 20px',
                      fontSize: '13px',
                      color: isActive ? '#F5F2EE' : '#9A958F',
                      textDecoration: 'none',
                      letterSpacing: '0.08em',
                      borderLeft: isActive ? '3px solid #B87333' : '3px solid transparent',
                      paddingLeft: isActive ? '17px' : '20px',
                      transition: 'color 150ms ease',
                    }}
                  >{item.label}</Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Sign out */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #3A3A3F' }}>
          <form action={signOut}>
            <button type="submit" style={{
              background: 'none',
              border: 'none',
              color: '#9A958F',
              fontSize: '11px',
              fontFamily: 'var(--font-montserrat)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              minHeight: 44,
              minWidth: 44,
              padding: '8px 0',
            }}>Sign out</button>
          </form>
        </div>
      </aside>
    </>
  )
}
