'use client'
import { useState, useEffect } from 'react'
import { KPICard } from '@/components/admin/KPICard'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { outboxEventLabel } from '@/lib/outbox-labels'
import type { OutboxHealth, OpenOutboxEvent } from '@/lib/outbox-admin-store'

type OutboxResponse = { health: OutboxHealth; events: OpenOutboxEvent[]; updatedAt: string }

function formatAge(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`
  return `${Math.floor(seconds / 86400)} d`
}

export default function OutboxPage() {
  const [data, setData] = useState<OutboxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    fetch('/api/admin/outbox')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: OutboxResponse | null) => {
        if (json?.health) setData(json)
        else setLoadError(true)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  const h = data?.health
  const dash = '—'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 24px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.08em',
            margin: 0,
          }}
        >
          Outbox
        </h1>
      </div>
      <p style={{ ...bodyText, color: 'var(--warmgrey)', margin: '0 0 32px' }}>
        Booking and signup events waiting to reach EspoCRM and Chatwoot. Failed events are retried automatically; use
        Retry after fixing the cause.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', margin: '0 0 32px' }}>
        <KPICard label="PENDING" value={h ? String(h.pending) : dash} subLabel="events" />
        <KPICard label="PROCESSING" value={h ? String(h.processing) : dash} subLabel="events" />
        <KPICard label="FAILED" value={h ? String(h.failed) : dash} subLabel="events" />
        <KPICard label="STUCK" value={h ? String(h.stuck) : dash} subLabel="overdue > 6 h" />
        <KPICard label="OLDEST PENDING" value={h ? formatAge(h.oldest_pending_seconds) : dash} subLabel="waiting" />
      </div>

      <div
        style={{
          width: '100%',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '4px',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--anthracite)', borderBottom: '1px solid var(--anthracite-light)', height: '48px' }}>
              {['STATUS', 'EVENT', 'REFERENCE', 'ATTEMPTS', 'LAST ERROR', 'NEXT ATTEMPT'].map((c) => (
                <th key={c} scope="col" style={headStyle}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  Loading...
                </td>
              </tr>
            ) : loadError || !data ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  Could not load outbox health. Refresh to retry.
                </td>
              </tr>
            ) : data.events.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  Everything is delivered
                </td>
              </tr>
            ) : (
              data.events.map((e) => (
                <tr key={e.idempotency_key} style={{ background: 'var(--anthracite-mid)', borderBottom: '1px solid var(--anthracite-light)' }}>
                  <td style={cellStyle}>
                    <StatusBadge {...badgeFor(e)} />
                  </td>
                  <td style={cellStyle}>{outboxEventLabel(e.event_type)}</td>
                  <td style={{ ...cellStyle, ...truncate }} title={e.idempotency_key}>
                    {e.booking_reference ?? e.aggregate_id.slice(0, 8)}
                  </td>
                  <td style={cellStyle}>{e.attempts}</td>
                  <td style={{ ...cellStyle, ...truncate, color: 'var(--warmgrey)' }} title={e.last_error ?? undefined}>
                    {e.last_error ?? dash}
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--warmgrey)' }} title={e.available_at}>
                    {new Date(e.available_at).toLocaleString('en-GB')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function badgeFor(e: OpenOutboxEvent): { variant: 'pending' | 'confirmed' | 'cancelled' | 'unpaid'; label: string } {
  if (e.stuck) return { variant: 'unpaid', label: 'Stuck' }
  if (e.status === 'failed') return { variant: 'cancelled', label: 'Failed' }
  if (e.status === 'processing') return { variant: 'confirmed', label: 'Processing' }
  return { variant: 'pending', label: 'Pending' }
}

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const headStyle: React.CSSProperties = {
  padding: '0 16px',
  textAlign: 'left',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  textTransform: 'uppercase',
  letterSpacing: '0.4em',
  color: 'var(--warmgrey)',
}

const cellStyle: React.CSSProperties = {
  padding: '0 16px',
  height: '48px',
  ...bodyText,
  color: 'var(--offwhite)',
}

const truncate: React.CSSProperties = {
  maxWidth: '280px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const emptyCellStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  ...bodyText,
  color: 'var(--warmgrey)',
}
