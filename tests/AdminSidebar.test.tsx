import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/bookings',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => <a href={href} {...props as React.AnchorHTMLAttributes<HTMLAnchorElement>}>{children}</a>,
}))

// Mock signOut server action
vi.mock('@/app/(internal)/admin/login/actions', () => ({
  signOut: vi.fn(),
}))

import AdminSidebar from '@/components/admin/AdminSidebar'

describe('AdminSidebar', () => {
  it('renders hamburger button on mobile (md:hidden class)', () => {
    render(<AdminSidebar />)
    const hamburger = screen.getByLabelText(/open menu/i)
    expect(hamburger).toBeDefined()
    expect(hamburger.className).toContain('md:hidden')
  })

  it('renders Promos nav item linking to /admin/promo-codes', () => {
    render(<AdminSidebar />)
    const promosLink = screen.getByText('Promos')
    expect(promosLink).toBeDefined()
    expect(promosLink.closest('a')?.getAttribute('href')).toBe('/admin/promo-codes')
  })

  it('renders Identities nav item linking to /admin/identities directly after Outbox', () => {
    render(<AdminSidebar />)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    const outbox = hrefs.indexOf('/admin/outbox')
    expect(outbox).toBeGreaterThanOrEqual(0)
    expect(hrefs[outbox + 1]).toBe('/admin/identities')
    expect(screen.getByText('Identities').closest('a')?.getAttribute('href')).toBe('/admin/identities')
  })

  it('renders Erasure nav item linking to /admin/erasure directly after Identities', () => {
    render(<AdminSidebar />)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    const identities = hrefs.indexOf('/admin/identities')
    expect(identities).toBeGreaterThanOrEqual(0)
    expect(hrefs[identities + 1]).toBe('/admin/erasure')
    expect(screen.getByText('Erasure').closest('a')?.getAttribute('href')).toBe('/admin/erasure')
  })

  it('all nav links have 44px minimum touch target', () => {
    render(<AdminSidebar />)
    const links = screen.getAllByRole('link')
    links.forEach((link) => {
      const style = link.getAttribute('style') || ''
      expect(style).toContain('min-height')
    })
  })
})
