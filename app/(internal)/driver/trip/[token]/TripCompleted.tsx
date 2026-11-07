'use client'

import { useState } from 'react'
import { Banknote, CircleCheck } from 'lucide-react'
import type { DriverTripCash } from '@/lib/driver-trip-step'
import { BUSINESS_TEL_URL } from '@/lib/contact-channels'
import { formatPickupDate, formatPragueTime } from '@/lib/driver-trip-format'
import ConfirmStepDialog from './ConfirmStepDialog'

export interface TripCompletedProps {
  variant: 'in-session' | 'reopened'
  summary?: { bookingReference: string; pickupDate: string; completedAt: string }
  /** Phase 89 (D-11): the trip token and the cash facts, present only for a cash_guarantee booking. */
  token?: string
  cash?: DriverTripCash
}

// D-17: shown for a completed trip. The in-session variant (right after the driver completes) adds
// a three-row summary: Booking, Date, Completed at. The re-opened variant (server-rendered later)
// carries no trip data at all. Neither shows the passenger, an address or a phone number.
//
// Phase 89 (D-11, D-12, D-21, UI-SPEC 6.2): the one scoped exception to "no amount". For a cash_guarantee booking whose
// cash is not settled, a card shows the amount (a label built on the server) and one button, "I received {amount}", that
// opens the confirm dialog and posts { action: 'confirm_cash' }. There is no "did not pay" answer: if the passenger did
// not pay, the driver calls the office and nothing happens by itself. After the confirmation (or when the operator already
// settled) the card is the ok line. A non-cash trip renders exactly as in Phase 87.
const CASH_ERROR_CHANGED = 'This booking changed. Reload the page.'
const CASH_ERROR_WAIT = 'A card payment is being checked. Try again in a minute.'
const CASH_ERROR_RATE = 'Too many taps. Wait a moment.'
const CASH_ERROR_OTHER = 'Could not send your answer. Try again.'

export default function TripCompleted({ variant, summary, token, cash }: TripCompletedProps) {
  const [settled, setSettled] = useState(cash?.state === 'settled')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmCash() {
    if (!token || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/driver/trip/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_cash' }),
      })
      if (res.status === 200) {
        // A replay answers 200 too: the same line, no second state.
        setSettled(true)
        setDialogOpen(false)
      } else if (res.status === 409 || res.status === 422 || res.status === 400) {
        const answer = (await res.json().catch(() => null)) as { error?: string } | null
        setError(answer?.error === 'cash_wait' ? CASH_ERROR_WAIT : CASH_ERROR_CHANGED)
      } else if (res.status === 429) {
        setError(CASH_ERROR_RATE)
      } else {
        setError(CASH_ERROR_OTHER)
      }
    } catch {
      setError(CASH_ERROR_OTHER)
    } finally {
      setSubmitting(false)
    }
  }

  function closeDialog() {
    if (submitting) return
    setDialogOpen(false)
    setError(null)
  }

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '48px 24px',
        textAlign: 'center',
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          background: 'var(--status-ok-bg)',
          color: 'var(--status-ok-fg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <CircleCheck size={48} aria-hidden="true" />
      </div>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-display)',
          fontWeight: 500,
          lineHeight: 1.1,
        }}
      >
        Trip completed
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 400,
          lineHeight: 1.5,
          color: 'var(--admin-text-muted)',
        }}
      >
        Thank you. This trip is closed.
      </p>

      {variant === 'in-session' && summary ? (
        <dl
          style={{
            boxSizing: 'border-box',
            width: '100%',
            margin: 0,
            padding: 16,
            background: 'var(--admin-surface)',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            textAlign: 'left',
          }}
        >
          <SummaryRow caption="Booking" value={summary.bookingReference} />
          <SummaryRow caption="Date" value={formatPickupDate(summary.pickupDate)} />
          <SummaryRow caption="Completed at" value={formatPragueTime(summary.completedAt)} />
        </dl>
      ) : null}

      {cash ? (
        settled ? (
          <p
            role="status"
            style={{
              boxSizing: 'border-box',
              width: '100%',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 'var(--driver-fs-body)',
              fontWeight: 500,
              lineHeight: 1.5,
              color: 'var(--status-ok-fg)',
              overflowWrap: 'anywhere',
            }}
          >
            <CircleCheck size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
            {`Cash received: ${cash.amountLabel}. Thank you.`}
          </p>
        ) : (
          <section
            aria-label="Cash to collect"
            style={{
              boxSizing: 'border-box',
              width: '100%',
              padding: 24,
              background: 'var(--admin-surface)',
              border: '1px solid var(--admin-border)',
              borderRadius: 'var(--admin-radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--driver-fs-label)', fontWeight: 500, lineHeight: 1.4, color: 'var(--admin-text-muted)' }}>
                CASH TO COLLECT
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 'var(--driver-fs-display)',
                  fontWeight: 500,
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                  overflowWrap: 'anywhere',
                }}
              >
                <Banknote size={24} aria-hidden="true" style={{ flexShrink: 0 }} />
                {cash.amountLabel}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 }}>
              Did the passenger pay you this amount in cash?
            </p>
            <button
              type="button"
              data-driver-focus=""
              disabled={!token}
              onClick={() => setDialogOpen(true)}
              style={{
                boxSizing: 'border-box',
                width: '100%',
                minHeight: 48,
                borderRadius: 'var(--admin-radius-md)',
                border: '1px solid var(--admin-accent)',
                background: 'var(--admin-accent)',
                color: 'var(--admin-on-accent)',
                fontFamily: 'inherit',
                fontSize: 'var(--driver-fs-body)',
                fontWeight: 500,
                lineHeight: 1.5,
                cursor: 'pointer',
              }}
            >
              {`I received ${cash.amountLabel}`}
            </button>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--driver-fs-label)',
                fontWeight: 400,
                lineHeight: 1.4,
                color: 'var(--admin-text-muted)',
              }}
            >
              If the passenger did not pay, call the office.
            </p>
          </section>
        )
      ) : null}

      <a
        href={BUSINESS_TEL_URL}
        data-driver-focus=""
        style={{
          minHeight: 48,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 500,
          color: 'var(--admin-accent-text)',
        }}
      >
        Call the office
      </a>

      {dialogOpen && cash && !settled ? (
        <ConfirmStepDialog
          mode="cash-received"
          cash={{ amountLabel: cash.amountLabel }}
          submitting={submitting}
          error={error}
          onConfirm={confirmCash}
          onCancel={closeDialog}
        />
      ) : null}
    </main>
  )
}

function SummaryRow({ caption, value }: { caption: string; value: string }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 'var(--driver-fs-label)',
          fontWeight: 500,
          lineHeight: 1.4,
          color: 'var(--admin-text-muted)',
        }}
      >
        {caption}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 400,
          lineHeight: 1.5,
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </dd>
    </div>
  )
}
