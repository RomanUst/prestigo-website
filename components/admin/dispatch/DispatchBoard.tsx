'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useBookingEvents, useBookingPanel } from '../BookingPanelProvider'
import { STATUS_FAMILY, type StatusBadgeVariant } from '../StatusBadge'
import { STATUS_LABELS, type AdminBooking } from '../bookingTypes'
import { dispatchRange } from '@/lib/prague-calendar'
import { useDispatchBookings } from './useDispatchBookings'
import { UpdatedAgo } from './UpdatedAgo'
import { BoardCard, BoardCardOverlay } from './BoardCard'
import {
  BOARD_COLUMNS,
  columnDropState,
  groupByColumn,
  isTerminalColumn,
  resolveDrop,
  type BoardColumn,
} from './boardModel'

// Phase 90 plan 07 (DISP-01, DISP-02, DISP-04, DISP-05): the kanban board. One column per status in flow order, cards
// sorted by pickup instant, moved through the shared move hook, opened in the shared side panel, refreshed every 30 s.
// The board never edits a row itself: rows change only when the server accepted a move ('patched' event) or a poll
// brings fresh data. No transform, filter, will-change or contain on any wrapper here: the side panel is
// position: fixed and the admin shell must stay free of containing blocks. dnd-kit moves only the DragOverlay.

function familyOf(status: string): string {
  return STATUS_FAMILY[status as StatusBadgeVariant] ?? 'neutral'
}

function ColumnView({
  status,
  bookings,
  showDate,
  dragging,
}: {
  status: BoardColumn
  bookings: AdminBooking[]
  showDate: boolean
  /** The status of the card being dragged, or null. */
  dragging: string | null
}) {
  const family = familyOf(status)
  const collapsible = isTerminalColumn(status)
  const [expanded, setExpanded] = useState(!collapsible)
  const dropState = columnDropState(status, dragging)
  // D-10: a column the card may not move to is a disabled droppable, so a drop on it is not even a candidate.
  // A collapsed terminal rail is still a droppable when allowed: the droppable sits on the rail itself.
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: dropState === 'blocked' })
  const collapsed = collapsible && !expanded
  const label = STATUS_LABELS[status] ?? status

  const countChip = (
    <span
      data-testid={`board-count-${status}`}
      style={{
        background: `var(--status-${family}-bg)`,
        border: `1px solid var(--status-${family}-border)`,
        borderRadius: 'var(--admin-radius-sm)',
        padding: '2px 8px',
      }}
    >
      {bookings.length}
    </span>
  )

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '8px 10px',
    fontFamily: 'var(--font-montserrat)',
    fontSize: 'var(--admin-fs-label)',
    fontWeight: 'var(--admin-fw-strong)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: `var(--status-${family}-fg)`,
  }

  return (
    <section
      ref={setNodeRef}
      data-testid={`board-column-${status}`}
      data-drop={dropState}
      aria-label={`${label}, ${bookings.length}`}
      style={{
        flex: collapsed ? '0 0 52px' : '1 1 0',
        minWidth: collapsed ? '52px' : '140px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--admin-bg)',
        border: '1px solid var(--admin-border)',
        borderTop: `3px solid var(--status-${family}-border)`,
        borderRadius: 'var(--admin-radius-md)',
        // allowed targets get the accent outline (stronger while the pointer is over one), the rest fade out
        outline: dropState === 'allowed' ? (isOver ? '3px solid var(--admin-accent)' : '2px dashed var(--admin-accent-border)') : 'none',
        outlineOffset: '-2px',
        opacity: dropState === 'blocked' ? 0.45 : 1,
      }}
    >
      {collapsible ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${label}, ${bookings.length}`}
          onClick={() => setExpanded(v => !v)}
          style={{
            ...headerStyle,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            minHeight: '44px',
            ...(collapsed ? { flexDirection: 'column', justifyContent: 'flex-start', padding: '10px 4px', gap: '10px' } : {}),
          }}
        >
          {collapsed ? (
            <>
              {countChip}
              <span style={{ writingMode: 'vertical-rl' }}>{label}</span>
            </>
          ) : (
            <>
              <span>{label}</span>
              {countChip}
            </>
          )}
        </button>
      ) : (
        <header style={headerStyle}>
          <span>{label}</span>
          {countChip}
        </header>
      )}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 8px 8px', overflowY: 'auto', minHeight: '120px' }}>
          {bookings.map(b => (
            <BoardCard key={b.id} booking={b} showDate={showDate} draggable />
          ))}
        </div>
      )}
    </section>
  )
}

export function DispatchBoard({ search, tripType }: { search: string; tripType: string }) {
  const { syncRows, pausePolling, moves } = useBookingPanel()
  // D-07: the board opens on today in Prague, independent of the list's DispatchDefault horizon.
  const [range] = useState(() => dispatchRange('today'))
  // The booking being dragged. The poll is paused while it is set (D-16) so a refetch cannot reshuffle the board under the pointer.
  const [dragged, setDragged] = useState<AdminBooking | null>(null)

  const { rows, updatedAt, patchRow, refresh } = useDispatchBookings<AdminBooking>(
    { ...range, search, tripType },
    { paused: dragged !== null || pausePolling },
  )

  // Keep an open panel current after every load (the provider snapshot goes stale otherwise).
  useEffect(() => {
    syncRows(rows)
  }, [rows, syncRows])

  useBookingEvents(
    useCallback(
      e => {
        if (e.type === 'patched') patchRow(e.id, e.patch)
        else refresh()
      },
      [patchRow, refresh],
    ),
  )

  const grouped = useMemo(() => groupByColumn(rows), [rows])
  const multiDay = range.startDate !== range.endDate

  // D-09: mouse and pen need a 6 px move (so a click still opens the panel); touch needs a 250 ms hold (so scrolling works).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const onDragStart = (e: DragStartEvent) => {
    setDragged(rows.find(r => r.id === String(e.active.id)) ?? null)
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragged(null)
    const booking = rows.find(r => r.id === String(e.active.id))
    if (!booking) return
    // D-10: a drop outside any column, on the card's own column or on a column UI_TRANSITIONS does not allow does nothing.
    const target = resolveDrop(booking, e.over ? String(e.over.id) : null)
    // D-11: the move hook decides what the move means (picker, dialog or a PATCH); the card stays until the server accepted.
    if (target) moves.requestMove(booking, target, 'board')
  }

  return (
    <div data-testid="dispatch-board" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          fontFamily: 'var(--font-montserrat)',
          fontSize: 'var(--admin-fs-label)',
          color: 'var(--admin-text-muted)',
        }}
      >
        <UpdatedAgo at={updatedAt} />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', overflowX: 'auto' }}>
          {BOARD_COLUMNS.map(status => (
            <ColumnView key={status} status={status} bookings={grouped[status]} showDate={multiDay} dragging={dragged?.status ?? null} />
          ))}
        </div>
        {/* One permanently mounted overlay: dnd-kit moves only this copy, never a wrapper of the board. */}
        <DragOverlay>{dragged ? <BoardCardOverlay booking={dragged} showDate={multiDay} /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}
