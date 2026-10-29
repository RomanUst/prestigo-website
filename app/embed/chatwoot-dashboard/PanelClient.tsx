'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  PANEL_ERROR_CODES,
  STATUS_LABELS,
  type PanelBooking,
  type PanelErrorCode,
  type PanelResponse,
} from '@/lib/panel-dto'
import { FETCH_INFO_MESSAGE, TOKEN_STORAGE_KEY, isTrustedContextEvent, parseAppContext } from './panel-handshake'

// Kept as a local const holding the literal: the isolation guard proves the only fetch target of
// app/embed files from this declaration. A test pins it to PANEL_API_PATH.
const PANEL_API = '/api/chatwoot/dashboard-app'

const ASK_INTERVAL_MS = 1000
const MAX_RETRIES = 5
const PAST_LIMIT = 10

const NOT_FRAMED_COPY = 'Open this panel from a Chatwoot conversation.'
const HANDSHAKE_TIMEOUT_COPY =
  "Chatwoot didn't send the conversation. Switch to another conversation and back, or reload this page."
const TOKEN_REJECTED_COPY =
  'Token not accepted. Copy it again from Profile settings, Access Token in Chatwoot, then paste it here.'
const GENERIC_ERROR_COPY = "Couldn't load bookings. Press Refresh to try again."

const ERROR_COPY: Record<PanelErrorCode, string> = {
  invalid_token: TOKEN_REJECTED_COPY,
  no_access: "You don't have access to this conversation, so its bookings are hidden.",
  bad_request: GENERIC_ERROR_COPY,
  rate_limited: 'Too many requests. Wait a moment, then press Refresh.',
  unavailable: "Can't reach Chatwoot right now. Try again in a minute.",
  not_configured: "The panel isn't set up yet. Ask the site owner to check the Chatwoot settings.",
  internal: GENERIC_ERROR_COPY,
}

function isErrorCode(value: unknown): value is PanelErrorCode {
  return typeof value === 'string' && (PANEL_ERROR_CODES as readonly string[]).includes(value)
}

/** Body code first, HTTP status as a fallback; anything unrecognised is the generic error. */
function errorCodeFor(status: number, body: unknown): PanelErrorCode {
  const fromBody = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
  if (isErrorCode(fromBody)) return fromBody
  if (status === 401) return 'invalid_token'
  if (status === 403) return 'no_access'
  if (status === 429) return 'rate_limited'
  if (status === 502) return 'unavailable'
  return 'internal'
}

function isPanelResponse(body: unknown): body is PanelResponse {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Partial<PanelResponse>
  return (b.state === 'ok' || b.state === 'no_contact') && Array.isArray(b.upcoming) && Array.isArray(b.past)
}

function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token === null) window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    else window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // Storage can be blocked inside a cross-site iframe; the token then lives in memory only.
  }
}

const PRAGUE_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "Thu 12 Nov 2026, 14:30" in Prague time; the wall-clock text when the instant is unknown. */
function formatPickup(b: PanelBooking): string {
  if (b.pickupMs === null) return `${b.pickupDate} ${b.pickupTime}`.trim()
  const parts: Record<string, string> = {}
  for (const part of PRAGUE_DATE.formatToParts(new Date(b.pickupMs))) parts[part.type] = part.value
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`
}

function BookingCard({ booking }: { booking: PanelBooking }) {
  const hourly = booking.hours !== null && booking.destination === null
  return (
    <article className="card">
      <h3 className="card-title">
        {formatPickup(booking)}
        {booking.isReturnLeg ? <span className="badge badge-neutral">Return</span> : null}
      </h3>
      <p className="route">
        <span>{hourly ? `${booking.origin} - ${booking.hours} h` : booking.origin}</span>
        {booking.destination ? <span className="route-to">{`to ${booking.destination}`}</span> : null}
      </p>
      <p className="badge-row">
        <span className={`badge badge-${STATUS_LABELS[booking.status] ? booking.status : 'neutral'}`}>
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
        {booking.reference ? <span className="meta reference">{booking.reference}</span> : null}
      </p>
    </article>
  )
}

function SkeletonCards() {
  return (
    <div aria-hidden="true" className="skeletons">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  )
}

interface PanelClientProps {
  /** Exact origin of the configured Chatwoot instance (derived on the server), or null. */
  chatwootOrigin: string | null
}

export default function PanelClient({ chatwootOrigin }: PanelClientProps) {
  const [inert, setInert] = useState(false)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [handshakeTimedOut, setHandshakeTimedOut] = useState(false)
  const [tokenLoaded, setTokenLoaded] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [tokenRejected, setTokenRejected] = useState(false)
  const [draft, setDraft] = useState('')
  const [data, setData] = useState<PanelResponse | null>(null)
  const [errorCode, setErrorCode] = useState<PanelErrorCode | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const tokenInput = useRef<HTMLInputElement>(null)

  // Token from the tab-scoped store, after hydration so the server markup matches.
  useEffect(() => {
    setToken(readStoredToken())
    setTokenLoaded(true)
  }, [])

  // Handshake: listener first, then ask the parent, retrying while no context has arrived.
  useEffect(() => {
    const parent = window.parent
    if (parent === window || !chatwootOrigin) {
      setInert(true)
      return
    }
    let received = false
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedContextEvent(event, chatwootOrigin, parent)) return
      const context = parseAppContext(event.data)
      if (!context) return
      received = true
      window.clearInterval(timer)
      document.documentElement.dataset.theme = context.theme
      setHandshakeTimedOut(false)
      setConversationId(context.conversationId)
    }
    window.addEventListener('message', onMessage)

    parent.postMessage(FETCH_INFO_MESSAGE, chatwootOrigin)
    let retries = 0
    const timer = window.setInterval(() => {
      if (received) {
        window.clearInterval(timer)
      } else if (retries < MAX_RETRIES) {
        retries += 1
        parent.postMessage(FETCH_INFO_MESSAGE, chatwootOrigin)
      } else {
        window.clearInterval(timer)
        setHandshakeTimedOut(true)
      }
    }, ASK_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('message', onMessage)
    }
  }, [chatwootOrigin])

  // Load the bookings once we hold both a token and a trusted conversation id.
  useEffect(() => {
    if (!token || conversationId === null) return
    const controller = new AbortController()
    setLoading(true)
    setErrorCode(null)
    ;(async () => {
      try {
        const res = await fetch(PANEL_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'api-access-token': token },
          body: JSON.stringify({ conversationId }),
          credentials: 'omit',
          cache: 'no-store',
          signal: controller.signal,
        })
        const body: unknown = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        if (res.ok && isPanelResponse(body)) {
          setData(body)
        } else {
          const code = errorCodeFor(res.status, body)
          if (code === 'invalid_token') {
            writeStoredToken(null)
            setToken(null)
            setData(null)
            setTokenRejected(true)
          } else {
            setErrorCode(code)
          }
        }
      } catch {
        if (!controller.signal.aborted) setErrorCode('internal')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [token, conversationId, reloadTick])

  const showTokenEntry = tokenLoaded && !token
  useEffect(() => {
    if (showTokenEntry && tokenRejected) tokenInput.current?.focus()
  }, [showTokenEntry, tokenRejected])

  const saveToken = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const value = draft.trim()
      if (!value) return
      writeStoredToken(value)
      setDraft('')
      setTokenRejected(false)
      setToken(value)
    },
    [draft],
  )

  if (inert) {
    return (
      <main className="panel">
        <p className="state-text">{NOT_FRAMED_COPY}</p>
      </main>
    )
  }

  const bookings = data ? [...data.upcoming, ...data.past.slice(0, PAST_LIMIT)] : []
  let status = ''
  if (showTokenEntry) status = 'Connect your Chatwoot account'
  else if (loading && !data) status = 'Loading bookings'
  else if (data) status = 'Bookings loaded'

  return (
    <main className="panel">
      <div className="sr-only" aria-live="polite">
        {status}
      </div>
      <header className="panel-header">
        <h1 className="heading">Bookings</h1>
        {token && conversationId !== null ? (
          <button type="button" className="text-button" disabled={loading} onClick={() => setReloadTick((n) => n + 1)}>
            Refresh
          </button>
        ) : null}
      </header>

      {showTokenEntry ? (
        <form className="state-panel" onSubmit={saveToken}>
          <h2 className="heading">Connect your Chatwoot account</h2>
          <p>
            Paste your personal access token to see this customer&apos;s bookings. Find it in Chatwoot under Profile
            settings, Access Token. It stays in this browser tab only and is cleared when you close it.
          </p>
          {tokenRejected ? (
            <p role="alert" className="error-text">
              {TOKEN_REJECTED_COPY}
            </p>
          ) : null}
          <label htmlFor="chatwoot-token" className="label">
            Chatwoot access token
          </label>
          <input
            id="chatwoot-token"
            ref={tokenInput}
            className="field"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste token"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="primary-button">
            Save token
          </button>
        </form>
      ) : null}

      {!showTokenEntry && tokenLoaded && conversationId === null && handshakeTimedOut ? (
        <p role="alert" className="error-text state-panel">
          {HANDSHAKE_TIMEOUT_COPY}
        </p>
      ) : null}

      {!showTokenEntry && errorCode ? (
        <p role="alert" className="error-text state-panel">
          {ERROR_COPY[errorCode]}
        </p>
      ) : null}

      {!showTokenEntry && !errorCode && !data && !(conversationId === null && handshakeTimedOut) ? (
        <SkeletonCards />
      ) : null}

      {!showTokenEntry && data && data.state === 'no_contact' ? (
        <p className="state-text">Add an email or phone to this contact in Chatwoot to see bookings</p>
      ) : null}

      {!showTokenEntry && data && data.state === 'ok' && bookings.length === 0 ? (
        <section className="state-panel">
          <h2 className="heading">No bookings</h2>
        </section>
      ) : null}

      {!showTokenEntry && data && bookings.length > 0 ? (
        <ul className="cards">
          {bookings.map((b) => (
            <li key={b.id}>
              <BookingCard booking={b} />
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}
