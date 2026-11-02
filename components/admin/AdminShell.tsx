'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  serializeSidebarCookie,
  serializeThemeCookie,
  type AdminSidebarState,
  type AdminTheme,
} from '@/lib/admin-shell-prefs'

// UI preference state only (Phase 86, D-01 / D-02). The wrapper carries the
// theme and sidebar attributes that app/(internal)/admin/admin-theme.css keys
// on. It performs no authentication, session read or navigation: the admin
// gate lives solely in the (dashboard) layout.

interface AdminShellValue {
  theme: AdminTheme
  sidebar: AdminSidebarState
  toggleTheme: () => void
  toggleSidebar: () => void
}

const noop = () => {}

// Default value so components rendered without the provider (a bare
// AdminSidebar in tests) keep working.
const AdminShellContext = createContext<AdminShellValue>({
  theme: 'light',
  sidebar: 'expanded',
  toggleTheme: noop,
  toggleSidebar: noop,
})

export function useAdminShell(): AdminShellValue {
  return useContext(AdminShellContext)
}

function writeCookie(value: string) {
  try {
    document.cookie = value
  } catch {
    // A blocked cookie write only loses persistence; no error UI (UI-SPEC E1/E2).
  }
}

export default function AdminShell({
  initialTheme,
  initialSidebar,
  children,
}: {
  initialTheme: AdminTheme
  initialSidebar: AdminSidebarState
  children: React.ReactNode
}) {
  // Seeded once: later prop changes (router.refresh, revalidatePath) must not
  // reset a toggle the operator already made.
  const [theme, setTheme] = useState<AdminTheme>(initialTheme)
  const [sidebar, setSidebar] = useState<AdminSidebarState>(initialSidebar)

  const toggleTheme = useCallback(() => {
    const next: AdminTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      writeCookie(serializeThemeCookie(next, location.protocol === 'https:'))
    } catch {
      // location unavailable: persistence only
    }
  }, [theme])

  const toggleSidebar = useCallback(() => {
    const next: AdminSidebarState = sidebar === 'collapsed' ? 'expanded' : 'collapsed'
    setSidebar(next)
    try {
      writeCookie(serializeSidebarCookie(next, location.protocol === 'https:'))
    } catch {
      // location unavailable: persistence only
    }
  }, [sidebar])

  const value = useMemo<AdminShellValue>(
    () => ({ theme, sidebar, toggleTheme, toggleSidebar }),
    [theme, sidebar, toggleTheme, toggleSidebar],
  )

  return (
    <AdminShellContext.Provider value={value}>
      <div className="admin-shell" data-admin-theme={theme} data-admin-sidebar={sidebar}>
        {children}
      </div>
    </AdminShellContext.Provider>
  )
}
