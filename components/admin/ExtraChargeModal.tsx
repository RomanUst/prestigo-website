'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle as fieldLabelStyle } from './adminFieldStyles'
import { DecisionButtons, DialogError, useFocusOnOpen, type DecisionResult } from './paymentParts'
import {
  COPY_PARTIAL,
  COPY_SESSION,
  CURRENCY_DECIMALS,
  amountStyle,
  bodyStyle,
  labelStyle,
  money,
  outlineButtonStyle,
  parseAmountToMinor,
  toCurrency,
} from './paymentShared'

// Phase 91-11 (EXTRA-01, D-09, D-10, D-15, D-16): the operator's extra charge to the client's saved card, from the booking
// panel. Two modes: extra WAITING (the operator enters billable minutes, the SERVER computes the amount; the browser never
// does) and OTHER (an agreed amount with a description that is printed on the client's receipt).
//
// Money rules of this dialog (T-91-35, T-91-36):
//   - the dialog states the amount, the currency and that the saved card is charged now with an email receipt BEFORE anything is
//     sent; the request goes out only from the primary button, whose label states the amount;
//   - a waiting request carries expected_amount_minor equal to the amount the server previewed, so the server can refuse a
//     different one (409 amount_changed); after that answer nothing is re-sent automatically: the new amount needs a new click;
//   - one request at a time (an in-flight ref blocks a second click before React re-renders), the primary is disabled while it
//     runs, and the dialog cannot be dismissed (Escape, scrim, close button) until the answer arrives;
//   - the server stays the authority for eligibility, rate, ceiling and currency: the UI checks are for convenience only.

export interface ExtraInFlight {
  id: string
  kind: 'waiting' | 'other'
  amount_minor: number
  currency: 'eur' | 'czk'
  requested_at: string
  /** True once the engine lease has passed: only then may the operator retry the same charge. */
  resumable: boolean
}

export interface ExtraChargeFact {
  id: string
  kind: 'waiting' | 'other'
  status: 'charging' | 'charged' | 'failed'
  amount_minor: number
  currency: 'eur' | 'czk'
  minutes: number | null
  description: string | null
  requested_at: string
  charged_at: string | null
  last_error_code: string | null
}

export interface ExtraFacts {
  eligible: boolean
  reason: string | null
  in_flight: ExtraInFlight | null
  charges: ExtraChargeFact[]
}

export interface ExtraChargeModalProps {
  isOpen: boolean
  bookingId: string
  currency: 'eur' | 'czk'
  inFlight: ExtraInFlight | null
  onClose: () => void
  /** The charge went through: the dialog has asked to close; report one result line and refetch. */
  onDone: (result?: DecisionResult) => void
  /** Refetch the panel after an answer that leaves the dialog open (a decline, a busy answer, a lost answer). */
  onRefetch?: () => void
}

type Mode = 'waiting' | 'other'

const DESCRIPTION_MIN = 3
const DESCRIPTION_MAX = 200
const MINUTES_MIN = 1
const MINUTES_MAX = 480
/** Stripe's technical ceiling for one amount in minor units; the server enforces it, this only saves a round trip. */
const AMOUNT_CEILING_MINOR = 99_999_999
const PREVIEW_DELAY_MS = 350
const BLOCK_MINUTES = 15

const COPY_CHARGE_STATEMENT =
  'The saved card is charged now. The client gets an email receipt.'
const COPY_WAITING_HINT = 'Enter only the billable minutes beyond the free waiting.'
const COPY_RECEIPT_LABEL = 'Shown to the client in the receipt'
const COPY_RATE_MISSING = 'No waiting rate is set for this class in Admin > Pricing.'
const COPY_PREVIEW_FAILED = 'Could not calculate the amount. Try again.'
const COPY_REFUSED = 'The request was refused. Check the values and try again.'
const COPY_GENERIC = 'Could not complete the charge. Nothing was charged. Try again.'
const COPY_BUSY_EXTRA = 'A charge is still being processed. Try again in a few minutes.'
// Stripe did not settle the payment and it could not be cancelled: it may still go through. Never "declined / nothing charged".
const COPY_UNCONFIRMED =
  'Stripe has not confirmed whether this charge went through. Do not charge again. The owner was alerted: check the payment in the Stripe Dashboard.'

/** The plain-words reason of a refused action (the route's action_not_allowed reasons). */
const NOT_ALLOWED_TEXT: Record<string, string> = {
  partner: 'Extra charges are not available for partner bookings.',
  erased: 'This booking was erased at the client\'s request, so nothing can be charged.',
  not_completed: 'The trip is not completed yet, so nothing can be charged.',
  payment_mode: 'This booking has no saved card that can be charged an extra.',
  no_saved_card: 'There is no saved card on this booking.',
  consent_not_covered: "The client's card consent does not cover extra charges.",
  in_flight: 'Another extra charge is still being processed.',
}

interface ExtraAnswer {
  status: number
  body: {
    outcome?: string
    error?: string
    reason?: string
    code?: string
    amount_minor?: number
    currency?: string
    blocks?: number
  } | null
}

type Preview =
  | { status: 'idle' }
  | { status: 'loading'; minutes: number }
  | { status: 'ok'; minutes: number; amountMinor: number; currency: string; blocks: number }
  | { status: 'error'; minutes: number; text: string }

type Outcome =
  | { kind: 'done'; text: string }
  | { kind: 'stay'; text: string; refetch?: boolean }

/** One line: no control character, no line or paragraph separator (mirrors the route schema). */
function isSingleLine(s: string): boolean {
  return ![...s].some((ch) => {
    const c = ch.codePointAt(0) ?? 0
    return c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029
  })
}

function notAllowedText(reason: string | undefined): string {
  return (reason && NOT_ALLOWED_TEXT[reason]) || 'This charge is not allowed for the booking right now.'
}

async function request(url: string, init?: RequestInit): Promise<ExtraAnswer> {
  const res = await fetch(url, init)
  const body: ExtraAnswer['body'] = await res.json().catch(() => null)
  return { status: res.status, body }
}

/** Every non-happy answer of the POST, shared by the new charge and the resume. Charged is handled by the caller. */
function interpretPost(answer: ExtraAnswer, currency: 'eur' | 'czk'): Outcome {
  const { status, body } = answer
  if (status === 200 && body?.outcome === 'charged') {
    const amount = typeof body.amount_minor === 'number' ? money(body.amount_minor, body.currency ?? currency) : 'The amount'
    return { kind: 'done', text: `${amount} was charged to the saved card and the client was emailed a receipt.` }
  }
  if (status === 200 && body?.outcome === 'declined') {
    return { kind: 'stay', text: `The card was declined (${body.code ?? 'unknown'}). Nothing was charged.`, refetch: true }
  }
  if (status === 200 && body?.outcome === 'unconfirmed') return { kind: 'stay', text: COPY_UNCONFIRMED, refetch: true }
  if (status === 401 || status === 403) return { kind: 'stay', text: COPY_SESSION }
  if (status === 409 && body?.error === 'payment_busy') return { kind: 'stay', text: COPY_BUSY_EXTRA, refetch: true }
  if (status === 422 && body?.error === 'waiting_rate_missing') return { kind: 'stay', text: COPY_RATE_MISSING }
  if (status === 422) return { kind: 'stay', text: notAllowedText(body?.reason), refetch: true }
  if (status === 400) return { kind: 'stay', text: COPY_REFUSED }
  // A 5xx (or a lost answer) may come after the charge ran: never claim that nothing was charged.
  if (status >= 500) return { kind: 'stay', text: COPY_PARTIAL, refetch: true }
  return { kind: 'stay', text: COPY_GENERIC }
}

export function ExtraChargeModal({ isOpen, bookingId, currency, inFlight, onClose, onDone, onRefetch }: ExtraChargeModalProps) {
  const decimals = CURRENCY_DECIMALS[toCurrency(currency)]
  const [mode, setMode] = useState<Mode>('other')
  const [description, setDescription] = useState('')
  const [amountText, setAmountText] = useState('')
  const [minutesText, setMinutesText] = useState('')
  const [preview, setPreview] = useState<Preview>({ status: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must send nothing (T-91-36).
  const busy = useRef(false)
  const handlersRef = useRef({ onClose, onDone, onRefetch })
  handlersRef.current = { onClose, onDone, onRefetch }
  const firstFieldRef = useFocusOnOpen<HTMLInputElement>(isOpen && inFlight === null)

  // A reopened dialog starts clean.
  useEffect(() => {
    if (!isOpen) {
      setMode('other')
      setDescription('')
      setAmountText('')
      setMinutesText('')
      setPreview({ status: 'idle' })
      setSubmitting(false)
      setError(null)
      busy.current = false
    }
  }, [isOpen])

  // ── waiting: the amount is the server's ───────────────────────────────────
  const minutes = useMemo<number | null>(() => {
    const t = minutesText.trim()
    if (!/^\d{1,3}$/.test(t)) return null
    const n = Number(t)
    return n >= MINUTES_MIN && n <= MINUTES_MAX ? n : null
  }, [minutesText])

  useEffect(() => {
    if (!isOpen || mode !== 'waiting' || inFlight !== null || minutes === null) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setPreview({ status: 'loading', minutes })
      try {
        const answer = await request(`/api/admin/bookings/${bookingId}/extra?minutes=${minutes}`, { cache: 'no-store' })
        if (cancelled) return
        const { status, body } = answer
        if (status === 200 && typeof body?.amount_minor === 'number' && body.amount_minor > 0) {
          setPreview({
            status: 'ok',
            minutes,
            amountMinor: body.amount_minor,
            currency: body.currency ?? currency,
            blocks: typeof body.blocks === 'number' ? body.blocks : Math.ceil(minutes / BLOCK_MINUTES),
          })
        } else if (status === 422 && body?.error === 'waiting_rate_missing') {
          setPreview({ status: 'error', minutes, text: COPY_RATE_MISSING })
        } else if (status === 422) {
          setPreview({ status: 'error', minutes, text: notAllowedText(body?.reason) })
        } else if (status === 401 || status === 403) {
          setPreview({ status: 'error', minutes, text: COPY_SESSION })
        } else {
          setPreview({ status: 'error', minutes, text: COPY_PREVIEW_FAILED })
        }
      } catch {
        if (!cancelled) setPreview({ status: 'error', minutes, text: COPY_PREVIEW_FAILED })
      }
    }, PREVIEW_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, mode, inFlight, minutes, bookingId, currency])

  // A preview counts only for the minutes typed right now: a stale amount can never reach the button.
  const shownPreview = preview.status !== 'idle' && minutes !== null && preview.minutes === minutes ? preview : null
  const waitingReady = shownPreview?.status === 'ok'

  // ── other: a described, agreed amount ─────────────────────────────────────
  const parsed = useMemo(() => parseAmountToMinor(amountText, decimals), [amountText, decimals])
  const trimmedDescription = description.trim()
  const descriptionLong = trimmedDescription.length > DESCRIPTION_MAX
  const descriptionOneLine = isSingleLine(trimmedDescription)
  const descriptionValid = trimmedDescription.length >= DESCRIPTION_MIN && !descriptionLong && descriptionOneLine
  const amountTooLarge = parsed.ok && parsed.minor > AMOUNT_CEILING_MINOR
  const otherMinor = parsed.ok && !amountTooLarge ? parsed.minor : null
  const otherReady = descriptionValid && otherMinor !== null

  const amountProblem: string | null = (() => {
    if (parsed.ok) return amountTooLarge ? 'That amount is too large.' : null
    if (parsed.reason === 'empty') return null
    if (parsed.reason === 'decimals') return decimals === 0 ? 'Use a whole number.' : `Use at most ${decimals} decimals.`
    if (parsed.reason === 'zero') return 'The amount must be more than zero.'
    return 'Enter an amount like 15.00.'
  })()
  const descriptionProblem = !descriptionOneLine ? 'Use one line of plain text.' : descriptionLong ? `Use at most ${DESCRIPTION_MAX} characters.` : null

  // ── the request ───────────────────────────────────────────────────────────
  async function post(payload: Record<string, unknown>, onAnswer: (answer: ExtraAnswer) => Outcome) {
    if (busy.current) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const answer = await request(`/api/admin/bookings/${bookingId}/extra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const outcome = onAnswer(answer)
      const h = handlersRef.current
      if (outcome.kind === 'done') {
        h.onClose()
        h.onDone({ ok: true, text: outcome.text })
      } else {
        setError(outcome.text)
        if (outcome.refetch) h.onRefetch?.()
      }
    } catch {
      setError(COPY_PARTIAL)
      handlersRef.current.onRefetch?.()
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  function chargeOther() {
    if (!otherReady || otherMinor === null) return
    void post({ kind: 'other', description: trimmedDescription, amount_minor: otherMinor }, (a) => interpretPost(a, toCurrency(currency)))
  }

  function chargeWaiting() {
    if (shownPreview?.status !== 'ok' || minutes === null) return
    const shown = shownPreview
    void post({ kind: 'waiting', minutes, expected_amount_minor: shown.amountMinor }, (answer) => {
      // The server's amount moved since the preview: show the new one and wait for a fresh click (never re-send on our own).
      if (answer.status === 409 && answer.body?.error === 'amount_changed' && typeof answer.body.amount_minor === 'number') {
        const next = answer.body.amount_minor
        setPreview({
          status: 'ok',
          minutes: shown.minutes,
          amountMinor: next,
          currency: shown.currency,
          blocks: shown.blocks,
        })
        return {
          kind: 'stay',
          text: `The amount changed to ${money(next, shown.currency)}. Check it and press the button again.`,
        }
      }
      return interpretPost(answer, toCurrency(currency))
    })
  }

  function resume() {
    if (!inFlight || !inFlight.resumable) return
    void post({ kind: 'resume', charge_id: inFlight.id }, (a) => interpretPost(a, inFlight.currency))
  }

  const closeGuarded = submitting ? () => {} : onClose

  // ── the pending charge (a lost Stripe answer) ─────────────────────────────
  if (inFlight) {
    const pending = money(inFlight.amount_minor, inFlight.currency)
    return (
      <Modal isOpen={isOpen} onClose={closeGuarded} title="Pending extra charge">
        {inFlight.resumable ? (
          <>
            <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
              {`A charge of ${pending} was started but Stripe did not confirm it. Retrying first checks Stripe for this charge: if it already went through it is recorded, and the client is never charged twice.`}
            </p>
            <p style={{ ...labelStyle, margin: '16px 0 0' }}>{COPY_CHARGE_STATEMENT}</p>
            <DialogError text={error} />
            <DecisionButtons
              primaryLabel={`Retry the pending charge of ${pending}`}
              tone="accent"
              secondaryLabel="Close"
              canSubmit
              submitting={submitting}
              onPrimary={resume}
              onSecondary={onClose}
            />
          </>
        ) : (
          <>
            <p role="status" style={{ ...bodyStyle, margin: 0 }}>{COPY_BUSY_EXTRA}</p>
            <p style={{ ...labelStyle, margin: '8px 0 0' }}>{`The pending charge is ${pending}.`}</p>
            <DialogError text={error} />
            <div style={{ marginTop: '24px' }}>
              <button type="button" onClick={onClose} style={outlineButtonStyle}>Close</button>
            </div>
          </>
        )}
      </Modal>
    )
  }

  // ── a new charge ──────────────────────────────────────────────────────────
  const waitingPrimary = shownPreview?.status === 'ok' ? `Charge ${money(shownPreview.amountMinor, shownPreview.currency)} to the saved card` : 'Charge to the saved card'
  const otherPrimary = otherMinor !== null && otherReady ? `Charge ${money(otherMinor, currency)} to the saved card` : 'Charge to the saved card'

  const modeButton = (value: Mode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      disabled={submitting}
      onClick={() => { setMode(value); setError(null) }}
      style={{
        ...outlineButtonStyle,
        minHeight: '44px',
        padding: '0 16px',
        background: mode === value ? 'var(--admin-hover)' : 'transparent',
        borderColor: mode === value ? 'var(--admin-accent)' : 'var(--admin-border-strong)',
        opacity: submitting ? 0.7 : 1,
        cursor: submitting ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <Modal isOpen={isOpen} onClose={closeGuarded} title="Add extra charge">
      <div role="group" aria-label="Kind of extra charge" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {modeButton('waiting', 'Extra waiting')}
        {modeButton('other', 'Other')}
      </div>

      {mode === 'waiting' ? (
        <div style={{ marginTop: '16px' }}>
          <label htmlFor="extra-minutes" style={fieldLabelStyle}>Billable minutes</label>
          <input
            id="extra-minutes"
            ref={firstFieldRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={minutesText}
            disabled={submitting}
            aria-describedby="extra-minutes-help extra-minutes-readout"
            onChange={(e) => { setMinutesText(e.target.value); setError(null) }}
            {...focusRingHandlers}
            style={{ ...inputBaseStyle, fontWeight: 400, maxWidth: '200px', fontVariantNumeric: 'tabular-nums' }}
          />
          <div id="extra-minutes-help" style={{ ...labelStyle, marginTop: '4px' }}>{COPY_WAITING_HINT}</div>
          <div id="extra-minutes-readout" role="status" style={{ ...bodyStyle, marginTop: '8px', overflowWrap: 'anywhere' }}>
            {shownPreview?.status === 'loading' && 'Calculating…'}
            {shownPreview?.status === 'ok' && (
              <>
                <span>{`${shownPreview.minutes} min = ${shownPreview.blocks} × ${BLOCK_MINUTES} min`}</span>
                <strong style={{ display: 'block', fontWeight: 'var(--admin-fw-strong)', ...amountStyle }}>
                  {money(shownPreview.amountMinor, shownPreview.currency)}
                </strong>
              </>
            )}
            {shownPreview?.status === 'error' && <span style={{ color: 'var(--status-danger-fg)' }}>{shownPreview.text}</span>}
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginTop: '16px' }}>
            <label htmlFor="extra-description" style={fieldLabelStyle}>{COPY_RECEIPT_LABEL}</label>
            <input
              id="extra-description"
              ref={firstFieldRef}
              type="text"
              autoComplete="off"
              maxLength={DESCRIPTION_MAX + 50}
              placeholder="Description, e.g. Airport parking"
              value={description}
              disabled={submitting}
              aria-invalid={descriptionProblem ? true : undefined}
              onChange={(e) => { setDescription(e.target.value); setError(null) }}
              {...focusRingHandlers}
              style={{ ...inputBaseStyle, fontWeight: 400 }}
            />
            {descriptionProblem && <div style={errorStyle}>{descriptionProblem}</div>}
          </div>
          <div style={{ marginTop: '16px' }}>
            <label htmlFor="extra-amount" style={fieldLabelStyle}>{`Amount (${toCurrency(currency).toUpperCase()})`}</label>
            <input
              id="extra-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              disabled={submitting}
              aria-invalid={amountProblem ? true : undefined}
              onChange={(e) => { setAmountText(e.target.value); setError(null) }}
              {...focusRingHandlers}
              style={{ ...inputBaseStyle, fontWeight: 400, maxWidth: '200px', fontVariantNumeric: 'tabular-nums' }}
            />
            {amountProblem && <div style={errorStyle}>{amountProblem}</div>}
          </div>
        </>
      )}

      <p style={{ ...labelStyle, margin: '16px 0 0' }}>{COPY_CHARGE_STATEMENT}</p>

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel={mode === 'waiting' ? waitingPrimary : otherPrimary}
        tone="accent"
        secondaryLabel="Cancel"
        canSubmit={mode === 'waiting' ? waitingReady : otherReady}
        submitting={submitting}
        onPrimary={mode === 'waiting' ? chargeWaiting : chargeOther}
        onSecondary={onClose}
      />
    </Modal>
  )
}
