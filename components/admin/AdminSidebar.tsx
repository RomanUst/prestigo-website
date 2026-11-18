'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Building2,
  CalendarCheck,
  Car,
  ChartColumn,
  Eraser,
  FileText,
  IdCard,
  LogOut,
  Map as MapIcon,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings,
  Sun,
  Tag,
  Ticket,
  X,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/app/(internal)/admin/login/actions'
import { useAdminShell } from '@/components/admin/AdminShell'

// All colours, radii, fonts and the rail geometry live in
// app/(internal)/admin/admin-theme.css (Phase 86). This component carries
// structure and behaviour only: no colour literal may appear here (D-07).

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/admin/pricing', label: 'Pricing', icon: Tag },
  { href: '/admin/zones', label: 'Zones', icon: MapIcon },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/admin/quotes', label: 'Quotes', icon: FileText },
  { href: '/admin/accounts', label: 'Accounts', icon: Building2 },
  { href: '/admin/drivers', label: 'Drivers', icon: Car },
  { href: '/admin/promo-codes', label: 'Promos', icon: Ticket },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/stats', label: 'Stats', icon: ChartColumn },
  { href: '/admin/outbox', label: 'Outbox', icon: Send },
  { href: '/admin/identities', label: 'Identities', icon: IdCard },
  { href: '/admin/erasure', label: 'Erasure', icon: Eraser },
]

const SHORTCUT_HINT = 'Ctrl+\\ or Cmd+\\'
const TOOLTIP_DELAY_MS = 300

interface RailTip {
  label: string
  hint?: string
  top: number
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { theme, sidebar, toggleTheme, toggleSidebar } = useAdminShell()
  const collapsed = sidebar === 'collapsed'

  // Rail tooltip: one fixed-position element, so the scrolling nav cannot clip it.
  const [tip, setTip] = useState<RailTip | null>(null)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTip = useCallback(() => {
    if (tipTimer.current) {
      clearTimeout(tipTimer.current)
      tipTimer.current = null
    }
    setTip(null)
  }, [])

  useEffect(() => {
    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current)
    }
  }, [])

  // Checked at event time, never during render, so there is no hydration mismatch.
  const railIsActive = () =>
    collapsed && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches

  const tipHandlers = (label: string, hint?: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (!railIsActive()) return
      const rect = e.currentTarget.getBoundingClientRect()
      const top = rect.top + rect.height / 2
      if (tipTimer.current) clearTimeout(tipTimer.current)
      tipTimer.current = setTimeout(() => {
        tipTimer.current = null
        setTip({ label, hint, top })
      }, TOOLTIP_DELAY_MS)
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (!railIsActive()) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (tipTimer.current) {
        clearTimeout(tipTimer.current)
        tipTimer.current = null
      }
      setTip({ label, hint, top: rect.top + rect.height / 2 })
    },
    onMouseLeave: clearTip,
    onBlur: clearTip,
  })

  const handleToggleSidebar = useCallback(() => {
    clearTip()
    toggleSidebar()
  }, [clearTip, toggleSidebar])

  // D-15: Ctrl+\ or Cmd+\ collapses/expands. Layout-independent match (key or
  // code) because the backslash sits behind AltGr on Czech keyboards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (!(e.key === '\\' || e.code === 'Backslash')) return
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
      ) {
        return
      }
      if (document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      handleToggleSidebar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleToggleSidebar])

  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  const collapseLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        className="md:hidden admin-hamburger"
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
          cursor: 'pointer',
        }}
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      {/* Backdrop overlay — mobile only when open */}
      {open && (
        <div
          className="md:hidden admin-backdrop"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
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
        <div className="admin-sidebar-header">
          <div>
            <span className="admin-wordmark">PRESTIGO</span>
            <span className="admin-sublabel">Admin</span>
          </div>
          <button
            type="button"
            className="admin-icon-btn admin-collapse-btn"
            onClick={handleToggleSidebar}
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            {...tipHandlers(collapseLabel, SHORTCUT_HINT)}
          >
            {collapsed
              ? <PanelLeftOpen size={20} aria-hidden="true" />
              : <PanelLeftClose size={20} aria-hidden="true" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="admin-nav">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="admin-nav-item"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    style={{ minHeight: 44 }}
                    {...tipHandlers(item.label)}
                  >
                    <Icon size={20} aria-hidden="true" className="admin-nav-icon" />
                    <span className="admin-nav-label">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer: theme toggle and sign out, pinned under the scrolling nav */}
        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-icon-btn"
            onClick={toggleTheme}
            aria-label={themeLabel}
            {...tipHandlers(themeLabel)}
          >
            {theme === 'dark'
              ? <Sun size={20} aria-hidden="true" />
              : <Moon size={20} aria-hidden="true" />}
          </button>
          <form action={signOut}>
            <button
              type="submit"
              className="admin-icon-btn admin-signout-btn"
              {...tipHandlers('Sign out')}
            >
              <LogOut size={20} aria-hidden="true" className="admin-nav-icon" />
              <span className="admin-nav-label">Sign out</span>
            </button>
          </form>
        </div>

        {tip && collapsed && (
          <span role="tooltip" className="admin-rail-tooltip" style={{ top: tip.top }}>
            {tip.label}
            {tip.hint && <span className="admin-rail-tooltip-hint">{tip.hint}</span>}
          </span>
        )}
      </aside>
    </>
  )
}
