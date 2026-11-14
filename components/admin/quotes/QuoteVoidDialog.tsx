'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/admin/Modal'
import { DecisionButtons, DialogError } from '@/components/admin/paymentParts'
import { COPY_SESSION, bodyStyle, labelStyle } from '@/components/admin/paymentShared'

// Phase 92-14 (QUOTE-06, T-92-45): "Cancel quote" on an unpaid quote. Rules (the ExtraChargeModal rules):
//   - the dialog says what will happen BEFORE anything is sent: the client's link stops working, nothing is charged;
//   - the request goes out only from the primary button; an in-flight ref blocks a second click before React re-renders
//     (the server void is idempotent as well);
//   - the dialog cannot be dismissed (Escape, scrim, buttons) until the answer arrives;
//   - the server stays the authority: a paid quote is refused (422 already_paid) and a deposit that is being paid is
//     refused (409 deposit_in_flight).

export interface VoidTarget {
  id: string
  reference: string
  client_name: string
}

export interface QuoteVoidDialogProps {
  /** The quote to cancel; null while the dialog is closed. */
  quote: VoidTarget | null
  onClose: () => void
  /** The server voided the quote: the caller shows it as Voided. */
  onDone: (quoteId: string) => void
  /** Read the list again after an answer that shows the row on screen is stale (paid, gone). */
  onRefetch?: () => void
}

const COPY_EFFECT = "The client's link stops working. Nothing is charged."
const COPY_DEPOSIT_IN_FLIGHT = 'The client is paying the deposit right now. Try again in a few minutes.'
const COPY_ALREADY_PAID = 'This quote is paid. Open it to cancel with a refund.'
const COPY_BUSY = 'The quote is being changed right now. Try again in a moment.'
const COPY_GONE = 'This quote no longer exists.'
const COPY_REFUSED = 'This quote cannot be cancelled right now.'
const COPY_FAILED = 'Could not cancel the quote. Try again: cancelling twice is safe.'

type Outcome = { kind: 'done' } | { kind: 'stay'; text: string; refetch?: boolean }

function interpret(status: number, body: { error?: string; reason?: string } | null): Outcome {
  if (status === 200) return { kind: 'done' }
  if (status === 401 || status === 403) return { kind: 'stay', text: COPY_SESSION }
  if (status === 404) return { kind: 'stay', text: COPY_GONE, refetch: true }
  if (status === 409) {
    return { kind: 'stay', text: body?.error === 'deposit_in_flight' ? COPY_DEPOSIT_IN_FLIGHT : COPY_BUSY }
  }
  if (status === 422) {
    return body?.reason === 'already_paid'
      ? { kind: 'stay', text: COPY_ALREADY_PAID, refetch: true }
      : { kind: 'stay', text: COPY_REFUSED, refetch: true }
  }
  return { kind: 'stay', text: COPY_FAILED }
}

export function QuoteVoidDialog({ quote, onClose, onDone, onRefetch }: QuoteVoidDialogProps) {
  const isOpen = quote !== null
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const handlersRef = useRef({ onClose, onDone, onRefetch })
  handlersRef.current = { onClose, onDone, onRefetch }

  // A reopened dialog starts clean.
  useEffect(() => {
    if (!isOpen) {
      setSubmitting(false)
      setError(null)
      busy.current = false
    }
  }, [isOpen])

  async function confirm() {
    if (!quote || busy.current) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const body = await res.json().catch(() => null)
      const outcome = interpret(res.status, body)
      const h = handlersRef.current
      if (outcome.kind === 'done') {
        h.onDone(quote.id)
        h.onClose()
      } else {
        setError(outcome.text)
        if (outcome.refetch) h.onRefetch?.()
      }
    } catch {
      setError(COPY_FAILED)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  const closeGuarded = submitting ? () => {} : onClose

  return (
    <Modal isOpen={isOpen} onClose={closeGuarded} title="Cancel quote">
      {quote && (
        <>
          <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
            {`Cancel quote ${quote.reference} for ${quote.client_name}?`}
          </p>
          <p style={{ ...labelStyle, margin: '8px 0 0', textTransform: 'none', letterSpacing: 0 }}>{COPY_EFFECT}</p>
          <DialogError text={error} />
          <DecisionButtons
            primaryLabel="Cancel quote"
            tone="danger"
            secondaryLabel="Keep quote"
            canSubmit
            submitting={submitting}
            onPrimary={confirm}
            onSecondary={onClose}
          />
        </>
      )}
    </Modal>
  )
}
