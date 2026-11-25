'use client'

// Fill the TBC fields of a sent quote (migration 099, owner request 2026-11-24).
//
// A quote may be sent with fields still to be confirmed. This panel lists, per trip, only the fields that are still
// empty on the version the client has, and saves what the operator filled with POST /api/admin/quotes/[id]/details. The
// server writes only empty fields (nothing the client was shown changes). When the quote was paid with its bookings
// waiting and every trip is now complete, the server makes the bookings and emails the client the booking references.

import { useState, type CSSProperties } from 'react'
import AddressInput from '@/components/booking/AddressInput'
import type { PlaceResult } from '@/types/booking'
import { errorStyle, labelStyle } from '@/components/admin/adminFieldStyles'
import { outlineButtonStyle } from '@/components/admin/paymentShared'
import { draftFromDetail, lineTbcFields, type QuotePlace } from '@/components/admin/quotes/quoteDraft'
import { MISSING_FIELD_LABEL } from '@/lib/quotes/completeness'
import type { QuoteDetail } from '@/lib/quotes/store'

type Fill = {
  pickup_date?: string
  pickup_time?: string
  origin?: QuotePlace
  destination?: QuotePlace
  hours?: number
  return_date?: string
  title?: string
}

const cardStyle: CSSProperties = {
  backgroundColor: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const mutedStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  color: 'var(--admin-text-muted)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: '44px',
  padding: '8px 12px',
  backgroundColor: 'var(--admin-bg)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-md)',
  color: 'var(--admin-text)',
  fontFamily: 'var(--font-montserrat)',
  colorScheme: 'dark',
}

const HOURS = Array.from({ length: 24 }, (_, i) => i + 1)

const LIVE_STATUSES = new Set(['sent', 'viewed', 'accepted', 'paid'])

/** The trips of the client's version that still have TBC fields (the price is never TBC on a sent version). */
export function tbcTrips(detail: QuoteDetail) {
  const draft = draftFromDetail(detail)
  return draft.lines
    .map((line, i) => ({
      position: detail.lines[i]?.position ?? i + 1,
      tripType: line.trip_type,
      missing: lineTbcFields(line, draft.currency).filter((f) => f !== 'amount'),
    }))
    .filter((t) => t.missing.length > 0)
}

export function QuoteDetailsPanel({ detail, onSaved }: { detail: QuoteDetail; onSaved: () => Promise<unknown> | void }) {
  const [fills, setFills] = useState<Record<number, Fill>>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const open =
    detail.version.frozen_at !== null &&
    LIVE_STATUSES.has(detail.quote.status) &&
    !detail.quote.cancelled_at &&
    detail.effective_status !== 'voided' &&
    detail.effective_status !== 'cancelled'
  const trips = open ? tbcTrips(detail) : []
  if (trips.length === 0) return null

  const pending = detail.quote.bookings_pending === true
  const set = (position: number, patch: Fill) => setFills((all) => ({ ...all, [position]: { ...all[position], ...patch } }))

  async function save() {
    const lines = Object.entries(fills)
      .map(([position, f]) => ({ position: Number(position), ...f }))
      .filter((l) => Object.keys(l).length > 1)
    if (lines.length === 0) {
      setStatus({ kind: 'error', text: 'Fill in at least one field.' })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/admin/quotes/${detail.quote.id}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      const body = (await res.json().catch(() => null)) as { complete?: boolean; bookings?: { outcome?: string } | null; code?: string } | null
      if (!res.ok) {
        setStatus({
          kind: 'error',
          text:
            res.status === 400
              ? 'Some fields are not valid. Check them and try again.'
              : res.status === 422
                ? 'This quote can no longer take details (it was cancelled, voided or revised). Reload the page.'
                : 'Could not save the details. Try again.',
        })
        return
      }
      const outcome = body?.bookings?.outcome
      setFills({})
      setStatus({
        kind: 'ok',
        text:
          outcome === 'created' || outcome === 'replayed'
            ? 'Saved. Every trip is complete: the bookings are made and the client got the booking references.'
            : body?.complete
              ? 'Saved. Every trip is complete.'
              : 'Saved. The client sees the new details on the quote page.',
      })
      await onSaved()
    } catch {
      setStatus({ kind: 'error', text: 'Could not save the details. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label="TBC details" data-testid="quote-details-panel" style={cardStyle}>
      <div>
        <div style={{ ...labelStyle, color: 'var(--admin-accent-text)' }}>TBC details</div>
        <p style={{ ...mutedStyle, marginTop: '4px' }}>
          {pending
            ? 'The client has paid. The bookings are made as soon as every TBC field below is filled in.'
            : 'The client sees these fields as to be confirmed. Fill them in when you know them; the bookings wait for them.'}
        </p>
      </div>
      {trips.map((trip) => {
        const f = fills[trip.position] ?? {}
        const id = (name: string) => `tbc-${trip.position}-${name}`
        return (
          <div key={trip.position} data-testid={`quote-details-trip-${trip.position}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={labelStyle}>{`Trip ${trip.position}: ${trip.missing.map((m) => MISSING_FIELD_LABEL[m]).join(', ')}`}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              {trip.missing.includes('pickup_date') && (
                <div>
                  <label htmlFor={id('date')} style={labelStyle}>Pickup date</label>
                  <input id={id('date')} type="date" value={f.pickup_date ?? ''} onChange={(e) => set(trip.position, { pickup_date: e.target.value || undefined })} style={inputStyle} />
                </div>
              )}
              {trip.missing.includes('pickup_time') && (
                <div>
                  <label htmlFor={id('time')} style={labelStyle}>Pickup time</label>
                  <input id={id('time')} type="time" value={f.pickup_time ?? ''} onChange={(e) => set(trip.position, { pickup_time: e.target.value || undefined })} style={inputStyle} />
                </div>
              )}
              {trip.missing.includes('hours') && (
                <div>
                  <label htmlFor={id('hours')} style={labelStyle}>Hours</label>
                  <select id={id('hours')} value={f.hours ?? ''} onChange={(e) => set(trip.position, { hours: e.target.value ? Number(e.target.value) : undefined })} style={inputStyle}>
                    <option value="">TBC</option>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              )}
              {trip.missing.includes('return_date') && (
                <div>
                  <label htmlFor={id('return')} style={labelStyle}>Return date</label>
                  <input id={id('return')} type="date" value={f.return_date ?? ''} onChange={(e) => set(trip.position, { return_date: e.target.value || undefined })} style={inputStyle} />
                </div>
              )}
              {trip.missing.includes('title') && (
                <div>
                  <label htmlFor={id('title')} style={labelStyle}>Tour title</label>
                  <input id={id('title')} type="text" maxLength={200} value={f.title ?? ''} onChange={(e) => set(trip.position, { title: e.target.value.replace(/[\r\n]+/g, ' ') || undefined })} style={inputStyle} />
                </div>
              )}
            </div>
            {trip.missing.includes('origin') && (
              <AddressInput
                label="Pickup address"
                placeholder="Start typing an address…"
                value={f.origin ? ({ address: f.origin.address, placeId: '', lat: f.origin.lat, lng: f.origin.lng } as PlaceResult) : null}
                onSelect={(p) => set(trip.position, { origin: { address: p.address, lat: p.lat, lng: p.lng } })}
                onClear={() => set(trip.position, { origin: undefined })}
                ariaLabel={`Trip ${trip.position} pickup address`}
                neverDisabled
              />
            )}
            {trip.missing.includes('destination') && (
              <AddressInput
                label="Destination address"
                placeholder="Start typing an address…"
                value={f.destination ? ({ address: f.destination.address, placeId: '', lat: f.destination.lat, lng: f.destination.lng } as PlaceResult) : null}
                onSelect={(p) => set(trip.position, { destination: { address: p.address, lat: p.lat, lng: p.lng } })}
                onClear={() => set(trip.position, { destination: undefined })}
                ariaLabel={`Trip ${trip.position} destination address`}
                neverDisabled
              />
            )}
          </div>
        )
      })}
      {status && (
        <p role={status.kind === 'error' ? 'alert' : 'status'} style={status.kind === 'error' ? { ...errorStyle, margin: 0 } : { ...mutedStyle, color: 'var(--status-ok-fg)', margin: 0 }}>
          {status.text}
        </p>
      )}
      <div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ ...outlineButtonStyle, background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', border: 'none', opacity: saving ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </section>
  )
}
