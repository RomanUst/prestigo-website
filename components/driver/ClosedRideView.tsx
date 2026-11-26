import type { CSSProperties } from 'react'
import { CircleCheck, Info } from 'lucide-react'
import DriverBackLink from '@/components/driver/DriverBackLink'
import type { RideSummary } from '@/lib/driver-cabinet/ride-detail'

// Phase 94 plan 94-07 (DCAB-05; UI-SPEC "Ride states in the cabinet", "Ride summary card"): a completed, cancelled or
// no-show ride of the cabinet. The state block reproduces the Phase 87 TripCompleted visuals (TripCompleted itself is
// untouched); below it a short summary card. The card carries only the route facts and the driver's own fee: the
// summary type has no field for the passenger, contact data, notes, the client price or payments. 'Your fee' shows for a completed ride that has one only.
// Server component, colours only through var(--admin-*) / var(--status-*).

export type ClosedRideState = 'completed' | 'cancelled' | 'no_show'

const STATE_COPY: Record<ClosedRideState, { heading: string; body: string }> = {
  completed: { heading: 'Trip completed', body: 'Thank you. This trip is closed.' },
  cancelled: { heading: 'Ride cancelled', body: 'This ride is closed.' },
  no_show: { heading: 'Marked as no-show', body: 'This ride is closed.' },
}

const captionStyle: CSSProperties = {
  fontSize: 'var(--driver-fs-label)',
  fontWeight: 500,
  lineHeight: 1.4,
  color: 'var(--admin-text-muted)',
}

const valueStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 400,
  lineHeight: 1.5,
  color: 'var(--admin-text)',
  overflowWrap: 'anywhere',
}

function SummaryRow({ caption, value, tabular = false, strong = false }: {
  caption: string
  value: string
  tabular?: boolean
  strong?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={captionStyle}>{caption}</dt>
      <dd
        style={{
          ...valueStyle,
          ...(tabular ? { fontVariantNumeric: 'tabular-nums' } : {}),
          ...(strong ? { fontWeight: 500 } : {}),
        }}
      >
        {value}
      </dd>
    </div>
  )
}

export default function ClosedRideView({
  state,
  backHref,
  summary,
}: {
  state: ClosedRideState
  backHref: string
  summary: RideSummary
}) {
  const copy = STATE_COPY[state]
  const completed = state === 'completed'

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <header
        style={{
          boxSizing: 'border-box',
          height: 56,
          padding: '0 24px',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          background: 'var(--admin-bg)',
          flexShrink: 0,
        }}
      >
        <span style={{ gridColumn: 1, justifySelf: 'start' }}>
          <DriverBackLink href={backHref} />
        </span>
        <span className="admin-wordmark driver-wordmark-optional" style={{ gridColumn: 2 }}>
          PRESTIGO
        </span>
      </header>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: completed ? 'var(--status-ok-bg)' : 'var(--status-info-bg)',
            color: completed ? 'var(--status-ok-fg)' : 'var(--status-info-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {completed ? <CircleCheck size={48} aria-hidden="true" /> : <Info size={48} aria-hidden="true" />}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--admin-font-heading)',
            fontSize: 'var(--driver-fs-display)',
            fontWeight: 500,
            lineHeight: 1.1,
          }}
        >
          {copy.heading}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'var(--admin-text-muted)',
          }}
        >
          {copy.body}
        </p>
      </div>

      <dl
        aria-label="Ride summary"
        style={{
          boxSizing: 'border-box',
          margin: '0 24px 32px',
          padding: 16,
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderRadius: 'var(--admin-radius-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          textAlign: 'left',
        }}
      >
        <SummaryRow caption="Booking" value={summary.bookingReference} tabular />
        <SummaryRow caption="Date" value={summary.dateLabel} />
        <SummaryRow caption="Pickup time" value={summary.pickupTime} tabular />
        <SummaryRow caption="Pickup" value={summary.pickup} />
        <SummaryRow caption="Drop-off" value={summary.dropoff} />
        <SummaryRow caption="Vehicle class" value={summary.vehicleLabel} />
        {completed && summary.feeLabel ? <SummaryRow caption="Your fee" value={summary.feeLabel} tabular strong /> : null}
      </dl>
    </main>
  )
}
