import Link from 'next/link'
import { ArrowRight, CalendarDays, ChevronRight } from 'lucide-react'
import { StatusBadge, type StatusBadgeVariant } from '@/components/admin/StatusBadge'
import type { RideBadge, RideRowView } from '@/lib/driver-cabinet/rides'

// Phase 94 plan 94-06 (D-03, UI-SPEC "Ride row", E4, E7): server components for the ride lists. No fee is printed
// here (the fee total belongs to the Past month card, 94-10); no client data beyond the first name.

const BADGE_LABEL: Record<RideBadge, string> = {
  en_route: 'En route',
  on_location: 'On site',
  on_board: 'On board',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

export function DayGroupHeader({ label }: { label: string }) {
  return (
    <h2
      style={{
        margin: 0,
        padding: '24px 24px 8px',
        fontFamily: 'var(--font-montserrat)',
        fontSize: 'var(--driver-fs-label)',
        fontWeight: 500,
        color: 'var(--admin-text-muted)',
      }}
    >
      {label}
    </h2>
  )
}

export function RideRow({ row }: { row: RideRowView }) {
  const metaParts: Array<{ key: string; node: React.ReactNode }> = []
  if (row.firstName) {
    metaParts.push({
      key: 'name',
      node: <span style={{ ...ellipsis, display: 'inline-block', maxWidth: '100%', verticalAlign: 'bottom' }}>{row.firstName}</span>,
    })
  }
  metaParts.push({
    key: 'plate',
    node: row.plate ? (
      <span style={{ color: 'var(--admin-text)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{row.plate}</span>
    ) : (
      <span>Pending</span>
    ),
  })
  if (row.vehicleLabel) metaParts.push({ key: 'class', node: <span>{row.vehicleLabel}</span> })

  return (
    <Link
      href={`/driver/rides/${row.assignmentId}`}
      className="driver-ride-row"
      data-driver-focus
      aria-label={row.accessibleName}
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        minHeight: '80px',
        margin: '0 24px 8px',
        padding: '16px',
        background: 'var(--admin-surface)',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-md)',
        color: 'var(--admin-text)',
        textDecoration: 'none',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <span
        style={{
          width: '64px',
          flexShrink: 0,
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-heading)',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {row.time}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {row.badge && (
          <span style={{ display: 'flex' }}>
            <StatusBadge variant={row.badge as StatusBadgeVariant} label={BADGE_LABEL[row.badge]} />
          </span>
        )}
        <span style={{ ...ellipsis, fontSize: 'var(--driver-fs-body)', fontWeight: 500 }}>{row.pickup}</span>
        <span
          style={{
            ...ellipsis,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            color: 'var(--admin-text-muted)',
          }}
        >
          <ArrowRight size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span className="driver-sr-only">to </span>
          <span style={{ ...ellipsis, minWidth: 0 }}>{row.dropoff}</span>
        </span>
        <span
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: '4px',
            fontSize: 'var(--driver-fs-label)',
            fontWeight: 400,
            color: 'var(--admin-text-muted)',
          }}
        >
          {metaParts.map((part, i) => (
            <span key={part.key} style={{ display: 'inline-flex', minWidth: 0, maxWidth: '100%', columnGap: '4px' }}>
              {i > 0 && <span aria-hidden="true">·</span>}
              {part.node}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--admin-text-muted)' }} />
    </Link>
  )
}

export function RidesEmptyState({
  heading,
  body,
  offersCount = 0,
}: {
  heading: string
  body?: string
  offersCount?: number
}) {
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
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--admin-hover)',
          color: 'var(--admin-text-muted)',
          marginBottom: '16px',
        }}
      >
        <CalendarDays size={48} aria-hidden="true" />
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
        {heading}
      </p>
      {body && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--driver-fs-body)', fontWeight: 400, color: 'var(--admin-text-muted)' }}>
          {body}
        </p>
      )}
      {offersCount > 0 && (
        <Link
          href="/driver/offers"
          className="driver-text-link"
          data-driver-focus
          style={{
            marginTop: '16px',
            minHeight: '48px',
            padding: '0 16px',
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 500,
            color: 'var(--admin-accent-text)',
            textDecoration: 'none',
          }}
        >
          {offersCount === 1 ? 'Review 1 offer' : `Review ${offersCount} offers`}
        </Link>
      )}
    </div>
  )
}
