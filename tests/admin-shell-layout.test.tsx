import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Phase 86 D-01 / D-02 / D-06 / D-18: the admin root layout reads the
 * admin_theme / admin_sidebar cookies and renders ONE div.admin-shell wrapper
 * around every /admin route, including /admin/login.
 */

const { jar } = vi.hoisted(() => ({ jar: {} as Record<string, string> }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined),
  }),
}))

// The login page imports the server action module; it must not load Supabase.
vi.mock('@/app/(internal)/admin/login/actions', () => ({
  signIn: vi.fn(),
}))

import AdminRootLayout from '@/app/(internal)/admin/layout'
import AdminLoginPage from '@/app/(internal)/admin/login/page'

function setJar(values: Record<string, string>) {
  for (const k of Object.keys(jar)) delete jar[k]
  Object.assign(jar, values)
}

async function renderLayout(children: React.ReactNode = <p>child</p>) {
  const ui = await AdminRootLayout({ children })
  return render(ui)
}

describe('AdminRootLayout cookie-driven wrapper', () => {
  beforeEach(() => {
    setJar({})
  })

  it('renders light + expanded when no cookie is present', async () => {
    const { container } = await renderLayout()
    const shells = container.querySelectorAll('div.admin-shell')
    expect(shells).toHaveLength(1)
    expect(shells[0].getAttribute('data-admin-theme')).toBe('light')
    expect(shells[0].getAttribute('data-admin-sidebar')).toBe('expanded')
  })

  it('honours admin_theme=dark and admin_sidebar=collapsed', async () => {
    setJar({ admin_theme: 'dark', admin_sidebar: 'collapsed' })
    const { container } = await renderLayout()
    const shell = container.querySelector('div.admin-shell')!
    expect(shell.getAttribute('data-admin-theme')).toBe('dark')
    expect(shell.getAttribute('data-admin-sidebar')).toBe('collapsed')
  })

  it('falls back and never reflects a hostile cookie value', async () => {
    setJar({ admin_theme: '"><img src=x>', admin_sidebar: 'garbage' })
    const { container } = await renderLayout()
    const shell = container.querySelector('div.admin-shell')!
    expect(shell.getAttribute('data-admin-theme')).toBe('light')
    expect(shell.getAttribute('data-admin-sidebar')).toBe('expanded')
    expect(container.innerHTML).not.toContain('img src=x')
    expect(container.innerHTML).not.toContain('garbage')
  })

  it('renders the real login page inside the dark wrapper (D-18)', async () => {
    setJar({ admin_theme: 'dark' })
    const { container } = await renderLayout(<AdminLoginPage />)
    const shell = container.querySelector('div.admin-shell[data-admin-theme="dark"]')!
    expect(shell).not.toBeNull()
    const emailLabel = screen.getByText('Email')
    expect(shell.contains(emailLabel)).toBe(true)
  })

  it('renders the login page in the light wrapper without a cookie', async () => {
    const { container } = await renderLayout(<AdminLoginPage />)
    const shell = container.querySelector('div.admin-shell[data-admin-theme="light"]')!
    expect(shell).not.toBeNull()
    expect(shell.contains(screen.getByText('Email'))).toBe(true)
  })

  it('leaves html and body untouched (D-02)', async () => {
    setJar({ admin_theme: 'dark' })
    await renderLayout()
    expect(document.documentElement.hasAttribute('data-admin-theme')).toBe(false)
    expect(document.body.hasAttribute('data-admin-theme')).toBe(false)
  })

  it('wrapper carries no inline style (containing-block pitfall)', async () => {
    const { container } = await renderLayout()
    const shell = container.querySelector('div.admin-shell')!
    expect(shell.hasAttribute('style')).toBe(false)
  })
})
