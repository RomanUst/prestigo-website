import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
import AdminShell from '@/components/admin/AdminShell'

function clearPrefCookies() {
  document.cookie = 'admin_sidebar=; Path=/admin; Max-Age=0'
  document.cookie = 'admin_theme=; Path=/admin; Max-Age=0'
}

function cookieEntries(name: string): string[] {
  return document.cookie.split('; ').filter((c) => c.startsWith(`${name}=`))
}

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

describe('AdminSidebar collapse toggle (ADM-01, D-13, tracer)', () => {
  afterEach(() => {
    clearPrefCookies()
    window.history.pushState({}, '', '/')
  })

  function mountInShell(initialSidebar: 'expanded' | 'collapsed' = 'expanded') {
    // Path=/admin cookies are only readable from a URL below /admin.
    window.history.pushState({}, '', '/admin/bookings')
    return render(
      <AdminShell initialTheme="light" initialSidebar={initialSidebar}>
        <AdminSidebar />
      </AdminShell>,
    )
  }

  it('collapses and expands, flipping data-admin-sidebar, the label, aria-expanded and the cookie', () => {
    const { container } = mountInShell()
    const wrapper = container.querySelector('.admin-shell') as HTMLElement
    expect(wrapper.getAttribute('data-admin-sidebar')).toBe('expanded')

    const collapse = screen.getByLabelText('Collapse sidebar')
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    expect(collapse.getAttribute('aria-controls')).toBe('admin-sidebar')
    expect(document.getElementById('admin-sidebar')).not.toBeNull()

    fireEvent.click(collapse)
    expect(wrapper.getAttribute('data-admin-sidebar')).toBe('collapsed')
    const expand = screen.getByLabelText('Expand sidebar')
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    expect(cookieEntries('admin_sidebar')).toEqual(['admin_sidebar=collapsed'])

    fireEvent.click(expand)
    expect(wrapper.getAttribute('data-admin-sidebar')).toBe('expanded')
    expect(cookieEntries('admin_sidebar')).toEqual(['admin_sidebar=expanded'])
  })

  it('the collapse button is a button and does not match the hamburger label', () => {
    mountInShell()
    const collapse = screen.getByLabelText('Collapse sidebar')
    expect(collapse.tagName).toBe('BUTTON')
    expect(screen.getAllByLabelText(/open menu/i)).toHaveLength(1)
  })

  it('keeps labels in the DOM while collapsed (visually hidden, never removed)', () => {
    mountInShell('collapsed')
    expect(screen.getByText('Promos')).toBeDefined()
    expect(screen.getByText('Bookings')).toBeDefined()
  })
})
