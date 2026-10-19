'use client'
import { useState } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/admin/StatusBadge'
import type { ErasureLogRow } from '@/lib/erasure-store'

// The erasure log (GDPR-01, D-09). Every cell is built from a status, a count or a date: the rows
// the API returns hold a hash prefix and per-system counts only, and this component never renders
// anything else, so no email, name or phone can reach the screen from here.

interface ErasureAuditTableProps {
  rows: ErasureLogRow[]
  loading: boolean
}

type SystemKey = 'site' | 'chatwoot' | 'espocrm'
type SystemState = { state: 'done' | 'pending' | 'failed'; counts: string | null }
type Badge = { variant: 'pending' | 'confirmed' | 'completed' | 'cancelled'; label: string }

const COLUMNS = ['REQUESTED', 'REFERENCE', 'STATUS', 'SITE', 'CHATWOOT', 'ESPOCRM', 'VERIFIED', 'COMPLETED']

/** Rows that are still moving: the page polls only while one of these exists. */
export function isErasureActive(row: Pick<ErasureLogRow, 'status'>): boolean {
  return row.status === 'confirmed' || row.status === 'running'
}

function num(step: Record<string, unknown> | undefined, key: string): number {
  const v = step?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function joinCounts(parts: string[]): string | null {
  return parts.length > 0 ? parts.join(' · ') : null
}

function hasError(step: Record<string, unknown> | undefined): boolean {
  if (!step) return false
  const e = step.error
  return e !== undefined && e !== null && e !== false && e !== ''
}

/** Done = step recorded without an error; Failed = step with an error, or missing in a row that already failed. */
function systemState(row: ErasureLogRow, system: SystemKey): SystemState {
  const steps = row.steps as Record<string, Record<string, unknown> | undefined>
  const step = system === 'site' ? steps.supabase : system === 'chatwoot' ? steps.chatwoot : steps.espocrm
  if (hasError(step)) return { state: 'failed', counts: null }
  if (!step) return { state: row.status === 'failed' ? 'failed' : 'pending', counts: null }

  if (system === 'site') {
    const bookings = num(step, 'bookings_anonymised')
    const inquiries = num(step, 'inquiries_deleted') + num(step, 'quote_leads_deleted')
    const account = num(steps.auth, 'account_deleted')
    return {
      state: 'done',
      counts: joinCounts([
        ...(bookings > 0 ? [plural(bookings, 'booking', 'bookings')] : []),
        ...(inquiries > 0 ? [plural(inquiries, 'inquiry', 'inquiries')] : []),
        ...(account > 0 ? [plural(account, 'account', 'accounts')] : []),
      ]),
    }
  }
  if (system === 'chatwoot') {
    const contacts = num(step, 'chatwoot_contacts_deleted')
    return { state: 'done', counts: contacts > 0 ? plural(contacts, 'contact', 'contacts') : null }
  }
  const contacts = num(step, 'espo_contacts_deleted')
  const leads = num(step, 'espo_leads_deleted')
  const bookings = num(step, 'espo_cbookings_anonymised')
  return {
    state: 'done',
    counts: joinCounts([
      ...(contacts > 0 ? [plural(contacts, 'contact', 'contacts')] : []),
      ...(leads > 0 ? [plural(leads, 'lead', 'leads')] : []),
      ...(bookings > 0 ? [plural(bookings, 'booking', 'bookings')] : []),
    ]),
  }
}

/**
 * Systems finish independently, so the badge follows all of them: Completed only when the request is
 * completed, all three systems are Done and Verified is Yes; any Failed system or a failed request is
 * Needs attention; otherwise the request is still moving.
 */
function badgeFor(row: ErasureLogRow, cells: SystemState[]): Badge {
  const failed = row.status === 'failed' || cells.some((c) => c.state === 'failed')
  if (failed) return { variant: 'cancelled', label: 'Needs attention' }
  const allDone = cells.every((c) => c.state === 'done')
  if (row.status === 'completed' && allDone && row.verified === true) return { variant: 'completed', label: 'Completed' }
  const started = cells.some((c) => c.state === 'done')
  if (row.status === 'confirmed' && !started) return { variant: 'pending', label: 'Queued' }
  return { variant: 'confirmed', label: 'In progress' }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return '—'
  return t.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDateFull(iso: string | null): string | undefined {
  if (!iso) return undefined
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? undefined : t.toLocaleString('en-GB')
}

function SystemCell({ cell }: { cell: SystemState }) {
  if (cell.state === 'pending') return <span style={{ color: 'var(--warmgrey)' }}>Pending</span>
  if (cell.state === 'failed') {
    return (
      <>
        <span style={{ color: '#f87171' }}>Failed</span>
        <div style={{ ...labelText, whiteSpace: 'normal' }}>
          <Link href="/admin/outbox" style={{ color: 'var(--copper)', fontWeight: 500 }}>
            Open Outbox
          </Link>
        </div>
      </>
    )
  }
  return (
    <>
      <span>Done</span>
      {cell.counts && <div style={{ ...labelText, color: 'var(--warmgrey)' }}>{cell.counts}</div>}
    </>
  )
}

export function ErasureAuditTable({ rows, loading }: ErasureAuditTableProps) {
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
                <div style={{ fontFamily: 'var(--font-cormorant)', fontSize: '20px', color: 'var(--offwhite)', lineHeight: 1.25 }}>
                  No erasures yet
                </div>
                <div style={{ margin: '8px 0 0' }}>
                  Completed requests appear here with counts only. No personal data is stored in this log.
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const cells = (['site', 'chatwoot', 'espocrm'] as const).map((s) => systemState(row, s))
              const badge = badgeFor(row, cells)
              return (
                <tr
                  key={row.id}
                  onMouseEnter={() => setHovered(row.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: hovered === row.id ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
                    borderBottom: '1px solid var(--anthracite-light)',
                  }}
                >
                  <td style={{ ...cellStyle, ...truncate }} title={formatDateFull(row.requestedAt)}>
                    {formatDate(row.requestedAt)}
                  </td>
                  <td style={{ ...cellStyle, ...truncate }} title={row.reference}>
                    {row.reference}
                  </td>
                  <td style={cellStyle}>
                    <StatusBadge variant={badge.variant} label={badge.label} />
                  </td>
                  {cells.map((cell, i) => (
                    <td key={COLUMNS[3 + i]} style={cellStyle}>
                      <SystemCell cell={cell} />
                    </td>
                  ))}
                  <td style={cellStyle}>{row.verified === true ? 'Yes' : 'No'}</td>
                  <td style={{ ...cellStyle, ...truncate, color: 'var(--warmgrey)' }} title={formatDateFull(row.completedAt)}>
                    {formatDate(row.completedAt)}
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
  verticalAlign: 'middle',
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
