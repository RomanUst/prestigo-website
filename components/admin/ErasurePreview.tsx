'use client'
import { ShieldAlert } from 'lucide-react'
import type { ErasurePreviewData } from '@/components/admin/ErasureSearch'

interface ErasurePreviewProps {
  preview: ErasurePreviewData
  /** "Erase this person...": opens the confirm modal. */
  onErase: () => void
  /** "Discard preview": clears the preview, nothing is requested. */
  onDiscard: () => void
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ErasurePreview({ preview, onErase, onDiscard }: ErasurePreviewProps) {
  const { counts } = preview
  const inquiries = counts.inquiries + counts.quoteLeads
  const bookings = plural(counts.bookings, 'booking', 'bookings')

  return (
    <section aria-labelledby="erasure-preview-heading" style={{ margin: '32px 0 0' }}>
      <h2
        id="erasure-preview-heading"
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '20px',
          fontWeight: 500,
          lineHeight: 1.25,
          color: 'var(--offwhite)',
          margin: '0 0 16px',
          overflowWrap: 'anywhere',
        }}
      >
        {preview.primaryEmail}
      </h2>
      <div style={{ ...labelText, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#CFC9C2', margin: '0 0 8px' }}>
        What will happen
      </div>
      <div style={{ border: '1px solid var(--anthracite-light)', borderRadius: '4px' }}>
        <Row label="Site">
          {`${bookings} will be anonymised: name, email, phone, notes and addresses are wiped. Date, amount, vehicle class, reference and invoice data are kept for accounting. ${
            counts.hasAccount ? 'Account deleted.' : 'No account.'
          } ${plural(inquiries, 'form inquiry', 'form inquiries')} deleted.`}
        </Row>
        <Row label="Chatwoot">The contact and all of its conversations will be deleted.</Row>
        <Row label="EspoCRM">{`The contact and its leads will be deleted. ${bookings} will be anonymised.`}</Row>
        <Row muted>
          Not covered: the email mailbox archive, Stripe and Resend records, and encrypted backups (kept until they rotate
          out, up to 6 months). Handle these by hand if needed.
        </Row>
      </div>

      {counts.upcoming > 0 && (
        <div
          role="note"
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            margin: '16px 0 0',
            padding: '16px',
            background: '#2a1a1a',
            border: '1px solid #f87171',
            borderRadius: '4px',
            color: '#f87171',
            ...bodyText,
          }}
        >
          <ShieldAlert size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ margin: 0 }}>
            {`This person has ${plural(counts.upcoming, 'upcoming trip', 'upcoming trips')}. Erasing now removes the passenger's name, phone and addresses from those bookings, so the driver will lose the trip details.`}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '24px 0 0' }}>
        <button type="button" onClick={onErase} style={destructiveOutlined}>
          Erase this person...
        </button>
        <button type="button" onClick={onDiscard} style={secondaryButton}>
          Discard preview
        </button>
      </div>
    </section>
  )
}

function Row({ label, muted, children }: { label?: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 16px',
        padding: '16px',
        borderBottom: '1px solid var(--anthracite-light)',
        ...bodyText,
        color: muted ? 'var(--warmgrey)' : 'var(--offwhite)',
      }}
    >
      {label && (
        <div
          style={{
            ...labelText,
            flex: '0 0 96px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#CFC9C2',
            paddingTop: '2px',
          }}
        >
          {label}
        </div>
      )}
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>{children}</div>
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

const secondaryButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 16px',
  background: 'transparent',
  color: 'var(--offwhite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}

const destructiveOutlined: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  background: 'transparent',
  color: '#f87171',
  border: '1px solid #f87171',
  borderRadius: '4px',
  cursor: 'pointer',
  ...bodyText,
}
