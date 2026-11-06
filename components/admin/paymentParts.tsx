'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { inputBaseStyle, labelStyle as fieldLabelStyle } from './adminFieldStyles'
import {
  COPY_PARTIAL,
  labelStyle,
  amountStyle,
  bodyStyle,
  outlineButtonStyle,
  postFeeAction,
  type DialogOutcome,
  type FeeRouteAnswer,
} from './paymentShared'

// Phase 89-17: React parts shared by PaymentPanel and the fee / cash dialogs (banner, dialog buttons, the request hook).
// Colour comes only from var(--admin-*) / var(--status-*) tokens.

// ── banner ───────────────────────────────────────────────────────────────────

export type BannerFamily = 'danger' | 'amber' | 'warn' | 'info' | 'ok'

export interface BannerSpec {
  family: BannerFamily
  title: string
  body: string
  /** Extra lines under the body (the fee banner's collection sentence). */
  extra?: string | null
}

export function AlertBanner({ spec }: { spec: BannerSpec }) {
  const Icon = spec.family === 'info' || spec.family === 'ok' ? Info : TriangleAlert
  return (
    <div
      role={spec.family === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '16px', padding: '16px',
        background: `var(--status-${spec.family}-bg)`,
        border: `1px solid var(--status-${spec.family}-border)`,
        borderRadius: 'var(--admin-radius-md)',
      }}
    >
      <Icon size={20} aria-hidden="true" style={{ flexShrink: 0, color: `var(--status-${spec.family}-fg)` }} />
      <div style={{ ...bodyStyle, minWidth: 0 }}>
        <strong style={{ display: 'block', fontWeight: 'var(--admin-fw-strong)', color: `var(--status-${spec.family}-fg)` }}>
          {spec.title}
        </strong>
        <span style={{ overflowWrap: 'anywhere' }}>{spec.body}</span>
        {spec.extra ? <span style={{ display: 'block', marginTop: '4px', overflowWrap: 'anywhere' }}>{spec.extra}</span> : null}
      </div>
    </div>
  )
}

// ── dialog buttons ───────────────────────────────────────────────────────────

export function DecisionButtons({
  primaryLabel,
  tone,
  secondaryLabel,
  canSubmit,
  submitting,
  onPrimary,
  onSecondary,
  secondaryRef,
}: {
  primaryLabel: string
  tone: 'accent' | 'danger'
  secondaryLabel: string
  /** False while the input is invalid: the primary stays disabled. */
  canSubmit: boolean
  submitting: boolean
  onPrimary: () => void
  onSecondary: () => void
  secondaryRef?: React.Ref<HTMLButtonElement>
}) {
  const colors = tone === 'danger'
    ? { background: 'var(--admin-danger-solid)', color: 'var(--admin-on-danger)' }
    : { background: 'var(--admin-accent)', color: 'var(--admin-on-accent)' }
  const primaryDisabled = submitting || !canSubmit
  return (
    <div className="flex flex-col sm:flex-row" style={{ gap: '8px', marginTop: '24px' }}>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled}
        style={{
          ...outlineButtonStyle,
          ...colors,
          border: 'none',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          opacity: primaryDisabled ? 0.7 : 1,
          cursor: primaryDisabled ? 'not-allowed' : 'pointer',
          ...amountStyle,
        }}
      >
        {submitting && <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
        {submitting ? 'Working…' : primaryLabel}
      </button>
      <button
        ref={secondaryRef}
        type="button"
        onClick={onSecondary}
        disabled={submitting}
        style={{ ...outlineButtonStyle, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
      >
        {secondaryLabel}
      </button>
    </div>
  )
}

// ── request hook ─────────────────────────────────────────────────────────────

export interface DecisionResult {
  ok: boolean
  text: string
}

interface DecisionHandlers {
  /** Close the dialog (the panel's plain closer). */
  onClose: () => void
  /** Show the result line in the panel. */
  onResult: (result: DecisionResult) => void
  /** Refetch the payment GET. */
  onRefetch: () => void
}

/**
 * One request of a decision dialog. A second click before React re-renders sends no second request. While it runs the
 * dialog cannot be dismissed (the caller passes `submitting ? noop : onClose` to Modal). A reopened dialog starts clean.
 */
export function useDecisionRequest(isOpen: boolean, bookingId: string, handlers: DecisionHandlers) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<{ field: 'amount' | 'note'; text: string } | null>(null)
  const inFlight = useRef(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!isOpen) {
      setSubmitting(false)
      setError(null)
      setFieldError(null)
      inFlight.current = false
    }
  }, [isOpen])

  const submit = useCallback(
    async (payload: Record<string, unknown>, interpret: (answer: FeeRouteAnswer) => DialogOutcome) => {
      if (inFlight.current) return
      inFlight.current = true
      setSubmitting(true)
      setError(null)
      setFieldError(null)
      try {
        const outcome = interpret(await postFeeAction(bookingId, payload))
        const h = handlersRef.current
        if (outcome.kind === 'done') {
          h.onClose()
          h.onResult({ ok: outcome.ok, text: outcome.text })
          h.onRefetch()
        } else if (outcome.kind === 'gone') {
          h.onClose()
          h.onResult({ ok: false, text: outcome.text })
          h.onRefetch()
        } else {
          if (outcome.field) setFieldError({ field: outcome.field, text: outcome.text })
          else setError(outcome.text)
          if (outcome.refetch) h.onRefetch()
        }
      } catch {
        setError(COPY_PARTIAL)
        handlersRef.current.onRefetch()
      } finally {
        inFlight.current = false
        setSubmitting(false)
      }
    },
    [bookingId],
  )

  return { submitting, error, fieldError, submit }
}

/** The result / error line of a dialog. */
export function DialogError({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p role="alert" style={{ ...bodyStyle, color: 'var(--status-danger-fg)', margin: '16px 0 0', overflowWrap: 'anywhere' }}>
      {text}
    </p>
  )
}

/** Focus a field once the dialog is open. Deferred one tick so Modal records the trigger button for focus return. */
export function useFocusOnOpen<T extends HTMLElement>(isOpen: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => ref.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [isOpen])
  return ref
}

/** A required operator note (1 to `max`): the textarea of the cash dialogs. Stored on the booking, never shown to the client. */
export function NoteField({
  id,
  label,
  helper,
  value,
  max,
  disabled,
  onChange,
  inputRef,
}: {
  id: string
  label: string
  helper: string
  value: string
  max: number
  disabled: boolean
  onChange: (value: string) => void
  inputRef: React.Ref<HTMLTextAreaElement>
}) {
  return (
    <div style={{ marginTop: '16px' }}>
      <label htmlFor={id} style={fieldLabelStyle}>{label}</label>
      <textarea
        id={id}
        ref={inputRef}
        rows={3}
        value={value}
        maxLength={max}
        disabled={disabled}
        aria-required="true"
        aria-describedby={`${id}-help`}
        onChange={e => onChange(e.target.value)}
        onFocus={e => {
          e.currentTarget.style.outline = '2px solid var(--admin-focus)'
          e.currentTarget.style.outlineOffset = '2px'
        }}
        onBlur={e => { e.currentTarget.style.outline = 'none' }}
        style={{ ...inputBaseStyle, fontWeight: 400, resize: 'vertical' }}
      />
      <div id={`${id}-help`} style={{ ...labelStyle, marginTop: '4px' }}>{helper}</div>
    </div>
  )
}
