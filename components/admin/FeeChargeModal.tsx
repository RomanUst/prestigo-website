'use client'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle as fieldLabelStyle } from './adminFieldStyles'
import { DecisionButtons, DialogError, useDecisionRequest, useFocusOnOpen, type DecisionResult } from './paymentParts'
import {
  COPY_AMOUNT_OVER_CAP,
  COPY_NOTE_MISSING,
  COPY_REFUND_FAILED_CHARGE,
  CURRENCY_DECIMALS,
  amountStyle,
  bodyStyle,
  commonFeeError,
  labelStyle,
  minorToInput,
  money,
  parseAmountToMinor,
  percentOf,
  feeCollection,
  toCurrency,
  type DialogOutcome,
  type FeeCaseFacts,
  type FeeRouteAnswer,
  type PaymentSnapshot,
} from './paymentShared'

// Phase 89-17 (UI-SPEC Surface 4.3, D-05, D-13, D-14): charge a late-cancel or no-show fee. The operator picks any amount
// up to the case base; the typed text becomes integer minor units by string handling (T-89-57). The UI validates for
// convenience only: the server re-checks the cap, the note and the state.

const NOTE_MIN = 10
const NOTE_MAX = 1000
const NOTE_COUNTER_FROM = 900
const REASON_MAX = 500

interface FeeChargeModalProps {
  isOpen: boolean
  bookingId: string
  payment: PaymentSnapshot
  feeCase: FeeCaseFacts
  onClose: () => void
  onResult: (result: DecisionResult) => void
  onRefetch: () => void
}

/** The "where does the fee come from" sentence of the dialog (UI-SPEC 4.3 item 1). */
function collectionLine(payment: PaymentSnapshot, feeCase: FeeCaseFacts): string {
  const c = feeCollection(payment, feeCase)
  if (c.kind === 'hold') {
    const held = c.heldMinor !== null ? ` of ${money(c.heldMinor, feeCase.currency)}` : ''
    return `The fee is taken from the hold${held}; the rest of the hold is released.`
  }
  if (c.kind === 'paid') return `${money(c.paidMinor, feeCase.currency)} was paid; the part above the fee is refunded.`
  return 'The saved card is charged.'
}

export function FeeChargeModal({ isOpen, bookingId, payment, feeCase, onClose, onResult, onRefetch }: FeeChargeModalProps) {
  const decimals = CURRENCY_DECIMALS[toCurrency(feeCase.currency)]
  const isNoShow = feeCase.kind === 'no_show'
  const [amountText, setAmountText] = useState(() => minorToInput(feeCase.proposed_minor, decimals))
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const { submitting, error, fieldError, submit } = useDecisionRequest(isOpen, bookingId, { onClose, onResult, onRefetch })
  const amountRef = useFocusOnOpen<HTMLInputElement>(isOpen)

  // A reopened dialog starts from the proposal with empty text fields.
  useEffect(() => {
    if (isOpen) {
      setAmountText(minorToInput(feeCase.proposed_minor, decimals))
      setNote('')
      setReason('')
    }
  }, [isOpen, feeCase.proposed_minor, decimals])

  const parsed = useMemo(() => parseAmountToMinor(amountText, decimals), [amountText, decimals])
  const overCap = parsed.ok && parsed.minor > feeCase.base_minor
  const amountValid = parsed.ok && !overCap
  const trimmedNote = note.trim()
  const noteValid = !isNoShow || (trimmedNote.length >= NOTE_MIN && trimmedNote.length <= NOTE_MAX)
  const canSubmit = amountValid && noteValid && reason.length <= REASON_MAX

  const amountProblem: string | null = (() => {
    if (parsed.ok) return overCap ? COPY_AMOUNT_OVER_CAP : null
    if (parsed.reason === 'empty') return null
    if (parsed.reason === 'decimals') return decimals === 0 ? 'Use a whole number.' : `Use at most ${decimals} decimals.`
    if (parsed.reason === 'zero') return 'The amount must be more than zero.'
    return `Enter an amount like ${minorToInput(feeCase.proposed_minor, decimals)}.`
  })()
  const serverAmountProblem = fieldError?.field === 'amount' ? fieldError.text : null
  const serverNoteProblem = fieldError?.field === 'note' ? fieldError.text : null
  const shownAmountProblem = amountProblem ?? serverAmountProblem

  const typedMinor = parsed.ok ? parsed.minor : null
  const primaryLabel = typedMinor !== null && amountValid ? `Charge ${money(typedMinor, feeCase.currency)}` : 'Charge'
  const readout = typedMinor !== null
    ? `${percentOf(typedMinor, feeCase.base_minor)}% of the booking amount of ${money(feeCase.base_minor, feeCase.currency)}`
    : ''

  function interpret(charged: number) {
    return (answer: FeeRouteAnswer): DialogOutcome => {
      const { status, body } = answer
      if (status === 200) {
        const text = body?.outcome === 'declined'
          ? `The card was declined. The client was emailed a payment link for ${money(charged, feeCase.currency)}.`
          : `Done. ${money(charged, feeCase.currency)} was charged and the client was emailed.`
        return { kind: 'done', ok: body?.outcome !== 'declined', text }
      }
      if (status === 422 && body?.error === 'amount_above_cap') return { kind: 'stay', text: COPY_AMOUNT_OVER_CAP, field: 'amount' }
      if (status === 422 && body?.error === 'note_required') return { kind: 'stay', text: COPY_NOTE_MISSING, field: 'note' }
      if (status === 502 && body?.error === 'refund_failed') return { kind: 'stay', text: COPY_REFUND_FAILED_CHARGE, refetch: true }
      return commonFeeError(answer)
    }
  }

  function charge() {
    if (!canSubmit || typedMinor === null) return
    const payload: Record<string, unknown> = { action: 'charge', amount_minor: typedMinor }
    const trimmedReason = reason.trim()
    if (trimmedReason) payload.reason = trimmedReason
    if (isNoShow) payload.contact_note = trimmedNote
    void submit(payload, interpret(typedMinor))
  }

  const title = isNoShow ? 'Charge no-show fee' : 'Charge cancellation fee'
  const clientLine = payment.client_email ? ` ${payment.client_email}.` : ''

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title={title}>
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
        {`Booking ${payment.booking_reference}.${clientLine} ${collectionLine(payment, feeCase)}`}
      </p>

      <div style={{ marginTop: '16px' }}>
        <label htmlFor="fee-amount" style={fieldLabelStyle}>{`Amount to charge (${toCurrency(feeCase.currency).toUpperCase()})`}</label>
        <input
          id="fee-amount"
          ref={amountRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amountText}
          disabled={submitting}
          aria-invalid={shownAmountProblem ? true : undefined}
          aria-describedby="fee-amount-readout fee-amount-help"
          onChange={e => setAmountText(e.target.value)}
          {...focusRingHandlers}
          style={{ ...inputBaseStyle, fontWeight: 400, maxWidth: '200px', fontVariantNumeric: 'tabular-nums' }}
        />
        <div id="fee-amount-readout" role="status" style={{ ...labelStyle, marginTop: '4px', ...amountStyle, whiteSpace: 'normal' }}>
          {readout}
        </div>
        <div id="fee-amount-help" style={{ ...labelStyle, marginTop: '4px' }}>
          {`Up to ${money(feeCase.base_minor, feeCase.currency)}, which is 100% of the booking.`}
        </div>
        {shownAmountProblem && <div style={errorStyle}>{shownAmountProblem}</div>}
      </div>

      {isNoShow && (
        <div style={{ marginTop: '16px' }}>
          <label htmlFor="fee-note" style={fieldLabelStyle}>How did you try to reach the passenger?</label>
          <textarea
            id="fee-note"
            rows={3}
            value={note}
            maxLength={NOTE_MAX}
            disabled={submitting}
            aria-required="true"
            aria-invalid={serverNoteProblem ? true : undefined}
            aria-describedby="fee-note-help"
            onChange={e => setNote(e.target.value)}
            style={{ ...inputBaseStyle, fontWeight: 400, resize: 'vertical' }}
          />
          <div id="fee-note-help" style={{ ...labelStyle, marginTop: '4px' }}>
            Stored with the evidence. Not shown to the client.
            {note.length > NOTE_COUNTER_FROM && ` ${note.length} / ${NOTE_MAX}`}
          </div>
          {serverNoteProblem && <div style={errorStyle}>{serverNoteProblem}</div>}
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <label htmlFor="fee-reason" style={fieldLabelStyle}>Reason (optional)</label>
        <input
          id="fee-reason"
          type="text"
          value={reason}
          maxLength={REASON_MAX}
          disabled={submitting}
          onChange={e => setReason(e.target.value)}
          {...focusRingHandlers}
          style={{ ...inputBaseStyle, fontWeight: 400 }}
        />
      </div>

      <p style={{ ...labelStyle, margin: '16px 0 0' }}>
        The client is emailed in their language. If the card is declined, the client gets a payment link for the fee.
      </p>

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel={primaryLabel}
        tone="accent"
        secondaryLabel="Don't charge"
        canSubmit={canSubmit}
        submitting={submitting}
        onPrimary={charge}
        onSecondary={onClose}
      />
    </Modal>
  )
}
