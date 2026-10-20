'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { KPICard } from '@/components/admin/KPICard'
import { HealthBanner } from '@/components/admin/HealthBanner'
import { OutboxTable } from '@/components/admin/OutboxTable'
import type { OutboxHealth, OpenOutboxEvent } from '@/lib/outbox-admin-store'

type OutboxResponse = { health: OutboxHealth; events: OpenOutboxEvent[]; updatedAt: string }
type Filter = 'all' | 'failed' | 'pending' | 'processing'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'failed', label: 'Failed' },
  { id: 'pending', label: 'Pending' },
  { id: 'processing', label: 'Processing' },
]
const EVENT_CAP = 100
const RETRY_ERROR = 'Could not queue the retry. Check your connection and try again.'
const DASH = '—'

function formatAge(seconds: number | null): string {
  if (seconds === null) return DASH
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`
  return `${Math.floor(seconds / 86400)} d`
}

function statusTotal(h: OutboxHealth, status: string): number {
  return h.by_type.filter((r) => r.status === status).reduce((sum, r) => sum + r.count, 0)
}

function chipCount(h: OutboxHealth | undefined, id: Filter): number | null {
  if (!h) return null
  return id === 'all' ? h.open_total : statusTotal(h, id)
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

export default function OutboxPage() {
  const [data, setData] = useState<OutboxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [queued, setQueued] = useState<Set<string>>(new Set())
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retryError, setRetryError] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [retryAllBusy, setRetryAllBusy] = useState(false)
  const [retryAllMsg, setRetryAllMsg] = useState('')
  const submittingRef = useRef(false)
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (status: Filter) => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/admin/outbox?status=${status}`)
      const json = res.ok ? ((await res.json()) as OutboxResponse) : null
      if (json?.health) {
        setData(json)
        setQueued(new Set())
      } else {
        setData(null)
        setLoadError(true)
      }
    } catch {
      setData(null)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filter)
  }, [load, filter])

  useEffect(() => {
    return () => {
      if (msgTimer.current) clearTimeout(msgTimer.current)
    }
  }, [])

  const post = async (url: string, body: unknown): Promise<boolean> => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.ok
    } catch {
      return false
    }
  }

  const retryOne = async (key: string) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setRetrying(key)
    setRetryError(false)
    const ok = await post('/api/admin/outbox/retry', { key })
    if (ok) setQueued((prev) => new Set(prev).add(key))
    else setRetryError(true)
    setRetrying(null)
    submittingRef.current = false
  }

  const retryAll = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setRetryAllBusy(true)
    setRetryError(false)
    let queuedCount = -1
    try {
      const res = await fetch('/api/admin/outbox/retry-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (res.ok) {
        const json = (await res.json()) as { queued?: unknown }
        queuedCount = typeof json.queued === 'number' ? json.queued : 0
      }
    } catch {
      queuedCount = -1
    }
    setConfirmAll(false)
    setRetryAllBusy(false)
    submittingRef.current = false
    if (queuedCount < 0) {
      setRetryError(true)
      return
    }
    setRetryAllMsg(`${queuedCount} ${plural(queuedCount, 'event', 'events')} queued for retry.`)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setRetryAllMsg(''), 4000)
    void load(filter)
  }

  const h = data?.health
  const failed = h?.failed ?? 0
  const total = chipCount(h, filter) ?? 0
  const events = data?.events ?? []
  const caption =
    h && total > EVENT_CAP
      ? `Showing the latest ${EVENT_CAP} open events of ${total}. Sent events are not listed.`
      : null
  const nothingOpen = !!h && h.open_total === 0
  const empty = nothingOpen
    ? {
        heading: 'Everything is delivered',
        body: 'No pending or failed events. New booking and signup events appear here until they are delivered.',
      }
    : { heading: `No ${filter} events`, body: 'Nothing matches this filter. Choose All to see every open event.' }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '0 0 24px',
        }}
      >
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
        {confirmAll ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ ...bodyText, color: 'var(--offwhite)' }}>
              {`Retry ${failed} failed ${plural(failed, 'event', 'events')}?`}
            </span>
            <button type="button" onClick={retryAll} disabled={retryAllBusy} style={primaryButton}>
              Retry all
            </button>
            <button type="button" onClick={() => setConfirmAll(false)} disabled={retryAllBusy} style={secondaryButton}>
              Don&apos;t retry
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            disabled={!h || failed === 0}
            style={{ ...primaryButton, opacity: !h || failed === 0 ? 0.5 : 1 }}
          >
            Retry all failed
          </button>
        )}
      </div>

      <p style={{ ...bodyText, color: 'var(--warmgrey)', margin: '0 0 32px' }}>
        Booking and signup events waiting to reach EspoCRM and Chatwoot. Failed events are retried automatically; use
        Retry after fixing the cause.
      </p>

      {h && <HealthBanner failed={h.failed} stuck={h.stuck} />}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', margin: '0 0 32px' }}>
        <KPICard label="PENDING" value={h ? String(h.pending) : DASH} subLabel="events" />
        <KPICard label="PROCESSING" value={h ? String(h.processing) : DASH} subLabel="events" />
        <KPICard label="FAILED" value={h ? String(h.failed) : DASH} subLabel="events" />
        <KPICard label="STUCK" value={h ? String(h.stuck) : DASH} subLabel="overdue > 6 h" />
        <KPICard label="OLDEST PENDING" value={h ? formatAge(h.oldest_pending_seconds) : DASH} subLabel="waiting" />
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '0 0 16px',
        }}
      >
        <div role="group" aria-label="Filter events by status" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {FILTERS.map((f) => {
            const count = chipCount(h, f.id)
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.id)}
                style={{
                  ...secondaryButton,
                  borderColor: active ? 'var(--copper)' : 'var(--anthracite-light)',
                  color: active ? 'var(--copper-light)' : 'var(--offwhite)',
                }}
              >
                {count === null ? f.label : `${f.label} (${count})`}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {data && (
            <span style={{ ...labelText, color: 'var(--warmgrey)' }}>
              {`Updated ${new Date(data.updatedAt).toLocaleTimeString('en-GB', { hour12: false })}`}
            </span>
          )}
          <button type="button" onClick={() => void load(filter)} style={secondaryButton}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh outbox
          </button>
        </div>
      </div>

      <div aria-live="polite" style={{ ...labelText, color: 'var(--copper-light)', minHeight: '16px', margin: '0 0 8px' }}>
        {retryAllMsg}
      </div>
      {retryError && (
        <p role="alert" style={{ ...labelText, color: '#f87171', margin: '0 0 16px' }}>
          {RETRY_ERROR}
        </p>
      )}

      {loadError ? (
        <div style={{ ...bodyText, color: 'var(--warmgrey)', padding: '32px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px' }}>Could not load outbox health. Refresh to retry.</p>
        </div>
      ) : (
        <OutboxTable
          events={events}
          loading={loading}
          queued={queued}
          retrying={retrying}
          onRetry={(key) => void retryOne(key)}
          empty={empty}
          caption={caption}
        />
      )}
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

const primaryButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  background: 'var(--copper)',
  color: 'var(--anthracite)',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}
