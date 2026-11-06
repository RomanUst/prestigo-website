import NotificationToggles from '@/components/admin/NotificationToggles'
import DispatchDefault from '@/components/admin/DispatchDefault'
import NoShowWaitSettings from '@/components/admin/NoShowWaitSettings'
import CardFlowSettings from '@/components/admin/CardFlowSettings'
import CancellationPolicySettings from '@/components/admin/CancellationPolicySettings'
import { cookies } from 'next/headers'

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/admin/settings`, {
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
            marginBottom: '32px',
          }}
        >
          Settings
        </h1>
        <p style={{ color: 'var(--warmgrey)', fontSize: '13px' }}>
          Could not load settings. Refresh to retry.
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
        Settings
      </h1>
      <NotificationToggles initialFlags={data.notification_flags} />
      <DispatchDefault
        initialHorizon={data.dispatch_default_horizon}
        initialDays={data.dispatch_horizon_days}
      />
      <NoShowWaitSettings
        initialCityMin={data.noshow_wait_city_min}
        initialAirportMin={data.noshow_wait_airport_min}
      />
      <CardFlowSettings
        initialMode={data.card_flow_mode}
        initialLeadHours={data.payment_hold_lead_hours}
        initialEmails={data.card_flow_canary_emails}
      />
      <CancellationPolicySettings
        initialKm={data.cancel_free_km_threshold}
        initialShortHours={data.cancel_free_hours_short}
        initialLongHours={data.cancel_free_hours_long}
        initialHourlyHours={data.cancel_free_hours_hourly}
        initialPercent={data.cancel_fee_percent}
      />
    </div>
  )
}
