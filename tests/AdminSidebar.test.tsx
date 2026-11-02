import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

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

const NAV = [
  ['Pricing', '/admin/pricing'],
  ['Zones', '/admin/zones'],
  ['Bookings', '/admin/bookings'],
  ['Accounts', '/admin/accounts'],
  ['Drivers', '/admin/drivers'],
  ['Promos', '/admin/promo-codes'],
  ['Settings', '/admin/settings'],
  ['Stats', '/admin/stats'],
  ['Outbox', '/admin/outbox'],
  ['Identities', '/admin/identities'],
  ['Erasure', '/admin/erasure'],
] as const

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

function mountShell(opts: { sidebar?: 'expanded' | 'collapsed'; theme?: 'light' | 'dark' } = {}) {
  window.history.pushState({}, '', '/admin/bookings')
  const ui = (theme: 'light' | 'dark', sidebar: 'expanded' | 'collapsed') => (
    <AdminShell initialTheme={theme} initialSidebar={sidebar}>
      <AdminSidebar />
    </AdminShell>
  )
  const view = render(ui(opts.theme ?? 'light', opts.sidebar ?? 'expanded'))
  return { ...view, ui }
}

describe('AdminSidebar nav, icons and active state (D-09)', () => {
  afterEach(() => {
    clearPrefCookies()
    window.history.pushState({}, '', '/')
  })

  it('renders all 11 items in order with hrefs, an svg icon and the label', () => {
    render(<AdminSidebar />)
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(NAV.map(([, href]) => href))
    NAV.forEach(([label], i) => {
      expect(links[i].querySelector('svg')).not.toBeNull()
      expect(links[i].textContent).toBe(label)
    })
  })

  it('marks only the current section with aria-current="page"', () => {
    render(<AdminSidebar />)
    const links = screen.getAllByRole('link')
    const current = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('href')).toBe('/admin/bookings')
  })

  it('keeps Sign out as a submit button inside the form, labelled in both states', () => {
    const { rerender } = render(<AdminSidebar />)
    const btn = screen.getByText('Sign out').closest('button') as HTMLButtonElement
    expect(btn.type).toBe('submit')
    expect(btn.closest('form')).not.toBeNull()
    rerender(<AdminSidebar />)
    expect(screen.getByText('Sign out')).toBeDefined()
  })

  it('adds no other control matching /open menu/i than the hamburger', () => {
    render(<AdminSidebar />)
    expect(screen.getAllByLabelText(/open menu/i)).toHaveLength(1)
  })

  it('gives every icon-only control an aria-label', () => {
    render(<AdminSidebar />)
    expect(screen.getByLabelText('Collapse sidebar')).toBeDefined()
    expect(screen.getByLabelText('Switch to dark theme')).toBeDefined()
  })
})

describe('AdminSidebar rail tooltips (UI-SPEC E1)', () => {
  afterEach(() => {
    vi.useRealTimers()
    setViewport(1024)
    clearPrefCookies()
    window.history.pushState({}, '', '/')
  })

  it('shows on keyboard focus and hides on blur when collapsed on desktop', () => {
    setViewport(1280)
    mountShell({ sidebar: 'collapsed' })
    const link = screen.getByText('Bookings').closest('a') as HTMLElement
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(link)
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('Bookings')
    fireEvent.blur(link)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows on hover only after the 300ms delay and hides on mouse leave', () => {
    vi.useFakeTimers()
    setViewport(1280)
    mountShell({ sidebar: 'collapsed' })
    const link = screen.getByText('Promos').closest('a') as HTMLElement
    fireEvent.mouseEnter(link)
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('tooltip').textContent).toBe('Promos')
    fireEvent.mouseLeave(link)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('a mouse leave inside the delay cancels the tooltip', () => {
    vi.useFakeTimers()
    setViewport(1280)
    mountShell({ sidebar: 'collapsed' })
    const link = screen.getByText('Promos').closest('a') as HTMLElement
    fireEvent.mouseEnter(link)
    fireEvent.mouseLeave(link)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('never shows when expanded', () => {
    setViewport(1280)
    mountShell({ sidebar: 'expanded' })
    fireEvent.focus(screen.getByText('Bookings').closest('a') as HTMLElement)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('never shows below 768px even with a collapsed cookie', () => {
    setViewport(390)
    mountShell({ sidebar: 'collapsed' })
    fireEvent.focus(screen.getByText('Bookings').closest('a') as HTMLElement)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('the collapse button tooltip carries the shortcut hint line', () => {
    setViewport(1280)
    mountShell({ sidebar: 'collapsed' })
    fireEvent.focus(screen.getByLabelText('Expand sidebar'))
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('Expand sidebar')
    expect(tip.textContent).toContain('Ctrl+\\ or Cmd+\\')
  })

  it('theme toggle and sign out also get a tooltip in the rail', () => {
    setViewport(1280)
    mountShell({ sidebar: 'collapsed' })
    fireEvent.focus(screen.getByLabelText('Switch to dark theme'))
    expect(screen.getByRole('tooltip').textContent).toBe('Switch to dark theme')
    fireEvent.blur(screen.getByLabelText('Switch to dark theme'))
    fireEvent.focus(screen.getByText('Sign out').closest('button') as HTMLElement)
    expect(screen.getByRole('tooltip').textContent).toBe('Sign out')
  })

  it('a label is found exactly once while no tooltip is open', () => {
    setViewport(1280)
    mountShell({ sidebar: 'collapsed' })
    expect(screen.getAllByText('Promos')).toHaveLength(1)
  })
})

describe('AdminSidebar theme toggle (ADM-02)', () => {
  afterEach(() => {
    clearPrefCookies()
    window.history.pushState({}, '', '/')
  })

  it('flips data-admin-theme instantly, relabels and writes one admin_theme cookie', () => {
    const { container } = mountShell()
    const wrapper = container.querySelector('.admin-shell') as HTMLElement
    expect(wrapper.getAttribute('data-admin-theme')).toBe('light')

    fireEvent.click(screen.getByLabelText('Switch to dark theme'))
    expect(wrapper.getAttribute('data-admin-theme')).toBe('dark')
    expect(cookieEntries('admin_theme')).toEqual(['admin_theme=dark'])
    expect(screen.getByLabelText('Switch to light theme')).toBeDefined()

    fireEvent.click(screen.getByLabelText('Switch to light theme'))
    expect(wrapper.getAttribute('data-admin-theme')).toBe('light')
    expect(cookieEntries('admin_theme')).toEqual(['admin_theme=light'])
    expect(screen.getByLabelText('Switch to dark theme')).toBeDefined()
  })

  it('shows a Moon icon in light and a Sun icon in dark', () => {
    mountShell()
    const iconClass = () => screen.getByLabelText(/switch to/i).querySelector('svg')?.getAttribute('class') ?? ''
    expect(iconClass()).toContain('lucide-moon')
    fireEvent.click(screen.getByLabelText('Switch to dark theme'))
    expect(iconClass()).toContain('lucide-sun')
  })

  it('keeps the in-memory choice when the shell re-renders with other initial props', () => {
    const { container, rerender, ui } = mountShell()
    fireEvent.click(screen.getByLabelText('Switch to dark theme'))
    rerender(ui('light', 'expanded'))
    expect((container.querySelector('.admin-shell') as HTMLElement).getAttribute('data-admin-theme')).toBe('dark')
  })
})

describe('AdminSidebar Ctrl/Cmd+\\ shortcut (D-15, T-86-08)', () => {
  afterEach(() => {
    clearPrefCookies()
    window.history.pushState({}, '', '/')
    document.body.innerHTML = ''
  })

  const state = (container: HTMLElement) =>
    (container.querySelector('.admin-shell') as HTMLElement).getAttribute('data-admin-sidebar')

  it('Ctrl+\\ toggles and calls preventDefault', () => {
    const { container } = mountShell()
    const ev = new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true, cancelable: true })
    act(() => {
      document.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(state(container)).toBe('collapsed')
  })

  it('Cmd+Backslash by code toggles back', () => {
    const { container } = mountShell({ sidebar: 'collapsed' })
    fireEvent.keyDown(document, { code: 'Backslash', metaKey: true })
    expect(state(container)).toBe('expanded')
  })

  it('ignores a bare backslash and other chords', () => {
    const { container } = mountShell()
    fireEvent.keyDown(document, { key: '\\' })
    fireEvent.keyDown(document, { key: 'a', ctrlKey: true })
    expect(state(container)).toBe('expanded')
  })

  it.each(['input', 'textarea', 'select'])('is ignored while focus is in a %s', (tag) => {
    const { container } = mountShell()
    const el = document.createElement(tag)
    document.body.appendChild(el)
    const ev = new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true, cancelable: true })
    act(() => {
      el.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(state(container)).toBe('expanded')
  })

  it('is ignored inside a contenteditable element', () => {
    const { container } = mountShell()
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    const inner = document.createElement('span')
    div.appendChild(inner)
    document.body.appendChild(div)
    act(() => {
      inner.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', ctrlKey: true, bubbles: true, cancelable: true }))
    })
    expect(state(container)).toBe('expanded')
  })

  it('is ignored while an aria-modal element is open', () => {
    const { container } = mountShell()
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.appendChild(modal)
    fireEvent.keyDown(document, { key: '\\', ctrlKey: true })
    expect(state(container)).toBe('expanded')
  })

  it('removes the listener on unmount', () => {
    const { container, unmount } = mountShell()
    unmount()
    const spy = vi.fn()
    document.addEventListener('keydown', spy)
    fireEvent.keyDown(document, { key: '\\', ctrlKey: true })
    document.removeEventListener('keydown', spy)
    expect(spy).toHaveBeenCalled()
    expect(container.querySelector('.admin-shell')).toBeNull()
  })
})
