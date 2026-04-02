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

interface Booking {
  id: string
  booking_reference: string
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
  payment_intent_id: string
  created_at: string
}

const vehicleClassMap: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
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
      if (res.ok) {
        const data = await res.json()
        setBookings(data.bookings ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, tripType, debouncedSearch, startDate, endDate])

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
      header: 'REF',
      size: 120,
      cell: ({ getValue }) => (
        <span style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          color: 'var(--copper)',
        }}>
          {getValue<string>()}
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

      {/* Table */}
      <div style={{
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
                              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                                {row.original.payment_intent_id.length > 24
                                  ? `${row.original.payment_intent_id.slice(0, 24)}...`
                                  : row.original.payment_intent_id}
                              </span>
                            }
                          />
                        </div>
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
    </div>
  )
}
