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
vi.mock('@/app/admin/login/actions', () => ({
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

  it('all nav links have 44px minimum touch target', () => {
    render(<AdminSidebar />)
    const links = screen.getAllByRole('link')
    links.forEach((link) => {
      const style = link.getAttribute('style') || ''
      expect(style).toContain('min-height')
    })
  })
})
