'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { StatusBadge } from './StatusBadge'

// Local type — deliberately NOT imported from types/database.types.ts (stale, Pitfall 1).
interface AuditRow {
  id: string
  field: string
  old_value: string | null
  new_value: string | null
  operator_id: string | null
  changed_at: string
  notified: boolean
}

interface BookingChangeHistoryProps {
  bookingId: string
}

type FetchState = 'idle' | 'loading' | 'loaded' | 'error'

const FIELD_LABELS: Record<string, string> = {
  pickup_date: 'Pickup date',
  pickup_time: 'Pickup time',
  client_first_name: 'First name',
  client_last_name: 'Last name',
  client_email: 'Email',
  client_phone: 'Phone',
  flight_number: 'Flight number',
  vehicle_class: 'Vehicle',
  origin_address: 'From',
  destination_address: 'To',
  distance_km: 'Distance (km)',
  amount_czk: 'Total price',
}

function humanizeField(field: string): string {
  return FIELD_LABELS[field] ?? field
}

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface HistoryGroup {
  changedAt: string
  operatorId: string | null
  rows: AuditRow[]
}

// Group rows sharing one changed_at (one PATCH -> N field-change rows -> 1 header),
// ordered newest-first (D-10).
function groupRows(rows: AuditRow[]): HistoryGroup[] {
  const byTimestamp = new Map<string, AuditRow[]>()
  for (const row of rows) {
    const bucket = byTimestamp.get(row.changed_at)
    if (bucket) bucket.push(row)
    else byTimestamp.set(row.changed_at, [row])
  }
  const groups: HistoryGroup[] = Array.from(byTimestamp.entries()).map(([changedAt, groupRows]) => ({
    changedAt,
    operatorId: groupRows[0]?.operator_id ?? null,
    rows: groupRows,
  }))
  groups.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
  return groups
}

export function BookingChangeHistory({ bookingId }: BookingChangeHistoryProps) {
  const [status, setStatus] = useState<FetchState>('idle')
  const [rows, setRows] = useState<AuditRow[]>([])
  const hasFetchedRef = useRef(false)

  const fetchHistory = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/audit-log`)
      if (!res.ok) throw new Error('audit_log_fetch_failed')
      const data = await res.json()
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setStatus('loaded')
    } catch {
      setStatus('error')
    }
  }, [bookingId])

  // Lazy fetch: this component is only mounted when the admin expands the
  // booking row (Plan 05 owns that mount gate). On its own mount, fetch once
  // — guarded so it never refetches on a parent re-render (D-11 / Pitfall 4).
  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    fetchHistory()
  }, [fetchHistory])

  const handleRetry = useCallback(() => {
    fetchHistory()
  }, [fetchHistory])

  const groups = groupRows(rows)

  return (
    <div
      style={{
        background: 'var(--anthracite-mid)',
        padding: 16,
        maxHeight: 240,
        overflowY: 'auto',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      {status === 'loading' && (
        <span style={{ fontSize: 11, color: 'var(--warmgrey)' }}>Loading history…</span>
      )}

      {status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 11, color: '#f87171' }}>
            Couldn't load change history — try again.
          </span>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              border: '1px solid var(--copper)',
              color: 'var(--copper)',
              background: 'transparent',
              borderRadius: 2,
              padding: '4px 8px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {status === 'loaded' && rows.length === 0 && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--offwhite)', lineHeight: 1.5 }}>
            No changes recorded yet.
          </div>
          <div style={{ fontSize: 11, color: 'var(--warmgrey)', marginTop: 4 }}>
            Edits to this booking will appear here.
          </div>
        </div>
      )}

      {status === 'loaded' && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map(group => (
            <div key={group.changedAt}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.25em',
                  color: 'var(--copper-light)',
                  marginBottom: 8,
                }}
              >
                {formatTimestamp(group.changedAt)} · {group.operatorId ?? 'Unknown operator'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.rows.map(row => (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--offwhite)',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                        flex: '1 1 auto',
                      }}
                    >
                      {humanizeField(row.field)}: {row.old_value ?? '—'} → {row.new_value ?? '—'}
                    </span>
                    <StatusBadge
                      variant={row.notified ? 'active' : 'inactive'}
                      label={row.notified ? 'Notified' : 'Not notified'}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
