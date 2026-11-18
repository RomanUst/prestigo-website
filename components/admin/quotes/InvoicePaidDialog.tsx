'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/admin/Modal'
import { errorStyle, focusRingHandlers, inputBaseStyle, labelStyle as fieldLabelStyle } from '@/components/admin/adminFieldStyles'
import { DecisionButtons, DialogError, useFocusOnOpen } from '@/components/admin/paymentParts'
import { COPY_PARTIAL, COPY_SESSION, bodyStyle, labelStyle } from '@/components/admin/paymentShared'

// Mark the invoice of a paid invoice-method quote as paid (Phase 92, plan 92-26; QUOTE-04; D-17). The remainder of such a quote
// is settled outside the site: the operator types the invoice number once the money has arrived.
//
// The dialog states what this does BEFORE anything is sent: the quote and its trips are recorded as paid under that number;
// no card is charged and no email is sent. One request from the primary button (an in-flight ref blocks a second click), the
// dialog cannot be dismissed while it runs, and every refusal of the route has its own sentence. The server stays the authority.

export interface InvoicePaidDialogProps {
  isOpen: boolean
  quoteId: string
  onClose: () => void
  /** The invoice is marked paid and the dialog asked to close: report one result line. The caller refetches. */
  onDone: (text: string) => void
  /** Refetch the page after an answer that leaves the dialog open. */
  onRefetch?: () => void
}

/** Mirrors the route: trimmed, 1..60 characters, one line of printable text. */
const NUMBER_MAX = 60

function isSingleLine(s: string): boolean {
  return ![...s].some((ch) => {
    const c = ch.codePointAt(0) ?? 0
    return c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029
  })
}

const REASON_TEXT: Record<string, string> = {
  not_invoice: 'This quote is not paid by invoice, so there is no invoice to mark. The page shows the current state.',
  not_paid: 'The deposit of this quote is not paid, or the quote is cancelled, so its invoice cannot be marked paid.',
  number_conflict: 'This quote is already marked paid with another invoice number.',
}

export function InvoicePaidDialog({ isOpen, quoteId, onClose, onDone, onRefetch }: InvoicePaidDialogProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must send nothing.
  const busy = useRef(false)
  const handlers = useRef({ onDone, onRefetch })
  handlers.current = { onDone, onRefetch }
  const fieldRef = useFocusOnOpen<HTMLInputElement>(isOpen)

  // A reopened dialog starts clean.
  useEffect(() => {
    if (!isOpen) {
      setText('')
      setSubmitting(false)
      setError(null)
      busy.current = false
    }
  }, [isOpen])

  const number = text.trim()
  const oneLine = isSingleLine(number)
  const tooLong = number.length > NUMBER_MAX
  const ready = number.length > 0 && oneLine && !tooLong
  const problem = !oneLine ? 'Use one line of plain text.' : tooLong ? `Use at most ${NUMBER_MAX} characters.` : null

  async function confirm() {
    if (busy.current || !ready) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/invoice-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_number: number }),
      })
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      const h = handlers.current
      if (res.status === 200) {
        h.onDone(
          body?.changed === false
            ? `Invoice ${number} was already marked paid. Nothing changed.`
            : `Invoice ${number} marked paid. The quote and its trips are recorded as paid.`,
        )
        return
      }
      if (res.status === 401 || res.status === 403) setError(COPY_SESSION)
      else if (res.status === 404) {
        setError('This quote no longer exists.')
        h.onRefetch?.()
      } else if (res.status === 422) {
        const reason = typeof body?.reason === 'string' ? body.reason : ''
        setError(REASON_TEXT[reason] ?? 'This invoice cannot be marked paid right now. The page shows the current state.')
        h.onRefetch?.()
      } else if (res.status === 400 || res.status === 413) {
        setError('The invoice number is not valid. Use one line of at most 60 characters.')
      } else {
        // A 5xx or a lost answer can come after the quote was marked: never claim that nothing changed.
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

  return (
    <Modal isOpen={isOpen} onClose={closeGuarded} title="Mark invoice paid">
      <div data-testid="invoice-paid-dialog">
        <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>
          Record that the client has paid the remainder of this quote by invoice. Do this only when the money has arrived.
        </p>
        <p style={{ ...labelStyle, margin: '8px 0 0' }}>
          The quote and its trips are marked paid under this invoice number. No card is charged and no email is sent.
        </p>
        <div style={{ marginTop: '16px' }}>
          <label htmlFor="invoice-paid-number" style={fieldLabelStyle}>Invoice number</label>
          <input
            id="invoice-paid-number"
            data-testid="invoice-paid-number"
            ref={fieldRef}
            type="text"
            autoComplete="off"
            maxLength={NUMBER_MAX + 20}
            value={text}
            disabled={submitting}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            {...focusRingHandlers}
            style={{ ...inputBaseStyle, fontWeight: 400 }}
          />
          {problem && <div style={errorStyle}>{problem}</div>}
        </div>
        <DialogError text={error} />
        <DecisionButtons
          primaryLabel="Mark invoice paid"
          tone="accent"
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
