'use client'

import type { CSSProperties } from 'react'
import { PaymentStateBadge } from '@/components/admin/PaymentStateBadge'
import { formatPragueFull, labelStyle, money } from '@/components/admin/paymentShared'
import type { QuoteDetail } from '@/lib/quotes/store'

// The history of a quote and the bookings made from it (Phase 92, plan 92-25; QUOTE-06, SC1). Mounted by QuoteBuilder.
// An event shows its time (Prague), what happened, the version, an amount when it has one and an error code when it
// failed. It never shows a client name, email, phone or address: the quote_events table holds none, and this list reads
// only the fields named here. Newest first.

const EVENT_LABEL: Record<string, string> = {
  created: 'Quote created',
  sent: 'Quote sent',
  link_minted: 'New link created',
  viewed: 'Client opened the link',
  revised: 'New version created',
  voided: 'Quote cancelled before payment',
  accepted: 'Client accepted',
  deposit_started: 'Deposit payment started',
  deposit_paid: 'Deposit paid',
  deposit_failed: 'Deposit payment failed',
  deposit_canceled: 'Deposit payment cancelled',
  converted: 'Bookings created',
  convert_failed: 'Creating the bookings failed',
  orphan_refunded: 'Payment refunded automatically',
  dispute_opened: 'Payment disputed',
  email_sent: 'Email sent',
  email_failed: 'Email not sent',
  alert_sent: 'Alert sent to the team',
  reminder_scheduled: 'Reminder scheduled',
  invoice_requested: 'Invoice requested',
  invoice_paid: 'Invoice marked paid',
  remainder_requested: 'Remainder requested',
  remainder_started: 'Remainder payment started',
  remainder_paid: 'Remainder paid',
  remainder_failed: 'Remainder payment failed',
  cancelled: 'Paid quote cancelled',
  deposit_refunded: 'Deposit refunded',
  remainder_refunded: 'Remainder refunded',
  refund_failed: 'Refund failed',
  refund_observed: 'Refund seen in Stripe',
  admin_action: 'Admin action',
}

const sectionStyle: CSSProperties = {
  backgroundColor: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
}

const textStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  color: 'var(--admin-text)',
  margin: 0,
}

const mutedStyle: CSSProperties = { ...textStyle, color: 'var(--admin-text-muted)' }

const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: '4px 12px',
  borderBottom: '1px solid var(--admin-border)',
  paddingBottom: '8px',
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function QuoteEventsList({ detail }: { detail: QuoteDetail }) {
  const versionNo = new Map(detail.versions.map((v) => [v.id, v.version_no]))
  const events = [...detail.events].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  return (
    <section data-testid="quote-events" aria-label="History and bookings" style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <div style={labelStyle}>History</div>
        {events.length === 0 ? (
          <p style={mutedStyle}>Nothing has happened yet.</p>
        ) : (
          <ol style={{ ...listStyle, maxHeight: '320px', overflowY: 'auto' }}>
            {events.map((e, index) => {
              const kind = String(e.kind ?? '')
              const when = formatPragueFull(typeof e.created_at === 'string' ? e.created_at : null)
              const version = typeof e.version_id === 'string' ? versionNo.get(e.version_id) : undefined
              const amount = asNumber(e.amount_minor)
              const errorCode = typeof e.error_code === 'string' && e.error_code ? e.error_code : null
              return (
                <li key={String(e.id ?? `${kind}-${index}`)} data-testid="quote-event-row" style={rowStyle}>
                  <span data-testid="quote-event-time" style={{ ...mutedStyle, whiteSpace: 'nowrap' }}>{when ?? ''}</span>
                  <span data-testid="quote-event-kind" style={textStyle}>{EVENT_LABEL[kind] ?? kind}</span>
                  {version !== undefined && <span style={mutedStyle}>{`Version ${version}`}</span>}
                  {amount !== null && (
                    <span data-testid="quote-event-amount" style={{ ...textStyle, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {money(amount, typeof e.currency === 'string' ? e.currency : detail.version.currency)}
                    </span>
                  )}
                  {errorCode && <span style={{ ...mutedStyle, color: 'var(--status-danger-fg)' }}>{errorCode}</span>}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <div>
        <div style={labelStyle}>Bookings</div>
        {detail.bookings.length === 0 ? (
          <p style={mutedStyle}>No bookings yet. They are created when the client pays the deposit.</p>
        ) : (
          <ul style={listStyle}>
            {detail.bookings.map((b) => (
              <li key={b.id} data-testid="quote-booking-row" style={rowStyle}>
                <span style={textStyle}>{b.booking_reference ?? 'No reference yet'}</span>
                <PaymentStateBadge state={b.payment_state ?? 'none'} mode={b.payment_mode} />
                <span style={mutedStyle}>{b.status}</span>
                {b.pickup_date && <span style={mutedStyle}>{b.pickup_date}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
