'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { money } from '@/components/admin/paymentShared'
import { QuoteStatusBadge, type QuoteBadgeStatus } from './QuoteStatusBadge'

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

export function QuotesTable({ quotes }: QuotesTableProps) {
  const router = useRouter()

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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
