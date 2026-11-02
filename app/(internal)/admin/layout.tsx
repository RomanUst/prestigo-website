import './admin-theme.css'
import { cookies } from 'next/headers'
import AdminShell from '@/components/admin/AdminShell'
import {
  ADMIN_SIDEBAR_COOKIE,
  ADMIN_THEME_COOKIE,
  parseAdminSidebar,
  parseAdminTheme,
} from '@/lib/admin-shell-prefs'

// Wraps every /admin route (login and dashboard) in the themed shell wrapper.
// Preferences come from two functional cookies; a missing or invalid value
// falls back to light / expanded. Authentication is NOT handled here: the
// admin gate stays in (dashboard)/layout.tsx.
export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const jar = await cookies()
  return (
    <AdminShell
      initialTheme={parseAdminTheme(jar.get(ADMIN_THEME_COOKIE)?.value)}
      initialSidebar={parseAdminSidebar(jar.get(ADMIN_SIDEBAR_COOKIE)?.value)}
    >
      {children}
    </AdminShell>
  )
}
