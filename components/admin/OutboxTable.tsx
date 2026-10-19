'use client'
import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { outboxEventLabel, outboxErrorHint } from '@/lib/outbox-labels'
import type { OpenOutboxEvent } from '@/lib/outbox-admin-store'

interface OutboxTableProps {
  events: OpenOutboxEvent[]
  loading: boolean
  /** Keys the owner already asked to retry since the last refresh. */
  queued: ReadonlySet<string>
  /** Key of a retry request in flight, if any. */
  retrying: string | null
  onRetry: (key: string) => void
  /** Shown instead of rows when there is nothing to list. */
  empty: { heading: string; body: string }
  /** "Showing the latest 100 open events of {total}..." or null. */
  caption: string | null
}

const COLUMNS = ['STATUS', 'EVENT', 'REFERENCE', 'ATTEMPTS', 'LAST ERROR', 'NEXT ATTEMPT']
const COL_COUNT = COLUMNS.length + 1

/** "in 5 min" / "2 h ago" / "now". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Math.round((t - now) / 1000)
  const abs = Math.abs(diff)
  if (abs < 45) return 'now'
  let value: string
  if (abs < 3600) value = `${Math.max(1, Math.round(abs / 60))} min`
  else if (abs < 86400) value = `${Math.round(abs / 3600)} h`
  else value = `${Math.round(abs / 86400)} d`
  return diff > 0 ? `in ${value}` : `${value} ago`
}

function badgeFor(e: OpenOutboxEvent): { variant: 'pending' | 'confirmed' | 'cancelled' | 'unpaid'; label: string } {
  if (e.stuck) return { variant: 'unpaid', label: 'Stuck' }
  if (e.status === 'failed') return { variant: 'cancelled', label: 'Failed' }
  if (e.status === 'processing') return { variant: 'confirmed', label: 'Processing' }
  return { variant: 'pending', label: 'Pending' }
}

export function OutboxTable({ events, loading, queued, retrying, onRetry, empty, caption }: OutboxTableProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div>
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
              {COLUMNS.map((c) => (
                <th key={c} scope="col" style={headStyle}>
                  {c}
                </th>
              ))}
              <th scope="col" style={headStyle}>
                <span style={visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COL_COUNT} style={emptyCellStyle}>
                  Loading...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} style={emptyCellStyle}>
                  <div style={{ fontFamily: 'var(--font-cormorant)', fontSize: '20px', color: 'var(--offwhite)', lineHeight: 1.25 }}>
                    {empty.heading}
                  </div>
                  <div style={{ margin: '8px 0 0' }}>{empty.body}</div>
                </td>
              </tr>
            ) : (
              events.map((e) => {
                const reference = e.booking_reference ?? e.aggregate_id.slice(0, 8)
                const name = outboxEventLabel(e.event_type)
                const hint = outboxErrorHint(e.last_error)
                const isQueued = queued.has(e.idempotency_key)
                const retryable = e.status === 'failed' || e.status === 'pending'
                return (
                  <tr
                    key={e.idempotency_key}
                    onMouseEnter={() => setHovered(e.idempotency_key)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      background: hovered === e.idempotency_key ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
                      borderBottom: '1px solid var(--anthracite-light)',
                    }}
                  >
                    <td style={cellStyle}>
                      <StatusBadge {...badgeFor(e)} />
                    </td>
                    <td style={cellStyle}>{name}</td>
                    <td style={{ ...cellStyle, ...truncate }} title={e.idempotency_key}>
                      {reference}
                    </td>
                    <td style={cellStyle}>{e.attempts}</td>
                    <td style={{ ...cellStyle, ...truncate, color: 'var(--warmgrey)' }} title={e.last_error ?? undefined}>
                      {e.last_error ?? '—'}
                      {hint && (
                        <div style={{ ...labelText, color: 'var(--warmgrey)', whiteSpace: 'normal' }}>{hint}</div>
                      )}
                    </td>
                    <td style={{ ...cellStyle, color: 'var(--warmgrey)' }} title={new Date(e.available_at).toLocaleString('en-GB')}>
                      {relativeTime(e.available_at)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {isQueued ? (
                        <span style={{ ...labelText, color: 'var(--warmgrey)' }}>Queued</span>
                      ) : retryable ? (
                        <button
                          type="button"
                          onClick={() => onRetry(e.idempotency_key)}
                          disabled={retrying === e.idempotency_key}
                          aria-label={`Retry ${name} ${reference}`}
                          style={secondaryButton}
                          onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = 'var(--copper)' }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = 'var(--anthracite-light)' }}
                        >
                          <RotateCw size={16} aria-hidden="true" />
                          Retry event
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {caption && <p style={{ ...labelText, color: 'var(--warmgrey)', margin: '8px 0 0' }}>{caption}</p>}
    </div>
  )
}

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const labelText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const headStyle: React.CSSProperties = {
  padding: '0 16px',
  textAlign: 'left',
  ...labelText,
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
  padding: '48px 32px',
  textAlign: 'center',
  ...bodyText,
  color: 'var(--warmgrey)',
}

const secondaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  minHeight: '44px',
  padding: '0 16px',
  background: 'transparent',
  color: 'var(--offwhite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}
