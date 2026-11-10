'use client'
import React from 'react'
import { useState } from 'react'
import { Copy, Send } from 'lucide-react'
import { czkToEur } from '@/lib/currency'
import { truncatePaymentLinkUrl, copyPaymentLinkToClipboard } from '@/lib/ui/payment-link-display'

// D-05: row-level "Generate Payment Link" action + result panel. Renders
// ONLY for unpaid/pending bookings (64-UI-SPEC.md E3/E2). Mounted identically
// in the desktop expanded row and the mobile expanded card.
interface PaymentLinkSectionProps {
  bookingId: string
  status: string
  paymentLinkUrl: string | null
  clientEmail: string
  amountCzk: number
  onGenerated: (bookingId: string, url: string, linkedBookingId: string | null) => void
}

const paymentLinkIconButtonStyle: React.CSSProperties = {
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  color: 'var(--copper)',
  cursor: 'pointer',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

export function PaymentLinkSection({ bookingId, status, paymentLinkUrl, clientEmail, amountCzk, onGenerated }: PaymentLinkSectionProps) {
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(false)
  const [linkedBookingId, setLinkedBookingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sent' | 'error'>('idle')

  // D-05: only unpaid/pending bookings are eligible for a payment link.
  if (status !== 'unpaid' && status !== 'pending') return null

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(false)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setLinkedBookingId(data.linkedBookingId ?? null)
        onGenerated(bookingId, data.paymentLinkUrl, data.linkedBookingId ?? null)
      } else {
        setGenerateError(true)
      }
    } catch {
      setGenerateError(true)
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyLink(url: string) {
    const didCopy = await copyPaymentLinkToClipboard(url, `payment-link-url-text-${bookingId}`)
    if (didCopy) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleResend() {
    setResending(true)
    setResendState('idle')
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resend: true }),
      })
      if (res.ok) {
        setResendState('sent')
        setTimeout(() => setResendState('idle'), 2000)
      } else {
        setResendState('error')
      }
    } catch {
      setResendState('error')
    } finally {
      setResending(false)
    }
  }

  const amountEur = czkToEur(amountCzk)
  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--font-montserrat)',
    fontSize: '11px',
    fontWeight: 300,
    textTransform: 'uppercase',
    letterSpacing: '0.3em',
    color: 'var(--warmgrey)',
    marginBottom: '8px',
  }

  if (paymentLinkUrl) {
    return (
      <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
        <div style={sectionLabel}>Payment Link</div>
        <div style={{
          background: 'var(--anthracite-mid)',
          borderLeft: '3px solid var(--copper)',
          padding: '24px',
        }}>
          <div style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            marginBottom: '8px',
          }}>
            Payment link ready
          </div>
          <div style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            lineHeight: 1.5,
            color: 'var(--warmgrey)',
            marginBottom: '16px',
          }}>
            Already emailed to {clientEmail}. Copy the link to share it another way (e.g. WhatsApp), or resend the email.
          </div>
          <div
            id={`payment-link-url-text-${bookingId}`}
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 300,
              lineHeight: 1.5,
              color: 'var(--offwhite)',
              wordBreak: 'break-all',
              marginBottom: '16px',
            }}
          >
            {truncatePaymentLinkUrl(paymentLinkUrl)}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleCopyLink(paymentLinkUrl)} style={paymentLinkIconButtonStyle}>
              <Copy size={14} />
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              style={{ ...paymentLinkIconButtonStyle, opacity: resending ? 0.6 : 1, cursor: resending ? 'not-allowed' : 'pointer' }}
            >
              <Send size={14} />
              {resending ? 'Sending...' : resendState === 'sent' ? 'Sent' : 'Resend Email'}
            </button>
          </div>
          {resendState === 'error' && (
            <div style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 300,
              color: 'var(--status-danger-fg)',
              marginTop: '8px',
            }}>
              Failed to send — try again
            </div>
          )}
          {linkedBookingId && (
            <div style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 300,
              color: 'var(--warmgrey)',
              marginTop: '8px',
            }}>
              This link also covers the linked return/outbound leg — paying once settles both.
            </div>
          )}
          <div style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--copper)',
            marginTop: '16px',
          }}>
            {amountEur} EUR
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
      <div style={sectionLabel}>Payment Link</div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '13px',
        fontWeight: 300,
        color: 'var(--offwhite)',
        marginBottom: '4px',
      }}>
        No payment link yet.
      </div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '11px',
        fontWeight: 300,
        color: 'var(--warmgrey)',
        marginBottom: '8px',
      }}>
        Generate one to let the client pay online.
      </div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        style={{
          border: '1px solid var(--copper)',
          color: 'var(--offwhite)',
          background: 'transparent',
          minHeight: '44px',
          padding: '0 24px',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-montserrat)',
          cursor: generating ? 'not-allowed' : 'pointer',
          borderRadius: '2px',
          opacity: generating ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!generating) {
            e.currentTarget.style.background = 'var(--copper)'
            e.currentTarget.style.color = 'var(--anthracite)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--offwhite)'
        }}
      >
        {generating ? 'Generating…' : 'Generate Payment Link'}
      </button>
      {status === 'pending' && (
        <div style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 300,
          color: 'var(--warmgrey)',
          marginTop: '8px',
        }}>
          Generating a payment link will mark this booking as Unpaid until the client pays.
        </div>
      )}
      {generateError && (
        <div style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 300,
          color: 'var(--status-danger-fg)',
          marginTop: '8px',
        }}>
          Could not generate payment link. Please try again.
        </div>
      )}
    </div>
  )
}
