import { redirect } from 'next/navigation'
import Script from 'next/script'
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
      {/* Pre-load Google Maps so AddressInput is ready when the booking wizard opens */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&v=weekly`}
        strategy="afterInteractive"
      />
      <AdminSidebar />
      <main
        className="md:ml-[280px] pt-16 md:pt-8"
        style={{
          flex: 1,
          padding: '0 32px 32px',
          backgroundColor: 'var(--anthracite-mid)',
          fontFamily: 'var(--font-montserrat)',
          color: 'var(--offwhite)',
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
    </div>
  )
}
