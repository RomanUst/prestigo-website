import { CircleCheck } from 'lucide-react'
import type { DriverTripCash } from '@/lib/driver-trip-step'
import { BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { formatPickupDate, formatPragueTime } from '@/lib/driver-trip-format'

export interface TripCompletedProps {
  variant: 'in-session' | 'reopened'
  summary?: { bookingReference: string; pickupDate: string; completedAt: string }
  /** Phase 89 (D-11): the trip token and the cash facts, present only for a cash_guarantee booking. */
  token?: string
  cash?: DriverTripCash
}

// D-17: shown for a completed trip. The in-session variant (right after the driver completes) adds
// a three-row summary: Booking, Date, Completed at. The re-opened variant (server-rendered later)
// carries no trip data at all. Neither shows the passenger, an address, a phone number or an amount.
export default function TripCompleted({ variant, summary }: TripCompletedProps) {
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
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '48px 24px',
        textAlign: 'center',
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          background: 'var(--status-ok-bg)',
          color: 'var(--status-ok-fg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <CircleCheck size={48} aria-hidden="true" />
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
        Trip completed
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
        Thank you. This trip is closed.
      </p>

      {variant === 'in-session' && summary ? (
        <dl
          style={{
            boxSizing: 'border-box',
            width: '100%',
            margin: 0,
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
          <SummaryRow caption="Booking" value={summary.bookingReference} />
          <SummaryRow caption="Date" value={formatPickupDate(summary.pickupDate)} />
          <SummaryRow caption="Completed at" value={formatPragueTime(summary.completedAt)} />
        </dl>
      ) : null}

      <a
        href={BUSINESS_TEL_URL}
        data-driver-focus=""
        style={{
          minHeight: 48,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 500,
          color: 'var(--admin-accent-text)',
        }}
      >
        Call the office
      </a>
    </main>
  )
}

function SummaryRow({ caption, value }: { caption: string; value: string }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 'var(--driver-fs-label)',
          fontWeight: 500,
          lineHeight: 1.4,
          color: 'var(--admin-text-muted)',
        }}
      >
        {caption}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 400,
          lineHeight: 1.5,
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </dd>
    </div>
  )
}
