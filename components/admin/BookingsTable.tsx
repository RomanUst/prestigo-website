'use client'
import React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type ExpandedState,
} from '@tanstack/react-table'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import PaymentPanel from './PaymentPanel'
import { PaymentStateBadge } from './PaymentStateBadge'
import { FeeCaseBadge, CashChip, hasPendingFeeCase } from './FeeCaseBadge'
import { CancelBookingDialog, type CancelDoneInfo } from './CancelBookingDialog'
import { NoShowBanner, NoShowChip, hasOpenNoShowRequest } from './NoShowBanner'
import { ConfirmNoShowModal } from './ConfirmNoShowModal'
import { STATUS_CONFLICT_STYLE, statusConflictMessage } from './statusConflict'
import { FlightStatusBlock } from './FlightStatusBlock'
import { BookingChangeHistory } from './BookingChangeHistory'
import { DriverAssignmentSection } from '@/components/admin/DriverAssignmentSection'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import type { BookingStatus } from '@/lib/booking-status'
import { DetailField } from './DetailField'
import { TripEditPanel } from './TripEditPanel'
import { PaymentLinkSection } from './PaymentLinkSection'
import {
  PatchError,
  patchBooking,
  showsPaymentBadge,
  hasCancelMoney,
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
  const [expanded, setExpanded] = useState<ExpandedState>({})
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

  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  // D-01: per-booking inline message after an admin status change lost the race (409 status_conflict)
  const [statusConflict, setStatusConflict] = useState<Record<string, string>>({})
  const [notesSaving, setNotesSaving] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  const notesDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [localDriverPrice, setLocalDriverPrice] = useState<Record<string, string>>({})
  const [driverPriceSaving, setDriverPriceSaving] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})

  const [isMobile, setIsMobile] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  // Phase 87 D-16(a): the booking whose Confirm no-show modal is open (banner button or the
  // generic status select / buttons; no_show is terminal, so it is never applied directly).
  const [noShowTarget, setNoShowTarget] = useState<{ id: string; reference: string } | null>(null)

  // Phase 89 plan 16: the booking whose cancel dialog is open (CancelBookingDialog owns its own choice and request state).
  const [pendingCancel, setPendingCancel] = useState<Booking | null>(null)
  // Phase 88-07: per-booking counter that makes an open PaymentPanel refetch after a trip edit.
  const [paymentRefreshKeys, setPaymentRefreshKeys] = useState<Record<string, number>>({})

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Phase 63 Plan 05: optimistic-update sink for TripEditPanel — mutates only
  // the fields that were actually saved, mirroring handleStatusChange's pattern.
  const handleTripUpdated = useCallback((bookingId: string, patch: Partial<Booking>) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...patch } : b))
    // Phase 88-07: a trip edit can change the payment (price, pickup); the panel refetches.
    setPaymentRefreshKeys(prev => ({ ...prev, [bookingId]: (prev[bookingId] ?? 0) + 1 }))
  }, [])

  // D-05: sink for PaymentLinkSection's row-level "Generate Payment Link"
  // action — the route also flips a 'pending' source booking to 'unpaid'
  // directly (Pitfall 2), so both fields are optimistically updated here.
  // 88-REVIEW C-WR-04: the open PaymentPanel reports the state after every (re)load, so the row badge follows panel
  // actions and the refetch after a cancel.
  const handlePaymentState = useCallback((bookingId: string, state: string) => {
    setBookings(prev => prev.map(b => (b.id === bookingId && b.payment_state !== state ? { ...b, payment_state: state } : b)))
  }, [])

  const bumpPayment = useCallback((bookingId: string) => {
    setPaymentRefreshKeys(prev => ({ ...prev, [bookingId]: (prev[bookingId] ?? 0) + 1 }))
  }, [])

  const handlePaymentLinkGenerated = useCallback((bookingId: string, url: string) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_link_url: url, status: 'unpaid' } : b))
  }, [])

  const handleStatusChange = useCallback(async (bookingId: string, newStatus: string, fromStatus: string) => {
    setStatusUpdating(prev => ({ ...prev, [bookingId]: true }))
    setStatusConflict(prev => {
      if (!(bookingId in prev)) return prev
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    try {
      // D-01: expected_status = the status this row shows, so a stale view cannot overwrite the driver
      await patchBooking({ id: bookingId, status: newStatus, expected_status: fromStatus })
      // Optimistic update — mutate only the status field, don't re-fetch
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b))
    } catch (err) {
      if (err instanceof PatchError && err.status === 409 && err.message === 'status_conflict') {
        // Lost the race: show the locked inline copy, keep the row as it is, no automatic reload
        setStatusConflict(prev => ({ ...prev, [bookingId]: statusConflictMessage(err.currentStatus) }))
      } else {
        // Show alert on failure — simple for v1.3 single-operator admin
        alert(err instanceof Error ? err.message : 'Status update failed')
      }
    } finally {
      setStatusUpdating(prev => ({ ...prev, [bookingId]: false }))
    }
  }, [])

  // T-87-40: every path to the terminal no_show goes through the confirmation modal.
  const requestStatusChange = useCallback((booking: Booking, newStatus: string) => {
    if (newStatus === 'no_show') {
      setNoShowTarget({ id: booking.id, reference: booking.booking_reference })
      return
    }
    // 88-REVIEW T5: a card booking is cancelled through the payment-aware cancel dialog (release / refund), never
    // by a bare status change (the server answers 422 use_cancel_route to that).
    // Phase 89 plan 16: the same holds for cash bookings and any booking with money paid online.
    if (newStatus === 'cancelled' && hasCancelMoney(booking)) {
      setPendingCancel(booking)
      return
    }
    handleStatusChange(booking.id, newStatus, booking.status)
  }, [handleStatusChange])

  // The server moved the booking to no_show (final): mirror it locally and drop the request flag.
  const handleNoShowConfirmed = useCallback((bookingId: string) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'no_show', no_show_requested_at: null } : b))
    setStatusConflict(prev => {
      if (!(bookingId in prev)) return prev
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    setNoShowTarget(null)
  }, [])

  // "Client found": the request is cleared, the status stays on_location.
  const handleNoShowCleared = useCallback((bookingId: string) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, no_show_requested_at: null } : b))
  }, [])

  const flushNotes = useCallback(async (bookingId: string, value: string) => {
    setNotesSaving(prev => ({ ...prev, [bookingId]: 'saving' }))
    try {
      await patchBooking({ id: bookingId, operator_notes: value })
      setNotesSaving(prev => ({ ...prev, [bookingId]: 'saved' }))
      // Reset "saved" indicator after 2 seconds
      setTimeout(() => {
        setNotesSaving(prev => prev[bookingId] === 'saved' ? { ...prev, [bookingId]: 'idle' } : prev)
      }, 2000)
    } catch {
      setNotesSaving(prev => ({ ...prev, [bookingId]: 'error' }))
    }
  }, [])

  const handleNotesChange = useCallback((bookingId: string, value: string) => {
    setLocalNotes(prev => ({ ...prev, [bookingId]: value }))
    // Cancel pending debounce
    if (notesDebounceRef.current[bookingId]) {
      clearTimeout(notesDebounceRef.current[bookingId])
    }
    // Schedule save after 800ms idle
    notesDebounceRef.current[bookingId] = setTimeout(() => {
      flushNotes(bookingId, value)
    }, 800)
  }, [flushNotes])

  const handleNotesBlur = useCallback((bookingId: string) => {
    // Flush immediately on blur
    const currentValue = localNotes[bookingId]
    if (currentValue !== undefined) {
      if (notesDebounceRef.current[bookingId]) {
        clearTimeout(notesDebounceRef.current[bookingId])
      }
      flushNotes(bookingId, currentValue)
    }
  }, [localNotes, flushNotes])

  const saveDriverPrice = useCallback(async (bookingId: string, rawValue: string) => {
    const trimmed = rawValue.trim()
    // Empty clears the fee (null); otherwise must be a non-negative integer.
    let value: number | null
    if (trimmed === '') {
      value = null
    } else {
      const n = Number(trimmed)
      if (!Number.isInteger(n) || n < 0) {
        setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'error' }))
        return
      }
      value = n
    }
    setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'saving' }))
    try {
      await patchBooking({ id: bookingId, driver_price_czk: value })
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, driver_price_czk: value } : b))
      setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'saved' }))
      setTimeout(() => {
        setDriverPriceSaving(prev => prev[bookingId] === 'saved' ? { ...prev, [bookingId]: 'idle' } : prev)
      }, 2000)
    } catch {
      setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'error' }))
    }
  }, [])

  // The cancel dialog reports its outcome; the row follows at once and an open panel refetches (C-WR-04).
  const handleCancelled = useCallback((booking: { id: string }, done: CancelDoneInfo) => {
    setBookings(prev => prev.map(b => b.id === booking.id
      ? {
          ...b,
          status: 'cancelled',
          // a released hold shows as released at once; a late cancel keeps the money and a fee decision is pending
          ...(done.released ? { payment_state: 'released' } : {}),
          ...(done.late ? { fee_case_status: 'pending' } : {}),
        }
      : b))
    bumpPayment(booking.id)
    setPendingCancel(null)
  }, [bumpPayment])

  // Phase 88 D-20: the cancel applied (the row is cancelled now) but the refund or release did not. The dialog closes;
  // the panel refetches and shows the Refund failed banner with the amount to refund by hand.
  const handleCancelRefundFailed = useCallback((booking: { id: string }) => {
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
    bumpPayment(booking.id)
    setPendingCancel(null)
  }, [bumpPayment])

  // The cancel applied but the late-cancel case could not be opened: the row is cancelled, the dialog stays up with its line.
  const handleCancelledWithoutCase = useCallback((booking: { id: string }) => {
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
    bumpPayment(booking.id)
  }, [bumpPayment])

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
      // Seed localNotes for bookings that don't already have a local edit
      const fetched = data.bookings ?? []
      setLocalNotes(prev => {
        const next = { ...prev }
        fetched.forEach((b: Booking) => {
          if (!(b.id in next)) {
            next[b.id] = b.operator_notes ?? ''
          }
        })
        return next
      })
      setLocalDriverPrice(prev => {
        const next = { ...prev }
        fetched.forEach((b: Booking) => {
          if (!(b.id in next)) {
            next[b.id] = b.driver_price_czk != null ? String(b.driver_price_czk) : ''
          }
        })
        return next
      })
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

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const debounceMap = notesDebounceRef.current
    return () => {
      Object.values(debounceMap).forEach(timer => clearTimeout(timer))
    }
  }, [])

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
      cell: ({ row }) => (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--warmgrey)',
        }}>
          {row.getIsExpanded()
            ? <ChevronUp size={16} />
            : <ChevronDown size={16} />}
        </span>
      ),
    },
  ]

  const table = useReactTable({
    data: bookings,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
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
              const isExpanded = !!expandedCards[booking.id]
              const transitions = UI_TRANSITIONS[booking.status] ?? []
              return (
                <div
                  key={booking.id}
                  style={{
                    backgroundColor: booking.status === 'unpaid' ? 'var(--status-warn-bg)' : 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                  }}
                  onClick={() => setExpandedCards(prev => ({ ...prev, [booking.id]: !prev[booking.id] }))}
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
                          disabled={!!statusUpdating[booking.id]}
                          onClick={() => requestStatusChange(booking, s)}
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
                            cursor: statusUpdating[booking.id] ? 'not-allowed' : 'pointer',
                            opacity: statusUpdating[booking.id] ? 0.5 : 1,
                          }}
                        >
                          {statusUpdating[booking.id] ? '...' : STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {statusConflict[booking.id] && (
                      <div role="alert" style={{ ...STATUS_CONFLICT_STYLE, marginTop: 0, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                        {statusConflict[booking.id]}
                      </div>
                    )}
                    </>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--admin-border)', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                      {hasOpenNoShowRequest(booking) && booking.no_show_requested_at && (
                        <NoShowBanner
                          bookingId={booking.id}
                          requestedAt={booking.no_show_requested_at}
                          onConfirmRequest={() => setNoShowTarget({ id: booking.id, reference: booking.booking_reference })}
                          onCleared={() => handleNoShowCleared(booking.id)}
                        />
                      )}
                      {booking.flight_iata && (
                        <FlightStatusBlock
                          bookingId={booking.id}
                          flightIata={booking.flight_iata}
                          initialStatus={booking.flight_status}
                          initialEstimatedArrival={booking.flight_estimated_arrival}
                          initialDelayMinutes={booking.flight_delay_minutes}
                        />
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 12 }}>
                        <DetailField label="Origin" value={booking.origin_address} />
                        <DetailField label="Destination" value={booking.destination_address} />
                        <DetailField label="Email" value={booking.client_email} />
                        <DetailField label="Phone" value={booking.client_phone} />
                        {booking.flight_number && <DetailField label="Flight" value={booking.flight_number} />}
                        {booking.terminal && <DetailField label="Terminal" value={booking.terminal} />}
                        {booking.special_requests && <DetailField label="Requests" value={booking.special_requests} />}
                        <DetailField label="Language" value={booking.locale ? booking.locale.toUpperCase() : '—'} />
                        <DetailField
                          label="Child seat"
                          value={booking.extra_child_seat ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="Meet & greet"
                          value={booking.extra_meet_greet ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="Extra luggage"
                          value={booking.extra_luggage ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        {booking.leg === 'return' && booking.linked_booking?.booking_reference && (
                          <DetailField
                            label="Paired outbound"
                            value={
                              <button
                                type="button"
                                data-testid={`linked-ref-chip-mobile-${booking.id}`}
                                aria-label={`Search for paired outbound booking ${booking.linked_booking.booking_reference}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const ref = booking.linked_booking?.booking_reference
                                  if (ref) {
                                    setSearch(ref)
                                    setDebouncedSearch(ref)
                                    setPage(0)
                                  }
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  border: '1px solid var(--copper)',
                                  color: 'var(--copper)',
                                  background: 'transparent',
                                  borderRadius: '2px',
                                  padding: '4px 12px',
                                  fontFamily: 'var(--font-montserrat)',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  letterSpacing: '0.12em',
                                  textTransform: 'uppercase' as const,
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                              >
                                {booking.linked_booking.booking_reference}
                              </button>
                            }
                          />
                        )}
                      </div>

                      {/* Operator notes */}
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          fontFamily: 'var(--font-montserrat)',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3em',
                          color: 'var(--warmgrey)',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          Operator Notes
                          {notesSaving[booking.id] === 'saving' && (
                            <span style={{ color: 'var(--copper)', fontSize: '10px' }}>Saving...</span>
                          )}
                          {notesSaving[booking.id] === 'saved' && (
                            <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px' }}>Saved</span>
                          )}
                          {notesSaving[booking.id] === 'error' && (
                            <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px' }}>Error saving</span>
                          )}
                        </div>
                        <textarea
                          value={localNotes[booking.id] ?? booking.operator_notes ?? ''}
                          onChange={(e) => handleNotesChange(booking.id, e.target.value)}
                          onBlur={() => handleNotesBlur(booking.id)}
                          onClick={(e) => e.stopPropagation()}
                          maxLength={2000}
                          placeholder="Add internal notes..."
                          rows={3}
                          style={{
                            width: '100%',
                            background: 'var(--anthracite-mid)',
                            border: '1px solid var(--anthracite-light)',
                            borderRadius: '2px',
                            padding: '8px 12px',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '13px',
                            color: 'var(--offwhite)',
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box' as const,
                          }}
                          onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
                        />
                      </div>

                      {/* Payment panel (Phase 88 HOLD-07) */}
                      <PaymentPanel
                        bookingId={booking.id}
                        refreshKey={paymentRefreshKeys[booking.id] ?? 0}
                        paymentMode={booking.payment_mode ?? null}
                        onPaymentState={(state) => handlePaymentState(booking.id, state)}
                      />

                      {/* Payment Link (D-05) */}
                      <PaymentLinkSection
                        bookingId={booking.id}
                        status={booking.status}
                        paymentLinkUrl={booking.payment_link_url}
                        clientEmail={booking.client_email}
                        amountCzk={booking.amount_czk}
                        onGenerated={handlePaymentLinkGenerated}
                      />

                      {/* Trip-edit mode (Phase 63 Plan 05) */}
                      <TripEditPanel booking={booking} patchBooking={patchBooking} onUpdated={handleTripUpdated} />

                      {/* Change history (D-11, FOLLOW-02) */}
                      <div style={{ marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
                        <BookingChangeHistory bookingId={booking.id} />
                      </div>

                      {/* Cancel button */}
                      {(booking.status === 'pending' || booking.status === 'confirmed') && (
                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendingCancel(booking) }}
                            style={{
                              border: '1px solid var(--anthracite-light)',
                              background: 'transparent',
                              color: 'var(--warmgrey)',
                              fontFamily: 'var(--font-montserrat)',
                              fontSize: '11px',
                              fontWeight: 500,
                              letterSpacing: '3px',
                              textTransform: 'uppercase' as const,
                              padding: '0 24px',
                              minHeight: 44,
                              borderRadius: '2px',
                              cursor: 'pointer',
                              width: '100%',
                            }}
                          >
                            Cancel Booking
                          </button>
                        </div>
                      )}
                    </div>
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
              table.getRowModel().rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() => row.toggleExpanded()}
                    onMouseEnter={() => setHoveredRow(row.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: row.getIsExpanded() || hoveredRow === row.id
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
                  {row.getIsExpanded() && (
                    <tr key={`${row.id}-expanded`}>
                      <td
                        colSpan={columns.length}
                        style={{
                          background: 'var(--anthracite)',
                          padding: '16px 20px',
                          borderBottom: '1px solid var(--anthracite-light)',
                        }}
                      >
                        {hasOpenNoShowRequest(row.original) && row.original.no_show_requested_at && (
                          <NoShowBanner
                            bookingId={row.original.id}
                            requestedAt={row.original.no_show_requested_at}
                            onConfirmRequest={() => setNoShowTarget({ id: row.original.id, reference: row.original.booking_reference })}
                            onCleared={() => handleNoShowCleared(row.original.id)}
                          />
                        )}
                        {row.original.flight_iata && (
                          <FlightStatusBlock
                            bookingId={row.original.id}
                            flightIata={row.original.flight_iata}
                            initialStatus={row.original.flight_status}
                            initialEstimatedArrival={row.original.flight_estimated_arrival}
                            initialDelayMinutes={row.original.flight_delay_minutes}
                          />
                        )}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '12px',
                        }}>
                          <DetailField label="Origin" value={row.original.origin_address} />
                          <DetailField label="Destination" value={row.original.destination_address} />
                          {row.original.trip_type === 'hourly' && row.original.hours !== null && (
                            <DetailField label="Duration" value={`${row.original.hours} hours`} />
                          )}
                          <DetailField label="Passengers" value={String(row.original.passengers)} />
                          <DetailField label="Luggage" value={String(row.original.luggage)} />
                          <DetailField
                            label="Child seat"
                            value={row.original.extra_child_seat
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="Meet & greet"
                            value={row.original.extra_meet_greet
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="Extra luggage"
                            value={row.original.extra_luggage
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField label="Flight" value={row.original.flight_number ?? '—'} />
                          <DetailField label="Terminal" value={row.original.terminal ?? '—'} />
                          <DetailField label="Return" value={row.original.return_date ?? '—'} />
                          <DetailField label="Notes" value={row.original.special_requests ?? '—'} />
                          <DetailField label="Language" value={row.original.locale ? row.original.locale.toUpperCase() : '—'} />
                          <DetailField
                            label="Payment ID"
                            value={
                              row.original.payment_intent_id ? (
                                <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                                  {row.original.payment_intent_id.length > 24
                                    ? `${row.original.payment_intent_id.slice(0, 24)}...`
                                    : row.original.payment_intent_id}
                                </span>
                              ) : '—'
                            }
                          />
                          {row.original.leg === 'return' && row.original.linked_booking?.booking_reference && (
                            <DetailField
                              label="Paired outbound"
                              value={
                                <button
                                  type="button"
                                  data-testid={`linked-ref-chip-${row.original.id}`}
                                  aria-label={`Search for paired outbound booking ${row.original.linked_booking.booking_reference}`}
                                  onClick={() => {
                                    const ref = row.original.linked_booking?.booking_reference
                                    if (ref) {
                                      setSearch(ref)
                                      setDebouncedSearch(ref)
                                      setPage(0)
                                    }
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: '1px solid var(--copper)',
                                    color: 'var(--copper)',
                                    background: 'transparent',
                                    borderRadius: '2px',
                                    padding: '4px 12px',
                                    fontFamily: 'var(--font-montserrat)',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                                >
                                  {row.original.linked_booking.booking_reference}
                                </button>
                              }
                            />
                          )}
                        </div>

                        {/* Status transition */}
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3em',
                            color: 'var(--warmgrey)',
                          }}>
                            Status
                          </span>
                          {(UI_TRANSITIONS[row.original.status] ?? []).length > 0 ? (
                            <select
                              value=""
                              disabled={!!statusUpdating[row.original.id]}
                              onChange={(e) => {
                                if (e.target.value) requestStatusChange(row.original, e.target.value)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                height: '32px',
                                padding: '0 8px',
                                background: 'var(--anthracite)',
                                border: '1px solid var(--anthracite-light)',
                                borderRadius: '2px',
                                fontFamily: 'var(--font-montserrat)',
                                fontSize: '13px',
                                color: 'var(--offwhite)',
                                cursor: statusUpdating[row.original.id] ? 'not-allowed' : 'pointer',
                                opacity: statusUpdating[row.original.id] ? 0.5 : 1,
                              }}
                            >
                              <option value="" disabled>
                                {statusUpdating[row.original.id] ? 'Updating...' : `Change from ${STATUS_LABELS[row.original.status]}...`}
                              </option>
                              {(UI_TRANSITIONS[row.original.status] ?? []).map(s => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          ) : (
                            <StatusBadge
                              variant={row.original.status as BookingStatus}
                              label={`${STATUS_LABELS[row.original.status]} (final)`}
                            />
                          )}
                        </div>
                        {statusConflict[row.original.id] && (
                          <div role="alert" style={STATUS_CONFLICT_STYLE}>
                            {statusConflict[row.original.id]}
                          </div>
                        )}

                        {/* Operator notes */}
                        <div style={{ marginTop: '16px' }}>
                          <div style={{
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3em',
                            color: 'var(--warmgrey)',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}>
                            Operator Notes
                            {notesSaving[row.original.id] === 'saving' && (
                              <span style={{ color: 'var(--copper)', fontSize: '10px', letterSpacing: '0.1em' }}>Saving...</span>
                            )}
                            {notesSaving[row.original.id] === 'saved' && (
                              <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>
                            )}
                            {notesSaving[row.original.id] === 'error' && (
                              <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Error saving</span>
                            )}
                          </div>
                          <textarea
                            value={localNotes[row.original.id] ?? row.original.operator_notes ?? ''}
                            onChange={(e) => handleNotesChange(row.original.id, e.target.value)}
                            onBlur={() => handleNotesBlur(row.original.id)}
                            onClick={(e) => e.stopPropagation()}
                            maxLength={2000}
                            placeholder="Add internal notes..."
                            rows={3}
                            style={{
                              width: '100%',
                              background: 'var(--anthracite-mid)',
                              border: '1px solid var(--anthracite-light)',
                              borderRadius: '2px',
                              padding: '8px 12px',
                              fontFamily: 'var(--font-montserrat)',
                              fontSize: '13px',
                              color: 'var(--offwhite)',
                              resize: 'vertical',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                            onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
                          />
                        </div>

                        {/* Driver Price (shown to driver in assignment email) */}
                        <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{
                            fontFamily: 'var(--font-montserrat)', fontSize: '11px', textTransform: 'uppercase',
                            letterSpacing: '0.3em', color: 'var(--warmgrey)', marginBottom: '4px',
                            display: 'flex', alignItems: 'center', gap: '8px',
                          }}>
                            Driver Price (CZK)
                            {driverPriceSaving[row.original.id] === 'saving' && <span style={{ color: 'var(--copper)', fontSize: '10px', letterSpacing: '0.1em' }}>Saving...</span>}
                            {driverPriceSaving[row.original.id] === 'saved' && <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>}
                            {driverPriceSaving[row.original.id] === 'error' && <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Enter a whole number ≥ 0</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={localDriverPrice[row.original.id] ?? ''}
                              onChange={(e) => setLocalDriverPrice(prev => ({ ...prev, [row.original.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDriverPrice(row.original.id, localDriverPrice[row.original.id] ?? '') } }}
                              placeholder="e.g. 1000 — leave empty to hide"
                              style={{
                                width: '220px', height: '32px', background: 'var(--anthracite-mid)',
                                border: '1px solid var(--anthracite-light)', borderRadius: '2px', padding: '0 12px',
                                fontFamily: 'var(--font-montserrat)', fontSize: '13px', color: 'var(--offwhite)',
                                outline: 'none', boxSizing: 'border-box',
                              }}
                              onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
                              onBlur={(e) => { e.target.style.borderColor = 'var(--anthracite-light)'; saveDriverPrice(row.original.id, localDriverPrice[row.original.id] ?? '') }}
                            />
                            <button
                              onClick={() => saveDriverPrice(row.original.id, localDriverPrice[row.original.id] ?? '')}
                              style={{
                                height: '32px', padding: '0 16px', background: 'transparent',
                                border: '1px solid var(--copper)', color: 'var(--copper)', borderRadius: '2px',
                                fontFamily: 'var(--font-montserrat)', fontSize: '11px', letterSpacing: '0.15em',
                                textTransform: 'uppercase', cursor: 'pointer',
                              }}
                            >Save</button>
                          </div>
                          <span style={{
                            fontFamily: 'var(--font-montserrat)', fontSize: '11px', fontWeight: 300,
                            color: 'var(--warmgrey)', marginTop: '4px', display: 'block',
                          }}>Shown to the driver in the assignment email. Empty = no price shown.</span>
                        </div>

                        {/* Driver Assignment */}
                        <DriverAssignmentSection
                          bookingId={row.original.id}
                          bookingStatus={row.original.status}
                          onAssigned={(newStatus) => {
                            setBookings(prev =>
                              prev.map(b => b.id === row.original.id ? { ...b, status: newStatus } : b)
                            )
                          }}
                        />

                        {/* Payment panel (Phase 88 HOLD-07) */}
                        <PaymentPanel
                          bookingId={row.original.id}
                          refreshKey={paymentRefreshKeys[row.original.id] ?? 0}
                          paymentMode={row.original.payment_mode ?? null}
                          onPaymentState={(state) => handlePaymentState(row.original.id, state)}
                        />

                        {/* Payment Link (D-05) */}
                        <PaymentLinkSection
                          bookingId={row.original.id}
                          status={row.original.status}
                          paymentLinkUrl={row.original.payment_link_url}
                          clientEmail={row.original.client_email}
                          amountCzk={row.original.amount_czk}
                          onGenerated={handlePaymentLinkGenerated}
                        />

                        {/* Trip-edit mode (Phase 63 Plan 05) */}
                        <TripEditPanel booking={row.original} patchBooking={patchBooking} onUpdated={handleTripUpdated} />

                        {/* Change history (D-11, FOLLOW-02) */}
                        <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
                          <BookingChangeHistory bookingId={row.original.id} />
                        </div>

                        {/* Cancel Booking button — only for cancellable statuses */}
                        {(row.original.status === 'pending' || row.original.status === 'confirmed') && (
                          <div style={{ marginTop: '16px' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setPendingCancel(row.original) }}
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
                              Cancel Booking
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
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

      {/* Confirm no-show (Phase 87 D-16 a): the only way to reach the terminal no_show status */}
      <ConfirmNoShowModal
        isOpen={noShowTarget !== null}
        bookingId={noShowTarget?.id ?? ''}
        bookingReference={noShowTarget?.reference ?? ''}
        onClose={() => setNoShowTarget(null)}
        onConfirmed={() => { if (noShowTarget) handleNoShowConfirmed(noShowTarget.id) }}
      />

      {/* Cancel dialog (Phase 89 plan 16, D-20): who cancelled is required, the money effect is shown first */}
      <CancelBookingDialog
        booking={pendingCancel}
        onClose={() => setPendingCancel(null)}
        onCancelled={handleCancelled}
        onRefundFailed={handleCancelRefundFailed}
        onCancelledWithoutCase={handleCancelledWithoutCase}
      />
    </div>
  )
}
