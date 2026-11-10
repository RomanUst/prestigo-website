'use client'
import React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { PaymentStateBadge } from './PaymentStateBadge'
import { FeeCaseBadge, CashChip, hasPendingFeeCase } from './FeeCaseBadge'
import { NoShowChip, hasOpenNoShowRequest } from './NoShowBanner'
import { STATUS_CONFLICT_STYLE } from './statusConflict'
import { useBookingPanel, useBookingEvents } from './BookingPanelProvider'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import type { BookingStatus } from '@/lib/booking-status'
import {
  showsPaymentBadge,
  vehicleClassMap,
  STATUS_LABELS,
  type AdminBooking,
} from './bookingTypes'

type Booking = AdminBooking

interface BookingsTableProps {
  // DISP-02: the persisted default, read from /api/admin/settings by the
  // parent page. Treated as read-only here — this component NEVER writes
  // back to it. Falls back to the shipped defaults ('future'/7) so the
  // component still renders correctly if the parent hasn't hydrated yet.
  defaultHorizon?: string
  horizonDays?: number
}

// The bookings table opens pre-filtered from a link: /admin/bookings?search={ref|email}.
// Sources: the CRM Booking "Admin link" (Phase 80 D-18, a booking reference),
// the stats Customers tab top-customer links and the Chatwoot panel
// admin_bookings_url (Phase 85 D-11, an email).
// Read once on mount; only a well-formed booking reference (letters, digits,
// hyphens, max 40) or a strict email (<= 254 characters, one @, local part of
// 1-64 characters, a dotted domain, none of whitespace, angle brackets, quotes
// or backtick) is accepted — anything else is ignored. The accepted value is
// only placed in the search box and sent as a bound query parameter. The
// parameter is stripped from the address bar right after it is applied (see
// clearBookingDeepLink) so a later remount of the table — e.g. after a manual
// booking is created — starts from the operator's defaults, not the old link.
const DEEP_LINK_REFERENCE = /^[A-Za-z0-9-]{1,40}$/
const DEEP_LINK_EMAIL = /^[^\s@<>"'`]{1,64}@[^\s@<>"'`]+\.[^\s@<>"'`]+$/

function readBookingDeepLink(): string {
  if (typeof window === 'undefined') return ''
  const raw = new URLSearchParams(window.location.search).get('search')
  if (!raw) return ''
  const value = raw.trim()
  if (DEEP_LINK_REFERENCE.test(value)) return value
  if (value.length <= 254 && DEEP_LINK_EMAIL.test(value)) return value
  return ''
}

function clearBookingDeepLink(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('search')) return
  url.searchParams.delete('search')
  // Keep history.state: the Next.js router stores its own bookkeeping in it.
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export default function BookingsTable({ defaultHorizon = 'future', horizonDays: horizonDaysProp = 7 }: BookingsTableProps) {
  const [deepLinkSearch] = useState(readBookingDeepLink)
  // Apply the deep link once: drop it from the URL after the first render has
  // consumed it. Impure work stays out of the useState initializer (StrictMode
  // calls initializers twice).
  useEffect(() => {
    if (deepLinkSearch) clearBookingDeepLink()
  }, [deepLinkSearch])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [tripType, setTripType] = useState<string>('all')
  // D-08: a SEPARATE status dimension from tripType — the 'Unpaid' chip
  // coexists with the trip-type chips rather than replacing them.
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState(deepLinkSearch)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  // DISP-01/DISP-03/DISP-04 (Plan 65-04): TWO distinct state slots.
  // 1) The persisted default is the `defaultHorizon`/`horizonDaysProp` props
  //    themselves — never re-stored, never mutated by this component.
  // 2) `horizon`/`horizonDays` is the EPHEMERAL in-session override, seeded
  //    from the persisted default on mount. The Future/Past/All segmented
  //    control only ever calls setHorizon — it NEVER PATCHes
  //    /api/admin/settings. A remount (fresh props) re-seeds from the
  //    persisted default, not from whatever was last clicked (D-04).
  //    A Phase 80 D-18 deep link (?search={ref}) starts the session on 'all'
  //    so past bookings are found; still never written back.
  const [horizon, setHorizon] = useState<string>(deepLinkSearch ? 'all' : defaultHorizon)
  const [horizonDays] = useState<number>(horizonDaysProp)
  // D-05 refetch-error state (E2 backstop): distinct from "zero rows" so a
  // legitimately-empty Future view is never confused with a silent failure.
  const [fetchFailed, setFetchFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState(deepLinkSearch)
  const limit = 20

  const [isMobile, setIsMobile] = useState(false)

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Phase 90 plan 05: bookings open in the shared side panel (D-02/D-03). The provider owns the moves, their
  // dialogs and the panel; every row change (a move, a panel save) reaches this list as a 'patched' event.
  const { openBooking, selected, moves, setReferenceSearchHandler } = useBookingPanel()

  useBookingEvents(useCallback((e) => {
    // 'stale' is ignored on purpose: a 409 keeps the row as it is and the list does not reload by itself.
    if (e.type === 'patched') {
      setBookings(prev => prev.map(b => b.id === e.id ? { ...b, ...e.patch } : b))
    }
  }, []))

  // The paired-outbound chip inside the detail panel filters the list by that reference.
  const handleSearchReference = useCallback((ref: string) => {
    setSearch(ref)
    setDebouncedSearch(ref)
    setPage(0)
  }, [])

  // The panel's "Paired outbound" chip filters this list by that reference.
  useEffect(() => {
    setReferenceSearchHandler(handleSearchReference)
    return () => setReferenceSearchHandler(null)
  }, [handleSearchReference, setReferenceSearchHandler])

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [search])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (tripType !== 'all') params.set('tripType', tripType)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      // D-07: an explicit manual Date Range takes session precedence over the
      // segmented-control horizon — omit horizon entirely so the manual bound
      // (already set above) drives the query untouched.
      if (!startDate && !endDate) {
        params.set('horizon', horizon)
        if (horizon === 'last_n_days') params.set('horizonDays', String(horizonDays))
      }

      const res = await fetch(`/api/admin/bookings?${params.toString()}`)
      if (!res.ok) {
        console.error('Failed to load bookings', res.status)
        setFetchFailed(true)
        return
      }
      const data = await res.json()
      setFetchFailed(false)
      setBookings(data.bookings ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error('fetchBookings error', err)
      setFetchFailed(true)
    } finally {
      setLoading(false)
    }
  }, [page, tripType, statusFilter, debouncedSearch, startDate, endDate, horizon, horizonDays])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const handleFilterChange = useCallback((setter: (v: string) => void) => (v: string) => {
    setter(v)
    setPage(0)
  }, [])

  const columns: ColumnDef<Booking>[] = [
    {
      accessorKey: 'booking_reference',
      header: 'Ref',
      size: 160,
      cell: ({ row }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          <span style={{
            fontFamily: 'monospace',
            fontSize: '13px',
            color: 'var(--copper)',
          }}>
            {row.original.booking_reference}
          </span>
          {row.original.booking_source === 'manual' && (
            <span style={{
              marginLeft: '8px',
              background: 'var(--admin-accent-tint-strong)',
              color: 'var(--admin-accent-text)',
              border: '1px solid var(--admin-accent-border)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 8px',
              borderRadius: '2px',
              display: 'inline-block',
            }}>Manual</span>
          )}
          {(row.original.leg === 'return' || (row.original.leg === 'outbound' && row.original.linked_booking_id !== null)) && (
            <span
              data-testid={`leg-badge-${row.original.id}`}
              style={{
                marginLeft: '8px',
                background: 'transparent',
                color: 'var(--copper)',
                border: '1px solid var(--copper)',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '4px 8px',
                borderRadius: '2px',
                display: 'inline-block',
              }}
            >
              {row.original.leg === 'return' ? 'Return' : 'Outbound'}
            </span>
          )}
          {row.original.booking_source === 'gnet' && (
            <span
              data-testid={`gnet-badge-${row.original.id}`}
              style={{
                marginLeft: '8px',
                background: 'var(--status-info-bg)',
                color: 'var(--status-info-fg)',
                border: '1px solid var(--status-info-border)',
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '4px 8px',
                borderRadius: '2px',
                display: 'inline-block',
                fontFamily: 'var(--font-montserrat)',
                lineHeight: 1,
              }}
            >
              GNet
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'pickup',
      header: 'Pickup',
      size: 140,
      cell: ({ row }) => (
        <span>{row.original.pickup_date} · {row.original.pickup_time}</span>
      ),
    },
    {
      id: 'client',
      header: 'Client',
      size: 180,
      cell: ({ row }) => (
        <span>{row.original.client_first_name} {row.original.client_last_name}</span>
      ),
    },
    {
      accessorKey: 'trip_type',
      header: 'Type',
      size: 100,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{v.charAt(0).toUpperCase() + v.slice(1)}</span>
      },
    },
    {
      accessorKey: 'vehicle_class',
      header: 'Vehicle',
      size: 120,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{vehicleClassMap[v] ?? v}</span>
      },
    },
    {
      accessorKey: 'amount_czk',
      header: 'Amount',
      size: 100,
      cell: ({ getValue }) => (
        <span style={{ textAlign: 'right', display: 'block' }}>
          {getValue<number>()} CZK
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', maxWidth: '100%' }}>
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
            <StatusBadge
              variant={row.original.status as BookingStatus}
              label={STATUS_LABELS[row.original.status] ?? row.original.status}
            />
            {hasOpenNoShowRequest(row.original) && <NoShowChip />}
          </span>
          {hasPendingFeeCase(row.original) && <FeeCaseBadge />}
          {showsPaymentBadge(row.original) && (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
              {row.original.payment_mode === 'cash_guarantee' && <CashChip />}
              <PaymentStateBadge state={row.original.payment_state ?? 'none'} />
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'expand',
      header: '',
      size: 48,
      // Static hint that the row opens in the side panel (D-02); there is no expansion state.
      cell: () => (
        <span aria-hidden="true" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--warmgrey)',
        }}>
          <ChevronRight size={16} />
        </span>
      ),
    },
  ]

  const table = useReactTable({
    data: bookings,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: total,
  })

  const totalPages = Math.ceil(total / limit)
  const start = total === 0 ? 0 : page * limit + 1
  const end = Math.min(page * limit + limit, total)

  const filterChips = [
    { label: 'All', value: 'all' },
    { label: 'Transfer', value: 'transfer' },
    { label: 'Hourly', value: 'hourly' },
    { label: 'Daily', value: 'daily' },
  ]

  // DISP-03/D-07: an explicit manual Date Range takes session precedence over
  // the segmented control — gray every segment to the inactive-chip style so
  // the admin sees the Date Range is driving the query (not disabled, just
  // visually deferred).
  const dateRangeActive = Boolean(startDate || endDate)
  // 'last_n_days' (persisted-default-only, not a segment) displays as its
  // nearest visible peer, Future, per UI-SPEC.
  const displayHorizon = horizon === 'last_n_days' ? 'future' : horizon
  const horizonSegments = [
    { label: 'Future', value: 'future' },
    { label: 'Past', value: 'past' },
    { label: 'All', value: 'all' },
  ]
  // E2 empty: the Future-segment "nothing upcoming" copy only applies when
  // the segmented control (not a manual Date Range) is actually driving a
  // future-only query.
  const isFutureEmpty = displayHorizon === 'future' && !dateRangeActive

  return (
    <div>
      {/* Filter bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        {/* Future/Past/All segmented control (DISP-03) — ephemeral in-session
            override, never PATCHes /api/admin/settings. Sits at the top of
            the filter bar per UI-SPEC. */}
        {horizonSegments.map(seg => {
          const isActive = !dateRangeActive && displayHorizon === seg.value
          return (
            <button
              key={seg.value}
              onClick={() => handleFilterChange(setHorizon)(seg.value)}
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
              {seg.label}
            </button>
          )
        })}

        {/* Separator */}
        <div style={{ width: '1px', height: '20px', background: 'var(--anthracite-light)' }} />

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--warmgrey)',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Search size={13} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or reference..."
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
            onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--anthracite-light)' }}
          />
        </div>

        {/* Date range button */}
        <button
          onClick={() => setShowDateFilter(v => !v)}
          style={{
            height: '32px',
            padding: '0 12px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.06em',
            borderRadius: '2px',
            cursor: 'pointer',
            background: showDateFilter ? 'var(--admin-accent-tint)' : 'transparent',
            border: showDateFilter ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
            color: showDateFilter ? 'var(--offwhite)' : 'var(--warmgrey)',
            transition: 'border-color 150ms ease, color 150ms ease',
          }}
        >
          Date Range
        </button>

        {/* Date inputs */}
        {showDateFilter && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                color: 'var(--warmgrey)',
                letterSpacing: '0.06em',
              }}>
                From
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(0) }}
                style={{
                  width: '140px',
                  height: '32px',
                  background: 'var(--anthracite)',
                  border: '1px solid var(--anthracite-light)',
                  borderRadius: '2px',
                  padding: '0 12px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  color: 'var(--offwhite)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                color: 'var(--warmgrey)',
                letterSpacing: '0.06em',
              }}>
                To
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(0) }}
                style={{
                  width: '140px',
                  height: '32px',
                  background: 'var(--anthracite)',
                  border: '1px solid var(--anthracite-light)',
                  borderRadius: '2px',
                  padding: '0 12px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  color: 'var(--offwhite)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </>
        )}

        {/* Separator */}
        <div style={{ width: '1px', height: '20px', background: 'var(--anthracite-light)' }} />

        {/* Filter chips */}
        {filterChips.map(chip => {
          const isActive = tripType === chip.value
          return (
            <button
              key={chip.value}
              onClick={() => handleFilterChange(setTripType)(chip.value)}
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

        {/* Unpaid status chip — separate dimension from trip-type chips (D-08) */}
        <button
          onClick={() => handleFilterChange(setStatusFilter)(statusFilter === 'unpaid' ? 'all' : 'unpaid')}
          style={{
            height: '32px',
            padding: '0 12px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.06em',
            borderRadius: '2px',
            cursor: 'pointer',
            background: statusFilter === 'unpaid' ? 'var(--status-warn-bg)' : 'transparent',
            border: statusFilter === 'unpaid' ? '1px solid var(--status-warn-fg)' : '1px solid var(--anthracite-light)',
            color: statusFilter === 'unpaid' ? 'var(--offwhite)' : 'var(--warmgrey)',
            transition: 'border-color 150ms ease, color 150ms ease',
          }}
        >
          Unpaid
        </button>
      </div>

      {/* Mobile card layout */}
      {!isMobile ? null : (
        <div className="md:hidden" data-testid="mobile-cards">
          {loading ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--warmgrey)',
            }}>Loading...</div>
          ) : fetchFailed ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--status-danger-fg)',
            }}>
              Couldn&apos;t load bookings — check your connection and try again.
            </div>
          ) : bookings.length === 0 ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--warmgrey)',
            }}>
              {isFutureEmpty ? (
                <>
                  <div>No upcoming trips</div>
                  <div style={{ marginTop: '8px' }}>Every confirmed booking has passed. Switch to Past or All to see historical trips.</div>
                </>
              ) : (
                <>
                  <div>No bookings found.</div>
                  <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
                </>
              )}
            </div>
          ) : (
            bookings.map((booking) => {
              const isSelected = selected?.id === booking.id
              const transitions = UI_TRANSITIONS[booking.status] ?? []
              return (
                <div
                  key={booking.id}
                  tabIndex={0}
                  aria-current={isSelected ? 'true' : undefined}
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--anthracite-light)'
                      : booking.status === 'unpaid' ? 'var(--status-warn-bg)' : 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => openBooking(booking, e.currentTarget)}
                  onKeyDown={(e) => {
                    // Enter / Space on the focused card itself (not on a button inside it) opens the panel.
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openBooking(booking, e.currentTarget)
                    }
                  }}
                >
                  {/* Top row: ref + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      color: booking.booking_source === 'manual' ? 'var(--admin-accent-text)' : 'var(--copper)',
                    }}>
                      {booking.booking_reference}
                      {booking.booking_source === 'manual' && (
                        <span style={{
                          marginLeft: '8px',
                          background: 'var(--admin-accent-tint-strong)',
                          color: 'var(--admin-accent-text)',
                          border: '1px solid var(--admin-accent-border)',
                          fontSize: '11px',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          padding: '2px 6px',
                          borderRadius: '2px',
                        }}>Manual</span>
                      )}
                      {(booking.leg === 'return' || (booking.leg === 'outbound' && booking.linked_booking_id !== null)) && (
                        <span
                          data-testid={`leg-badge-mobile-${booking.id}`}
                          style={{
                            marginLeft: '8px',
                            background: 'transparent',
                            color: 'var(--copper)',
                            border: '1px solid var(--copper)',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            fontWeight: 500,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.08em',
                            padding: '2px 6px',
                            borderRadius: '2px',
                          }}
                        >
                          {booking.leg === 'return' ? 'Return' : 'Outbound'}
                        </span>
                      )}
                      {booking.booking_source === 'gnet' && (
                        <span
                          data-testid={`gnet-badge-mobile-${booking.id}`}
                          style={{
                            marginLeft: '8px',
                            background: 'var(--status-info-bg)',
                            color: 'var(--status-info-fg)',
                            border: '1px solid var(--status-info-border)',
                            fontSize: '11px',
                            fontWeight: 500,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.08em',
                            padding: '4px 8px',
                            borderRadius: '2px',
                            display: 'inline-block',
                            fontFamily: 'var(--font-montserrat)',
                            lineHeight: 1,
                          }}
                        >
                          GNet
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', maxWidth: '100%' }}>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                        <StatusBadge
                          variant={booking.status as BookingStatus}
                          label={STATUS_LABELS[booking.status] ?? booking.status}
                        />
                        {hasOpenNoShowRequest(booking) && <NoShowChip />}
                      </span>
                      {hasPendingFeeCase(booking) && <FeeCaseBadge />}
                      {showsPaymentBadge(booking) && (
                        <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                          {booking.payment_mode === 'cash_guarantee' && <CashChip />}
                          <PaymentStateBadge state={booking.payment_state ?? 'none'} />
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Client name */}
                  <div style={{
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--offwhite)',
                    marginBottom: 4,
                  }}>
                    {booking.client_first_name} {booking.client_last_name}
                  </div>

                  {/* Pickup + vehicle */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '11px',
                    color: 'var(--warmgrey)',
                    marginBottom: 4,
                  }}>
                    <span>{booking.pickup_date} · {booking.pickup_time}</span>
                    <span>{vehicleClassMap[booking.vehicle_class] ?? booking.vehicle_class}</span>
                  </div>

                  {/* Amount */}
                  <div style={{
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--offwhite)',
                    textAlign: 'right' as const,
                    marginBottom: 8,
                  }}>
                    {booking.amount_czk} CZK
                  </div>

                  {/* Status transitions */}
                  {transitions.length > 0 && (
                    <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                      {transitions.map(s => (
                        <button
                          key={s}
                          disabled={moves.isUpdating(booking.id)}
                          onClick={() => moves.requestStatusChange(booking, s)}
                          style={{
                            minHeight: 44,
                            minWidth: 44,
                            flex: 1,
                            background: 'transparent',
                            border: '1px solid var(--anthracite-light)',
                            borderRadius: '2px',
                            color: 'var(--offwhite)',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase' as const,
                            cursor: moves.isUpdating(booking.id) ? 'not-allowed' : 'pointer',
                            opacity: moves.isUpdating(booking.id) ? 0.5 : 1,
                          }}
                        >
                          {moves.isUpdating(booking.id) ? '...' : STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {/* the open panel shows the same line for the selected booking */}
                    {moves.conflictFor(booking.id) && !isSelected && (
                      <div role="alert" style={{ ...STATUS_CONFLICT_STYLE, marginTop: 0, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                        {moves.conflictFor(booking.id)}
                      </div>
                    )}
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Table (desktop) */}
      <div className="hidden md:block" data-testid="desktop-table" style={{
        width: '100%',
        border: '1px solid var(--anthracite-light)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} style={{
                background: 'var(--anthracite)',
                borderBottom: '1px solid var(--anthracite-light)',
                height: '40px',
              }}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      padding: '0 12px',
                      textAlign: header.column.id === 'amount_czk' ? 'right' : 'left',
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '11px',
                      fontWeight: 400,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4em',
                      color: 'var(--warmgrey)',
                      width: header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--warmgrey)',
                  }}
                >
                  Loading...
                </td>
              </tr>
            ) : fetchFailed ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--status-danger-fg)',
                  }}
                >
                  Couldn&apos;t load bookings — check your connection and try again.
                </td>
              </tr>
            ) : bookings.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--warmgrey)',
                  }}
                >
                  {isFutureEmpty ? (
                    <>
                      <div>No upcoming trips</div>
                      <div style={{ marginTop: '8px' }}>Every confirmed booking has passed. Switch to Past or All to see historical trips.</div>
                    </>
                  ) : (
                    <>
                      <div>No bookings found.</div>
                      <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => {
                const isSelected = selected?.id === row.original.id
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={(e) => openBooking(row.original, e.currentTarget)}
                    onKeyDown={(e) => {
                      // Enter / Space on the focused row itself (not on a control inside it) opens the panel.
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openBooking(row.original, e.currentTarget)
                      }
                    }}
                    onMouseEnter={() => setHoveredRow(row.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: isSelected || hoveredRow === row.id
                        ? 'var(--anthracite-light)'
                        : row.original.status === 'unpaid'
                          ? 'var(--status-warn-bg)'
                          : 'var(--anthracite-mid)',
                      borderBottom: '1px solid var(--anthracite-light)',
                      minHeight: '44px',
                      cursor: 'pointer',
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        style={{
                          padding: '0 12px',
                          height: '44px',
                          fontFamily: 'var(--font-montserrat)',
                          fontSize: '13px',
                          color: 'var(--offwhite)',
                          width: cell.column.getSize(),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '12px',
        marginTop: '16px',
      }}>
        <span style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          color: 'var(--warmgrey)',
        }}>
          Showing {start}–{end} of {total}
        </span>
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          style={{
            border: '1px solid var(--anthracite-light)',
            padding: '8px 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: 'var(--warmgrey)',
            borderRadius: '2px',
            cursor: page === 0 ? 'not-allowed' : 'pointer',
            background: 'transparent',
            opacity: page === 0 ? 0.4 : 1,
            pointerEvents: page === 0 ? 'none' : 'auto',
          }}
        >
          Previous
        </button>
        <span style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          color: 'var(--warmgrey)',
        }}>
          Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={page >= totalPages - 1}
          style={{
            border: '1px solid var(--anthracite-light)',
            padding: '8px 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: 'var(--warmgrey)',
            borderRadius: '2px',
            cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
            background: 'transparent',
            opacity: page >= totalPages - 1 ? 0.4 : 1,
            pointerEvents: page >= totalPages - 1 ? 'none' : 'auto',
          }}
        >
          Next
        </button>
      </div>
    </div>
  )
}
