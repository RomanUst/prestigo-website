'use client'

// What a client can do on the manage page (Phase 89, plan 89-28; UI-SPEC Surface 1; D-01 to D-04): cancel the booking and
// ask the operator for a change. This is the only client component of the page.
//
// - It receives READY strings (and nodes) from the server page, built from the catalog in the booking's language, plus the
//   secret token. The layout has no client message provider, so nothing here translates anything.
// - The cancel is an explicit POST (mail scanners prefetch GET links). The client sends the outcome it was shown
//   (`acknowledge`); the server recomputes it, and a stale page cancels nothing and learns the current outcome (409).
// - The late variant needs a ticked checkbox before the confirm is enabled. The tick belongs to one variant and is cleared
//   whenever the variant changes or the server answers POLICY_CHANGED.
// - Types for the strings live here; the page imports them with `import type`.

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from '@/i18n/routing'
import { LoaderCircle } from 'lucide-react'

export type ManageCancelVariant = 'free' | 'late'

export interface ManageCancelCopy {
  open: string
  heading: string
  keep: string
  confirm: string
  busy: string
  /** Per variant: the summary line and (late only) the label of the required tick. */
  variants: Record<ManageCancelVariant, { summary: ReactNode; tick: ReactNode | null }>
  results: {
    freeHold: ReactNode
    /** Null when the page knows of no collected money: the generic line is used then. */
    freeRefunded: ReactNode | null
    freeNone: ReactNode
    late: ReactNode
    manual: ReactNode
    generic: ReactNode
    emailSent: string
  }
  errors: {
    policyChanged: string
    busy: string
    rateLimit: string
    network: string
    generic: ReactNode
  }
  /** The H1 once cancelled (page H1 updates to "Booking cancelled"). */
  cancelledTitle: string
}

export interface ManageChangeCopy {
  open: string
  label: string
  helper: string
  phone: ReactNode
  send: string
  sending: string
  sent: string
  errors: { empty: string; rateLimit: string; generic: ReactNode }
}

export type ManageActionsProps =
  | { region: 'cancel'; token: string; variant: ManageCancelVariant; copy: ManageCancelCopy }
  | { region: 'change-request'; token: string; copy: ManageChangeCopy }

const MESSAGE_MAX = 1000
const COUNTER_FROM = 900
const ERROR_COLOR = '#f87171'

// ── "this booking was just cancelled in this browser" ─────────────────────────────────────────────────────────────────
// A tiny external store so the H1 and the change-request form (server-placed elsewhere in the page) follow the cancel
// without a second client tree. Keyed by token: a stale flag can never leak onto another booking's page.

let cancelledToken: string | null = null
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
function markCancelled(token: string) {
  cancelledToken = token
  listeners.forEach((fn) => fn())
}
function useCancelled(token: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => cancelledToken === token,
    () => false,
  )
}

/** The page H1: its server-rendered content until the booking is cancelled here, then "Booking cancelled". */
export function ManageTitle({ token, cancelledTitle, children }: { token: string; cancelledTitle: string; children: ReactNode }) {
  return useCancelled(token) ? <>{cancelledTitle}</> : <>{children}</>
}

// ── shared styling (inline, CSS variables; same recipe as the page) ───────────────────────────────────────────────────

const surfaceStyle = {
  boxSizing: 'border-box',
  marginTop: 16,
  padding: 24,
  backgroundColor: 'var(--anthracite-mid)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: 4,
} as const

const bodyStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.6,
  color: 'var(--offwhite)',
  overflowWrap: 'anywhere',
} as const

const fullWidth = { width: '100%', boxSizing: 'border-box' } as const

const dangerButtonStyle = {
  ...fullWidth,
  gap: 8,
  minHeight: 44,
  color: ERROR_COLOR,
  backgroundColor: 'transparent',
  border: `1px solid ${ERROR_COLOR}`,
} as const

type Message = { kind: 'error' | 'notice'; node: ReactNode }

function messageStyle(kind: Message['kind']) {
  return {
    ...bodyStyle,
    marginTop: 16,
    ...(kind === 'error' ? { color: ERROR_COLOR } : {}),
  } as const
}

/** A POST with a JSON body. Never throws: a network failure is `{ network: true }`. */
async function postJson(url: string, payload: unknown): Promise<{ network: true } | { network: false; status: number; data: Record<string, unknown> }> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return { network: true }
  }
  const data = (await res.json().catch(() => ({}))) as unknown
  return { network: false, status: res.status, data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {} }
}

// ── cancel ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function CancelRegion({ token, variant: variantProp, copy }: { token: string; variant: ManageCancelVariant; copy: ManageCancelCopy }) {
  const router = useRouter()
  const regionId = useId()
  const headingId = `${regionId}-heading`
  // A 409 POLICY_CHANGED switches the region to the variant the server named, at once; the refresh below makes the
  // server-rendered panel above it catch up. Until then the override wins.
  const [override, setOverride] = useState<ManageCancelVariant | null>(null)
  const variant = override ?? variantProp
  const [open, setOpen] = useState(false)
  const [tickedFor, setTickedFor] = useState<ManageCancelVariant | null>(null)
  const ticked = tickedFor === variant && variant === 'late'
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<(Message & { focus?: boolean }) | null>(null)
  const [result, setResult] = useState<ReactNode | null>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const cancelled = useCancelled(token)

  // Opening moves focus to the heading of the region (tabIndex -1); a notice that asks for attention takes it next.
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])
  useEffect(() => {
    if (message?.focus) noticeRef.current?.focus()
  }, [message])
  useEffect(() => {
    if (result) resultRef.current?.focus()
  }, [result])

  const close = () => {
    setOpen(false)
    setMessage(null)
    setTickedFor(null)
    // The control that opened the region is gone from the focus order while it is open; give focus back to it.
    setTimeout(() => openButtonRef.current?.focus(), 0)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation()
      close()
    }
  }

  const finish = (node: ReactNode) => {
    markCancelled(token)
    setOpen(false)
    setMessage(null)
    setResult(node)
  }

  const submit = async () => {
    if (busy || (variant === 'late' && !ticked)) return
    setBusy(true)
    setMessage(null)
    const answer = await postJson('/api/manage/cancel', { token, acknowledge: variant })
    setBusy(false)

    if (answer.network) {
      setMessage({ kind: 'error', node: copy.errors.network })
      return
    }
    const { status, data } = answer

    if (status >= 200 && status < 300 && data.ok === true) {
      // A repeat cancel is a success: the page re-renders as cancelled.
      if (data.alreadyCancelled === true) {
        finish(<p style={bodyStyle}>{copy.results.generic}</p>)
        router.refresh()
        return
      }
      const money = data.money
      let line: ReactNode
      let mail = true
      if (money === 'kept') line = copy.results.late
      else if (money === 'manual') {
        line = copy.results.manual
        mail = false
      } else if (money === 'released') line = copy.results.freeHold
      else if (money === 'refunded') line = copy.results.freeRefunded ?? copy.results.generic
      else if (money === 'none') line = copy.results.freeNone
      else line = copy.results.generic
      finish(
        <>
          <p style={bodyStyle}>{line}</p>
          {mail ? <p style={{ ...bodyStyle, marginTop: 8 }}>{copy.results.emailSent}</p> : null}
        </>,
      )
      return
    }

    if (status === 409 && data.code === 'POLICY_CHANGED') {
      setTickedFor(null)
      if (data.outcome === 'free' || data.outcome === 'late') setOverride(data.outcome)
      setMessage({ kind: 'notice', node: copy.errors.policyChanged, focus: true })
      router.refresh()
      return
    }
    if (status === 409 && data.error === 'payment_busy') {
      setMessage({ kind: 'error', node: copy.errors.busy })
      return
    }
    // The booking is not what the page showed (already cancelled elsewhere, status moved, pickup passed): no error, the
    // page re-renders as what it is now.
    if (status === 409) {
      setOpen(false)
      router.refresh()
      return
    }
    if (status === 429) {
      setMessage({ kind: 'error', node: copy.errors.rateLimit })
      return
    }
    setMessage({ kind: 'error', node: copy.errors.generic })
  }

  if (result) {
    return (
      <div
        ref={resultRef}
        role="status"
        tabIndex={-1}
        data-testid="manage-cancel-result"
        style={{ marginTop: 24, outline: 'none' }}
      >
        {result}
      </div>
    )
  }
  // Cancelled in this browser through another tab: nothing left to offer.
  if (cancelled) return null

  const v = copy.variants[variant]
  const lateBlocked = variant === 'late' && !ticked

  return (
    <div data-testid="manage-cancel-region" style={{ marginTop: 24 }}>
      {!open ? (
        <button
          ref={openButtonRef}
          type="button"
          className="btn-secondary"
          style={fullWidth}
          aria-expanded={false}
          aria-controls={regionId}
          onClick={() => setOpen(true)}
        >
          {copy.open}
        </button>
      ) : (
        <div
          id={regionId}
          role="group"
          aria-labelledby={headingId}
          aria-busy={busy}
          onKeyDown={onKeyDown}
          style={{ borderTop: '1px solid var(--anthracite-light)', paddingTop: 24 }}
        >
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            style={{ ...bodyStyle, fontWeight: 400, outline: 'none' }}
          >
            {copy.heading}
          </h3>
          <p style={{ ...bodyStyle, marginTop: 8 }}>{v.summary}</p>

          {variant === 'late' && v.tick ? (
            <label
              style={{ display: 'flex', alignItems: 'flex-start', gap: 16, minHeight: 44, padding: '8px 0', marginTop: 16, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={ticked}
                disabled={busy}
                onChange={(e) => setTickedFor(e.target.checked ? 'late' : null)}
                style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, accentColor: 'var(--copper)' }}
              />
              <span style={bodyStyle}>{v.tick}</span>
            </label>
          ) : null}

          {message ? (
            <p
              ref={message.kind === 'notice' ? noticeRef : undefined}
              role={message.kind === 'error' ? 'alert' : 'status'}
              tabIndex={message.kind === 'notice' ? -1 : undefined}
              style={{ ...messageStyle(message.kind), outline: 'none' }}
            >
              {message.node}
            </p>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <button
              type="button"
              className="btn-primary"
              style={{ ...fullWidth, flex: '1 1 200px' }}
              disabled={busy}
              onClick={close}
            >
              {copy.keep}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ ...dangerButtonStyle, flex: '1 1 200px', opacity: busy || lateBlocked ? 0.6 : 1 }}
              disabled={busy || lateBlocked}
              aria-busy={busy}
              onClick={submit}
            >
              {busy ? (
                <>
                  <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  <span>{copy.busy}</span>
                </>
              ) : (
                copy.confirm
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── change request ────────────────────────────────────────────────────────────────────────────────────────────────────

function ChangeRegion({ token, copy }: { token: string; copy: ManageChangeCopy }) {
  const regionId = useId()
  const textId = `${regionId}-text`
  const helperId = `${regionId}-helper`
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'empty' | 'rate' | 'generic' | null>(null)
  const [sent, setSent] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const sentRef = useRef<HTMLDivElement>(null)
  const cancelled = useCancelled(token)

  useEffect(() => {
    if (open) textRef.current?.focus()
  }, [open])
  useEffect(() => {
    if (sent) sentRef.current?.focus()
  }, [sent])

  // A cancelled booking can not be changed (and the page hides this form in that state).
  if (cancelled) return null

  if (sent) {
    return (
      <div ref={sentRef} role="status" tabIndex={-1} data-testid="manage-change-sent" style={{ ...surfaceStyle, outline: 'none' }}>
        <p style={bodyStyle}>{copy.sent}</p>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={fullWidth}
        aria-expanded={false}
        aria-controls={regionId}
        onClick={() => setOpen(true)}
      >
        {copy.open}
      </button>
    )
  }

  const submit = async () => {
    if (busy) return
    const message = text.trim()
    if (message.length === 0) {
      setError('empty')
      textRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const answer = await postJson('/api/manage/change-request', { token, message })
    setBusy(false)
    if (!answer.network && answer.status >= 200 && answer.status < 300 && answer.data.ok === true) {
      setSent(true)
      return
    }
    // The typed text stays in every failure.
    setError(!answer.network && answer.status === 429 ? 'rate' : 'generic')
  }

  const errorNode = error === 'empty' ? copy.errors.empty : error === 'rate' ? copy.errors.rateLimit : error === 'generic' ? copy.errors.generic : null

  return (
    <div id={regionId} data-testid="manage-change-region" aria-busy={busy} style={surfaceStyle}>
      <label htmlFor={textId} className="label" style={{ display: 'block' }}>
        {copy.label}
      </label>
      <textarea
        id={textId}
        ref={textRef}
        value={text}
        rows={5}
        maxLength={MESSAGE_MAX}
        autoComplete="off"
        disabled={busy}
        aria-describedby={helperId}
        aria-invalid={error === 'empty' ? true : undefined}
        onChange={(e) => {
          setText(e.target.value)
          if (error === 'empty') setError(null)
        }}
        style={{
          ...fullWidth,
          display: 'block',
          marginTop: 8,
          minHeight: 120,
          padding: 12,
          fontFamily: 'var(--font-montserrat)',
          fontWeight: 300,
          lineHeight: 1.5,
          color: 'var(--offwhite)',
          backgroundColor: 'var(--anthracite)',
          border: `1px solid ${error === 'empty' ? ERROR_COLOR : 'var(--anthracite-light)'}`,
          borderRadius: 4,
          resize: 'vertical',
        }}
      />
      <p id={helperId} style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 300, lineHeight: 1.5, color: 'var(--warmgrey)' }}>
        {copy.helper}
      </p>
      {text.length > COUNTER_FROM ? (
        <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)' }}>
          <bdi dir="ltr">
            {text.length} / {MESSAGE_MAX}
          </bdi>
        </p>
      ) : null}
      <p style={{ ...bodyStyle, marginTop: 16 }}>{copy.phone}</p>

      {errorNode ? (
        <p role="alert" style={{ ...bodyStyle, marginTop: 16, color: ERROR_COLOR }}>
          {errorNode}
        </p>
      ) : null}

      <button
        type="button"
        className="btn-primary"
        style={{ ...fullWidth, marginTop: 16, gap: 8, opacity: busy ? 0.6 : 1 }}
        disabled={busy}
        aria-busy={busy}
        onClick={submit}
      >
        {busy ? (
          <>
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            <span>{copy.sending}</span>
          </>
        ) : (
          copy.send
        )}
      </button>
    </div>
  )
}

export default function ManageActions(props: ManageActionsProps) {
  return props.region === 'cancel' ? (
    <CancelRegion token={props.token} variant={props.variant} copy={props.copy} />
  ) : (
    <ChangeRegion token={props.token} copy={props.copy} />
  )
}
