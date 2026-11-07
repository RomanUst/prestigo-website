'use client'
import { Modal } from './Modal'
import { DecisionButtons, DialogError, useDecisionRequest, useFocusOnOpen, type DecisionResult } from './paymentParts'
import {
  bodyStyle,
  commonFeeError,
  money,
  type DialogOutcome,
  type FeeRouteAnswer,
  type PaymentSnapshot,
} from './paymentShared'

// Phase 89-17 (UI-SPEC Surface 5.5, CASH-04): the operator marks a cash booking paid in cash. No required input, so the
// initial focus is the safe choice ("Not yet"). The saved card is not charged.

interface MarkCashModalProps {
  isOpen: boolean
  bookingId: string
  payment: PaymentSnapshot
  onClose: () => void
  onResult: (result: DecisionResult) => void
  onRefetch: () => void
}

function interpret(answer: FeeRouteAnswer): DialogOutcome {
  if (answer.status === 200) return { kind: 'done', ok: true, text: 'Done. Marked as paid in cash.' }
  return commonFeeError(answer)
}

export function MarkCashModal({ isOpen, bookingId, payment, onClose, onResult, onRefetch }: MarkCashModalProps) {
  const { submitting, error, submit } = useDecisionRequest(isOpen, bookingId, { onClose, onResult, onRefetch })
  const secondaryRef = useFocusOnOpen<HTMLButtonElement>(isOpen)
  const amount = payment.amount_minor !== null ? money(payment.amount_minor, payment.currency) : 'the amount'

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Mark paid in cash">
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
        {`Mark ${amount} as paid in cash for booking ${payment.booking_reference}? The saved card will not be charged.`}
      </p>

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel="Mark paid in cash"
        tone="accent"
        secondaryLabel="Not yet"
        canSubmit
        submitting={submitting}
        onPrimary={() => { void submit({ action: 'mark_cash_settled' }, interpret) }}
        onSecondary={onClose}
        secondaryRef={secondaryRef}
      />
    </Modal>
  )
}
