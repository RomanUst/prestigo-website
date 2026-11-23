'use client'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import type { CustomTourRequestDetail } from '@/lib/custom-tours/admin-store'
import { outlineButtonStyle } from '@/components/admin/paymentShared'

// Phase 93 (plan 93-33; TRIP-07; UI-SPEC 8.3): what the client asked for, shown above the lines of a quote that answers a
// custom-tour request (quotes.source_inquiry_id). It loads /api/admin/custom-tours/<id> and hands the request to the builder
// (onLoaded) so the empty first trip can start from its date, people and wishes. The text is visitor-supplied: rendered as
// React text only (T-93-76). Colours only through the --status-info-* tokens.

const WHERE_LINES = 6
/** Without layout (tests, first paint) a text this long or this tall is assumed to be clamped. */
const WHERE_LONG_CHARS = 240

type LoadState = 'loading' | 'ready' | 'gone' | 'error'

const cardStyle: CSSProperties = {
  backgroundColor: 'var(--status-info-bg)',
  border: '1px solid var(--status-info-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
  color: 'var(--admin-text)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  fontWeight: 'var(--admin-fw-strong)',
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: 'var(--status-info-fg)',
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--admin-fs-label)',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: 'var(--status-info-fg)',
  marginBottom: '2px',
}

const textStyle: CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontWeight: 300 }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  )
}

export default function CustomTourRequestCard({
  requestId,
  onLoaded,
}: {
  requestId: string
  /** Called once with the request when it has loaded. */
  onLoaded?: (request: CustomTourRequestDetail) => void
}) {
  const [state, setState] = useState<LoadState>('loading')
  const [request, setRequest] = useState<CustomTourRequestDetail | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const whereRef = useRef<HTMLParagraphElement | null>(null)
  // The callback may change identity on every render of the builder: the latest one is read at call time.
  const onLoadedRef = useRef(onLoaded)
  useEffect(() => {
    onLoadedRef.current = onLoaded
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/custom-tours/${requestId}`, { cache: 'no-store' })
        if (cancelled) return
        if (res.status === 404) {
          setState('gone')
          return
        }
        if (!res.ok) {
          setState('error')
          return
        }
        const json = (await res.json()) as CustomTourRequestDetail
        if (cancelled) return
        setRequest(json)
        setState('ready')
        onLoadedRef.current?.(json)
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [requestId])

  const where = request?.where ?? ''
  useLayoutEffect(() => {
    const el = whereRef.current
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [where, expanded])

  const longText = where.length > WHERE_LONG_CHARS || where.split(/\r\n|\r|\n/).length > WHERE_LINES
  const canExpand = overflowing || longText

  const clamp: CSSProperties = expanded
    ? textStyle
    : { ...textStyle, display: '-webkit-box', WebkitLineClamp: WHERE_LINES, WebkitBoxOrient: 'vertical', overflow: 'hidden' }

  return (
    <section aria-label="Custom-tour request" data-testid="custom-tour-request-card" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <h2 style={headingStyle}>Custom-tour request</h2>
        <Link
          href={`/admin/custom-tours/${requestId}`}
          style={{ ...outlineButtonStyle, minHeight: '36px', padding: '0 12px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          Open request
        </Link>
      </div>

      {state === 'loading' && <p style={{ ...textStyle, color: 'var(--admin-text-muted)' }}>Loading…</p>}
      {state === 'gone' && <p style={{ ...textStyle, color: 'var(--admin-text-muted)' }}>This request was erased.</p>}
      {state === 'error' && <p style={{ ...textStyle, color: 'var(--admin-text-muted)' }}>Could not load the request.</p>}

      {state === 'ready' && request && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '12px 24px' }}>
          <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <Row label="Where">
              <p ref={whereRef} data-testid="custom-tour-request-where" style={clamp}>{request.where}</p>
              {canExpand && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                  style={{
                    marginTop: '4px',
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--status-info-fg)',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: 'var(--admin-fs-label)',
                    textDecoration: 'underline',
                  }}
                >
                  {expanded ? 'Show less' : 'Show all'}
                </button>
              )}
            </Row>
          </div>
          <Row label="Trip date">
            <p style={textStyle}>{request.date ?? 'Not given'}</p>
          </Row>
          <Row label="People">
            <p style={textStyle}>{request.people ?? '—'}</p>
          </Row>
          <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <Row label="Wishes">
              <p style={textStyle}>{request.wishes ?? 'None'}</p>
            </Row>
          </div>
        </div>
      )}
    </section>
  )
}
