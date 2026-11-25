import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { requireDriver } from '@/lib/driver-cabinet/auth'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getDriverProfile, getDriverStats } from '@/lib/driver-cabinet/profile'
import YouHelpSection from '@/components/driver/YouHelpSection'
import SignOutButton from '@/components/driver/SignOutButton'

// Phase 94 plan 94-12 (DCAB-10; D-13): the You tab. The driver's own details (read-only), two simple stats and Help.
// Per request (reads the session cookie), gated by this page itself (a layout is not a gate, Pitfall 4). The service
// client is created inside the request, never at module scope. The page holds only these sections: no client
// feedback scores, no paperwork and no payouts.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'You | Prestigo Driver',
  robots: { index: false, follow: false },
}

const card: CSSProperties = {
  margin: '0 24px 16px',
  padding: 16,
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-md)',
}

const caption: CSSProperties = {
  fontSize: 'var(--driver-fs-label)',
  fontWeight: 500,
  lineHeight: 1.4,
  color: 'var(--admin-text-muted)',
}

const value: CSSProperties = {
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 400,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
}

function ProfileRow({ label, text, muted }: { label: string; text: string | null; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <dt style={caption}>{label}</dt>
      <dd style={{ ...value, margin: 0, ...(text === null || muted ? { color: 'var(--admin-text-muted)' } : null) }}>
        {text ?? '—'}
      </dd>
    </div>
  )
}

function StatTile({ text, label }: { text: string; label: string }) {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--admin-surface)',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-md)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--driver-fs-display)',
          fontWeight: 500,
          lineHeight: 1.2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {text}
      </div>
      <div style={{ ...caption, fontWeight: 400 }}>{label}</div>
    </div>
  )
}

export default async function DriverYouPage() {
  const { driverId } = await requireDriver('/driver/you')

  const supabase = createSupabaseServiceClient()
  const [profile, stats] = await Promise.all([getDriverProfile(supabase, driverId), getDriverStats(supabase, driverId)])

  return (
    <main style={{ flex: 1, fontFamily: 'var(--font-montserrat)', color: 'var(--admin-text)' }}>
      <h1
        style={{
          margin: '8px 24px 16px',
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-display)',
          fontWeight: 500,
        }}
      >
        You
      </h1>

      <section aria-labelledby="you-profile-heading" style={card}>
        <h2
          id="you-profile-heading"
          style={{
            margin: '0 0 16px',
            fontFamily: 'var(--admin-font-heading)',
            fontSize: 'var(--driver-fs-heading)',
            fontWeight: 500,
            lineHeight: 1.2,
            overflowWrap: 'break-word',
          }}
        >
          {profile?.name || 'Driver'}
        </h2>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ProfileRow label="Phone" text={profile?.phone ?? null} />
          <ProfileRow label="Email" text={profile?.email || null} />
          <ProfileRow label="Vehicle" text={profile?.vehicleInfo ?? null} />
          <ProfileRow label="Plate" text={profile?.plate ?? 'Pending'} muted={!profile?.plate} />
        </dl>
        <p style={{ ...caption, fontWeight: 400, margin: '16px 0 0' }}>To change these details, ask the office.</p>
      </section>

      <div
        style={{
          margin: '0 24px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <StatTile text={String(stats.ridesCompleted)} label="Rides completed" />
        <StatTile
          text={stats.offersAcceptedPercent === null ? '—' : `${stats.offersAcceptedPercent}%`}
          label="Offers accepted"
        />
      </div>

      <YouHelpSection />

      {/* Slot: Notifications (94-13) goes here; Sign out closes the page. */}

      <SignOutButton />
    </main>
  )
}
