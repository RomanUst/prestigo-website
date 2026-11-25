import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import type { OfferView } from '@/lib/driver-cabinet/offers'

// Phase 94 plan 94-11 (DCAB-07; D-11, D-12): one live offer. Server-compatible (no hooks): the answer buttons arrive
// through the actions slot from the OffersList client island. An unanswered offer shows only the day and time, the
// route, the passenger's FIRST name, the class and the driver's own fee. Nothing else is in OfferView, so nothing else
// can be rendered here.

const labelMuted = {
  fontSize: 'var(--driver-fs-label)',
  lineHeight: 1.4,
  color: 'var(--admin-text-muted)',
} as const

function Stop({
  caption,
  address,
  dot,
  connector,
}: {
  caption: string
  address: string
  dot: 'filled' | 'ring'
  connector?: boolean
}) {
  return (
    <li style={{ display: 'flex', gap: 16, paddingBottom: connector ? 16 : 0 }}>
      <div style={{ position: 'relative', width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <span
          aria-hidden="true"
          style={{
            boxSizing: 'border-box',
            marginTop: 4,
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            zIndex: 1,
            background: dot === 'filled' ? 'var(--admin-accent)' : 'var(--admin-surface)',
            border: dot === 'ring' ? '2px solid var(--admin-text)' : 'none',
          }}
        />
        {connector ? (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 16,
              bottom: -20,
              left: '50%',
              width: 1,
              background: 'var(--admin-border-strong)',
            }}
          />
        ) : null}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...labelMuted, fontWeight: 500 }}>{caption}</div>
        <div
          className="driver-address-clamp"
          style={{ fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5, overflowWrap: 'anywhere' }}
        >
          {address}
        </div>
      </div>
    </li>
  )
}

export default function OfferCard({ offer, actions }: { offer: OfferView; actions?: ReactNode }) {
  const hasFee = typeof offer.feeLabel === 'string' && offer.feeLabel.length > 0
  return (
    <article
      style={{
        boxSizing: 'border-box',
        margin: '0 24px 16px',
        padding: 16,
        background: 'var(--admin-surface)',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...labelMuted, fontWeight: 500 }}>{offer.dayLabel}</div>
          <div
            style={{
              fontSize: 'var(--driver-fs-display)',
              fontWeight: 500,
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {offer.time}
          </div>
        </div>
        {hasFee ? (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ ...labelMuted, fontWeight: 400 }}>Your fee</div>
            <div
              style={{
                fontSize: 'var(--driver-fs-heading)',
                fontWeight: 500,
                lineHeight: 1.2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {offer.feeLabel}
            </div>
          </div>
        ) : null}
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <Stop caption="Pickup" address={offer.pickup} dot="filled" connector />
        <Stop caption="Drop-off" address={offer.dropoff} dot="ring" />
      </ol>

      <div style={{ ...labelMuted, fontWeight: 400, minWidth: 0 }}>
        <span>Passenger </span>
        <span
          style={{
            display: 'inline-block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            verticalAlign: 'bottom',
          }}
        >
          {offer.firstName}
        </span>
        <span>{` · ${offer.vehicleLabel}`}</span>
      </div>

      {actions}
    </article>
  )
}

export function OffersEmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <span
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--admin-hover)',
          color: 'var(--admin-text-muted)',
          marginBottom: 16,
        }}
      >
        <Inbox size={48} aria-hidden="true" />
      </span>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-heading)',
          fontWeight: 500,
          color: 'var(--admin-text)',
        }}
      >
        No offers right now
      </p>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 400,
          lineHeight: 1.5,
          color: 'var(--admin-text-muted)',
        }}
      >
        When the office sends you a ride, it shows up here and we email you.
      </p>
    </div>
  )
}
