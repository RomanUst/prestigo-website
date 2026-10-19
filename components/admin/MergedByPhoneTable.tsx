'use client'
import { useState } from 'react'
import { Split } from 'lucide-react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import type { PhoneMergeRow } from '@/lib/identity-admin-store'

interface MergedByPhoneTableProps {
  merges: PhoneMergeRow[]
  loading: boolean
  onSplit: (merge: PhoneMergeRow) => void
  /** Shown instead of rows when there is nothing to list. */
  empty: { heading?: string; body: string }
}

const COLUMNS = ['CONTACT', 'MERGED EMAIL', 'PHONE', 'BOOKINGS', 'MERGED']
const COL_COUNT = COLUMNS.length + 1
const DASH = '—'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleDateString('en-GB')
}

function formatDateTime(iso: string): string | undefined {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString('en-GB')
}

export function MergedByPhoneTable({ merges, loading, onSplit, empty }: MergedByPhoneTableProps) {
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
            <th scope="col" style={headStyle}>
              <span style={visuallyHidden}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={COL_COUNT} style={emptyCellStyle}>
                Loading...
              </td>
            </tr>
          ) : merges.length === 0 ? (
            <tr>
              <td colSpan={COL_COUNT} style={emptyCellStyle}>
                {empty.heading && (
                  <div style={{ fontFamily: 'var(--font-cormorant)', fontSize: '20px', color: 'var(--offwhite)', lineHeight: 1.25 }}>
                    {empty.heading}
                  </div>
                )}
                <div style={{ margin: empty.heading ? '8px 0 0' : 0 }}>{empty.body}</div>
              </td>
            </tr>
          ) : (
            merges.map((m) => {
              const rowKey = `${m.identityId}:${m.mergedEmail}`
              const contact = m.contactEmail ?? DASH
              return (
                <tr
                  key={rowKey}
                  onMouseEnter={() => setHovered(rowKey)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: hovered === rowKey ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
                    borderBottom: '1px solid var(--anthracite-light)',
                  }}
                >
                  <td style={{ ...cellStyle, ...truncate }} title={m.contactEmail ?? undefined}>
                    {contact}
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ ...truncate, minWidth: 0 }} title={m.mergedEmail}>
                        {m.mergedEmail}
                      </span>
                      <span style={{ flexShrink: 0 }}>
                        <StatusBadge variant="quote" label="Phone merge" />
                      </span>
                    </div>
                  </td>
                  <td style={{ ...cellStyle, ...truncate }} title={m.phone ?? undefined}>
                    {m.phone ?? DASH}
                  </td>
                  <td style={cellStyle}>{m.bookings}</td>
                  <td style={{ ...cellStyle, color: 'var(--warmgrey)' }} title={formatDateTime(m.mergedAt)}>
                    {formatDate(m.mergedAt)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => onSplit(m)}
                      aria-label={`Split ${m.mergedEmail} from ${contact}`}
                      style={secondaryButton}
                      onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = 'var(--copper)' }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = 'var(--anthracite-light)' }}
                    >
                      <Split size={16} aria-hidden="true" />
                      Split contact
                    </button>
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

const secondaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  minHeight: '44px',
  padding: '0 16px',
  background: 'transparent',
  color: 'var(--offwhite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  ...bodyText,
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}
