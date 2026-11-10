'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useBookingPanel } from '../BookingPanelProvider'
import { STATUS_LABELS, showsPaymentBadge, vehicleClassMap, type AdminBooking } from '../bookingTypes'
import { STATUS_CONFLICT_STYLE } from '../statusConflict'
import { BadgeShell } from '../StatusBadge'
import { PaymentStateBadge } from '../PaymentStateBadge'
import { FeeCaseBadge, CashChip, hasPendingFeeCase } from '../FeeCaseBadge'
import { NoShowChip, hasOpenNoShowRequest } from '../NoShowBanner'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import { collapseFlags, pickupLabel } from './boardModel'

// Phase 90 plan 07 (D-06, D-09): one booking on the board. The card opens the shared side panel on a click, and its
// "..." menu is the keyboard and touch path to every move the drag gesture offers. Moves are never applied here:
// requestMove(booking, to, 'board') asks the shared hook, which waits for the server.

export interface BoardCardProps {
  booking: AdminBooking
  /** The assigned driver's name when known; the card says "Not assigned" or "Assigned driver" otherwise. */
  driverName: string | null
  /** Whether a pointer or touch gesture may drag the card (off on a phone: the menu moves cards there). */
  draggable: boolean
  /** Show the Prague day before the time (a multi-day range). */
  showDate?: boolean
}

const monoFont = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

function CardMenu({ booking }: { booking: AdminBooking }) {
  const { openBooking, moves } = useBookingPanel()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Only the targets UI_TRANSITIONS offers for this status, in its order; terminal statuses get "Open" only.
  const targets = UI_TRANSITIONS[booking.status] ?? []

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) {
      close(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      // The menu is position: fixed so a column's own scrolling cannot clip it; flip up near the bottom edge.
      const flip = rect.bottom + 220 > window.innerHeight
      setPos(
        flip
          ? { bottom: window.innerHeight - rect.top + 4, right: Math.max(8, window.innerWidth - rect.right) }
          : { top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) },
      )
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close(false)
    }
    // A scrolled column would leave a fixed menu hanging in the wrong place.
    const onScroll = () => close(false)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      close(true)
      return
    }
    if (e.key === 'Tab') {
      close(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
      const at = items.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
      items[next]?.focus()
    }
  }

  const choose = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation()
    setOpen(false)
    action()
  }

  const itemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    color: 'var(--admin-text)',
    fontFamily: 'var(--font-montserrat)',
    fontSize: 'var(--admin-fs-body)',
    padding: '10px 14px',
    minHeight: '44px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    // Stop pointer events here so a press on the menu never starts a drag of the card underneath.
    <span
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      style={{ flexShrink: 0 }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${booking.booking_reference}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        style={{
          background: 'transparent',
          border: '1px solid var(--admin-border)',
          borderRadius: 'var(--admin-radius-sm)',
          color: 'var(--admin-text-muted)',
          cursor: 'pointer',
          minWidth: '44px',
          minHeight: '44px',
          fontSize: '18px',
          lineHeight: 1,
        }}
      >
        …
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${booking.booking_reference}`}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'fixed',
            ...pos,
            zIndex: 90,
            minWidth: '200px',
            background: 'var(--admin-surface)',
            border: '1px solid var(--admin-border-strong)',
            borderRadius: 'var(--admin-radius-md)',
            boxShadow: 'var(--admin-shadow-sheet)',
            padding: '4px 0',
          }}
        >
          <button type="button" role="menuitem" style={itemStyle} onClick={e => choose(e, () => openBooking(booking, triggerRef.current))}>
            Open
          </button>
          {targets.map(to => (
            <button
              key={to}
              type="button"
              role="menuitem"
              style={itemStyle}
              onClick={e => choose(e, () => moves.requestMove(booking, to, 'board'))}
            >
              Move to {STATUS_LABELS[to] ?? to}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

function cardStyle(opts: { selected: boolean; busy: boolean; dimmed: boolean }): React.CSSProperties {
  return {
    background: opts.selected ? 'var(--admin-accent-tint)' : 'var(--admin-surface)',
    border: `1px solid ${opts.selected ? 'var(--admin-accent-border)' : 'var(--admin-border)'}`,
    borderRadius: 'var(--admin-radius-md)',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    opacity: opts.dimmed ? 0.4 : opts.busy ? 0.6 : 1,
    minWidth: 0,
    fontFamily: 'var(--font-montserrat)',
    fontSize: 'var(--admin-fs-body)',
    color: 'var(--admin-text)',
  }
}

const czkFormat = new Intl.NumberFormat('cs-CZ')

export interface CardFlag {
  key: string
  label: string
  node: React.ReactNode
}

/** D-06 attention flags in their fixed order; the Fee decision badge is never shown for a GNet (partner) booking. */
export function flagsOf(b: AdminBooking): CardFlag[] {
  const flags: CardFlag[] = []
  if (hasOpenNoShowRequest(b)) flags.push({ key: 'no-show', label: 'No-show requested', node: <NoShowChip /> })
  if (hasPendingFeeCase(b)) flags.push({ key: 'fee', label: 'Fee decision', node: <FeeCaseBadge /> })
  if (b.payment_mode === 'cash_guarantee' && b.payment_state !== 'cash_settled') {
    flags.push({ key: 'cash', label: 'Cash', node: <CashChip /> })
  }
  if (b.booking_source === 'gnet') {
    flags.push({
      key: 'gnet',
      label: 'GNet',
      node: (
        <span data-testid={`board-gnet-${b.id}`}>
          <BadgeShell family="info" label="GNet" />
        </span>
      ),
    })
  }
  return flags
}

/** The flags in a wrapping row; more than three collapse into a "+N" chip whose title names the hidden ones. */
export function FlagRow({ flags }: { flags: CardFlag[] }) {
  if (flags.length === 0) return null
  const { shown, hidden } = collapseFlags(flags, 3)
  return (
    <div data-testid="board-flags" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
      {shown.map(f => (
        <React.Fragment key={f.key}>{f.node}</React.Fragment>
      ))}
      {hidden.length > 0 && (
        <span
          data-testid="board-flag-more"
          title={hidden.map(f => f.label).join(', ')}
          style={{
            padding: '4px 8px',
            borderRadius: 'var(--admin-radius-sm)',
            border: '1px solid var(--status-neutral-border)',
            background: 'var(--status-neutral-bg)',
            color: 'var(--status-neutral-fg)',
            fontSize: 'var(--admin-fs-label)',
            fontWeight: 'var(--admin-fw-strong)',
          }}
        >
          +{hidden.length}
        </span>
      )}
    </div>
  )
}

function CardContent({
  booking,
  driverName,
  showDate,
  menu,
}: {
  booking: AdminBooking
  driverName: string | null
  showDate: boolean
  menu: boolean
}) {
  const muted: React.CSSProperties = { color: 'var(--admin-text-muted)', fontSize: 'var(--admin-fs-label)' }
  const flags = flagsOf(booking)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 'var(--admin-fw-strong)' }}>{pickupLabel(booking, showDate)}</div>
          <div style={{ fontFamily: monoFont, fontSize: 'var(--admin-fs-label)', color: 'var(--admin-text-muted)', overflowWrap: 'anywhere' }}>
            {booking.booking_reference}
          </div>
        </div>
        {menu && <CardMenu booking={booking} />}
      </div>
      <div style={{ overflowWrap: 'anywhere' }}>
        {booking.origin_address} to {booking.destination_address}
      </div>
      <div data-testid="board-driver-line" style={{ ...muted, overflowWrap: 'anywhere' }}>
        {/* Pitfall 8: the name comes from driver_id; a driver id the list does not know still reads as assigned. */}
        {booking.driver_id ? (driverName ?? 'Assigned driver') : 'Not assigned'}
        {' · '}
        {vehicleClassMap[booking.vehicle_class] ?? booking.vehicle_class}
      </div>
      {showsPaymentBadge(booking) && (
        <div>
          <PaymentStateBadge state={booking.payment_state ?? 'none'} />
        </div>
      )}
      <FlagRow flags={flags} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', ...muted }}>
        <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
          {booking.client_first_name} {booking.client_last_name}
        </span>
        <span data-testid="board-amount" style={{ whiteSpace: 'nowrap', color: 'var(--admin-text)' }}>
          {czkFormat.format(booking.amount_czk)} CZK
        </span>
      </div>
    </>
  )
}

/**
 * The copy that follows the pointer inside the DragOverlay. It is presentational on purpose: a second useDraggable
 * with the same id would overwrite the original card's entry in the DnD registry.
 */
export function BoardCardOverlay({
  booking,
  driverName,
  showDate = false,
}: {
  booking: AdminBooking
  driverName: string | null
  showDate?: boolean
}) {
  return (
    <div
      data-testid="board-card-overlay"
      style={{ ...cardStyle({ selected: false, busy: false, dimmed: false }), cursor: 'grabbing', boxShadow: 'var(--admin-shadow-sheet)' }}
    >
      <CardContent booking={booking} driverName={driverName} showDate={showDate} menu={false} />
    </div>
  )
}

export function BoardCard({ booking, driverName, draggable, showDate = false }: BoardCardProps) {
  const { openBooking, selected, moves } = useBookingPanel()
  // D-09: the listeners sit on the card body; PointerSensor distance 6 means a plain click still reaches onClick.
  // No keyboard sensor on purpose: the "..." menu is the keyboard path.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: booking.id, disabled: !draggable })
  const isSelected = selected?.id === booking.id
  const conflict = moves.conflictFor(booking.id)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      data-testid="board-card"
      data-reference={booking.booking_reference}
      tabIndex={0}
      aria-current={isSelected ? 'true' : undefined}
      aria-busy={moves.isUpdating(booking.id) || undefined}
      onClick={e => openBooking(booking, e.currentTarget)}
      onKeyDown={e => {
        // Enter or Space on the card itself, not on the menu button inside it.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openBooking(booking, e.currentTarget)
        }
      }}
      style={cardStyle({ selected: isSelected, busy: moves.isUpdating(booking.id), dimmed: isDragging })}
    >
      <CardContent booking={booking} driverName={driverName} showDate={showDate} menu />
      {conflict && !isSelected && (
        <p role="alert" style={{ ...STATUS_CONFLICT_STYLE, margin: 0 }}>
          {conflict}
        </p>
      )}
    </div>
  )
}
