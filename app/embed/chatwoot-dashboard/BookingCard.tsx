'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PAYMENT_STATE_LABELS,
  STATUS_LABELS,
  TRIP_PROGRESS_LABELS,
  VEHICLE_CLASS_LABELS,
  type PanelBooking,
} from '@/lib/panel-dto'
import { isSafePaymentLinkUrl } from '@/lib/panel-links'
import CopyLinkButton from './CopyLinkButton'

const PRAGUE_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const PRAGUE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const EUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

/** An amount from API data in euro, never a typed literal. */
export function formatEur(amount: number): string {
  return EUR.format(amount)
}

/** "Thu 12 Nov 2026, 14:30" in Prague time; the wall-clock text when the instant is unknown. */
export function formatPickup(b: Pick<PanelBooking, 'pickupMs' | 'pickupDate' | 'pickupTime'>): string {
  if (b.pickupMs === null) return `${b.pickupDate} ${b.pickupTime}`.trim()
  const parts: Record<string, string> = {}
  for (const part of PRAGUE_DATE.formatToParts(new Date(b.pickupMs))) parts[part.type] = part.value
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`
}

/** "14:30" in Prague time for the footer. */
export function formatPragueTime(date: Date): string {
  return PRAGUE_TIME.format(date)
}

/** Own-property lookup so a raw key such as "constructor" can never hit Object.prototype. */
function labelFor(map: Record<string, string>, key: string): string | null {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
}

const STATUS_HUES = new Set(['unpaid', 'pending', 'confirmed', 'assigned', 'en_route', 'on_location', 'completed', 'cancelled'])

// Trip progress reuses the status hues (UI-SPEC): arrived = on_location, on_board = assigned, no_show = cancelled.
const PROGRESS_HUES: Record<string, string> = {
  en_route: 'en_route',
  arrived: 'on_location',
  on_board: 'assigned',
  completed: 'completed',
  no_show: 'cancelled',
}

// Payment badge hues (UI-SPEC): paid = completed, awaiting payment = unpaid, quote = confirmed.
const PAYMENT_HUES = { paid: 'completed', awaiting_payment: 'unpaid', quote: 'confirmed' } as const

function Badge({ hue, children }: { hue: string | null; children: string }) {
  return <span className={`badge badge-${hue ?? 'neutral'}`}>{children}</span>
}

interface BookingCardProps {
  booking: PanelBooking
  /** The nearest upcoming trip gets the accent rule. */
  isNext: boolean
  /** The panel's single live region for the "Payment link copied" announcement. */
  onAnnounce?: (message: string) => void
}

export default function BookingCard({ booking, isNext, onAnnounce }: BookingCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const notesRef = useRef<HTMLParagraphElement>(null)
  const notes = booking.notes

  // Detect whether the clamped note is cut off. Once a note is known to overflow it keeps its toggle,
  // so expanding (which removes the clamp and the overflow) does not make the toggle disappear.
  useLayoutEffect(() => {
    const el = notesRef.current
    if (el && el.scrollHeight > el.clientHeight + 1) setOverflowing(true)
  }, [notes])
  useEffect(() => {
    const onResize = () => {
      const el = notesRef.current
      if (el && el.scrollHeight > el.clientHeight + 1) setOverflowing(true)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const hourly = booking.hours !== null && booking.destination === null
  const statusKnown = labelFor(STATUS_LABELS, booking.status)
  const statusHue = statusKnown && STATUS_HUES.has(booking.status) ? booking.status : null
  const vehicle = labelFor(VEHICLE_CLASS_LABELS, booking.vehicleClass) ?? booking.vehicleClass
  const progressLabel = booking.tripProgress ? (labelFor(TRIP_PROGRESS_LABELS, booking.tripProgress) ?? booking.tripProgress) : null
  const progressHue = booking.tripProgress ? (labelFor(PROGRESS_HUES, booking.tripProgress) ?? null) : null
  const paymentLabel = booking.paymentState === 'cancelled' ? null : PAYMENT_STATE_LABELS[booking.paymentState]
  const showCopy = booking.paymentState === 'awaiting_payment' && isSafePaymentLinkUrl(booking.paymentLinkUrl)
  const adminHref = booking.adminHref && booking.adminHref.startsWith('/admin/') ? booking.adminHref : null

  const meta = [
    vehicle,
    `${booking.passengers} pax`,
    `${booking.luggage} bags`,
    ...(booking.amountEur !== null ? [formatEur(booking.amountEur)] : []),
  ].join(' · ')

  const clamped = !expanded

  return (
    <article className={isNext ? 'card card-next' : 'card'}>
      <h3 className="card-title">
        {formatPickup(booking)}
        {booking.isReturnLeg ? <Badge hue={null}>Return</Badge> : null}
      </h3>

      <p className="route">
        <span>{hourly ? `${booking.origin} - ${booking.hours} h` : booking.origin}</span>
        {booking.destination ? <span className="route-to">{`to ${booking.destination}`}</span> : null}
      </p>

      <p className="badge-row">
        <Badge hue={statusHue}>{statusKnown ?? booking.status}</Badge>
        {paymentLabel ? <Badge hue={PAYMENT_HUES[booking.paymentState as keyof typeof PAYMENT_HUES]}>{paymentLabel}</Badge> : null}
        {booking.reference ? <span className="meta reference">{booking.reference}</span> : null}
      </p>

      <p className="meta">{meta}</p>

      {booking.driverName ? (
        <p className="driver-row">
          <span>{booking.driverName}</span>
          {progressLabel ? <Badge hue={progressHue}>{progressLabel}</Badge> : null}
        </p>
      ) : null}

      {booking.flightNumber ? <p className="meta">{`Flight ${booking.flightNumber}`}</p> : null}

      {notes ? (
        <div className="notes">
          <span className="meta">Customer notes</span>
          <p ref={notesRef} className={clamped ? 'notes-text notes-clamped' : 'notes-text'}>
            {notes}
          </p>
          {overflowing ? (
            <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show less' : 'Show full note'}
            </button>
          ) : null}
        </div>
      ) : null}

      {adminHref || showCopy ? (
        <div className="actions">
          {adminHref ? (
            <a className="link" href={adminHref} target="_blank" rel="noopener noreferrer">
              Open in admin
            </a>
          ) : null}
          {showCopy ? <CopyLinkButton url={booking.paymentLinkUrl} onAnnounce={onAnnounce} /> : null}
        </div>
      ) : null}
    </article>
  )
}
