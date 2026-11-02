import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 86 (T-86-07): the (dashboard) layout is the admin gate. Editing its
 * main element for the sidebar offset must not weaken the two redirects, and
 * the main element must be driven by the admin-main class (no fixed margin).
 */

const { mockRedirect, mockGetUser } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
  mockGetUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
vi.mock('@/components/admin/AdminSidebar', () => ({
  default: () => <aside data-testid="sidebar-stub" />,
}))

import AdminDashboardLayout from '@/app/(internal)/admin/(dashboard)/layout'

describe('(dashboard) layout gate and main contract', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    mockGetUser.mockReset()
  })

  it('redirects to /admin/login when there is no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(AdminDashboardLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT:/admin/login')
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login')
  })

  it('redirects a non-admin user to /', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: {} } } })
    await expect(AdminDashboardLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('redirects a user whose is_admin flag is false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: { is_admin: false } } } })
    await expect(AdminDashboardLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('renders main.admin-main with the mobile padding classes and no fixed left margin for an admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: { is_admin: true } } } })
    const el = await AdminDashboardLayout({ children: <p>child content</p> })
    const { container, getByText, getByTestId } = render(el)
    const main = container.querySelector('main') as HTMLElement
    expect(main).not.toBeNull()
    const classes = main.className.split(/\s+/)
    expect(classes).toContain('admin-main')
    expect(classes).toContain('pt-16')
    expect(classes).toContain('md:pt-8')
    expect(main.className).not.toContain('ml-[')
    expect(getByText('child content')).toBeDefined()
    expect(getByTestId('sidebar-stub')).toBeDefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
