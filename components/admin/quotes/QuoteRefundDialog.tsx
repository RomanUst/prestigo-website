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
  money,
  outlineButtonStyle,
  parseAmountToMinor,
  toCurrency,
} from '@/components/admin/paymentShared'

// Refund part of a paid quote payment by hand (Phase 92, plan 92-26; QUOTE-04; D-12): part of the deposit when one trip of a
// quote drops out, or part of a remainder that was paid on the quote page. Works on a cancelled quote too (that is how a
// failed refund of a cancel is retried).
//
// Money rules (T-92-81, T-92-82): the dialog states the amount, that it goes back to the client's card now and that the client
// gets an email BEFORE anything is sent; the amount is typed in the quote's currency, bounded by paid minus refunded, and sent
// in minor units from the primary button, whose label states the amount; an in-flight ref blocks a second click; the dialog
// cannot be dismissed while the request runs. The server bound stays the authority.

export interface RefundSource {
  /** What the client paid on this payment, minor units of the quote currency. */
  paidMinor: number
  /** What was already refunded of it. */
  refundedMinor: number
}

export interface QuoteRefundDialogProps {
  isOpen: boolean
  quoteId: string
  currency: string
  deposit: RefundSource
  /** Present only when a remainder was paid on the quote page. */
  remainder: RefundSource | null
  onClose: () => void
  /** The refund went through and the dialog asked to close: report one result line. The caller refetches. */
  onDone: (text: string) => void
  /** Refetch the page after an answer that leaves the dialog open. */
  onRefetch?: () => void
}

type Source = 'deposit' | 'remainder'

const COPY_OUT_OF_RANGE = 'That is more than what was paid minus what was already refunded. The page now shows the current amounts; check the amount and try again.'
const COPY_NOT_PAID = 'That payment was never made, so there is nothing to refund. The page shows the current state.'
const COPY_REFUND_FAILED = 'The card payment provider refused the refund. Nothing was refunded. The operator alert has the details.'
const COPY_GONE = 'This quote no longer exists.'
const COPY_BAD = 'The request was not valid. Reload the page and try again.'

const refundable = (s: RefundSource): number => Math.max(0, s.paidMinor - s.refundedMinor)

export function QuoteRefundDialog({ isOpen, quoteId, currency, deposit, remainder, onClose, onDone, onRefetch }: QuoteRefundDialogProps) {
  const cur = toCurrency(currency)
  const decimals = CURRENCY_DECIMALS[cur]
  const [source, setSource] = useState<Source>('deposit')
  const [amountText, setAmountText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must send nothing.
  const busy = useRef(false)
  const handlers = useRef({ onDone, onRefetch })
  handlers.current = { onDone, onRefetch }

  // A reopened dialog starts clean.
  useEffect(() => {
    if (!isOpen) {
      setSource('deposit')
      setAmountText('')
      setSubmitting(false)
      setError(null)
      busy.current = false
    }
  }, [isOpen])

  const active = source === 'remainder' && remainder ? remainder : deposit
  const bound = refundable(active)
  const parsed = parseAmountToMinor(amountText, decimals)
  const typedMinor = parsed.ok ? parsed.minor : null
  const overBound = typedMinor !== null && typedMinor > bound
  const ready = typedMinor !== null && !overBound && bound > 0
  const problem: string | null = (() => {
    if (overBound) return `At most ${money(bound, cur)}`
    if (parsed.ok || parsed.reason === 'empty') return null
    if (parsed.reason === 'zero') return 'The amount must be more than zero.'
    if (parsed.reason === 'decimals') return decimals === 0 ? 'Use a whole number.' : `Use at most ${decimals} decimals.`
    return 'Enter an amount like 15.00.'
  })()

  async function confirm() {
    if (busy.current || !ready || typedMinor === null) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, amount_minor: typedMinor }),
      })
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      const h = handlers.current
      if (res.status === 200 && body?.ok === true) {
        h.onDone(`${money(typedMinor, cur)} refunded to the client's card. The client was emailed.`)
        return
      }
      const code = body?.error
      if (res.status === 401 || res.status === 403) setError(COPY_SESSION)
      else if (res.status === 404) {
        setError(COPY_GONE)
        h.onRefetch?.()
      } else if (res.status === 422 && code === 'out_of_range') {
        setError(COPY_OUT_OF_RANGE)
        h.onRefetch?.()
      } else if (res.status === 422 && code === 'not_paid') {
        setError(COPY_NOT_PAID)
        h.onRefetch?.()
      } else if (res.status === 502 && code === 'refund_failed') {
        setError(COPY_REFUND_FAILED)
        h.onRefetch?.()
      } else if (res.status === 400 || res.status === 413) setError(COPY_BAD)
      else {
        // A 5xx or a lost answer can come after the refund ran: never claim that nothing was refunded.
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

  const sourceButton = (value: Source, label: string) => (
    <button
      type="button"
      aria-pressed={source === value}
      data-testid={`quote-refund-source-${value}`}
      disabled={submitting}
      onClick={() => {
        setSource(value)
        setAmountText('')
        setError(null)
      }}
      style={{
        ...outlineButtonStyle,
        minHeight: '44px',
        padding: '0 16px',
        background: source === value ? 'var(--admin-hover)' : 'transparent',
        borderColor: source === value ? 'var(--admin-accent)' : 'var(--admin-border-strong)',
        opacity: submitting ? 0.7 : 1,
        cursor: submitting ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <Modal isOpen={isOpen} onClose={closeGuarded} title="Refund">
      <div data-testid="quote-refund-dialog">
        <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
          The amount goes back to the client&apos;s card now and the client gets an email. It cannot be undone.
        </p>

        {remainder && (
          <div role="group" aria-label="What to refund" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
            {sourceButton('deposit', 'Deposit')}
            {sourceButton('remainder', 'Remainder')}
          </div>
        )}

        <p data-testid="quote-refund-bound" style={{ ...labelStyle, margin: '16px 0 0' }}>
          {`${source === 'remainder' && remainder ? 'Remainder' : 'Deposit'}: paid ${money(active.paidMinor, cur)}, refunded before ${money(active.refundedMinor, cur)}. You can refund up to ${money(bound, cur)}.`}
        </p>

        <div style={{ marginTop: '16px' }}>
          <label htmlFor="quote-refund-amount" style={fieldLabelStyle}>{`Amount to refund (${cur.toUpperCase()})`}</label>
          <input
            id="quote-refund-amount"
            data-testid="quote-refund-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountText}
            disabled={submitting}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => {
              setAmountText(e.target.value)
              setError(null)
            }}
            {...focusRingHandlers}
            style={{ ...inputBaseStyle, fontWeight: 400, maxWidth: '200px', fontVariantNumeric: 'tabular-nums' }}
          />
          {problem && <div data-testid="quote-refund-problem" style={errorStyle}>{problem}</div>}
        </div>

        <DialogError text={error} />
        <DecisionButtons
          primaryLabel={ready && typedMinor !== null ? `Refund ${money(typedMinor, cur)}` : 'Refund'}
          tone="danger"
          secondaryLabel="Go back"
          canSubmit={ready}
          submitting={submitting}
          onPrimary={confirm}
          onSecondary={onClose}
        />
      </div>
    </Modal>
  )
}
