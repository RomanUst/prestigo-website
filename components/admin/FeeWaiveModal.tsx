'use client'
import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { focusRingHandlers, inputBaseStyle, labelStyle as fieldLabelStyle } from './adminFieldStyles'
import { DecisionButtons, DialogError, useDecisionRequest, useFocusOnOpen, type DecisionResult } from './paymentParts'
import {
  COPY_REFUND_FAILED_WAIVE,
  bodyStyle,
  commonFeeError,
  feeCollection,
  labelStyle,
  money,
  outlineButtonStyle,
  type DialogOutcome,
  type FeeCaseFacts,
  type FeeRouteAnswer,
  type PaymentSnapshot,
} from './paymentShared'

// Phase 89-17 (UI-SPEC Surface 4.4, D-05): waive a pending fee. The reason is required (1 to 500) and lives on the case
// row only: it never reaches the payment history, the ledger or the client email.

const REASON_MAX = 500
const SUGGESTIONS = ['Flight cancelled', 'Regular client', 'Prestigo error'] as const

interface FeeWaiveModalProps {
  isOpen: boolean
  bookingId: string
  payment: PaymentSnapshot
  feeCase: FeeCaseFacts
  onClose: () => void
  onResult: (result: DecisionResult) => void
  onRefetch: () => void
}

/** What happens to the money when the fee is waived: hold released, collected money refunded, or nothing charged. */
function waiveEffect(payment: PaymentSnapshot, feeCase: FeeCaseFacts): string {
  const c = feeCollection(payment, feeCase)
  if (c.kind === 'hold') {
    return c.heldMinor !== null ? `The hold of ${money(c.heldMinor, feeCase.currency)} is released.` : 'The hold is released.'
  }
  if (c.kind === 'paid') return `${money(c.paidMinor, feeCase.currency)} is refunded to the client.`
  return 'The client is not charged.'
}

function interpret(answer: FeeRouteAnswer): DialogOutcome {
  const { status, body } = answer
  if (status === 200) return { kind: 'done', ok: true, text: 'Done. The fee was waived and the client was emailed.' }
  if (status === 502 && body?.error === 'refund_failed') return { kind: 'stay', text: COPY_REFUND_FAILED_WAIVE, refetch: true }
  return commonFeeError(answer)
}

export function FeeWaiveModal({ isOpen, bookingId, payment, feeCase, onClose, onResult, onRefetch }: FeeWaiveModalProps) {
  const [reason, setReason] = useState('')
  const { submitting, error, submit } = useDecisionRequest(isOpen, bookingId, { onClose, onResult, onRefetch })
  const reasonRef = useFocusOnOpen<HTMLInputElement>(isOpen)

  useEffect(() => {
    if (isOpen) setReason('')
  }, [isOpen])

  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= 1 && trimmed.length <= REASON_MAX

  function waive() {
    if (!canSubmit) return
    void submit({ action: 'waive', reason: trimmed }, interpret)
  }

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Waive fee">
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
        {`Waive the fee for booking ${payment.booking_reference}? ${waiveEffect(payment, feeCase)} This cannot be undone.`}
      </p>

      <div style={{ marginTop: '16px' }}>
        <label htmlFor="fee-waive-reason" style={fieldLabelStyle}>Reason</label>
        <input
          id="fee-waive-reason"
          ref={reasonRef}
          type="text"
          value={reason}
          maxLength={REASON_MAX}
          disabled={submitting}
          aria-required="true"
          onChange={e => setReason(e.target.value)}
          {...focusRingHandlers}
          style={{ ...inputBaseStyle, fontWeight: 400 }}
        />
        <div style={{ ...labelStyle, marginTop: '4px' }}>Stored with the case. Not shown to the client.</div>
        <div className="flex flex-wrap" style={{ gap: '8px', marginTop: '8px' }}>
          {SUGGESTIONS.map(text => (
            <button
              key={text}
              type="button"
              disabled={submitting}
              onClick={() => setReason(text)}
              style={{ ...outlineButtonStyle, padding: '0 16px', cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel="Waive fee"
        tone="danger"
        secondaryLabel="Keep decision open"
        canSubmit={canSubmit}
        submitting={submitting}
        onPrimary={waive}
        onSecondary={onClose}
      />
    </Modal>
  )
}
