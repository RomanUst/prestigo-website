'use client'
import { useState } from 'react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import type { SharedPhoneRow } from '@/lib/identity-admin-store'

interface SharedNumbersTableProps {
  rows: SharedPhoneRow[]
  loading: boolean
  /** Shown instead of rows when there is nothing to list. */
  empty: { heading?: string; body: string }
}

const COLUMNS = ['PHONE', 'HOW', 'EMAILS', 'NOTE', 'MARKED']
const DASH = '—'
const SHOWN_EMAILS = 2

const HOW: Record<SharedPhoneRow['source'], { variant: 'pending' | 'quote' | 'confirmed'; label: string }> = {
  auto: { variant: 'pending', label: 'Automatic' },
  manual: { variant: 'quote', label: 'Manual' },
  split: { variant: 'confirmed', label: 'After split' },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleDateString('en-GB')
}

function formatDateTime(iso: string): string | undefined {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString('en-GB')
}

export function SharedNumbersTable({ rows, loading, empty }: SharedNumbersTableProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div
      style={{
        width: '100%',
        border: '1px solid var(--anthracite-light)',
        borderRadius: '4px',
        overflowX: 'auto',
      }}
    >
      <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--anthracite)', borderBottom: '1px solid var(--anthracite-light)', height: '48px' }}>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" style={headStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={COLUMNS.length} style={emptyCellStyle}>
                Loading...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} style={emptyCellStyle}>
                {empty.heading && (
                  <div style={{ fontFamily: 'var(--font-cormorant)', fontSize: '20px', color: 'var(--offwhite)', lineHeight: 1.25 }}>
                    {empty.heading}
                  </div>
                )}
                <div style={{ margin: empty.heading ? '8px 0 0' : 0 }}>{empty.body}</div>
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const shown = r.emails.slice(0, SHOWN_EMAILS)
              const more = r.emails.length - shown.length
              return (
                <tr
                  key={r.phone}
                  onMouseEnter={() => setHovered(r.phone)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: hovered === r.phone ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
                    borderBottom: '1px solid var(--anthracite-light)',
                  }}
                >
                  <td style={{ ...cellStyle, ...truncate }} title={r.phone}>
                    {r.phone}
                  </td>
                  <td style={cellStyle}>
                    <StatusBadge {...HOW[r.source]} />
                  </td>
                  <td style={cellStyle} title={r.emails.length > 0 ? r.emails.join(', ') : undefined}>
                    {r.emails.length === 0 ? (
                      DASH
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ ...truncate, minWidth: 0 }}>{shown.join(', ')}</span>
                        {more > 0 && (
                          <span style={{ ...labelText, color: 'var(--warmgrey)', flexShrink: 0 }}>{`+${more} more`}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ ...cellStyle, ...truncate, color: r.note ? 'var(--offwhite)' : 'var(--warmgrey)' }} title={r.note ?? undefined}>
                    {r.note ?? DASH}
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--warmgrey)' }} title={formatDateTime(r.markedAt)}>
                    {formatDate(r.markedAt)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const labelText: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  lineHeight: 1.5,
}

const headStyle: React.CSSProperties = {
  padding: '0 16px',
  textAlign: 'left',
  ...labelText,
  textTransform: 'uppercase',
  letterSpacing: '0.4em',
  color: 'var(--warmgrey)',
}

const cellStyle: React.CSSProperties = {
  padding: '0 16px',
  height: '48px',
  ...bodyText,
  color: 'var(--offwhite)',
}

const truncate: React.CSSProperties = {
  maxWidth: '280px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const emptyCellStyle: React.CSSProperties = {
  padding: '48px 32px',
  textAlign: 'center',
  ...bodyText,
  color: 'var(--warmgrey)',
}
