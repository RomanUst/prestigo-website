'use client'
import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { DecisionButtons, DialogError, NoteField, useDecisionRequest, useFocusOnOpen, type DecisionResult } from './paymentParts'
import {
  bodyStyle,
  commonFeeError,
  type DialogOutcome,
  type FeeRouteAnswer,
  type PaymentSnapshot,
} from './paymentShared'

// Phase 89-17 (UI-SPEC Surface 5.6, D-22): reverse a cash confirmation. The booking is unpaid again; the ledger keeps both
// rows. The primary is the accent colour, not red: this is a correction, not a destruction.

const NOTE_MAX = 500

interface ReopenCashModalProps {
  isOpen: boolean
  bookingId: string
  payment: PaymentSnapshot
  onClose: () => void
  onResult: (result: DecisionResult) => void
  onRefetch: () => void
}

function interpret(answer: FeeRouteAnswer): DialogOutcome {
  if (answer.status === 200) return { kind: 'done', ok: true, text: 'Done. The booking is unpaid again.' }
  return commonFeeError(answer)
}

export function ReopenCashModal({ isOpen, bookingId, onClose, onResult, onRefetch }: ReopenCashModalProps) {
  const [note, setNote] = useState('')
  const { submitting, error, submit } = useDecisionRequest(isOpen, bookingId, { onClose, onResult, onRefetch })
  const noteRef = useFocusOnOpen<HTMLTextAreaElement>(isOpen)

  useEffect(() => {
    if (isOpen) setNote('')
  }, [isOpen])

  const trimmed = note.trim()
  const canSubmit = trimmed.length >= 1 && trimmed.length <= NOTE_MAX

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Reopen as unpaid">
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
        The cash confirmation will be removed and the booking is unpaid again. Both entries stay in the payment history.
      </p>

      <NoteField
        id="cash-reopen-note"
        label="Why is the confirmation wrong?"
        helper="Stored with the booking. Not shown to the client."
        value={note}
        max={NOTE_MAX}
        disabled={submitting}
        onChange={setNote}
        inputRef={noteRef}
      />

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel="Reopen as unpaid"
        tone="accent"
        secondaryLabel="Keep as paid"
        canSubmit={canSubmit}
        submitting={submitting}
        onPrimary={() => {
          if (canSubmit) void submit({ action: 'reopen_cash', note: trimmed }, interpret)
        }}
        onSecondary={onClose}
      />
    </Modal>
  )
}
