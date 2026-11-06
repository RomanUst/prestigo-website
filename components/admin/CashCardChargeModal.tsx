'use client'
import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { DecisionButtons, DialogError, NoteField, useDecisionRequest, useFocusOnOpen, type DecisionResult } from './paymentParts'
import {
  bodyStyle,
  commonFeeError,
  labelStyle,
  money,
  type DialogOutcome,
  type FeeRouteAnswer,
  type PaymentSnapshot,
} from './paymentShared'

// Phase 89-17 (UI-SPEC Surface 5.4, D-10, D-21): charge the saved card of a cash booking. The amount is fixed at the
// booking amount (one action, no amount field). It must work during the trip: a card that is declined then tells the
// operator to have the driver take cash, and the passenger in the car is not emailed.

const NOTE_MAX = 500

interface CashCardChargeModalProps {
  isOpen: boolean
  bookingId: string
  payment: PaymentSnapshot
  onClose: () => void
  onResult: (result: DecisionResult) => void
  onRefetch: () => void
}

export function CashCardChargeModal({ isOpen, bookingId, payment, onClose, onResult, onRefetch }: CashCardChargeModalProps) {
  const [note, setNote] = useState('')
  const { submitting, error, submit } = useDecisionRequest(isOpen, bookingId, { onClose, onResult, onRefetch })
  const noteRef = useFocusOnOpen<HTMLTextAreaElement>(isOpen)

  useEffect(() => {
    if (isOpen) setNote('')
  }, [isOpen])

  const amount = payment.amount_minor !== null ? money(payment.amount_minor, payment.currency) : 'the amount'
  const trimmed = note.trim()
  const canSubmit = trimmed.length >= 1 && trimmed.length <= NOTE_MAX
  // After the trip the client gets a payment link when the card is declined; during it nothing is sent (D-21).
  const afterTrip = payment.completed

  function interpret(answer: FeeRouteAnswer): DialogOutcome {
    if (answer.status === 200) {
      if (answer.body?.outcome === 'declined') {
        return {
          kind: 'done',
          ok: false,
          text: afterTrip
            ? 'The card was declined. The client was emailed a payment link.'
            : `The card was declined. Tell the driver to take ${amount} in cash.`,
        }
      }
      return { kind: 'done', ok: true, text: `Done. ${amount} was charged.` }
    }
    return commonFeeError(answer)
  }

  function charge() {
    if (!canSubmit) return
    void submit({ action: 'charge_saved_card', note: trimmed }, interpret)
  }

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Charge saved card">
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
        {`Charge ${amount} to the client's saved card for booking ${payment.booking_reference}? Use this when the client chooses to pay by card instead of cash, or did not pay the driver.`}
      </p>

      <NoteField
        id="cash-card-note"
        label="Why are you charging the card?"
        helper="Stored with the booking. Not shown to the client."
        value={note}
        max={NOTE_MAX}
        disabled={submitting}
        onChange={setNote}
        inputRef={noteRef}
      />

      <p style={{ ...labelStyle, margin: '16px 0 0' }}>
        {afterTrip
          ? 'The client is emailed in their language. If the card is declined, the client gets a payment link.'
          : 'The client is emailed in their language. If the card is declined, nothing is sent and the driver takes cash.'}
      </p>

      <DialogError text={error} />

      <DecisionButtons
        primaryLabel={`Charge ${amount === 'the amount' ? '' : amount}`.trim()}
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
