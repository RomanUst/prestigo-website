import type { Metadata } from 'next'
import { requireDriver } from '@/lib/driver-cabinet/auth'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { listLiveOffers } from '@/lib/driver-cabinet/offers'
import OffersList from '@/components/driver/OffersList'
import OffersNotificationHint from '@/components/driver/OffersNotificationHint'
import { pushConfigured } from '@/lib/driver-cabinet/push'

// Phase 94 plan 94-11 (DCAB-07; D-08, D-11, D-12): the live offers of the signed-in driver, earliest pickup first.
// Per request (reads the session cookie), gated by this page itself (a layout is not a gate, Pitfall 4). The service
// client is created inside the request, never at module scope.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Offers | Prestigo Driver',
  robots: { index: false, follow: false },
}

export default async function DriverOffersPage() {
  const { driverId } = await requireDriver('/driver/offers')
  const offers = await listLiveOffers(createSupabaseServiceClient(), driverId)

  return (
    <main style={{ flex: 1, fontFamily: 'var(--font-montserrat)', color: 'var(--admin-text)' }}>
      <h1
        style={{
          margin: '8px 24px 8px',
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-display)',
          fontWeight: 500,
        }}
      >
        Offers
      </h1>
      <p
        style={{
          margin: '0 24px 16px',
          fontSize: 'var(--driver-fs-label)',
          fontWeight: 400,
          lineHeight: 1.4,
          color: 'var(--admin-text-muted)',
        }}
      >
        Rides the office has offered to you. Only you can see them.
      </p>
      <OffersNotificationHint pushEnabled={pushConfigured()} />
      <OffersList offers={offers} />
    </main>
  )
}
