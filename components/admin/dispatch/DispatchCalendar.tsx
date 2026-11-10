'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useBookingPanel } from '@/components/admin/BookingPanelProvider'
import { STATUS_FAMILY, type StatusBadgeVariant } from '@/components/admin/StatusBadge'
import type { AdminBooking } from '@/components/admin/bookingTypes'
import { BOOKING_STATUS_LABELS, isBookingStatus } from '@/lib/booking-status'
import { MIN_BLOCK_MIN, calendarWindow, monthGrid, type CalendarView, type Placed } from '@/lib/prague-calendar'
import { getPragueTodayISO, shiftIsoDate } from '@/lib/prague-date'
import { serializeCalendarViewCookie, type AdminCalendarView } from '@/lib/admin-shell-prefs'
import { useDispatchBookings } from './useDispatchBookings'
import {
  formatMinute,
  itemsByDay,
  monthCells,
  shiftIsoMonth,
  toCalendarItems,
  type CalendarItem,
} from './calendarModel'

// Phase 90 plan 08 (DISP-03): the dispatch calendar. Own grid, no calendar library (RESEARCH Alternatives).
// Every day, minute and week comes from lib/prague-calendar.ts and calendarModel.ts (Prague time), never from a
// local Date getter, so a booking around midnight is on the right Prague day in any browser timezone.
// Do not put a transform, filter, will-change or contain on a wrapper around this grid: the side panel is
// position: fixed and those properties would make it relative to the wrapper (RESEARCH Pitfall 6).

/** Pixels per minute on the day/week axis: a 30-minute minimum block is 37.5 px, enough for two text lines. */
const PX_PER_MIN = 1.25
const HOUR_PX = 60 * PX_PER_MIN
const AXIS_WIDTH_PX = 48
/** The grid opens scrolled to this hour, where the operator's day starts. */
const INITIAL_SCROLL_HOUR = 6
/** Month cells show this many bookings, the rest sit behind "+N". */
const MONTH_ITEMS_PER_DAY = 3

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const VIEW_OPTIONS: { value: AdminCalendarView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

/** Monday-first weekday index (0 = Monday) of a calendar date. */
function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7
}

function dayLabel(iso: string): string {
  return `${WEEKDAYS[weekdayIndex(iso)]} ${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`
}

function rangeTitle(view: CalendarView, anchor: string, days: string[]): string {
  if (view === 'month') return `${MONTHS_LONG[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`
  if (view === 'day') return `${dayLabel(anchor)} ${anchor.slice(0, 4)}`
  return `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])} ${days[days.length - 1].slice(0, 4)}`
}

function statusFamily(status: string): string {
  return STATUS_FAMILY[status as StatusBadgeVariant] ?? 'neutral'
}

function statusLabel(status: string): string {
  return isBookingStatus(status) ? BOOKING_STATUS_LABELS[status] : status
}

function routeTitle(b: AdminBooking): string {
  return [b.origin_address, b.destination_address].filter(Boolean).join(' → ')
}

/** The days a day or week view draws, from the fetch window. */
function daysOf(view: CalendarView, anchor: string): string[] {
  const { startDate } = calendarWindow(view, anchor)
  const count = view === 'day' ? 1 : 7
  return Array.from({ length: count }, (_, i) => shiftIsoDate(startDate, i))
}

/** A blocked cookie write only loses persistence (same rule as AdminShell). */
function rememberCalendarView(view: AdminCalendarView) {
  try {
    document.cookie = serializeCalendarViewCookie(view, location.protocol === 'https:')
  } catch {
    // persistence only: no error UI
  }
}

interface DispatchCalendarProps {
  search: string
  tripType: string
  initialView: AdminCalendarView
}

export function DispatchCalendar({ search, tripType, initialView }: DispatchCalendarProps) {
  const { openBooking, syncRows, pausePolling } = useBookingPanel()
  const [view, setView] = useState<CalendarView>(initialView)
  const [anchor, setAnchor] = useState<string>(() => getPragueTodayISO())
  const [showAll] = useState(false)

  // The window, and therefore the fetch, depends only on the view and the anchor date.
  const fetchWindow = useMemo(() => calendarWindow(view, anchor), [view, anchor])
  const { rows } = useDispatchBookings<AdminBooking>(
    { startDate: fetchWindow.startDate, endDate: fetchWindow.endDate, search, tripType },
    { paused: pausePolling },
  )

  // Keep an open panel current after every load (the provider's snapshot goes stale otherwise).
  useEffect(() => {
    syncRows(rows)
  }, [rows, syncRows])

  const items = useMemo(() => toCalendarItems(rows, { showAll }), [rows, showAll])
  const byDay = useMemo(() => itemsByDay(items), [items])
  const days = useMemo(() => daysOf(view, anchor), [view, anchor])
  const weeks = useMemo(() => (view === 'month' ? monthGrid(anchor).weeks : []), [view, anchor])
  const cells = useMemo(
    () => monthCells(items, weeks.flat(), MONTH_ITEMS_PER_DAY),
    [items, weeks],
  )
  const today = getPragueTodayISO()

  const switchView = useCallback((next: AdminCalendarView) => {
    setView(next)
    rememberCalendarView(next)
  }, [])

  const step = useCallback(
    (direction: 1 | -1) => {
      setAnchor(prev =>
        view === 'month' ? shiftIsoMonth(prev, direction) : shiftIsoDate(prev, direction * (view === 'week' ? 7 : 1)),
      )
    },
    [view],
  )

  const openFromGrid = useCallback((row: AdminBooking, opener: HTMLElement) => openBooking(row, opener), [openBooking])

  // "+N" in the month view: drill into that day. Not remembered as the operator's preferred view.
  const drillIntoDay = useCallback((iso: string) => {
    setAnchor(iso)
    setView('day')
  }, [])

  const unit = view === 'month' ? 'month' : view

  return (
    <div data-testid="dispatch-calendar">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            aria-label={`Previous ${unit}`}
            onClick={() => step(-1)}
            style={toolbarButtonStyle(false)}
          >
            ‹ Prev
          </button>
          <button type="button" onClick={() => setAnchor(getPragueTodayISO())} style={toolbarButtonStyle(false)}>
            Today
          </button>
          <button
            type="button"
            aria-label={`Next ${unit}`}
            onClick={() => step(1)}
            style={toolbarButtonStyle(false)}
          >
            Next ›
          </button>
          <h2
            data-testid="calendar-title"
            style={{
              margin: '0 0 0 8px',
              fontFamily: 'var(--admin-font-heading)',
              fontSize: 'var(--admin-fs-heading)',
              fontWeight: 'var(--admin-fw-heading)',
              color: 'var(--admin-text)',
            }}
          >
            {rangeTitle(view, anchor, days)}
          </h2>
        </div>

        <div role="tablist" aria-label="Calendar view" style={{ display: 'flex', gap: '4px' }}>
          {VIEW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={view === opt.value}
              onClick={() => switchView(opt.value)}
              style={toolbarButtonStyle(view === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <MonthGrid
          weeks={weeks}
          anchor={anchor}
          today={today}
          cells={cells}
          onOpen={openFromGrid}
          onMore={drillIntoDay}
        />
      ) : (
        <TimeGrid days={days} today={today} byDay={byDay} onOpen={openFromGrid} />
      )}
    </div>
  )
}

function toolbarButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: '36px',
    padding: '0 12px',
    fontFamily: 'inherit',
    fontSize: 'var(--admin-fs-body)',
    cursor: 'pointer',
    color: active ? 'var(--admin-accent-text)' : 'var(--admin-text)',
    backgroundColor: active ? 'var(--admin-accent-tint-strong)' : 'transparent',
    border: `1px solid ${active ? 'var(--admin-accent-border)' : 'var(--admin-border)'}`,
    borderRadius: 'var(--admin-radius-sm)',
  }
}

// ── Day and week grid ───────────────────────────────────────────────────────

const HOUR_LINES = `repeating-linear-gradient(to bottom, var(--admin-border) 0, var(--admin-border) 1px, transparent 1px, transparent ${HOUR_PX}px)`

function TimeGrid({
  days,
  today,
  byDay,
  onOpen,
}: {
  days: string[]
  today: string
  byDay: Record<string, Placed<CalendarItem<AdminBooking>>[]>
  onOpen: (row: AdminBooking, opener: HTMLElement) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = INITIAL_SCROLL_HOUR * HOUR_PX
  }, [])

  const columns = `${AXIS_WIDTH_PX}px repeat(${days.length}, minmax(${days.length > 1 ? 112 : 0}px, 1fr))`

  return (
    <div
      ref={scrollRef}
      style={{
        overflow: 'auto',
        maxHeight: '70vh',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-md)',
        background: 'var(--admin-surface)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columns,
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--admin-surface)',
          borderBottom: '1px solid var(--admin-border)',
        }}
      >
        <div />
        {days.map(iso => (
          <div
            key={iso}
            data-testid={`calendar-head-${iso}`}
            style={{
              padding: '8px 6px',
              textAlign: 'center',
              fontSize: 'var(--admin-fs-label)',
              fontWeight: 'var(--admin-fw-strong)',
              color: iso === today ? 'var(--admin-accent-text)' : 'var(--admin-text-muted)',
              background: iso === today ? 'var(--admin-accent-tint)' : undefined,
              borderLeft: '1px solid var(--admin-border)',
            }}
          >
            {dayLabel(iso)}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: columns }}>
        <div aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              style={{
                height: `${HOUR_PX}px`,
                boxSizing: 'border-box',
                padding: '2px 6px 0 0',
                textAlign: 'right',
                fontSize: 'var(--admin-fs-label)',
                color: 'var(--admin-text-muted)',
              }}
            >
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>
        {days.map(iso => (
          <div
            key={iso}
            data-testid={`calendar-day-${iso}`}
            aria-current={iso === today ? 'date' : undefined}
            style={{
              position: 'relative',
              height: `${24 * HOUR_PX}px`,
              borderLeft: '1px solid var(--admin-border)',
              backgroundImage: HOUR_LINES,
              backgroundColor: iso === today ? 'var(--admin-accent-tint)' : undefined,
            }}
          >
            {(byDay[iso] ?? []).map(p => (
              <CalendarBlock key={p.item.item.id} placed={p} onOpen={onOpen} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarBlock({
  placed,
  onOpen,
}: {
  placed: Placed<CalendarItem<AdminBooking>>
  onOpen: (row: AdminBooking, opener: HTMLElement) => void
}) {
  const { item: ci, startMin, endMin, col, cols } = placed
  const b = ci.item
  const family = statusFamily(b.status)
  const label = statusLabel(b.status)
  const height = Math.max(endMin - startMin, MIN_BLOCK_MIN) * PX_PER_MIN

  return (
    <button
      type="button"
      data-testid={`calendar-block-${b.id}`}
      data-start-min={startMin}
      data-end-min={endMin}
      title={`${formatMinute(startMin)} ${b.booking_reference} · ${label}\n${routeTitle(b)}`}
      onClick={e => onOpen(b, e.currentTarget)}
      style={{
        position: 'absolute',
        top: `${startMin * PX_PER_MIN}px`,
        height: `${height - 2}px`,
        left: `calc(${(col / cols) * 100}% + 1px)`,
        width: `calc(${100 / cols}% - 2px)`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '1px 6px',
        textAlign: 'left',
        lineHeight: 1.25,
        fontFamily: 'inherit',
        fontSize: 'var(--admin-fs-label)',
        cursor: 'pointer',
        background: `var(--status-${family}-bg)`,
        color: `var(--status-${family}-fg)`,
        border: `1px solid var(--status-${family}-border)`,
        borderRadius: 'var(--admin-radius-sm)',
        opacity: ci.faded ? 0.55 : 1,
      }}
    >
      <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'var(--admin-fw-strong)' }}>
        {formatMinute(startMin)} {b.booking_reference}
      </span>
      <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
        {ci.continues ? ' · continues' : ''}
      </span>
    </button>
  )
}

// ── Month grid ──────────────────────────────────────────────────────────────

function MonthGrid({
  weeks,
  anchor,
  today,
  cells,
  onOpen,
  onMore,
}: {
  weeks: string[][]
  anchor: string
  today: string
  cells: Record<string, { shown: CalendarItem<AdminBooking>[]; more: number }>
  onOpen: (row: AdminBooking, opener: HTMLElement) => void
  onMore: (iso: string) => void
}) {
  const anchorMonth = anchor.slice(0, 7)
  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-md)',
        background: 'var(--admin-surface)',
      }}
    >
      <div style={{ minWidth: '720px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {WEEKDAYS.map(d => (
            <div
              key={d}
              style={{
                padding: '8px 6px',
                textAlign: 'center',
                fontSize: 'var(--admin-fs-label)',
                fontWeight: 'var(--admin-fw-strong)',
                color: 'var(--admin-text-muted)',
                borderBottom: '1px solid var(--admin-border)',
              }}
            >
              {d}
            </div>
          ))}
        </div>
        {weeks.map(week => (
          <div key={week[0]} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {week.map(iso => {
              const outside = iso.slice(0, 7) !== anchorMonth
              const isToday = iso === today
              const cell = cells[iso] ?? { shown: [], more: 0 }
              return (
                <div
                  key={iso}
                  data-testid={`calendar-cell-${iso}`}
                  data-outside-month={outside ? 'true' : undefined}
                  aria-current={isToday ? 'date' : undefined}
                  style={{
                    minHeight: '112px',
                    padding: '4px',
                    boxSizing: 'border-box',
                    borderTop: '1px solid var(--admin-border)',
                    borderLeft: '1px solid var(--admin-border)',
                    backgroundColor: isToday ? 'var(--admin-accent-tint)' : outside ? 'var(--admin-bg)' : undefined,
                  }}
                >
                  <div
                    style={{
                      marginBottom: '4px',
                      fontSize: 'var(--admin-fs-label)',
                      fontWeight: 'var(--admin-fw-strong)',
                      color: isToday ? 'var(--admin-accent-text)' : outside ? 'var(--admin-text-muted)' : 'var(--admin-text)',
                      opacity: outside && !isToday ? 0.6 : 1,
                    }}
                  >
                    {Number(iso.slice(8, 10))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {cell.shown.map(ci => (
                      <MonthItem key={ci.item.id} ci={ci} onOpen={onOpen} />
                    ))}
                    {cell.more > 0 && (
                      <button
                        type="button"
                        aria-label={`+${cell.more} more, open ${dayLabel(iso)}`}
                        onClick={() => onMore(iso)}
                        style={{
                          alignSelf: 'flex-start',
                          padding: '1px 6px',
                          fontFamily: 'inherit',
                          fontSize: 'var(--admin-fs-label)',
                          fontWeight: 'var(--admin-fw-strong)',
                          cursor: 'pointer',
                          color: 'var(--admin-accent-text)',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--admin-accent-border)',
                          borderRadius: 'var(--admin-radius-sm)',
                        }}
                      >
                        +{cell.more}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthItem({
  ci,
  onOpen,
}: {
  ci: CalendarItem<AdminBooking>
  onOpen: (row: AdminBooking, opener: HTMLElement) => void
}) {
  const b = ci.item
  const family = statusFamily(b.status)
  const label = statusLabel(b.status)
  return (
    <button
      type="button"
      data-testid={`calendar-item-${b.id}`}
      title={`${formatMinute(ci.startMin)} ${b.booking_reference} · ${label}\n${routeTitle(b)}`}
      aria-label={`${formatMinute(ci.startMin)} ${b.booking_reference}, ${label}`}
      onClick={e => onOpen(b, e.currentTarget)}
      style={{
        width: '100%',
        padding: '1px 6px',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 'var(--admin-fs-label)',
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: 'pointer',
        backgroundColor: `var(--status-${family}-bg)`,
        color: `var(--status-${family}-fg)`,
        border: `1px solid var(--status-${family}-border)`,
        borderRadius: 'var(--admin-radius-sm)',
        opacity: ci.faded ? 0.55 : 1,
      }}
    >
      {formatMinute(ci.startMin)} {b.booking_reference}
    </button>
  )
}
