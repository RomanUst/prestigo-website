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

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar />
      <main
        style={{
          flex: 1,
          padding: '32px',
          backgroundColor: 'var(--anthracite-mid)',
          fontFamily: 'var(--font-montserrat)',
          color: 'var(--offwhite)',
        }}
      >
        {children}
      </main>
    </div>
  )
}
