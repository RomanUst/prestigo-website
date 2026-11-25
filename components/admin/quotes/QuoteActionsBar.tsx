'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Banknote, Copy, FileCheck, Link2, Mail, Pencil, RotateCcw, Send, XCircle } from 'lucide-react'
import { Modal } from '@/components/admin/Modal'
import { DecisionButtons, DialogError } from '@/components/admin/paymentParts'
import { COPY_SESSION, bodyStyle, formatPragueShort, labelStyle, money, outlineButtonStyle } from '@/components/admin/paymentShared'
import { QuoteStatusBadge } from '@/components/admin/quotes/QuoteStatusBadge'
import { InvoicePaidDialog } from '@/components/admin/quotes/InvoicePaidDialog'
import { QuoteCancelDialog } from '@/components/admin/quotes/QuoteCancelDialog'
import { QuoteRefundDialog } from '@/components/admin/quotes/QuoteRefundDialog'
import { QuoteVoidDialog } from '@/components/admin/quotes/QuoteVoidDialog'
import { LOCALE_ENDONYMS } from '@/i18n/locales'
import { STARTED_BOOKING_STATUSES, type BookingStatus } from '@/lib/booking-status'
import { copyPaymentLinkToClipboard } from '@/lib/ui/payment-link-display'
import { remainderDueMinor } from '@/lib/quotes/money'
import { MISSING_FIELD_LABEL, type QuoteLineRequiredField } from '@/lib/quotes/completeness'
import { draftFromDetail, sendBlockers, tbcFields } from '@/components/admin/quotes/quoteDraft'
import type { QuoteDetail } from '@/lib/quotes/store'

// The lifecycle controls of a quote (Phase 92, plan 92-25; QUOTE-01, QUOTE-02, QUOTE-06; D-02). Mounted by QuoteBuilder, which
// is rendered by app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx.
//
// What the operator sees: the state badge, the version, one plain sentence about the client's link, then the actions the
// state allows, each with the sentence of what it does, written BEFORE anything is sent:
//   draft                              Send
//   sent / viewed / accepted / expired Copy new link, Resend, Edit (a new version), Cancel quote (void)
//   paid                               Copy new link, Cancel quote (with the refund decision), Refund, Mark invoice paid, Send
//                                      remainder request (plan 92-26: the money dialogs)
//   voided / cancelled                 none
//
// Rules of every action (the ExtraChargeModal rules):
//   - a state change asks for a confirmation that names its effect; the request goes out only from the primary button;
//   - an in-flight ref blocks a second click before React re-renders, so a double click is one request;
//   - the dialog cannot be dismissed (Escape, scrim, buttons) while the request runs;
//   - the server stays the authority: every refusal code of the routes is turned into a sentence.
//
// The secret link (T-92-79): the server stores only its hash, so the URL is in the response of Send / Resend / Copy new link
// and nowhere else. It is held in this component's state only, shown once with a Copy button, cleared by Done, by the next
// action and when the page is left. It is never written to storage, never logged, never put in a URL.

export interface QuoteActionsBarProps {
  detail: QuoteDetail
  /** The builder holds edits that are not saved: Send would send the saved version, so it waits for a Save. */
  unsavedChanges?: boolean
  /** An action changed (or may have changed) the quote: read it again. */
  onChanged: () => void | Promise<unknown>
}

type DialogKind = 'send' | 'resend' | 'revise' | 'remainder'
type Revealed = { url: string; emailed: boolean | null; copyFailed: boolean; copied: boolean }
type Answer = { status: number; body: Record<string, unknown> | null }

const COPY_FAILED_GENERIC = 'Could not complete the action. The page shows the current state; check it before trying again.'
const COPY_BUSY = 'The quote is being changed right now. Try again in a moment.'
const COPY_GONE = 'This quote no longer exists.'
const COPY_BAD_REQUEST = 'The request was not valid. Reload the page and try again.'
const COPY_DEPOSIT_IN_FLIGHT = 'The client is paying the deposit right now. Try again in a few minutes.'

/** The money rule that refused a send, in plain words (the `reason` of a 422 money_invalid). */
const MONEY_REASON_TEXT: Record<string, string> = {
  deposit_missing: 'Choose the deposit before sending.',
  remainder_method_missing: 'Choose how the remainder is paid before sending.',
  terms_invalid: 'The cancellation terms are out of range. Correct them and save before sending.',
  no_lines: 'Add at least one trip before sending.',
  amount_invalid: 'Every trip needs an amount greater than 0.',
  lines_incomplete: 'Some trips still have TBC fields. Fill them in, save, then send.',
  deposit_zero: 'The deposit cannot be 0.',
  deposit_above_total: 'The deposit is more than the total of the trips.',
  deposit_below_minimum: 'The deposit is below the smallest amount a card can be charged.',
  remainder_below_minimum:
    'The remainder is below the smallest amount a card can be charged. Change the deposit or the amounts.',
}

/** What refused a send, by its `code` (the 422 body of /send is { error, code, reason }). */
const SEND_CODE_TEXT: Record<string, string> = {
  not_sendable: 'This quote cannot be sent in its current state. The page shows the current state.',
  first_pickup_passed: 'The first trip is in the past. Change the date before sending.',
  expired: 'The expiry date has passed. Move the expiry date to a later day (edit the quote if it was already sent), then send it.',
  distance_missing: 'A transfer has no distance. Choose its pickup and destination again, save, then send.',
}

/** "1:pickup_time,amount;3:origin" (the reason of a 422 incomplete) as one plain sentence. */
export function incompleteText(reason: string): string {
  const trips = reason
    .split(';')
    .map((part) => {
      const [position, fields] = part.split(':')
      const labels = (fields ?? '')
        .split(',')
        .map((f) => MISSING_FIELD_LABEL[f as QuoteLineRequiredField])
        .filter(Boolean)
      return position && labels.length > 0 ? `trip ${position}: ${labels.join(', ')}` : null
    })
    .filter((t): t is string => t !== null)
  return trips.length > 0
    ? `These fields are still TBC. Fill them in, save, then send (${trips.join('; ')}).`
    : 'Some trips still have TBC fields. Fill them in, save, then send.'
}

function sendRefusalText(answer: Answer): string {
  const { status, body } = answer
  if (status === 401 || status === 403) return COPY_SESSION
  if (status === 404) return COPY_GONE
  if (status === 409) return COPY_BUSY
  if (status === 400 || status === 413) return COPY_BAD_REQUEST
  if (status === 422) {
    const code = typeof body?.code === 'string' ? body.code : ''
    if (code === 'incomplete') {
      const reason = typeof body?.reason === 'string' ? body.reason : ''
      return incompleteText(reason)
    }
    if (code === 'money_invalid') {
      const reason = typeof body?.reason === 'string' ? body.reason : ''
      return MONEY_REASON_TEXT[reason] ?? 'The deposit or the amounts are not valid. Check them, save, then send.'
    }
    return SEND_CODE_TEXT[code] ?? 'This quote cannot be sent right now. The page shows the current state.'
  }
  return COPY_FAILED_GENERIC
}

function linkRefusalText(answer: Answer): string {
  const { status } = answer
  if (status === 401 || status === 403) return COPY_SESSION
  if (status === 404) return COPY_GONE
  if (status === 400 || status === 413) return COPY_BAD_REQUEST
  if (status === 422) return 'This quote has no link to give: it is a draft, cancelled or voided. The page shows the current state.'
  return COPY_FAILED_GENERIC
}

function reviseRefusalText(answer: Answer): string {
  const { status, body } = answer
  if (status === 401 || status === 403) return COPY_SESSION
  if (status === 404) return COPY_GONE
  if (status === 400 || status === 413) return COPY_BAD_REQUEST
  if (status === 409) return body?.error === 'deposit_in_flight' ? COPY_DEPOSIT_IN_FLIGHT : COPY_BUSY
  if (status === 422) return 'This quote can no longer be edited into a new version. The page shows its current state.'
  return COPY_FAILED_GENERIC
}

const REMAINDER_REASON_TEXT: Record<string, string> = {
  not_payment_link: 'This quote does not pay its remainder by payment link, so there is no request to send.',
  not_paid: 'The deposit of this quote is not paid, or the quote is cancelled, so no remainder can be requested.',
  nothing_due: 'Nothing is due: every trip of this quote is already paid or cancelled.',
}

function remainderRefusalText(answer: Answer): string {
  const { status, body } = answer
  if (status === 401 || status === 403) return COPY_SESSION
  if (status === 404) return COPY_GONE
  if (status === 429) return 'A request was sent less than 10 minutes ago. Wait a little before sending another.'
  if (status === 400 || status === 413) return COPY_BAD_REQUEST
  if (status === 422) {
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    return REMAINDER_REASON_TEXT[reason] ?? 'The request cannot be sent right now. The page shows the current state.'
  }
  if (status === 502) return 'The email could not be sent. Nothing was recorded as sent. Try again.'
  return COPY_FAILED_GENERIC
}

/** Answers that mean the page shows a stale state: read it again. */
const staleAnswer = (a: Answer): boolean => a.status === 404 || a.status === 422 || a.status >= 500

async function post(quoteId: string, action: string, payload: Record<string, unknown>): Promise<Answer> {
  const res = await fetch(`/api/admin/quotes/${quoteId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  return { status: res.status, body }
}

/** One plain sentence about the client's link, by the state (D-02: the link stays valid until the operator cancels). */
function linkSentence(detail: QuoteDetail): string {
  const expiry = formatPragueShort(detail.quote.expires_at)
  const live = `The client's link works until you cancel the quote${expiry ? `, until ${expiry} (Prague time)` : ''}, or until the first trip has started.`
  switch (detail.effective_status) {
    case 'draft':
      return 'Not sent yet. The client has no link.'
    case 'sent':
      return `Sent. ${live}`
    case 'viewed':
      return `The client has opened the link. ${live}`
    case 'accepted':
      return `The client has accepted the quote and is paying the deposit. ${live}`
    case 'expired':
      return 'The expiry date has passed, so the client\'s link no longer opens. To offer the quote again, edit it into a new version with a later expiry date and send that.'
    case 'paid':
      return 'Paid. The client\'s link stays readable as a receipt.'
    case 'voided':
      return 'Cancelled before payment. The client\'s link no longer works and nothing was charged.'
    case 'cancelled':
      return 'This paid quote was cancelled. The client\'s link no longer works.'
    default:
      return ''
  }
}

const cardStyle: CSSProperties = {
  backgroundColor: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
}

const mutedStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  color: 'var(--admin-text-muted)',
  margin: 0,
}

const effectStyle: CSSProperties = { ...mutedStyle, fontSize: 'var(--admin-fs-label)', marginTop: '6px' }

const primaryButtonStyle: CSSProperties = {
  ...outlineButtonStyle,
  background: 'var(--admin-accent)',
  color: 'var(--admin-on-accent)',
  border: 'none',
}

const buttonInner: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '8px' }

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
  danger,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
  testId: string
}) {
  const base = primary ? primaryButtonStyle : outlineButtonStyle
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        ...buttonInner,
        ...(danger ? { color: 'var(--status-danger-fg)' } : {}),
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

interface DialogConfig {
  title: string
  lead: string
  effects: string[]
  primaryLabel: string
  tone: 'accent' | 'danger'
  /** Runs the request. Returns the sentence to show when the action was refused, null when it worked. */
  run: () => Promise<string | null>
}

/** The confirmation of an action that changes state: names the effect first, sends from the primary button only. */
function ActionDialog({ config, onClose }: { config: DialogConfig | null; onClose: () => void }) {
  const isOpen = config !== null
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  // A reopened dialog starts clean.
  useEffect(() => {
    if (!isOpen) {
      setSubmitting(false)
      setError(null)
      busy.current = false
    }
  }, [isOpen])

  async function confirm() {
    if (!config || busy.current) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const refused = await config.run()
      if (refused === null) onClose()
      else setError(refused)
    } catch {
      setError(COPY_FAILED_GENERIC)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  const closeGuarded = submitting ? () => {} : onClose

  return (
    <Modal isOpen={isOpen} onClose={closeGuarded} title={config?.title ?? ''}>
      {config && (
        <>
          <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>{config.lead}</p>
          {config.effects.map((line) => (
            <p key={line} style={{ ...labelStyle, margin: '8px 0 0' }}>{line}</p>
          ))}
          <DialogError text={error} />
          <DecisionButtons
            primaryLabel={config.primaryLabel}
            tone={config.tone}
            secondaryLabel="Go back"
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

export function QuoteActionsBar({ detail, unsavedChanges = false, onChanged }: QuoteActionsBarProps) {
  const quoteId = detail.quote.id
  const status = detail.effective_status
  const versionNo = detail.version.version_no
  const frozen = detail.version.frozen_at !== null
  const clientName = `${detail.quote.client_first_name} ${detail.quote.client_last_name}`.trim()
  const language = (LOCALE_ENDONYMS as Record<string, string>)[detail.version.locale] ?? detail.version.locale

  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const linkInFlight = useRef(false)

  const refetch = async () => {
    await onChanged()
  }

  /** The URL is state, shown once; the next action and Done clear it. */
  const reveal = (url: string, emailed: boolean | null) => setRevealed({ url, emailed, copyFailed: false, copied: false })
  const clearOutcome = () => {
    setRevealed(null)
    setNotice(null)
    setError(null)
  }

  async function runSend(resend: boolean): Promise<string | null> {
    clearOutcome()
    const answer = await post(quoteId, 'send', resend ? { resend: true } : {})
    if (answer.status === 200 && typeof answer.body?.url === 'string') {
      reveal(answer.body.url, answer.body.emailed === true)
      await refetch()
      return null
    }
    if (staleAnswer(answer)) void refetch()
    return sendRefusalText(answer)
  }

  async function runRevise(): Promise<string | null> {
    clearOutcome()
    const answer = await post(quoteId, 'revise', {})
    if (answer.status === 200) {
      setNotice(`Version ${versionNo + 1} is ready to edit. The previous link no longer works; send this version to give the client a new one.`)
      await refetch()
      return null
    }
    if (staleAnswer(answer)) void refetch()
    return reviseRefusalText(answer)
  }

  async function runRemainder(): Promise<string | null> {
    clearOutcome()
    const answer = await post(quoteId, 'remainder-request', {})
    if (answer.status === 200) {
      const sent = typeof answer.body?.amountMinor === 'number' ? answer.body.amountMinor : dueMinor
      setNotice(`Request sent. ${detail.quote.client_email} was emailed a link to pay the remaining ${money(sent, detail.version.currency)}.`)
      await refetch()
      return null
    }
    if (staleAnswer(answer)) void refetch()
    return remainderRefusalText(answer)
  }

  async function copyNewLink() {
    if (linkInFlight.current) return
    linkInFlight.current = true
    setLinkBusy(true)
    clearOutcome()
    try {
      const answer = await post(quoteId, 'link', {})
      if (answer.status === 200 && typeof answer.body?.url === 'string') {
        reveal(answer.body.url, null)
      } else {
        setError(linkRefusalText(answer))
        if (staleAnswer(answer)) void refetch()
      }
    } catch {
      setError(COPY_FAILED_GENERIC)
    } finally {
      linkInFlight.current = false
      setLinkBusy(false)
    }
  }

  async function copyUrl() {
    if (!revealed) return
    const ok = await copyPaymentLinkToClipboard(revealed.url, 'quote-link-once-text')
    setRevealed((r) => (r ? { ...r, copied: ok, copyFailed: !ok } : r))
  }

  // What is still due on the quote (the remainders of its live, unpaid quote-mode trips), for the remainder request.
  const dueMinor = remainderDueMinor(
    detail.lines.map((l) => ({ id: l.id, remainder_minor: l.remainder_minor })),
    detail.bookings.map((b) => ({ quote_line_id: b.quote_line_id, status: b.status, paid_at: b.paid_at ?? null, payment_mode: b.payment_mode ?? '' })),
  )

  const dialogConfig = ((): DialogConfig | null => {
    if (dialog === 'send') {
      return {
        title: 'Send quote',
        lead: `Send version ${versionNo} to ${clientName}?`,
        effects: [
          `This version is frozen: it can no longer be edited, only replaced by a new version.`,
          `${detail.quote.client_email} gets an email in ${language} with the client's secret link.`,
        ],
        primaryLabel: 'Send quote',
        tone: 'accent',
        run: () => runSend(false),
      }
    }
    if (dialog === 'resend') {
      return {
        title: 'Resend quote',
        lead: `Email version ${versionNo} to ${clientName} again?`,
        effects: [
          `${detail.quote.client_email} gets another email in ${language} with a new link.`,
          'The links the client already has keep working.',
        ],
        primaryLabel: 'Resend quote',
        tone: 'accent',
        run: () => runSend(true),
      }
    }
    if (dialog === 'revise') {
      return {
        title: 'Edit quote',
        lead: `Editing creates version ${versionNo + 1}. The client's current link stops working.`,
        effects: [
          `Version ${versionNo} stays in the history, unchanged.`,
          `Nothing reaches the client until you send version ${versionNo + 1}.`,
        ],
        primaryLabel: `Create version ${versionNo + 1}`,
        tone: 'danger',
        run: runRevise,
      }
    }
    if (dialog === 'remainder') {
      const amount = money(dueMinor, detail.version.currency)
      return {
        title: 'Send remainder request',
        lead: `Ask ${clientName} to pay the remaining ${amount}?`,
        effects: [
          `${detail.quote.client_email} gets an email in ${language} with a new link to pay ${amount} by card.`,
          'You can send another request after 10 minutes.',
        ],
        primaryLabel: `Send request for ${amount}`,
        tone: 'accent',
        run: runRemainder,
      }
    }
    return null
  })()

  const canSend = status === 'draft'
  // Migration 097: a draft may be saved with TBC fields; Send waits until the SAVED version is complete.
  const stillTbc = canSend ? sendBlockers(draftFromDetail(detail)) : []
  const sentTbc = canSend ? tbcFields(draftFromDetail(detail)) : []
  const canLink = ['sent', 'viewed', 'accepted', 'expired', 'paid'].includes(status)
  const canResend = ['sent', 'viewed', 'accepted', 'expired'].includes(status)
  const canRevise = canResend
  const canVoid = canResend
  const tripStarted = detail.bookings.some((b) => STARTED_BOOKING_STATUSES.has(b.status as BookingStatus))
  const canCancelPaid = status === 'paid'
  const method = detail.version.remainder_method
  const canInvoicePaid = status === 'paid' && method === 'invoice' && !detail.quote.invoice_paid_at
  const invoiceDone = status === 'paid' && method === 'invoice' && Boolean(detail.quote.invoice_paid_at)
  const canRequestRemainder = status === 'paid' && method === 'payment_link' && dueMinor > 0
  // What can still be refunded (paid minus refunded), by payment. A cancelled quote keeps the refund: that is how a failed
  // refund of a cancel is retried. Only Stripe-collected money has a payment to refund.
  const q = detail.quote
  const depositSource = { paidMinor: Number(detail.version.deposit_minor ?? 0), refundedMinor: Number(q.deposit_refunded_minor ?? 0) }
  const remainderSource =
    q.remainder_paid_at && q.remainder_payment_intent_id && q.remainder_amount_minor
      ? { paidMinor: Number(q.remainder_amount_minor), refundedMinor: Number(q.remainder_refunded_minor ?? 0) }
      : null
  const refundableMinor =
    Math.max(0, depositSource.paidMinor - depositSource.refundedMinor) +
    (remainderSource ? Math.max(0, remainderSource.paidMinor - remainderSource.refundedMinor) : 0)
  const canRefund = (status === 'paid' || status === 'cancelled') && Boolean(q.paid_at) && refundableMinor > 0
  const none = !canSend && !canLink && !canResend && !canRevise && !canVoid && !canCancelPaid && !canRefund && !canInvoicePaid && !canRequestRemainder
  const busyNow = linkBusy

  return (
    <section data-testid="quote-actions" aria-label="Quote state and actions" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <QuoteStatusBadge status={status} />
          <span data-testid="quote-version" style={{ ...bodyStyle }}>
            {`Version ${versionNo} (${frozen ? 'sent' : 'draft'})`}
          </span>
        </div>
        <p data-testid="quote-link-state" style={{ ...mutedStyle, marginTop: '8px' }}>{linkSentence(detail)}</p>
      </div>

      {revealed && (
        <div data-testid="quote-link-once" role="status" style={{ ...cardStyle, backgroundColor: 'var(--admin-input-bg)' }}>
          <div style={labelStyle}>Link for the client</div>
          {revealed.emailed === true && <p style={{ ...mutedStyle, color: 'var(--status-ok-fg)' }}>{`Email sent to ${detail.quote.client_email}.`}</p>}
          {revealed.emailed === false && (
            <p style={{ ...mutedStyle, color: 'var(--status-warn-fg)' }}>Email not sent - copy the link to the client</p>
          )}
          <div
            id="quote-link-once-text"
            data-testid="quote-link-once-url"
            style={{ ...bodyStyle, wordBreak: 'break-all', margin: '8px 0', userSelect: 'all' }}
          >
            {revealed.url}
          </div>
          <p style={effectStyle}>
            This link is shown only now. Copy it before you leave this page. If you edit the quote into a new version, this link stops working.
          </p>
          {revealed.copyFailed && (
            <p style={{ ...effectStyle, color: 'var(--status-warn-fg)' }}>The browser did not allow copying. The link is selected: copy it by hand.</p>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
            <ActionButton testId="quote-link-copy" onClick={copyUrl} primary>
              <Copy size={14} aria-hidden="true" /> {revealed.copied ? 'Copied' : 'Copy link'}
            </ActionButton>
            <ActionButton testId="quote-link-done" onClick={() => setRevealed(null)} disabled={busyNow}>
              Done
            </ActionButton>
          </div>
        </div>
      )}

      {notice && <p role="status" style={{ ...mutedStyle, color: 'var(--status-ok-fg)' }}>{notice}</p>}
      {error && <p role="alert" style={{ ...mutedStyle, color: 'var(--status-danger-fg)' }}>{error}</p>}

      {none && <p style={mutedStyle}>No actions: this quote is closed.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {canSend && (
          <div>
            <ActionButton
              testId="quote-action-send"
              onClick={() => setDialog('send')}
              disabled={unsavedChanges || busyNow || stillTbc.length > 0}
              primary
            >
              <Send size={14} aria-hidden="true" /> Send
            </ActionButton>
            <p style={effectStyle} data-testid="quote-send-hint">
              {unsavedChanges
                ? 'You have unsaved changes. Save the quote first: Send uses the saved version.'
                : stillTbc.length > 0
                  ? `Needed before sending: ${stillTbc.join('; ')}.`
                  : sentTbc.length > 0
                    ? `Sends with TBC (${sentTbc.join('; ')}). The bookings are made once you fill these in.`
                    : 'Freezes this version, emails the client in their language and gives you the secret link.'}
            </p>
          </div>
        )}
        {canLink && (
          <div>
            <ActionButton testId="quote-action-link" onClick={copyNewLink} disabled={busyNow}>
              <Link2 size={14} aria-hidden="true" /> {linkBusy ? 'Working…' : 'Copy new link'}
            </ActionButton>
            <p style={effectStyle}>
              {status === 'expired'
                ? 'Makes a link, but it will not open until the expiry date is moved (use Edit).'
                : 'Makes one more working link and shows it once. Links you gave out earlier keep working. Nothing is emailed.'}
            </p>
          </div>
        )}
        {canResend && (
          <div>
            <ActionButton testId="quote-action-resend" onClick={() => setDialog('resend')} disabled={busyNow}>
              <Mail size={14} aria-hidden="true" /> Resend
            </ActionButton>
            <p style={effectStyle}>Emails the client again with a new link. The links they already have keep working.</p>
          </div>
        )}
        {canRevise && (
          <div>
            <ActionButton testId="quote-action-revise" onClick={() => setDialog('revise')} disabled={busyNow}>
              <Pencil size={14} aria-hidden="true" /> Edit
            </ActionButton>
            <p style={effectStyle}>{`Creates version ${versionNo + 1}. The client's current link stops working until you send the new version.`}</p>
          </div>
        )}
        {canVoid && (
          <div>
            <ActionButton testId="quote-action-void" onClick={() => setVoidOpen(true)} disabled={busyNow} danger>
              <XCircle size={14} aria-hidden="true" /> Cancel quote
            </ActionButton>
            <p style={effectStyle}>The client&apos;s link stops working. Nothing is charged.</p>
          </div>
        )}
      </div>

      {(canCancelPaid || canRefund || canInvoicePaid || canRequestRemainder || invoiceDone) && (
        <div data-testid="quote-money-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {canCancelPaid && (
            <div>
              <ActionButton testId="quote-action-cancel" onClick={() => setCancelOpen(true)} disabled={busyNow || tripStarted} danger>
                <XCircle size={14} aria-hidden="true" /> Cancel quote
              </ActionButton>
              <p data-testid="quote-cancel-effect" style={effectStyle}>
                {tripStarted
                  ? 'A trip of this quote has started, so the quote can no longer be cancelled. Cancel single trips in Bookings and refund here.'
                  : 'Only you can cancel a paid quote; it is refused once a trip has started. The dialog shows what is refunded and what is kept before anything is sent.'}
              </p>
            </div>
          )}
          {canRefund && (
            <div>
              <ActionButton testId="quote-action-refund" onClick={() => setRefundOpen(true)} disabled={busyNow} danger>
                <RotateCcw size={14} aria-hidden="true" /> Refund
              </ActionButton>
              <p data-testid="quote-refund-effect" style={effectStyle}>
                {`Returns part of the deposit or of a remainder paid on the page to the client's card. You can refund up to ${money(refundableMinor, detail.version.currency)} in total.`}
              </p>
            </div>
          )}
          {canInvoicePaid && (
            <div>
              <ActionButton testId="quote-action-invoice-paid" onClick={() => setInvoiceOpen(true)} disabled={busyNow}>
                <FileCheck size={14} aria-hidden="true" /> Mark invoice paid
              </ActionButton>
              <p data-testid="quote-invoice-effect" style={effectStyle}>
                Records that the client paid the remainder by invoice, under the invoice number you type. No card is charged and no email is sent.
              </p>
            </div>
          )}
          {invoiceDone && (
            <p data-testid="quote-invoice-done" style={effectStyle}>{`Invoice ${detail.quote.invoice_number ?? ''} is marked paid.`}</p>
          )}
          {canRequestRemainder && (
            <div>
              <ActionButton testId="quote-action-remainder" onClick={() => setDialog('remainder')} disabled={busyNow}>
                <Banknote size={14} aria-hidden="true" /> {`Send remainder request (${money(dueMinor, detail.version.currency)})`}
              </ActionButton>
              <p data-testid="quote-remainder-effect" style={effectStyle}>
                Emails the client a new link to pay what is still due by card. The dialog shows the amount before anything is sent.
              </p>
            </div>
          )}
        </div>
      )}

      <ActionDialog config={dialogConfig} onClose={() => setDialog(null)} />
      <InvoicePaidDialog
        isOpen={invoiceOpen}
        quoteId={quoteId}
        onClose={() => setInvoiceOpen(false)}
        onDone={(text) => {
          setInvoiceOpen(false)
          clearOutcome()
          setNotice(text)
          void refetch()
        }}
        onRefetch={() => void refetch()}
      />
      <QuoteRefundDialog
        isOpen={refundOpen}
        quoteId={quoteId}
        currency={detail.version.currency}
        deposit={depositSource}
        remainder={remainderSource}
        onClose={() => setRefundOpen(false)}
        onDone={(text) => {
          setRefundOpen(false)
          clearOutcome()
          setNotice(text)
          void refetch()
        }}
        onRefetch={() => void refetch()}
      />
      <QuoteCancelDialog
        isOpen={cancelOpen}
        quoteId={quoteId}
        currency={detail.version.currency}
        onClose={() => setCancelOpen(false)}
        onDone={(text) => {
          setCancelOpen(false)
          clearOutcome()
          setNotice(text)
          void refetch()
        }}
        onRefetch={() => void refetch()}
      />
      <QuoteVoidDialog
        quote={voidOpen ? { id: quoteId, reference: detail.quote.reference, client_name: clientName } : null}
        onClose={() => setVoidOpen(false)}
        onDone={() => {
          clearOutcome()
          void refetch()
        }}
        onRefetch={() => void refetch()}
      />
    </section>
  )
}
