'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { signOut } from '@/app/(internal)/admin/login/actions'
import { useAdminShell } from '@/components/admin/AdminShell'

const navItems = [
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/zones', label: 'Zones' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/drivers', label: 'Drivers' },
  { href: '/admin/promo-codes', label: 'Promos' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/stats', label: 'Stats' },
  { href: '/admin/outbox', label: 'Outbox' },
  { href: '/admin/identities', label: 'Identities' },
  { href: '/admin/erasure', label: 'Erasure' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { sidebar, toggleSidebar } = useAdminShell()
  const collapsed = sidebar === 'collapsed'

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
          alignItems: 'center',
          justifyContent: 'center',
          background: '#28282B',
          border: '1px solid #4E4E56',
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
        id="admin-sidebar"
        className={`admin-aside ${open ? 'flex' : 'hidden md:flex'}`}
        style={{ fontFamily: 'var(--font-montserrat)' }}
      >
        {/* Header */}
        <div
          className="admin-sidebar-header"
          style={{ padding: '24px 20px', borderBottom: '1px solid #4E4E56' }}
        >
          <div>
            <span style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '20px',
              color: '#F5F2EE',
              letterSpacing: '0.12em',
            }}>PRESTIGO</span>
            <span style={{
              display: 'block',
              fontSize: '11px',
              color: '#CFC9C2',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              marginTop: '4px',
            }}>Admin</span>
          </div>
          <button
            type="button"
            className="admin-icon-btn admin-collapse-btn"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
          >
            {collapsed
              ? <PanelLeftOpen size={20} aria-hidden="true" />
              : <PanelLeftClose size={20} aria-hidden="true" />}
          </button>
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
                    className="admin-nav-item"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 44,
                      padding: '0 20px',
                      fontSize: '13px',
                      color: isActive ? '#F5F2EE' : '#CFC9C2',
                      textDecoration: 'none',
                      letterSpacing: '0.08em',
                      borderLeft: isActive ? '3px solid #B87333' : '3px solid transparent',
                      paddingLeft: isActive ? '17px' : '20px',
                      transition: 'color 150ms ease',
                    }}
                  ><span className="admin-nav-label">{item.label}</span></Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Sign out */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #4E4E56' }}>
          <form action={signOut}>
            <button type="submit" style={{
              background: 'none',
              border: 'none',
              color: '#CFC9C2',
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
