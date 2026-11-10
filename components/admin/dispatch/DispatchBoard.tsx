'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useBookingEvents, useBookingPanel } from '../BookingPanelProvider'
import { STATUS_FAMILY, type StatusBadgeVariant } from '../StatusBadge'
import { STATUS_LABELS, type AdminBooking } from '../bookingTypes'
import { dispatchRange } from '@/lib/prague-calendar'
import { useDispatchBookings } from './useDispatchBookings'
import { UpdatedAgo } from './UpdatedAgo'
import { BoardCard } from './BoardCard'
import { BOARD_COLUMNS, groupByColumn, type BoardColumn } from './boardModel'

// Phase 90 plan 07 (DISP-01, DISP-02, DISP-04, DISP-05): the kanban board. One column per status in flow order, cards
// sorted by pickup instant, moved through the shared move hook, opened in the shared side panel, refreshed every 30 s.
// The board never edits a row itself: rows change only when the server accepted a move ('patched' event) or a poll
// brings fresh data.

function familyOf(status: string): string {
  return STATUS_FAMILY[status as StatusBadgeVariant] ?? 'neutral'
}

function ColumnView({
  status,
  bookings,
  showDate,
}: {
  status: BoardColumn
  bookings: AdminBooking[]
  showDate: boolean
}) {
  const family = familyOf(status)
  return (
    <section
      data-testid={`board-column-${status}`}
      aria-label={`${STATUS_LABELS[status] ?? status}, ${bookings.length}`}
      style={{
        flex: '1 1 0',
        minWidth: '140px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--admin-bg)',
        border: '1px solid var(--admin-border)',
        borderTop: `3px solid var(--status-${family}-border)`,
        borderRadius: 'var(--admin-radius-md)',
      }}
    >
      <header
        style={{
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
        }}
      >
        <span>{STATUS_LABELS[status] ?? status}</span>
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
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 8px 8px', overflowY: 'auto', minHeight: '120px' }}>
        {bookings.map(b => (
          <BoardCard key={b.id} booking={b} showDate={showDate} />
        ))}
      </div>
    </section>
  )
}

export function DispatchBoard({ search, tripType }: { search: string; tripType: string }) {
  const { syncRows, pausePolling } = useBookingPanel()
  // D-07: the board opens on today in Prague, independent of the list's DispatchDefault horizon.
  const [range] = useState(() => dispatchRange('today'))

  const { rows, updatedAt, patchRow, refresh } = useDispatchBookings<AdminBooking>(
    { ...range, search, tripType },
    { paused: pausePolling },
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
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', overflowX: 'auto' }}>
        {BOARD_COLUMNS.map(status => (
          <ColumnView key={status} status={status} bookings={grouped[status]} showDate={multiDay} />
        ))}
      </div>
    </div>
  )
}
