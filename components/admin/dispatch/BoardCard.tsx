'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useBookingPanel } from '../BookingPanelProvider'
import { STATUS_LABELS, type AdminBooking } from '../bookingTypes'
import { STATUS_CONFLICT_STYLE } from '../statusConflict'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import { pickupLabel } from './boardModel'

// Phase 90 plan 07 (D-06, D-09): one booking on the board. The card opens the shared side panel on a click, and its
// "..." menu is the keyboard and touch path to every move the drag gesture offers. Moves are never applied here:
// requestMove(booking, to, 'board') asks the shared hook, which waits for the server.

export interface BoardCardProps {
  booking: AdminBooking
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

function CardContent({ booking, showDate, menu }: { booking: AdminBooking; showDate: boolean; menu: boolean }) {
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
    </>
  )
}

/**
 * The copy that follows the pointer inside the DragOverlay. It is presentational on purpose: a second useDraggable
 * with the same id would overwrite the original card's entry in the DnD registry.
 */
export function BoardCardOverlay({ booking, showDate = false }: { booking: AdminBooking; showDate?: boolean }) {
  return (
    <div
      data-testid="board-card-overlay"
      style={{ ...cardStyle({ selected: false, busy: false, dimmed: false }), cursor: 'grabbing', boxShadow: 'var(--admin-shadow-sheet)' }}
    >
      <CardContent booking={booking} showDate={showDate} menu={false} />
    </div>
  )
}

export function BoardCard({ booking, draggable, showDate = false }: BoardCardProps) {
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
      <CardContent booking={booking} showDate={showDate} menu />
      {conflict && !isSelected && (
        <p role="alert" style={{ ...STATUS_CONFLICT_STYLE, margin: 0 }}>
          {conflict}
        </p>
      )}
    </div>
  )
}
