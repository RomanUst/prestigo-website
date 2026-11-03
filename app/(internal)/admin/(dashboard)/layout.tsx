import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  if (!user.app_metadata?.is_admin) {
    redirect('/')
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <AdminSidebar />
      <main
        className="admin-main pt-16 md:pt-8"
        style={{
          flex: 1,
          // Longhands only: a `padding` shorthand would reset the pt-16/md:pt-8 top
          // padding that keeps content clear of the fixed mobile menu button.
          // Offset, colours, font and min-height come from .admin-main in
          // admin-theme.css (width follows --admin-sidebar-w).
          paddingLeft: '32px',
          paddingRight: '32px',
          paddingBottom: '32px',
        }}
      >
        {children}
      </main>
    </div>
  )
}
