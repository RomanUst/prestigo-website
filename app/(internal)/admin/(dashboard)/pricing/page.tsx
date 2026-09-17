import PricingForm from '@/components/admin/PricingForm'
import PromoCard from '@/components/admin/PromoCard'
import RoutesTable from '@/components/admin/RoutesTable'
import { cookies } from 'next/headers'
import type { RoutePrice } from '@/lib/route-prices'

export default async function PricingPage() {
  const cookieStore = await cookies()
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const cookieHeader = cookieStore.toString()

  const [pricingRes, promoRes, routesRes] = await Promise.all([
    fetch(`${base}/api/admin/pricing`, { headers: { Cookie: cookieHeader }, cache: 'no-store' }),
    fetch(`${base}/api/admin/promo`, { headers: { Cookie: cookieHeader }, cache: 'no-store' }),
    fetch(`${base}/api/admin/route-prices`, { headers: { Cookie: cookieHeader }, cache: 'no-store' }),
  ])

  if (!pricingRes.ok || !promoRes.ok || !routesRes.ok) {
    return (
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.08em',
            marginBottom: '16px',
          }}
        >
          Pricing
        </h1>
        <p style={{ color: 'var(--warmgrey)', fontSize: '13px' }}>
          Could not load data. Refresh to retry.
        </p>
      </div>
    )
  }

  const pricingData = await pricingRes.json()
  const promoData: { active: boolean; regularPriceEur: number; promoPriceEur: number } = await promoRes.json()
  const routesData: { routes: RoutePrice[] } = await routesRes.json()

  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          letterSpacing: '0.08em',
          marginBottom: '32px',
        }}
      >
        Pricing
      </h1>
      <PricingForm initialData={{
        config: pricingData.config,
        globals: pricingData.globals,
        holidayDates: pricingData.globals?.holiday_dates ?? [],
      }} />

      <div style={{ marginTop: '32px' }}>
        <PromoCard initial={promoData} />
      </div>

      <div style={{ marginTop: '32px' }}>
        <RoutesTable initialRoutes={routesData.routes} />
      </div>
    </div>
  )
}
