'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/admin/Modal'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle as fieldLabelStyle } from '@/components/admin/adminFieldStyles'
import { DecisionButtons, DialogError } from '@/components/admin/paymentParts'
import {
  COPY_PARTIAL,
  COPY_SESSION,
  CURRENCY_DECIMALS,
  bodyStyle,
  labelStyle,
  minorToInput,
  money,
  outlineButtonStyle,
  parseAmountToMinor,
  toCurrency,
} from '@/components/admin/paymentShared'

// Cancel a paid quote (Phase 92, plan 92-26; QUOTE-03, QUOTE-04; D-03, D-11, D-13). Operator only: the client cannot cancel a
// paid quote, and the server refuses it once any trip has started.
//
// The dialog first asks the server what this cancel would do now (the preview), and states that outcome with the amounts
// BEFORE anything is sent:
//   free  the deposit that is not yet refunded goes back in full;
//   late  the stored percent of the deposit is kept; the operator confirms how much is refunded, in the quote's currency
//         (prefilled with the proposed refund, never above deposit minus what was already refunded);
//   a remainder paid on the quote page is always refunded in full.
// "Prestigo cancels" turns the outcome into free (the server computes it again; the browser never decides it).
//
// Rules of this dialog (the ExtraChargeModal rules): the request goes out only from the primary button; an in-flight ref
// blocks a second click before React re-renders; the dialog cannot be dismissed while the request runs; every refusal code of
// the route has its own sentence; the server stays the authority for every bound.

export interface QuoteCancelDialogProps {
  isOpen: boolean
  quoteId: string
  currency: string
  onClose: () => void
  /** The quote was cancelled and the dialog asked to close: report one result line. The caller refetches. */
  onDone: (text: string) => void
  /** Refetch the page after an answer that leaves the dialog open. */
  onRefetch?: () => void
}

type Initiator = 'admin_client' | 'admin_prestigo'

interface CancelPreviewData {
  outcome: 'free' | 'late'
  depositMinor: number
  refundedMinor: number
  keptMinor: number
  proposedRefundMinor: number
  remainderRefundMinor: number
}

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: CancelPreviewData }
  | { kind: 'error'; text: string }

const COPY_NOT_PAID = 'This quote has no deposit payment to cancel. The page shows the current state.'
const COPY_ALREADY = 'This quote is already cancelled. The page shows the current state.'
const COPY_TRIPS_STARTED = 'A trip of this quote has started. Cancel single trips in Bookings and refund here.'
const COPY_GONE_QUOTE = 'This quote no longer exists.'
const COPY_BAD = 'The request was not valid. Reload the page and try again.'
const COPY_OUT_OF_RANGE = 'That refund is not allowed any more. The dialog now shows the current limits; check the amount and try again.'
const COPY_BUSY =
  'The quote is being changed right now, or one of its trips could not be cancelled yet. Some trips may already be cancelled. Try again in a moment: a second try finishes the job.'
const COPY_PREVIEW_FAILED = 'Could not read the cancellation terms. Nothing was changed. Close this dialog and try again.'
export const COPY_REFUND_FAILED_AFTER_CANCEL = 'Cancelled. The refund failed - the operator alert has the details.'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function readPreview(body: Record<string, unknown> | null): CancelPreviewData | null {
  if (!body) return null
  const { outcome, depositMinor, refundedMinor, keptMinor, proposedRefundMinor, remainderRefundMinor } = body
  if ((outcome !== 'free' && outcome !== 'late') || !isNum(depositMinor) || !isNum(refundedMinor) || !isNum(keptMinor) || !isNum(proposedRefundMinor)) {
    return null
  }
  return {
    outcome,
    depositMinor,
    refundedMinor,
    keptMinor,
    proposedRefundMinor,
    remainderRefundMinor: isNum(remainderRefundMinor) ? remainderRefundMinor : 0,
  }
}

function previewErrorText(status: number, code: unknown): string {
  if (status === 401 || status === 403) return COPY_SESSION
  if (status === 404) return COPY_GONE_QUOTE
  if (status === 422 && code === 'not_paid') return COPY_NOT_PAID
  if (status === 422 && code === 'already_cancelled') return COPY_ALREADY
  return COPY_PREVIEW_FAILED
}

export function QuoteCancelDialog({ isOpen, quoteId, currency, onClose, onDone, onRefetch }: QuoteCancelDialogProps) {
  const cur = toCurrency(currency)
  const decimals = CURRENCY_DECIMALS[cur]
  const [prestigoCancels, setPrestigoCancels] = useState(false)
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' })
  const [refundText, setRefundText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  // A second click before React re-renders must send nothing.
  const busy = useRef(false)
  const handlers = useRef({ onDone, onRefetch })
  handlers.current = { onDone, onRefetch }

  const initiator: Initiator = prestigoCancels ? 'admin_prestigo' : 'admin_client'

  // A reopened dialog starts clean.
  useEffect(() => {
    if (!isOpen) {
      setPrestigoCancels(false)
      setPreview({ kind: 'loading' })
      setRefundText('')
      setSubmitting(false)
      setError(null)
      setFinished(null)
      busy.current = false
    }
  }, [isOpen])

  // The preview: what this cancel would do right now.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setPreview({ kind: 'loading' })
    void (async () => {
      try {
        const res = await fetch(`/api/admin/quotes/${quoteId}/cancel?initiator=${initiator}`, { cache: 'no-store' })
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
        if (cancelled) return
        const data = res.status === 200 ? readPreview(body) : null
        if (data) {
          setPreview({ kind: 'ok', data })
          setRefundText(minorToInput(data.proposedRefundMinor, decimals))
        } else {
          setPreview({ kind: 'error', text: previewErrorText(res.status, body?.error) })
        }
      } catch {
        if (!cancelled) setPreview({ kind: 'error', text: COPY_PREVIEW_FAILED })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, quoteId, initiator, reload, decimals])

  const data = preview.kind === 'ok' ? preview.data : null
  const bound = data ? Math.max(0, data.depositMinor - data.refundedMinor) : 0

  // The refund the operator types (late only): 0 is allowed, more than the bound is not.
  const parsed = parseAmountToMinor(refundText, decimals)
  const typedMinor: number | null = parsed.ok ? parsed.minor : parsed.reason === 'zero' ? 0 : null
  const overBound = typedMinor !== null && typedMinor > bound
  const refundProblem: string | null = (() => {
    if (!data || data.outcome !== 'late') return null
    if (overBound) return `At most ${money(bound, cur)}`
    if (typedMinor !== null) return null
    if (parsed.ok) return null
    if (parsed.reason === 'decimals') return decimals === 0 ? 'Use a whole number.' : `Use at most ${decimals} decimals.`
    return 'Enter an amount like 15.00.'
  })()

  const depositRefundMinor = !data ? 0 : data.outcome === 'free' ? data.proposedRefundMinor : (typedMinor ?? 0)
  const remainderMinor = data?.remainderRefundMinor ?? 0
  const totalRefundMinor = depositRefundMinor + remainderMinor
  const amountsValid = data !== null && (data.outcome === 'free' || (typedMinor !== null && !overBound))
  const keptNowMinor = data && data.outcome === 'late' && amountsValid ? Math.max(0, data.depositMinor - data.refundedMinor - depositRefundMinor) : 0
  const canSubmit = amountsValid && finished === null

  async function confirm() {
    if (!data || busy.current || !canSubmit) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const payload = { initiator, refund_minor: data.outcome === 'late' ? typedMinor : null }
      const res = await fetch(`/api/admin/quotes/${quoteId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      const h = handlers.current
      if (res.status === 200 && body?.ok === true) {
        if (body.refundFailed === true) {
          setFinished(COPY_REFUND_FAILED_AFTER_CANCEL)
          h.onRefetch?.()
        } else {
          const refunded = isNum(body.refundedMinor) ? body.refundedMinor : 0
          h.onDone(refunded > 0 ? `Quote cancelled. ${money(refunded, cur)} refunded to the client's card.` : 'Quote cancelled. Nothing was refunded.')
        }
        return
      }
      const code = body?.error
      if (res.status === 401 || res.status === 403) setError(COPY_SESSION)
      else if (res.status === 404) {
        setError(COPY_GONE_QUOTE)
        h.onRefetch?.()
      } else if (res.status === 409) {
        setError(COPY_BUSY)
        h.onRefetch?.()
      } else if (res.status === 422 && code === 'trips_started') {
        setError(COPY_TRIPS_STARTED)
        h.onRefetch?.()
      } else if (res.status === 422 && code === 'already_cancelled') {
        setError(COPY_ALREADY)
        h.onRefetch?.()
      } else if (res.status === 422 && code === 'not_paid') {
        setError(COPY_NOT_PAID)
        h.onRefetch?.()
      } else if (res.status === 422 && code === 'refund_out_of_range') {
        setError(COPY_OUT_OF_RANGE)
        setReload((n) => n + 1)
      } else if (res.status === 400 || res.status === 413) setError(COPY_BAD)
      else {
        // A 5xx or a lost answer can come after the cancel ran: never claim that nothing happened.
        setError(COPY_PARTIAL)
        h.onRefetch?.()
      }
    } catch {
      setError(COPY_PARTIAL)
      handlers.current.onRefetch?.()
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  const closeGuarded = submitting ? () => {} : onClose

  const primaryLabel = totalRefundMinor > 0 ? 'Cancel quote and refund' : 'Cancel quote, no refund'

  return (
    <Modal isOpen={isOpen} onClose={closeGuarded} title="Cancel quote">
      <div data-testid="quote-cancel-dialog">
        <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
          Cancelling releases every trip of this quote with no fee and emails the client once. It cannot be undone.
        </p>
        <p style={{ ...labelStyle, margin: '8px 0 0' }}>
          Only you can cancel a paid quote, and it is refused once any trip has started.
        </p>

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0 0' }}>
          <input
            type="checkbox"
            role="switch"
            data-testid="quote-cancel-prestigo"
            checked={prestigoCancels}
            disabled={submitting || finished !== null}
            onChange={(e) => {
              setPrestigoCancels(e.target.checked)
              setError(null)
            }}
          />
          Prestigo cancels (always free for the client)
        </label>

        {preview.kind === 'loading' && (
          <p role="status" data-testid="quote-cancel-loading" style={{ ...bodyStyle, margin: '16px 0 0' }}>Reading the cancellation terms…</p>
        )}
        {preview.kind === 'error' && (
          <p role="alert" data-testid="quote-cancel-preview-error" style={{ ...bodyStyle, color: 'var(--status-danger-fg)', margin: '16px 0 0' }}>
            {preview.text}
          </p>
        )}

        {data && (
          <div data-testid="quote-cancel-outcome" style={{ margin: '16px 0 0' }}>
            {data.outcome === 'free' ? (
              <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
                {data.refundedMinor === 0
                  ? `Free. The deposit of ${money(data.depositMinor, cur)} is refunded in full.`
                  : data.proposedRefundMinor > 0
                    ? `Free. The rest of the deposit, ${money(data.proposedRefundMinor, cur)}, is refunded (${money(data.refundedMinor, cur)} was refunded before).`
                    : `Free. The deposit of ${money(data.depositMinor, cur)} was already refunded in full.`}
              </p>
            ) : (
              <>
                <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
                  {data.keptMinor >= data.depositMinor
                    ? `Late. Under this quote's terms the deposit of ${money(data.depositMinor, cur)} is kept.`
                    : `Late. Under this quote's terms ${money(data.keptMinor, cur)} of the deposit of ${money(data.depositMinor, cur)} is kept.`}
                </p>
                {data.refundedMinor > 0 && (
                  <p style={{ ...labelStyle, margin: '4px 0 0' }}>{`${money(data.refundedMinor, cur)} of the deposit was refunded before.`}</p>
                )}
                <div style={{ marginTop: '16px' }}>
                  <label htmlFor="quote-cancel-refund" style={fieldLabelStyle}>{`Refund of the deposit (${cur.toUpperCase()})`}</label>
                  <input
                    id="quote-cancel-refund"
                    data-testid="quote-cancel-refund"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={refundText}
                    disabled={submitting || finished !== null}
                    aria-invalid={refundProblem ? true : undefined}
                    onChange={(e) => {
                      setRefundText(e.target.value)
                      setError(null)
                    }}
                    {...focusRingHandlers}
                    style={{ ...inputBaseStyle, fontWeight: 400, maxWidth: '200px', fontVariantNumeric: 'tabular-nums' }}
                  />
                  <div style={{ ...labelStyle, marginTop: '4px' }}>{`You can refund up to ${money(bound, cur)}. The proposed amount follows the terms.`}</div>
                  {refundProblem && <div data-testid="quote-cancel-refund-problem" style={errorStyle}>{refundProblem}</div>}
                </div>
              </>
            )}
            {remainderMinor > 0 && (
              <p style={{ ...bodyStyle, margin: '8px 0 0', overflowWrap: 'anywhere' }}>
                {`The remainder paid on the quote page, ${money(remainderMinor, cur)}, is refunded in full.`}
              </p>
            )}
            {amountsValid && (
              <p data-testid="quote-cancel-total" style={{ ...bodyStyle, fontWeight: 'var(--admin-fw-strong)', margin: '12px 0 0', overflowWrap: 'anywhere' }}>
                {`Refunded to the client's card now: ${money(totalRefundMinor, cur)}.`}
                {data.outcome === 'late' ? ` Kept by Prestigo: ${money(keptNowMinor, cur)} of the deposit.` : ''}
              </p>
            )}
          </div>
        )}

        {finished ? (
          <>
            <p role="alert" data-testid="quote-cancel-finished" style={{ ...bodyStyle, color: 'var(--status-warn-fg)', margin: '16px 0 0', overflowWrap: 'anywhere' }}>
              {finished}
            </p>
            <div style={{ marginTop: '24px' }}>
              <button type="button" data-testid="quote-cancel-close" onClick={onClose} style={outlineButtonStyle}>Close</button>
            </div>
          </>
        ) : (
          <>
            <DialogError text={error} />
            <DecisionButtons
              primaryLabel={primaryLabel}
              tone="danger"
              secondaryLabel="Go back"
              canSubmit={canSubmit}
              submitting={submitting}
              onPrimary={confirm}
              onSecondary={onClose}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
