'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Search } from 'lucide-react'
import { KPICard } from '@/components/admin/KPICard'
import BookingsTable from '@/components/admin/BookingsTable'
import { BookingPanelProvider } from '@/components/admin/BookingPanelProvider'
import { ManualBookingForm } from '@/components/admin/ManualBookingForm'
import { DispatchBoard } from '@/components/admin/dispatch/DispatchBoard'
import { DispatchCalendar } from '@/components/admin/dispatch/DispatchCalendar'
import {
  ADMIN_CALENDAR_VIEW_COOKIE,
  parseAdminCalendarView,
  serializeBookingsViewCookie,
  type AdminBookingsView,
  type AdminCalendarView,
} from '@/lib/admin-shell-prefs'

// Phase 90 plan 09 (D-01, D-04): /admin/bookings is one workspace with three tabs (List, Board, Calendar) around ONE
// BookingPanelProvider, so every view opens the same side panel and an open booking survives a tab switch. Only the
// active view is mounted: the board and the calendar poll on their own, the list never does, and a hidden view must
// not keep polling. No wrapper below adds a transform, filter, will-change or contain: the side panel is
// position: fixed and any of those would turn the wrapper into its containing block (Pitfall 6).

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function getSunday(date: Date): string {
  const monday = new Date(date)
  const day = monday.getDay()
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1)
  monday.setDate(diff)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return sunday.toISOString().split('T')[0]
}

const TABS: { value: AdminBookingsView; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
  { value: 'calendar', label: 'Calendar' },
]

const TABPANEL_ID = 'bookings-tabpanel'

const TRIP_TYPE_CHIPS = [
  { label: 'All', value: 'all' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Hourly', value: 'hourly' },
  { label: 'Daily', value: 'daily' },
]

interface Filters {
  search: string
  tripType: string
}

// The filter bar the board and the calendar share (the list has its own, richer bar and reports back). The search
// box keeps its own text and commits it to the workspace after the same 300 ms debounce the list uses; it is
// seeded from the workspace each time it mounts, so a search made on the list is already there.
function SharedFilterBar({
  filters,
  onSearch,
  onTripType,
}: {
  filters: Filters
  onSearch: (search: string) => void
  onTripType: (tripType: string) => void
}) {
  const [text, setText] = useState(filters.search)
  const committed = filters.search
  useEffect(() => {
    if (text === committed) return
    const id = setTimeout(() => onSearch(text), 300)
    return () => clearTimeout(id)
  }, [text, committed, onSearch])

  return (
    <div
      data-testid="dispatch-filter-bar"
      style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}
    >
      <div style={{ position: 'relative' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--warmgrey)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search size={13} />
        </span>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Search client or reference..."
          aria-label="Search bookings"
          style={{
            width: '240px',
            height: '32px',
            background: 'var(--anthracite)',
            border: '1px solid var(--anthracite-light)',
            borderRadius: '2px',
            padding: '0 12px 0 36px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            color: 'var(--offwhite)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--copper)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--anthracite-light)' }}
        />
      </div>
      {TRIP_TYPE_CHIPS.map(chip => {
        const isActive = filters.tripType === chip.value
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onTripType(chip.value)}
            style={{
              height: '32px',
              padding: '0 12px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              letterSpacing: '0.06em',
              borderRadius: '2px',
              cursor: 'pointer',
              background: isActive ? 'var(--admin-accent-tint)' : 'transparent',
              border: isActive ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
              color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
              transition: 'border-color 150ms ease, color 150ms ease',
            }}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}

// The calendar remembers its own day / week / month in admin_calendar_view and writes it itself. The workspace
// reads that cookie each time the Calendar tab mounts so the choice survives a tab switch (D-15); on the server, or
// without a cookie, the value resolved by the page is used.
function readRememberedCalendarView(fallback: AdminCalendarView): AdminCalendarView {
  if (typeof document === 'undefined') return fallback
  const prefix = `${ADMIN_CALENDAR_VIEW_COOKIE}=`
  for (const part of document.cookie.split(';')) {
    const entry = part.trim()
    if (entry.startsWith(prefix)) return parseAdminCalendarView(entry.slice(prefix.length))
  }
  return fallback
}

export default function BookingsWorkspace({
  initialView,
  initialCalendarView,
}: {
  initialView: AdminBookingsView
  initialCalendarView: AdminCalendarView
}) {
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [weekRevenue, setWeekRevenue] = useState<number | null>(null)
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // Seeded once: a later prop change (router refresh) must not undo a tab the operator already chose.
  const [view, setView] = useState<AdminBookingsView>(initialView)
  // DISP-02 read side: the persisted default horizon/days, hydrated from a
  // THIRD, separate fetch below — NOT one of the two KPI /api/admin/bookings
  // fetches. Falls back to the shipped defaults if the fetch fails.
  const [defaultHorizon, setDefaultHorizon] = useState('future')
  const [defaultHorizonDays, setDefaultHorizonDays] = useState(7)
  // CR-01 fix: BookingsTable seeds its ephemeral `horizon` state via
  // `useState(defaultHorizon)`, which only reads the prop on the component's
  // FIRST render. Since the settings fetch below is async, it always
  // resolves after BookingsTable's initial mount — so without this gate the
  // resolved persisted default is silently dropped and the table is stuck on
  // the hardcoded 'future' fallback forever. Gating the mount until the
  // settings fetch has settled (success or failure) guarantees BookingsTable
  // only ever mounts once it can see the real value.
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const tabRefs = useRef<Record<AdminBookingsView, HTMLButtonElement | null>>({ list: null, board: null, calendar: null })

  // Shared filters (D-01): search (already debounced) and trip type follow the operator across the three tabs.
  // The list reports its own filters back; the board and the calendar read them and edit them in SharedFilterBar.
  const [filters, setFilters] = useState<Filters>({ search: '', tripType: 'all' })
  const handleListFilters = useCallback((next: Filters) => {
    setFilters(prev => (prev.search === next.search && prev.tripType === next.tripType ? prev : next))
  }, [])
  const handleSearch = useCallback((search: string) => {
    setFilters(prev => (prev.search === search ? prev : { ...prev, search }))
  }, [])
  const handleTripType = useCallback((tripType: string) => {
    setFilters(prev => (prev.tripType === tripType ? prev : { ...prev, tripType }))
  }, [])

  const handleBookingCreated = useCallback(() => {
    setRefreshKey(k => k + 1)
    setShowNewBooking(false)
  }, [])

  const switchView = useCallback((next: AdminBookingsView) => {
    setView(next)
    // The cookie only remembers the choice for the next visit; a blocked write loses persistence, nothing else.
    try {
      document.cookie = serializeBookingsViewCookie(next, location.protocol === 'https:')
    } catch {
      // cookie or location unavailable
    }
    // Replace only the view parameter, keep every other one. history.state is passed back unchanged: the Next.js
    // router stores its own bookkeeping in it.
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('view', next)
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    } catch {
      // history unavailable
    }
  }, [])

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let target = -1
    if (e.key === 'ArrowRight') target = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') target = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') target = 0
    else if (e.key === 'End') target = TABS.length - 1
    if (target < 0) return
    e.preventDefault()
    const next = TABS[target].value
    switchView(next)
    tabRefs.current[next]?.focus()
  }, [switchView])

  useEffect(() => {
    const now = new Date()
    const todayISO = now.toISOString().split('T')[0]
    const mondayISO = getMonday(now)
    const sundayISO = getSunday(now)

    // Today's bookings count
    fetch(`/api/admin/bookings?startDate=${todayISO}&endDate=${todayISO}&limit=1`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setTodayCount(data.total ?? 0)
      })
      .catch(() => {})

    // This week's revenue
    fetch(`/api/admin/bookings?startDate=${mondayISO}&endDate=${sundayISO}&limit=100`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.bookings) {
          const sum = (data.bookings as Array<{ amount_czk: number }>)
            .reduce((acc, b) => acc + (b.amount_czk ?? 0), 0)
          setWeekRevenue(sum)
        }
      })
      .catch(() => {})
  }, [])

  // DISP-02: read the persisted dispatch-horizon default once on mount, in a
  // dedicated fetch decoupled from the two KPI fetches above (D-05) and from
  // BookingsTable's own list fetch — never routes the segmented-control's
  // ephemeral state back into this settings read.
  useEffect(() => {
    fetch('/api/admin/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.dispatch_default_horizon) setDefaultHorizon(data.dispatch_default_horizon)
        if (data?.dispatch_horizon_days) setDefaultHorizonDays(data.dispatch_horizon_days)
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true))
  }, [])

  const formatCZK = (value: number) =>
    new Intl.NumberFormat('cs-CZ').format(value)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.08em',
            margin: 0,
          }}
        >
          Bookings
        </h1>
        <button
          onClick={() => setShowNewBooking(true)}
          style={{
            border: '1px solid var(--anthracite-light)',
            background: 'transparent',
            color: 'var(--warmgrey)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            padding: '0 24px',
            minHeight: '44px',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
        >
          New Booking
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <KPICard
          label="Today"
          value={todayCount !== null ? String(todayCount) : '—'}
          subLabel="bookings"
        />
        <KPICard
          label="This week"
          value={weekRevenue !== null ? `${formatCZK(weekRevenue)} CZK` : '—'}
          subLabel="CZK revenue"
        />
      </div>

      {/* One provider for all three tabs: the side panel and the money dialogs are mounted once. */}
      <BookingPanelProvider>
        <div
          role="tablist"
          aria-label="Bookings view"
          style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}
        >
          {TABS.map((t, index) => {
            const active = view === t.value
            return (
              <button
                key={t.value}
                ref={el => { tabRefs.current[t.value] = el }}
                type="button"
                role="tab"
                id={`bookings-tab-${t.value}`}
                aria-selected={active}
                aria-controls={TABPANEL_ID}
                tabIndex={active ? 0 : -1}
                onClick={() => { if (!active) switchView(t.value) }}
                onKeyDown={e => handleTabKeyDown(e, index)}
                style={{
                  height: '36px',
                  padding: '0 20px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  background: active ? 'var(--admin-accent-tint)' : 'transparent',
                  border: active ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
                  color: active ? 'var(--offwhite)' : 'var(--warmgrey)',
                  transition: 'border-color 150ms ease, color 150ms ease',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div role="tabpanel" id={TABPANEL_ID} aria-labelledby={`bookings-tab-${view}`}>
          {view === 'list' && settingsLoaded && (
            <BookingsTable
              key={refreshKey}
              defaultHorizon={defaultHorizon}
              horizonDays={defaultHorizonDays}
              initialSearch={filters.search}
              initialTripType={filters.tripType}
              onFiltersChange={handleListFilters}
            />
          )}
          {view !== 'list' && (
            <SharedFilterBar filters={filters} onSearch={handleSearch} onTripType={handleTripType} />
          )}
          {view === 'board' && (
            <DispatchBoard key={refreshKey} search={filters.search} tripType={filters.tripType} />
          )}
          {view === 'calendar' && (
            <DispatchCalendar
              key={refreshKey}
              search={filters.search}
              tripType={filters.tripType}
              initialView={readRememberedCalendarView(initialCalendarView)}
            />
          )}
        </div>
      </BookingPanelProvider>

      <ManualBookingForm
        open={showNewBooking}
        onClose={() => setShowNewBooking(false)}
        onCreated={handleBookingCreated}
      />
    </div>
  )
}
