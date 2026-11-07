'use client'
import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { DecisionButtons, DialogError, NoteField, useDecisionRequest, useFocusOnOpen, type DecisionResult } from './paymentParts'
import { bodyStyle, commonFeeError, type DialogOutcome, type FeeRouteAnswer } from './paymentShared'

// Money CR-04: a fee refund failed and the operator settled the money by hand. This closes the case with no Stripe call and
// no mail to the client; the note stays with the booking. To keep part of the money, charge what is left instead.

const NOTE_MAX = 500

interface FeeCloseRefundedModalProps {
  isOpen: boolean
  bookingId: string
  onClose: () => void
  onResult: (result: DecisionResult) => void
  onRefetch: () => void
}

function interpret(answer: FeeRouteAnswer): DialogOutcome {
  if (answer.status === 200) return { kind: 'done', ok: true, text: 'Done. The case is closed.' }
  return commonFeeError(answer)
}

export function FeeCloseRefundedModal({ isOpen, bookingId, onClose, onResult, onRefetch }: FeeCloseRefundedModalProps) {
  const [note, setNote] = useState('')
  const { submitting, error, submit } = useDecisionRequest(isOpen, bookingId, { onClose, onResult, onRefetch })
  const noteRef = useFocusOnOpen<HTMLTextAreaElement>(isOpen)

  useEffect(() => {
    if (isOpen) setNote('')
  }, [isOpen])

  const trimmed = note.trim()
  const canSubmit = trimmed.length >= 1 && trimmed.length <= NOTE_MAX

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Close: refunded by hand">
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
        Use this only after you settled the money yourself, for example in the Stripe Dashboard. Nothing is refunded here and
        the client gets no email. The case closes with no fee.
      </p>

      <NoteField
        id="fee-close-note"
        label="What did you do?"
        helper="Stored with the booking. Not shown to the client."
        value={note}
        max={NOTE_MAX}
        disabled={submitting}
        onChange={setNote}
        inputRef={noteRef}
      />

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel="Close the case"
        tone="accent"
        secondaryLabel="Keep open"
        canSubmit={canSubmit}
        submitting={submitting}
        onPrimary={() => {
          if (canSubmit) void submit({ action: 'close_refunded', note: trimmed }, interpret)
        }}
        onSecondary={onClose}
      />
    </Modal>
  )
}
