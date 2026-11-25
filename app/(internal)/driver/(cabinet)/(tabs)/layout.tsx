import { getDriverSession } from '@/lib/driver-cabinet/auth'
import { countLiveOffers } from '@/lib/driver-cabinet/offers'
import { createSupabaseServiceClient } from '@/lib/supabase'
import CabinetTabBar from '@/components/driver/CabinetTabBar'
import CabinetRefresh from '@/components/driver/CabinetRefresh'

// Phase 94 plan 94-06 (D-02): header, content and the bottom tab bar of the three tab pages (Rides, Offers, You).
// This layout is NOT a gate (layouts do not re-run on client navigation, Pitfall 4): every page calls requireDriver()
// itself, the layout only reads the session to show the live-offers badge. The service client is created per request.
// CabinetRefresh (94-10) is mounted once here for all three tabs (refresh on return, online and every 30 s).
export const dynamic = 'force-dynamic'

export default async function DriverTabsLayout({ children }: { children: React.ReactNode }) {
  const session = await getDriverSession()
  const offersCount = session ? await countLiveOffers(createSupabaseServiceClient(), session.driverId) : 0

  return (
    <>
      <header className="driver-cabinet-header" style={{ background: 'var(--admin-bg)' }}>
        <span className="admin-wordmark">PRESTIGO</span>
      </header>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
      <CabinetRefresh />
      <CabinetTabBar offersCount={offersCount} />
    </>
  )
}
