'use client'
import { Modal } from './Modal'
import { DecisionButtons, DialogError, useDecisionRequest, type DecisionResult } from './paymentParts'
import { bodyStyle, commonFeeError, type DialogOutcome, type FeeRouteAnswer } from './paymentShared'

// Money WR-02: the fee case of a closed booking failed to open. This opens it from the booking; nothing is charged, the
// decision stays with the operator. The server refuses a cancel that was in time or cancelled by Prestigo.

interface FeeOpenCaseModalProps {
  isOpen: boolean
  bookingId: string
  onClose: () => void
  onResult: (result: DecisionResult) => void
  onRefetch: () => void
}

function interpret(answer: FeeRouteAnswer): DialogOutcome {
  if (answer.status === 200) return { kind: 'done', ok: true, text: 'Done. The fee case is open. Charge or waive it below.' }
  return commonFeeError(answer)
}

export function FeeOpenCaseModal({ isOpen, bookingId, onClose, onResult, onRefetch }: FeeOpenCaseModalProps) {
  const { submitting, error, submit } = useDecisionRequest(isOpen, bookingId, { onClose, onResult, onRefetch })

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Open fee case">
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
        This booking has no fee case. Opening one charges nothing: you decide afterwards. It is refused when the booking was
        cancelled in time or by Prestigo.
      </p>

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel="Open fee case"
        tone="accent"
        secondaryLabel="Keep closed"
        canSubmit
        submitting={submitting}
        onPrimary={() => void submit({ action: 'open_case' }, interpret)}
        onSecondary={onClose}
      />
    </Modal>
  )
}
