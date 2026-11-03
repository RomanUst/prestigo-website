'use client'

import { useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

const NOTE_MAX = 2000
const NOTE_ERROR = 'Could not send the note. Try again.'

type NoteState = 'idle' | 'sending' | 'saved' | 'error'

export interface TripDetailsProps {
  token: string
  bookingReference: string
  driverName: string | null
  vehicleLabel: string
  /** Free text from the driver profile; usually holds the plate. */
  vehicleInfo: string | null
  flight: string | null
  clientNotes: string | null
  /** The draft lives in the screen so collapsing the sheet or a router.refresh() never loses it. */
  draft: string
  onDraftChange: (value: string) => void
}

const captionStyle: CSSProperties = {
  fontSize: 'var(--driver-fs-label)',
  fontWeight: 500,
  lineHeight: 1.4,
  color: 'var(--admin-text-muted)',
}

const valueStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--driver-fs-body)',
  fontWeight: 400,
  lineHeight: 1.5,
  color: 'var(--admin-text)',
  overflowWrap: 'anywhere',
}

function DetailRow({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={captionStyle}>{caption}</span>
      {children}
    </div>
  )
}

/**
 * Expanded sheet content (UI-SPEC "TripSheet content", amendment C): the booking reference, the
 * driver, the vehicle class and vehicle (plate), flight and client
 * notes when present, and the driver note for the office (D-21). The note is posted on its own as
 * { note }; it never moves a step.
 */
export default function TripDetails({
  token,
  bookingReference,
  driverName,
  vehicleLabel,
  vehicleInfo,
  flight,
  clientNotes,
  draft,
  onDraftChange,
}: TripDetailsProps) {
  const router = useRouter()
  const noteId = useId()
  const [state, setState] = useState<NoteState>('idle')

  const sending = state === 'sending'
  const canSend = draft.trim() !== '' && !sending

  function edit(value: string) {
    onDraftChange(value)
    // "Note sent" clears on the next edit; an error stays until the next attempt.
    if (state === 'saved') setState('idle')
  }

  async function send() {
    if (!canSend) return
    setState('sending')
    try {
      const res = await fetch(`/api/driver/trip/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: draft.trim() }),
      })
      let body: { ok?: boolean; error?: string } | null = null
      try {
        body = (await res.json()) as { ok?: boolean; error?: string }
      } catch {
        body = null
      }
      if (res.status === 200 && body?.ok) {
        setState('saved')
        return
      }
      setState('error')
      // The link died while the screen was open: the refreshed page renders the ended view.
      if (res.status === 400 && body?.error === 'invalid_token') router.refresh()
    } catch {
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DetailRow caption="Booking">
        <p style={{ ...valueStyle, fontVariantNumeric: 'tabular-nums' }}>{bookingReference}</p>
      </DetailRow>
      {driverName ? (
        <DetailRow caption="Driver">
          <p style={valueStyle}>{driverName}</p>
        </DetailRow>
      ) : null}
      <DetailRow caption="Vehicle class">
        <p style={valueStyle}>{vehicleLabel}</p>
      </DetailRow>
      {vehicleInfo ? (
        <DetailRow caption="Vehicle">
          <p style={valueStyle}>{vehicleInfo}</p>
        </DetailRow>
      ) : null}
      {flight ? (
        <DetailRow caption="Flight">
          <p style={valueStyle}>{flight}</p>
        </DetailRow>
      ) : null}
      {clientNotes ? (
        <DetailRow caption="Notes from the client">
          <p style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{clientNotes}</p>
        </DetailRow>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={noteId} style={captionStyle}>
          Note for the office
        </label>
        <textarea
          id={noteId}
          data-driver-focus=""
          rows={3}
          maxLength={NOTE_MAX}
          value={draft}
          disabled={sending}
          aria-busy={sending}
          placeholder="Optional, for example: passenger running late"
          onChange={(e) => edit(e.target.value)}
          style={{
            boxSizing: 'border-box',
            width: '100%',
            padding: 16,
            background: 'var(--admin-input-bg)',
            border: '1px solid var(--admin-border-strong)',
            borderRadius: 'var(--admin-radius-md)',
            color: 'var(--admin-text)',
            // 16px so iOS does not zoom into the field.
            fontFamily: 'inherit',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
            resize: 'vertical',
          }}
        />
        <button
          type="button"
          data-driver-focus=""
          disabled={!canSend}
          onClick={send}
          style={{
            boxSizing: 'border-box',
            width: '100%',
            minHeight: 48,
            padding: '0 16px',
            background: 'transparent',
            border: '1px solid var(--admin-border-strong)',
            borderRadius: 'var(--admin-radius-md)',
            color: 'var(--admin-text)',
            fontFamily: 'inherit',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 500,
            lineHeight: 1.5,
            cursor: canSend ? 'pointer' : 'default',
            opacity: canSend ? 1 : 0.6,
          }}
        >
          {sending ? 'Sending…' : 'Send note'}
        </button>
        {state === 'saved' ? (
          <p
            role="status"
            style={{
              margin: 0,
              color: 'var(--status-ok-fg)',
              fontSize: 'var(--driver-fs-body)',
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          >
            Note sent
          </p>
        ) : null}
        {state === 'error' ? (
          <p
            role="alert"
            style={{
              margin: 0,
              color: 'var(--status-danger-fg)',
              fontSize: 'var(--driver-fs-body)',
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          >
            {NOTE_ERROR}
          </p>
        ) : null}
      </div>
    </div>
  )
}
