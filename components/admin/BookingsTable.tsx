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
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { FlightStatusBlock } from './FlightStatusBlock'
import { DriverAssignmentSection } from '@/components/admin/DriverAssignmentSection'

interface Booking {
  id: string
  booking_reference: string
  booking_source: 'online' | 'manual' | 'gnet'
  pickup_date: string
  pickup_time: string
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string
  trip_type: string
  vehicle_class: string
  amount_czk: number
  origin_address: string
  destination_address: string
  origin_lat: number
  origin_lng: number
  destination_lat: number
  destination_lng: number
  passengers: number
  luggage: number
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
  flight_number: string | null
  terminal: string | null
  hours: number | null
  return_date: string | null
  special_requests: string | null
  payment_intent_id: string | null
  status: string
  operator_notes: string | null
  created_at: string
  leg: 'outbound' | 'return' | null
  linked_booking_id: string | null
  outbound_amount_czk: number | null
  return_amount_czk: number | null
  linked_booking: { booking_reference: string } | null
  // Phase 32: flight status persisted columns (migration 033)
  flight_iata: string | null
  flight_status: string | null
  flight_estimated_arrival: string | null
  flight_delay_minutes: number | null
  flight_departure_airport: string | null
  flight_arrival_airport: string | null
  flight_terminal: string | null
}

const vehicleClassMap: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.3em',
        color: 'var(--warmgrey)',
        marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '13px',
        color: 'var(--offwhite)',
      }}>
        {value}
      </div>
    </div>
  )
}

export default function BookingsTable() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [tripType, setTripType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const limit = 20

  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  const [notesSaving, setNotesSaving] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  const notesDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [isMobile, setIsMobile] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  const [pendingCancel, setPendingCancel] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Reset cancel state when modal opens/closes
  useEffect(() => {
    if (!pendingCancel) {
      setCancelling(false)
      setCancelError(null)
    }
  }, [pendingCancel])

  const patchBooking = useCallback(async (body: { id: string; status?: string; operator_notes?: string }) => {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(data.error ?? 'Update failed')
    }
    return res.json()
  }, [])

  const handleStatusChange = useCallback(async (bookingId: string, newStatus: string) => {
    setStatusUpdating(prev => ({ ...prev, [bookingId]: true }))
    try {
      await patchBooking({ id: bookingId, status: newStatus })
      // Optimistic update — mutate only the status field, don't re-fetch
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b))
    } catch (err) {
      // Show alert on failure — simple for v1.3 single-operator admin
      alert(err instanceof Error ? err.message : 'Status update failed')
    } finally {
      setStatusUpdating(prev => ({ ...prev, [bookingId]: false }))
    }
  }, [patchBooking])

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
  }, [patchBooking])

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

  const handleCancel = useCallback(async (booking: Booking) => {
    const cancelBody: { id: string; leg?: 'outbound' | 'return' } = { id: booking.id }
    if (booking.leg !== null && booking.linked_booking_id !== null) {
      cancelBody.leg = booking.leg
    }
    const res = await fetch('/api/admin/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelBody),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(data.error ?? 'Cancel failed')
    }
    // Optimistic update
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
    setPendingCancel(null)
  }, [])

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
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await fetch(`/api/admin/bookings?${params.toString()}`)
      if (!res.ok) {
        console.error('Failed to load bookings', res.status)
        return
      }
      const data = await res.json()
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
    } catch (err) {
      console.error('fetchBookings error', err)
    } finally {
      setLoading(false)
    }
  }, [page, tripType, debouncedSearch, startDate, endDate])

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
      header: 'REF',
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
              background: '#2a2a1a',
              color: '#E8B87A',
              border: '1px solid rgba(184,115,51,0.25)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 8px',
              borderRadius: '2px',
              display: 'inline-block',
            }}>MANUAL</span>
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
              {row.original.leg === 'return' ? 'RETURN' : 'OUTBOUND'}
            </span>
          )}
          {row.original.booking_source === 'gnet' && (
            <span
              data-testid={`gnet-badge-${row.original.id}`}
              style={{
                marginLeft: '8px',
                background: '#1a2a3a',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.25)',
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
              GNET
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'pickup',
      header: 'PICKUP',
      size: 140,
      cell: ({ row }) => (
        <span>{row.original.pickup_date} · {row.original.pickup_time}</span>
      ),
    },
    {
      id: 'client',
      header: 'CLIENT',
      size: 180,
      cell: ({ row }) => (
        <span>{row.original.client_first_name} {row.original.client_last_name}</span>
      ),
    },
    {
      accessorKey: 'trip_type',
      header: 'TYPE',
      size: 100,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{v.charAt(0).toUpperCase() + v.slice(1)}</span>
      },
    },
    {
      accessorKey: 'vehicle_class',
      header: 'VEHICLE',
      size: 120,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{vehicleClassMap[v] ?? v}</span>
      },
    },
    {
      accessorKey: 'amount_czk',
      header: 'AMOUNT',
      size: 100,
      cell: ({ getValue }) => (
        <span style={{ textAlign: 'right', display: 'block' }}>
          {getValue<number>()} CZK
        </span>
      ),
    },
    {
      id: 'status',
      header: 'STATUS',
      size: 120,
      cell: ({ row }) => (
        <StatusBadge
          variant={row.original.status as 'pending' | 'confirmed' | 'completed' | 'cancelled'}
          label={STATUS_LABELS[row.original.status] ?? row.original.status}
        />
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
            background: showDateFilter ? 'rgba(184,115,51,0.09)' : 'transparent',
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
                background: isActive ? 'rgba(184,115,51,0.09)' : 'transparent',
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
          ) : bookings.length === 0 ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--warmgrey)',
            }}>
              <div>No bookings found.</div>
              <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
            </div>
          ) : (
            bookings.map((booking) => {
              const isExpanded = !!expandedCards[booking.id]
              const transitions = VALID_TRANSITIONS[booking.status] ?? []
              return (
                <div
                  key={booking.id}
                  style={{
                    backgroundColor: '#2A2A2D',
                    border: '1px solid #3A3A3F',
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
                      color: booking.booking_source === 'manual' ? '#E8B87A' : 'var(--copper)',
                    }}>
                      {booking.booking_reference}
                      {booking.booking_source === 'manual' && (
                        <span style={{
                          marginLeft: '8px',
                          background: '#2a2a1a',
                          color: '#E8B87A',
                          border: '1px solid rgba(184,115,51,0.25)',
                          fontSize: '11px',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          padding: '2px 6px',
                          borderRadius: '2px',
                        }}>MANUAL</span>
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
                          {booking.leg === 'return' ? 'RETURN' : 'OUTBOUND'}
                        </span>
                      )}
                      {booking.booking_source === 'gnet' && (
                        <span
                          data-testid={`gnet-badge-mobile-${booking.id}`}
                          style={{
                            marginLeft: '8px',
                            background: '#1a2a3a',
                            color: '#60a5fa',
                            border: '1px solid rgba(59,130,246,0.25)',
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
                          GNET
                        </span>
                      )}
                    </span>
                    <StatusBadge
                      variant={booking.status as 'pending' | 'confirmed' | 'completed' | 'cancelled'}
                      label={STATUS_LABELS[booking.status] ?? booking.status}
                    />
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
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                      {transitions.map(s => (
                        <button
                          key={s}
                          disabled={!!statusUpdating[booking.id]}
                          onClick={() => handleStatusChange(booking.id, s)}
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
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #3A3A3F', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
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
                        <DetailField label="ORIGIN" value={booking.origin_address} />
                        <DetailField label="DESTINATION" value={booking.destination_address} />
                        <DetailField label="EMAIL" value={booking.client_email} />
                        <DetailField label="PHONE" value={booking.client_phone} />
                        {booking.flight_number && <DetailField label="FLIGHT" value={booking.flight_number} />}
                        {booking.terminal && <DetailField label="TERMINAL" value={booking.terminal} />}
                        {booking.special_requests && <DetailField label="REQUESTS" value={booking.special_requests} />}
                        <DetailField
                          label="CHILD SEAT"
                          value={booking.extra_child_seat ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="MEET & GREET"
                          value={booking.extra_meet_greet ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="EXTRA LUGGAGE"
                          value={booking.extra_luggage ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        {booking.leg === 'return' && booking.linked_booking?.booking_reference && (
                          <DetailField
                            label="PAIRED OUTBOUND"
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
                            <span style={{ color: '#4ade80', fontSize: '10px' }}>Saved</span>
                          )}
                          {notesSaving[booking.id] === 'error' && (
                            <span style={{ color: '#f87171', fontSize: '10px' }}>Error saving</span>
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
                  <div>No bookings found.</div>
                  <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
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
                          <DetailField label="ORIGIN" value={row.original.origin_address} />
                          <DetailField label="DESTINATION" value={row.original.destination_address} />
                          {row.original.trip_type === 'hourly' && row.original.hours !== null && (
                            <DetailField label="DURATION" value={`${row.original.hours} hours`} />
                          )}
                          <DetailField label="PASSENGERS" value={String(row.original.passengers)} />
                          <DetailField label="LUGGAGE" value={String(row.original.luggage)} />
                          <DetailField
                            label="CHILD SEAT"
                            value={row.original.extra_child_seat
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="MEET & GREET"
                            value={row.original.extra_meet_greet
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="EXTRA LUGGAGE"
                            value={row.original.extra_luggage
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField label="FLIGHT" value={row.original.flight_number ?? '—'} />
                          <DetailField label="TERMINAL" value={row.original.terminal ?? '—'} />
                          <DetailField label="RETURN" value={row.original.return_date ?? '—'} />
                          <DetailField label="NOTES" value={row.original.special_requests ?? '—'} />
                          <DetailField
                            label="PAYMENT ID"
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
                              label="PAIRED OUTBOUND"
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
                          {(VALID_TRANSITIONS[row.original.status] ?? []).length > 0 ? (
                            <select
                              value=""
                              disabled={!!statusUpdating[row.original.id]}
                              onChange={(e) => {
                                if (e.target.value) handleStatusChange(row.original.id, e.target.value)
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
                              {(VALID_TRANSITIONS[row.original.status] ?? []).map(s => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          ) : (
                            <StatusBadge
                              variant={row.original.status as 'pending' | 'confirmed' | 'completed' | 'cancelled'}
                              label={`${STATUS_LABELS[row.original.status]} (final)`}
                            />
                          )}
                        </div>

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
                              <span style={{ color: '#4ade80', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>
                            )}
                            {notesSaving[row.original.id] === 'error' && (
                              <span style={{ color: '#f87171', fontSize: '10px', letterSpacing: '0.1em' }}>Error saving</span>
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

                        {/* Driver Assignment */}
                        <DriverAssignmentSection bookingId={row.original.id} />

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

      {/* CancellationModal */}
      {pendingCancel !== null && (
        <div
          onClick={() => { if (!cancelling) setPendingCancel(null) }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--anthracite-mid)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: '4px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              aria-label="Close"
              onClick={() => { if (!cancelling) setPendingCancel(null) }}
              style={{
                position: 'absolute',
                top: '24px',
                right: '24px',
                background: 'none',
                border: 'none',
                color: 'var(--warmgrey)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>

            {/* Heading */}
            <h2 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '26px',
              fontWeight: 300,
              lineHeight: 1.2,
              color: 'var(--offwhite)',
              margin: 0,
            }}>
              Cancel Booking
            </h2>

            {pendingCancel.payment_intent_id !== null && pendingCancel.leg !== null && pendingCancel.linked_booking_id !== null && pendingCancel.booking_source !== 'gnet' ? (
              /* Variant C: Stripe-paid round-trip leg — partial refund */
              (() => {
                const legAmountCzk = pendingCancel.leg === 'outbound'
                  ? pendingCancel.outbound_amount_czk
                  : pendingCancel.return_amount_czk
                const pairedLegLabel = pendingCancel.leg === 'outbound' ? 'return' : 'outbound'
                const pairedRef = pendingCancel.linked_booking?.booking_reference ?? '—'
                return (
                  <>
                    <p style={{
                      fontSize: '13px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 300,
                      color: 'var(--warmgrey)',
                      marginTop: '16px',
                      lineHeight: 1.8,
                    }}>
                      This booking was paid online. Cancelling will issue a partial refund for this leg only. This action cannot be undone.
                    </p>
                    <p style={{
                      fontSize: '13px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 500,
                      color: 'var(--offwhite)',
                      marginTop: '12px',
                    }}>
                      Refund: {legAmountCzk ?? '—'} CZK for this leg only.
                    </p>
                    <p style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      color: '#f87171',
                      marginTop: '8px',
                    }}>
                      The paired {pairedLegLabel} booking {pairedRef} will NOT be affected and remains active.
                    </p>
                    <p style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      color: '#f87171',
                      marginTop: '8px',
                    }}>
                      PARTIAL STRIPE REFUND WILL BE ISSUED FOR THIS LEG.
                    </p>
                  </>
                )
              })()
            ) : pendingCancel.payment_intent_id !== null && pendingCancel.booking_source !== 'gnet' ? (
              /* Variant A: Stripe-paid one-way — full refund (unchanged) */
              <>
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  This booking was paid online. Cancelling will issue a full refund to the client&apos;s card. This action cannot be undone.
                </p>
                <p style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  color: '#f87171',
                  marginTop: '12px',
                }}>
                  A FULL STRIPE REFUND WILL BE ISSUED.
                </p>
              </>
            ) : (
              /* Variant B: GNet or Manual */
              pendingCancel.booking_source === 'gnet' ? (
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  This booking was received from a GNet partner. Billing is handled directly by the GNet partner. Cancelling will mark the booking as cancelled and push the CANCEL status to GNet.
                </p>
              ) : (
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  This booking was created manually and has no payment record. Cancelling will mark the booking as cancelled.
                </p>
              )
            )}

            {/* Action buttons */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
            }}>
              <button
                onClick={() => setPendingCancel(null)}
                disabled={cancelling}
                style={{
                  border: '1px solid var(--anthracite-light)',
                  color: 'var(--warmgrey)',
                  background: 'transparent',
                  minHeight: '44px',
                  padding: '0 24px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  borderRadius: '2px',
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  opacity: cancelling ? 0.7 : 1,
                }}
              >
                Keep Booking
              </button>
              <button
                onClick={async () => {
                  setCancelling(true)
                  setCancelError(null)
                  try {
                    await handleCancel(pendingCancel)
                  } catch (err) {
                    setCancelError(err instanceof Error ? err.message : 'Cancel failed')
                  } finally {
                    setCancelling(false)
                  }
                }}
                disabled={cancelling}
                style={{
                  border: '1px solid var(--copper)',
                  color: 'var(--copper)',
                  background: 'transparent',
                  minHeight: '44px',
                  padding: '0 24px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  borderRadius: '2px',
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  opacity: cancelling ? 0.7 : 1,
                }}
              >
                {cancelling
                  ? 'Cancelling...'
                  : pendingCancel.payment_intent_id !== null && pendingCancel.booking_source !== 'gnet'
                    ? 'Confirm Cancel + Refund'
                    : 'Cancel Booking'}
              </button>
            </div>

            {/* Error message */}
            {cancelError && (
              <p style={{
                fontSize: '11px',
                fontFamily: 'var(--font-montserrat)',
                fontWeight: 300,
                color: '#f87171',
                marginTop: '8px',
                textAlign: 'right',
              }}>
                {cancelError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
