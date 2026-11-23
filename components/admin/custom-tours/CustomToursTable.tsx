'use client'
import Link from 'next/link'
import { BadgeShell } from '@/components/admin/StatusBadge'
import { formatPragueShort, outlineButtonStyle } from '@/components/admin/paymentShared'
import type { CustomTourRequestListItem } from '@/lib/custom-tours/admin-store'

// Phase 93 (plan 93-33; TRIP-07; UI-SPEC 8.1): one row per custom-tour request, newest first. Every cell shows visitor text
// as plain React text (T-93-76); the Where cell is one line with an ellipsis and the full text in `title` (E23). Colours only
// through --admin-* / --status-* tokens. Below 768px each row becomes a stacked card.

export type CustomTourListRow = CustomTourRequestListItem

/** The language chip of a request: the locale code on the neutral status tokens. */
export function LocaleChip({ locale }: { locale: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--admin-radius-sm)',
        background: 'var(--status-neutral-bg)',
        color: 'var(--status-neutral-fg)',
        border: '1px solid var(--status-neutral-border)',
        fontSize: '11px',
        fontWeight: 400,
        letterSpacing: '0.04em',
      }}
    >
      {locale}
    </span>
  )
}

/** Open (info) or Quoted (ok); `withReference` adds the linked quote's reference to the label. */
export function RequestStatusBadge({ status, reference }: { status: 'open' | 'quoted'; reference?: string | null }) {
  if (status === 'quoted') return <BadgeShell family="ok" label={reference ? `Quoted ${reference}` : 'Quoted'} />
  return <BadgeShell family="info" label="Open" />
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

const actionStyle: React.CSSProperties = {
  ...outlineButtonStyle,
  minHeight: '36px',
  padding: '0 12px',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
}

const STACK_CSS = `
@media (max-width: 767px) {
  .custom-tours-table thead { display: none; }
  .custom-tours-table, .custom-tours-table tbody { display: block; }
  .custom-tours-table tr { display: block; padding: 12px; border-bottom: 1px solid var(--admin-border); }
  .custom-tours-table td { display: block; border-bottom: none; padding: 6px 0; max-width: none !important; }
}
`

export function CustomToursTable({ requests }: { requests: CustomTourListRow[] }) {
  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-lg)',
        backgroundColor: 'var(--admin-surface)',
      }}
    >
      <style>{STACK_CSS}</style>
      <table className="custom-tours-table" data-testid="custom-tours-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Received</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Where</th>
            <th style={thStyle}>Trip date</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>People</th>
            <th style={thStyle}>Language</th>
            <th style={thStyle}>Status</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} data-testid="custom-tour-row">
              <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatPragueShort(r.receivedAt) ?? r.receivedAt}
              </td>
              <td style={tdStyle}>
                <div style={{ overflowWrap: 'anywhere' }}>{r.name || '—'}</div>
                <div style={{ ...mutedStyle, overflowWrap: 'anywhere' }}>{r.email}</div>
              </td>
              <td style={{ ...tdStyle, maxWidth: '280px' }}>
                <div
                  data-testid="custom-tour-where"
                  title={r.whereFirstLine}
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {r.whereFirstLine}
                </div>
              </td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                {r.date ?? <span style={{ color: 'var(--admin-text-muted)' }}>Not given</span>}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.people ?? '—'}</td>
              <td style={tdStyle}>
                <LocaleChip locale={r.locale} />
              </td>
              <td style={tdStyle}>
                <RequestStatusBadge status={r.status} reference={r.quote?.reference} />
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <Link href={`/admin/custom-tours/${r.id}`} style={actionStyle}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
