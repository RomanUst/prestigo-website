'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { money, outlineButtonStyle } from '@/components/admin/paymentShared'
import { QuoteStatusBadge, type QuoteBadgeStatus } from './QuoteStatusBadge'
import { QuoteVoidDialog, type VoidTarget } from './QuoteVoidDialog'

// Phase 92-14 (QUOTE-06 / SC1): one row per quote with reference, client, first trip date, total, version and the state
// badge. The row opens the quote (/admin/quotes/<id>). The amount is the API's integer minor units, formatted: no price
// is typed here.

export interface QuoteRow {
  id: string
  reference: string
  client_name: string
  client_email: string
  effective_status: QuoteBadgeStatus
  first_pickup_date: string | null
  total_minor: number
  currency: 'eur' | 'czk'
  updated_at: string
  version_no: number
}

type QuotesTableProps = {
  quotes: QuoteRow[]
  /** The server voided this quote: the parent shows it as Voided. */
  onVoided: (quoteId: string) => void
  /** Read the list again (the row on screen was stale). */
  onRefetch: () => void
}

// Cancel quote (void) is offered on every quote that is not paid and not already closed. A paid quote is cancelled with a
// refund from its own page (92-26), so its action is a link there.
const VOIDABLE: ReadonlySet<string> = new Set(['draft', 'sent', 'viewed', 'accepted', 'expired'])

const cancelActionStyle: React.CSSProperties = {
  ...outlineButtonStyle,
  minHeight: '36px',
  padding: '0 12px',
  whiteSpace: 'nowrap',
  color: 'var(--status-danger-fg)',
  borderColor: 'var(--status-danger-border)',
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
}

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: 'var(--admin-text-muted)',
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid var(--admin-border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 300,
  color: 'var(--admin-text)',
  padding: '12px',
  borderBottom: '1px solid var(--admin-border)',
  verticalAlign: 'middle',
}

const mutedStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--admin-text-muted)' }

export function QuotesTable({ quotes, onVoided, onRefetch }: QuotesTableProps) {
  const router = useRouter()
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null)

  if (quotes.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          backgroundColor: 'var(--admin-surface)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: 'var(--admin-text)',
            marginBottom: '8px',
          }}
        >
          No quotes yet.
        </div>
        <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '13px', fontWeight: 300, color: 'var(--admin-text-muted)' }}>
          Use New quote above to start one.
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        style={{
          overflowX: 'auto',
          border: '1px solid var(--admin-border)',
          borderRadius: '8px',
          backgroundColor: 'var(--admin-surface)',
        }}
      >
        <table data-testid="quotes-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Reference</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>First trip</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={thStyle}>Version</th>
              <th style={thStyle}>State</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr
                key={q.id}
                data-testid="quote-row"
                onClick={() => router.push(`/admin/quotes/${q.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <td style={{ ...tdStyle, fontWeight: 400, whiteSpace: 'nowrap' }}>
                  <Link
                    href={`/admin/quotes/${q.id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: 'var(--admin-accent)', textDecoration: 'none' }}
                  >
                    {q.reference}
                  </Link>
                </td>
                <td style={tdStyle}>
                  <div style={{ overflowWrap: 'anywhere' }}>{q.client_name}</div>
                  <div style={{ ...mutedStyle, overflowWrap: 'anywhere' }}>{q.client_email}</div>
                </td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} data-testid="quote-date">
                  {q.first_pickup_date ?? '—'}
                </td>
                <td
                  style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                  data-testid="quote-total"
                >
                  {money(q.total_minor, q.currency)}
                </td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{`v${q.version_no}`}</td>
                <td style={tdStyle}>
                  <QuoteStatusBadge status={q.effective_status} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {VOIDABLE.has(q.effective_status) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setVoidTarget({ id: q.id, reference: q.reference, client_name: q.client_name })
                      }}
                      style={cancelActionStyle}
                    >
                      Cancel quote
                    </button>
                  ) : q.effective_status === 'paid' ? (
                    <Link
                      href={`/admin/quotes/${q.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={cancelActionStyle}
                    >
                      Cancel quote
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <QuoteVoidDialog
        quote={voidTarget}
        onClose={() => setVoidTarget(null)}
        onDone={onVoided}
        onRefetch={onRefetch}
      />
    </>
  )
}
