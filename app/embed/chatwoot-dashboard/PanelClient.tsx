'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { PANEL_ERROR_CODES, type PanelErrorCode, type PanelResponse } from '@/lib/panel-dto'
import { ADMIN_ALL_BOOKINGS_HREF, ADMIN_HOME_HREF } from '@/lib/panel-links'
import BookingCard, { formatEur, formatPragueTime } from './BookingCard'
import {
  FETCH_INFO_MESSAGE,
  TOKEN_STORAGE_KEY,
  isTrustedContextEvent,
  isTrustedWebViewEvent,
  nativeBridgeOf,
  parseAppContext,
} from './panel-handshake'

// Kept as a local const holding the literal: the isolation guard proves the only fetch target of
// app/embed files from this declaration. A test pins it to PANEL_API_PATH.
const PANEL_API = '/api/chatwoot/dashboard-app'

const ASK_INTERVAL_MS = 1000
const MAX_RETRIES = 5
const PAST_LIMIT = 10
const AUTO_REFRESH_MS = 30_000

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
  return (
    (b.state === 'ok' || b.state === 'no_contact') &&
    Array.isArray(b.upcoming) &&
    Array.isArray(b.past) &&
    typeof b.contact === 'object' &&
    b.contact !== null &&
    typeof b.counters === 'object' &&
    b.counters !== null
  )
}

/** The Lead link comes from our own API; still, only an https URL is ever put into an href. */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
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
  const [announcement, setAnnouncement] = useState('')
  const [showAllPast, setShowAllPast] = useState(false)
  const loadingRef = useRef(false)
  const tokenInput = useRef<HTMLInputElement>(null)

  // Token from the tab-scoped store, after hydration so the server markup matches.
  useEffect(() => {
    setToken(readStoredToken())
    setTokenLoaded(true)
  }, [])

  // Handshake: listener first, then ask Chatwoot, retrying while no context has arrived. On the web
  // Chatwoot is the parent frame; in the mobile app this page is top level in a WebView and the
  // request goes through the native bridge instead.
  useEffect(() => {
    const parent = window.parent
    const bridge = nativeBridgeOf(window)
    if (!chatwootOrigin || (parent === window && !bridge)) {
      setInert(true)
      return
    }
    const origin = chatwootOrigin
    const ask = bridge
      ? () => bridge.postMessage(FETCH_INFO_MESSAGE)
      : () => parent.postMessage(FETCH_INFO_MESSAGE, origin)
    const trusted = bridge
      ? (event: MessageEvent) => isTrustedWebViewEvent(event, window)
      : (event: MessageEvent) => isTrustedContextEvent(event, origin, parent)
    let received = false
    const onMessage = (event: MessageEvent) => {
      if (!trusted(event)) return
      const context = parseAppContext(event.data)
      if (!context) return
      received = true
      window.clearInterval(timer)
      document.documentElement.dataset.theme = context.theme
      setHandshakeTimedOut(false)
      setConversationId(context.conversationId)
    }
    window.addEventListener('message', onMessage)

    ask()
    let retries = 0
    const timer = window.setInterval(() => {
      if (received) {
        window.clearInterval(timer)
      } else if (retries < MAX_RETRIES) {
        retries += 1
        ask()
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

  // A new conversation never shows the previous customer's data, even if its own request fails.
  useEffect(() => {
    setData(null)
    setErrorCode(null)
    setShowAllPast(false)
  }, [conversationId])

  // Load the bookings once we hold both a token and a trusted conversation id. A re-run (Refresh, focus,
  // visibility, the 30 s timer) keeps the last good response on screen and swaps it in place.
  useEffect(() => {
    if (!token || conversationId === null) {
      loadingRef.current = false
      setLoading(false)
      return
    }
    const controller = new AbortController()
    loadingRef.current = true
    setLoading(true)
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
          setErrorCode(null)
        } else {
          const code = errorCodeFor(res.status, body)
          if (code === 'invalid_token') {
            writeStoredToken(null)
            setToken(null)
            setData(null)
            setErrorCode(null)
            setTokenRejected(true)
          } else {
            // No access means no booking data on screen; any other error keeps the last good data below it.
            if (code === 'no_access') setData(null)
            setErrorCode(code)
          }
        }
      } catch {
        if (!controller.signal.aborted) setErrorCode('internal')
      } finally {
        if (!controller.signal.aborted) {
          loadingRef.current = false
          setLoading(false)
        }
      }
    })()
    return () => controller.abort()
  }, [token, conversationId, reloadTick])

  // Stay fresh on its own: window focus, the tab becoming visible, and every 30 s while visible.
  useEffect(() => {
    if (!token || conversationId === null) return
    const refreshIfIdle = () => {
      if (!loadingRef.current) setReloadTick((n) => n + 1)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfIdle()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshIfIdle()
    }, AUTO_REFRESH_MS)
    window.addEventListener('focus', refreshIfIdle)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshIfIdle)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token, conversationId])

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

  // Clears only the locally stored token (no confirmation: pasting it again restores everything).
  const forgetToken = useCallback(() => {
    writeStoredToken(null)
    setToken(null)
    setData(null)
    setErrorCode(null)
    setTokenRejected(false)
    setShowAllPast(false)
  }, [])

  if (inert) {
    return (
      <main className="panel">
        <p className="state-text">{NOT_FRAMED_COPY}</p>
      </main>
    )
  }

  const upcoming = data ? data.upcoming : []
  const past = data ? data.past : []
  const visiblePast = showAllPast ? past : past.slice(0, PAST_LIMIT)
  const hiddenPast = past.length - visiblePast.length
  const hasBookings = upcoming.length + past.length > 0
  const contactLabel = data ? (data.contact.email ?? data.contact.phone) : null
  const updatedAt = data ? new Date(data.generatedAt) : null
  const updatedText = updatedAt && !Number.isNaN(updatedAt.getTime()) ? formatPragueTime(updatedAt) : null
  const leadHref = data && data.leadUrl && isHttpsUrl(data.leadUrl) ? data.leadUrl : null

  let status = ''
  if (showTokenEntry) status = 'Connect your Chatwoot account'
  else if (loading && !data) status = 'Loading bookings'
  else if (data) status = 'Bookings loaded'
  if (announcement) status = announcement

  return (
    <main className="panel">
      <div className="sr-only" aria-live="polite">
        {status}
      </div>
      <header className="panel-header">
        <h1 className="heading">Bookings</h1>
        {token && conversationId !== null ? (
          <button
            type="button"
            className="text-button"
            disabled={loading}
            aria-disabled={loading}
            onClick={() => setReloadTick((n) => n + 1)}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
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

      {!showTokenEntry && data && data.state === 'ok' ? (
        <>
          <div className="contact">
            {contactLabel ? <p className="meta contact-line">{contactLabel}</p> : null}
            {data.contact.phoneMismatch ? <p className="meta">Phone matches a different customer</p> : null}
            {data.contact.verified ? (
              <p className="meta">Verified customer (signed in)</p>
            ) : (
              <p className="hint">
                <span className="hint-dot" aria-hidden="true" />
                Unverified email - confirm identity before sharing booking details
              </p>
            )}
          </div>

          {hasBookings ? (
            <>
              <dl className="counters">
                <div className="counter">
                  <dt className="label">Trips</dt>
                  <dd className="counter-value">{data.counters.trips}</dd>
                </div>
                <div className="counter">
                  <dt className="label">Total spent</dt>
                  <dd className="counter-value">{formatEur(data.counters.totalSpentEur)}</dd>
                </div>
              </dl>

              <section className="section">
                <h2 className="heading">
                  Upcoming <span className="meta">{`· ${upcoming.length}`}</span>
                </h2>
                {upcoming.length > 0 ? (
                  <ul className="cards">
                    {upcoming.map((b, i) => (
                      <li key={b.id}>
                        <BookingCard booking={b} isNext={i === 0} onAnnounce={setAnnouncement} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-line">No upcoming trips</p>
                )}
              </section>

              <section className="section">
                <h2 className="heading">
                  Past <span className="meta">{`· ${past.length}`}</span>
                </h2>
                {visiblePast.length > 0 ? (
                  <ul className="cards">
                    {visiblePast.map((b) => (
                      <li key={b.id}>
                        <BookingCard booking={b} isNext={false} onAnnounce={setAnnouncement} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-line">No past trips</p>
                )}
                {hiddenPast > 0 ? (
                  <button type="button" className="text-button show-more" onClick={() => setShowAllPast(true)}>
                    {`Show ${hiddenPast} more`}
                  </button>
                ) : null}
                {data.pastTruncated ? (
                  <a className="link" href={ADMIN_ALL_BOOKINGS_HREF} target="_blank" rel="noopener noreferrer">
                    Open all bookings in admin
                  </a>
                ) : null}
              </section>
            </>
          ) : (
            <section className="state-panel">
              <h2 className="heading">No bookings</h2>
              <p>{`No bookings found for ${contactLabel ?? 'this contact'}.`}</p>
              <p className="actions">
                <a className="link" href={ADMIN_HOME_HREF} target="_blank" rel="noopener noreferrer">
                  Create booking in admin
                </a>
                {leadHref ? (
                  <a className="link" href={leadHref} target="_blank" rel="noopener noreferrer">
                    Open Lead in EspoCRM
                  </a>
                ) : null}
              </p>
            </section>
          )}
        </>
      ) : null}

      {!showTokenEntry && token ? (
        <footer className="panel-footer">
          <span className="meta">{updatedText ? `Updated ${updatedText}` : ''}</span>
          <button type="button" className="text-button" onClick={forgetToken}>
            Forget token
          </button>
        </footer>
      ) : null}
    </main>
  )
}
