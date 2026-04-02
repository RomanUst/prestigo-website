import PricingForm from '@/components/admin/PricingForm'
import { cookies } from 'next/headers'

export default async function PricingPage() {
  // Fetch pricing data server-side, passing cookies for auth
  const cookieStore = await cookies()
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/admin/pricing`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  })

  if (!res.ok) {
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

  const data = await res.json()

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
      <PricingForm initialData={{ config: data.config, globals: data.globals }} />
    </div>
  )
}
