'use client'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { LocaleChip, RequestStatusBadge } from '@/components/admin/custom-tours/CustomToursTable'
import { errorStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { formatPragueFull, outlineButtonStyle } from '@/components/admin/paymentShared'
import type { CustomTourRequestDetail } from '@/lib/custom-tours/admin-store'
import { locales } from '@/i18n/locales'

// Phase 93 (plan 93-33; TRIP-07; UI-SPEC 8.2): one custom-tour request with a one-click "Create quote". Mounted by
// app/(internal)/admin/(dashboard)/custom-tours/[id]/page.tsx. The request text is visitor-supplied: every value is rendered as
// React text with pre-wrap (T-93-76), never as HTML; the mailto / tel / WhatsApp links are built from the email and the digits
// of the phone only. "Create quote" posts the request id and its language to the Phase 92 quote route (92 prices nothing
// here: the operator fills route and price in the builder). Colours only through --admin-* / --status-* tokens.

const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_LOAD_FAILED = 'Could not load the request. Try again.'
const COPY_CREATE_FAILED = 'Could not create the quote. Nothing was saved. Try again.'
const COPY_ERASED = 'This request was erased. A quote cannot be created.'

const MAX_NAME_PART = 100
const MAX_PHONE = 50

type LoadState = 'loading' | 'ready' | 'notfound' | 'error'

interface TourOption {
  id: string
  slug: string
  title: string
}

const cardStyle: CSSProperties = {
  backgroundColor: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
}

const mutedStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 300,
  color: 'var(--admin-text-muted)',
}

const h1Style: CSSProperties = {
  fontFamily: 'var(--font-cormorant)',
  fontSize: '26px',
  fontWeight: 300,
  lineHeight: 1.2,
  color: 'var(--admin-text)',
  letterSpacing: 0,
  overflowWrap: 'anywhere',
}

const accentButtonStyle: CSSProperties = {
  ...outlineButtonStyle,
  background: 'var(--admin-accent)',
  color: 'var(--admin-on-accent)',
  border: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  textDecoration: 'none',
}

const linkStyle: CSSProperties = { color: 'var(--admin-accent-text)', overflowWrap: 'anywhere' }

const valueStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 300,
  color: 'var(--admin-text)',
}

const textBlockStyle: CSSProperties = { ...valueStyle, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }

// Two columns from 768px: the card is at most 880px wide, so a 340px minimum gives one column below ~700px.
const dlStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
  gap: '16px 24px',
  margin: 0,
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0, ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
      <dt style={labelStyle}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  )
}

const none = <span style={{ ...valueStyle, color: 'var(--admin-text-muted)' }}>None</span>

/** The quote client from the request's single name field: split on the last space; a one-word name gets "-" as last name. */
function clientFrom(detail: CustomTourRequestDetail) {
  const full = detail.name.trim().replace(/\s+/g, ' ')
  const cut = full.lastIndexOf(' ')
  const first = (cut > 0 ? full.slice(0, cut) : full).slice(0, MAX_NAME_PART) || '-'
  const last = (cut > 0 ? full.slice(cut + 1) : '-').slice(0, MAX_NAME_PART)
  const phone = detail.phone?.trim().slice(0, MAX_PHONE) ?? ''
  return {
    first_name: first,
    last_name: last,
    email: detail.email,
    ...(phone ? { phone } : {}),
  }
}

const isQuoteLocale = (value: string): boolean => (locales as readonly string[]).includes(value)

export default function CustomTourDetail({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [detail, setDetail] = useState<CustomTourRequestDetail | null>(null)
  const [tour, setTour] = useState<TourOption | null>(null)
  const [quoteCreatedAt, setQuoteCreatedAt] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must send nothing.
  const busy = useRef(false)

  const load = useCallback(
    async (silent: boolean): Promise<CustomTourRequestDetail | null> => {
      if (!silent) setLoadState('loading')
      try {
        const res = await fetch(`/api/admin/custom-tours/${encodeURIComponent(requestId)}`, { cache: 'no-store' })
        if (res.status === 404) {
          setLoadState('notfound')
          return null
        }
        if (!res.ok) {
          if (!silent) setLoadState('error')
          return null
        }
        const json = (await res.json()) as CustomTourRequestDetail
        setDetail(json)
        setLoadState('ready')
        return json
      } catch {
        if (!silent) setLoadState('error')
        return null
      }
    },
    [requestId],
  )

  useEffect(() => {
    // The request is read from the server once per id.
    void load(false)
  }, [load])

  const tourSlug = detail?.tourSlug ?? null
  const quoteId = detail?.quote?.id ?? null

  // The starting tour links to its editor: the slug is matched to a tour of the admin list. No match leaves the slug as text.
  useEffect(() => {
    if (!tourSlug) {
      setTour(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/tours', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { tours?: TourOption[] }
        const match = (json.tours ?? []).find((t) => t.slug === tourSlug)
        if (!cancelled) setTour(match ? { id: match.id, slug: match.slug, title: match.title } : null)
      } catch {
        // The slug stays as plain text.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tourSlug])

  // "Quote created {date}" comes from the linked quote itself; without it the line is left out.
  useEffect(() => {
    if (!quoteId) {
      setQuoteCreatedAt(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/quotes/${quoteId}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { quote?: { created_at?: string } }
        const at = json.quote?.created_at
        if (!cancelled && typeof at === 'string') setQuoteCreatedAt(at)
      } catch {
        // The line is left out.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [quoteId])

  async function createQuote() {
    if (!detail || busy.current) return
    busy.current = true
    setCreating(true)
    setError(null)
    let navigating = false
    try {
      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: clientFrom(detail),
          lead_channel: 'other',
          currency: 'eur',
          source_inquiry_id: detail.id,
          ...(isQuoteLocale(detail.locale) ? { locale: detail.locale } : {}),
        }),
      })
      const body = (await res.json().catch(() => null)) as { id?: unknown } | null
      if (res.ok && body && typeof body.id === 'string') {
        navigating = true
        router.push(`/admin/quotes/${body.id}`)
        return
      }
      if (res.status === 401 || res.status === 403) {
        setError(COPY_SESSION)
      } else if (res.status === 404) {
        setLoadState('notfound')
      } else if (res.status === 409) {
        // Another quote already answers this request: read it again, the linked quote shows instead of the button.
        const fresh = await load(true)
        if (!fresh?.quote) setError(COPY_CREATE_FAILED)
      } else {
        setError(COPY_CREATE_FAILED)
      }
    } catch {
      setError(COPY_CREATE_FAILED)
    } finally {
      if (!navigating) {
        busy.current = false
        setCreating(false)
      }
    }
  }

  if (loadState === 'loading') return <p style={mutedStyle}>Loading…</p>

  if (loadState === 'notfound') {
    return (
      <div data-testid="custom-tour-detail" style={{ maxWidth: '880px' }}>
        <h1 style={h1Style}>Erased request</h1>
        <p role="alert" style={{ ...mutedStyle, marginTop: '8px' }}>{COPY_ERASED}</p>
      </div>
    )
  }

  if (loadState === 'error' || !detail) {
    return (
      <div data-testid="custom-tour-detail" style={{ maxWidth: '880px' }}>
        <p role="alert" style={errorStyle}>{COPY_LOAD_FAILED}</p>
        <button type="button" onClick={() => void load(false)} style={{ ...outlineButtonStyle, marginTop: '12px' }}>
          Retry
        </button>
      </div>
    )
  }

  const phoneDigits = (detail.phone ?? '').replace(/\D/g, '')
  const phoneTel = detail.phone ? detail.phone.replace(/[^\d+]/g, '') : ''
  const created = formatPragueFull(quoteCreatedAt)

  return (
    <div data-testid="custom-tour-detail" style={{ maxWidth: '880px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h1 style={h1Style}>{`Request from ${detail.name || detail.email}`}</h1>
        <RequestStatusBadge status={detail.status} />
      </div>

      <section aria-label="Request" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {detail.quote ? (
            <>
              <Link href={`/admin/quotes/${detail.quote.id}`} style={accentButtonStyle}>
                <FileText size={16} aria-hidden="true" />
                {`Open quote ${detail.quote.reference}`}
              </Link>
              {created && <span style={mutedStyle}>{`Quote created ${created}`}</span>}
            </>
          ) : (
            <button
              type="button"
              onClick={createQuote}
              disabled={creating}
              style={{ ...accentButtonStyle, opacity: creating ? 0.7 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}
            >
              <FileText size={16} aria-hidden="true" />
              {creating ? 'Creating…' : 'Create quote'}
            </button>
          )}
        </div>
        {error && <p role="alert" style={{ ...errorStyle, marginTop: 0, marginBottom: '16px' }}>{error}</p>}
        <dl style={dlStyle}>
          <Field label="Received">
            <p style={valueStyle}>{formatPragueFull(detail.receivedAt) ?? detail.receivedAt}</p>
          </Field>
          <Field label="Language">
            <LocaleChip locale={detail.locale} />
          </Field>
          <Field label="Starting tour">
            {detail.tourSlug ? (
              tour ? (
                <Link href={`/admin/tours/${tour.id}`} style={linkStyle}>{tour.title}</Link>
              ) : (
                <p style={textBlockStyle}>{detail.tourSlug}</p>
              )
            ) : (
              none
            )}
          </Field>
          <Field label="Trip date">
            {detail.date ? <p style={valueStyle}>{detail.date}</p> : <span style={{ ...valueStyle, color: 'var(--admin-text-muted)' }}>Not given</span>}
          </Field>
          <Field label="People">
            <p style={valueStyle}>{detail.people ?? '—'}</p>
          </Field>
          <Field label="Where" wide>
            <p style={textBlockStyle}>{detail.where}</p>
          </Field>
          <Field label="Wishes" wide>
            {detail.wishes ? <p style={textBlockStyle}>{detail.wishes}</p> : none}
          </Field>
        </dl>
      </section>

      <section aria-label="Contact" style={cardStyle}>
        <dl style={dlStyle}>
          <Field label="Name">
            <p style={{ ...valueStyle, overflowWrap: 'anywhere' }}>{detail.name || '—'}</p>
          </Field>
          <Field label="Email">
            <a href={`mailto:${detail.email}`} style={linkStyle}>{detail.email}</a>
          </Field>
          <Field label="Phone / WhatsApp" wide>
            {detail.phone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <a href={`tel:${phoneTel}`} style={linkStyle}>{detail.phone}</a>
                {phoneDigits && (
                  <a
                    href={`https://wa.me/${phoneDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...outlineButtonStyle, minHeight: '36px', padding: '0 12px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            ) : (
              none
            )}
          </Field>
        </dl>
      </section>
    </div>
  )
}
