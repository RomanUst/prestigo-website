'use client'

import { useState, useEffect } from 'react'
import { StatusBadge } from '@/components/admin/StatusBadge'

interface Driver {
  id: string
  name: string
}

interface Assignment {
  id: string
  driver_id: string
  status: string
  drivers: {
    name: string
    email: string
  }
}

type Mode = 'loading' | 'no-assignment' | 'assigned' | 'reassigning' | 'submitting' | 'error'

interface DriverAssignmentSectionProps {
  bookingId: string
  bookingStatus: string
  onAssigned?: (newStatus: 'assigned') => void
}

function getStatusBadgeVariant(status: string): 'pending' | 'active' | 'inactive' {
  if (status === 'accepted') return 'active'
  if (status === 'declined') return 'inactive'
  return 'pending'
}

export function DriverAssignmentSection({ bookingId, bookingStatus, onAssigned }: DriverAssignmentSectionProps) {
  // All hooks MUST come first — before any conditional return (Rules of Hooks)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  const [mode, setMode] = useState<Mode>('loading')
  const [driversLoading, setDriversLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        // Fetch current assignment
        const assignRes = await fetch(`/api/admin/bookings/${bookingId}/assignment`)
        if (!cancelled) {
          if (assignRes.ok) {
            const data = await assignRes.json()
            setAssignment(data.assignment)
            setMode(data.assignment ? 'assigned' : 'no-assignment')
          } else {
            setMode('no-assignment')
          }
        }
      } catch {
        if (!cancelled) {
          setMode('no-assignment')
        }
      }

      // Fetch drivers list
      try {
        const driversRes = await fetch('/api/admin/drivers')
        if (!cancelled) {
          if (driversRes.ok) {
            const data = await driversRes.json()
            const activeDrivers: Driver[] = (data.data ?? [])
              .filter((d: { id: string; name: string; active?: boolean }) => d.active !== false)
              .map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
            setDrivers(activeDrivers)
          }
          setDriversLoading(false)
        }
      } catch {
        if (!cancelled) {
          setDriversLoading(false)
        }
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [bookingId])

  // D-01 + D-02: hide entirely for terminal statuses — guard placed AFTER hooks
  if (bookingStatus === 'completed' || bookingStatus === 'cancelled') {
    return null
  }

  async function handleAssign() {
    if (!selectedDriverId) return
    setMode('submitting')

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: selectedDriverId }),
      })

      if (res.ok || res.status === 201) {
        // Re-fetch the assignment to get full data with driver name
        const assignRes = await fetch(`/api/admin/bookings/${bookingId}/assignment`)
        if (assignRes.ok) {
          const data = await assignRes.json()
          setAssignment(data.assignment)
          setMode('assigned')
          setSelectedDriverId('')
          onAssigned?.('assigned')   // D-06: notify parent for optimistic table update
        } else {
          setMode('error')
        }
      } else {
        setMode('error')
      }
    } catch {
      setMode('error')
    }
  }

  function handleReassign() {
    setMode('reassigning')
    setSelectedDriverId('')
  }

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 300,
    color: 'var(--warmgrey)',
    textTransform: 'uppercase',
    letterSpacing: '0.3em',
    fontFamily: 'var(--font-montserrat)',
    marginBottom: '8px',
  }

  const selectStyle: React.CSSProperties = {
    height: '32px',
    background: 'var(--anthracite)',
    border: '1px solid var(--anthracite-light)',
    borderRadius: '2px',
    fontFamily: 'var(--font-montserrat)',
    fontSize: '13px',
    color: 'var(--offwhite)',
    appearance: 'none',
    WebkitAppearance: 'none',
    padding: '0 8px',
    cursor: mode === 'submitting' || driversLoading ? 'not-allowed' : 'pointer',
    outline: 'none',
  }

  const assignButtonStyle: React.CSSProperties = {
    border: '1px solid var(--copper)',
    color: 'var(--offwhite)',
    background: 'transparent',
    minHeight: '44px',
    padding: '0 24px',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-montserrat)',
    cursor: 'pointer',
    borderRadius: '2px',
    opacity: mode === 'submitting' ? 0.5 : 1,
  }

  const reassignButtonStyle: React.CSSProperties = {
    border: '1px solid var(--anthracite-light)',
    color: 'var(--warmgrey)',
    background: 'transparent',
    minHeight: '44px',
    padding: '0 24px',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '3px',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-montserrat)',
    cursor: 'pointer',
    borderRadius: '2px',
  }

  const isSelectDisabled = driversLoading || mode === 'submitting'
  const isAssignDisabled = !selectedDriverId || drivers.length === 0 || isSelectDisabled

  if (mode === 'loading') {
    return (
      <div style={{ marginTop: '16px' }}>
        <div style={sectionLabelStyle}>Driver</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select disabled style={selectStyle}>
            <option>Loading...</option>
          </select>
          <button disabled style={{ ...assignButtonStyle, opacity: 0.5 }}>
            Assign
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'assigned' && assignment) {
    return (
      <div style={{ marginTop: '16px' }}>
        <div style={sectionLabelStyle}>Driver</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 300, color: 'var(--offwhite)' }}>
            {assignment.drivers?.name ?? 'Unknown driver'}
          </span>
          <StatusBadge
            variant={getStatusBadgeVariant(assignment.status)}
            label={assignment.status}
          />
          <button
            onClick={handleReassign}
            style={reassignButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--warmgrey)'
              e.currentTarget.style.color = 'var(--offwhite)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--anthracite-light)'
              e.currentTarget.style.color = 'var(--warmgrey)'
            }}
          >
            Reassign
          </button>
        </div>
      </div>
    )
  }

  // no-assignment, reassigning, submitting, error states — all show the select+assign UI
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={sectionLabelStyle}>Driver</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select
          value={selectedDriverId}
          onChange={(e) => {
            setSelectedDriverId(e.target.value)
            if (mode === 'error') setMode('no-assignment')
          }}
          disabled={isSelectDisabled}
          style={selectStyle}
        >
          {driversLoading ? (
            <option value="" disabled>Loading...</option>
          ) : drivers.length === 0 ? (
            <option value="" disabled>No active drivers</option>
          ) : (
            <>
              <option value="" disabled>Select driver...</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </>
          )}
        </select>
        <button
          onClick={handleAssign}
          disabled={isAssignDisabled}
          style={assignButtonStyle}
          onMouseEnter={(e) => {
            if (!isAssignDisabled) {
              e.currentTarget.style.background = 'var(--copper)'
              e.currentTarget.style.color = 'var(--anthracite)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--offwhite)'
          }}
        >
          {mode === 'submitting' ? 'Assigning...' : 'Assign'}
        </button>
      </div>
      {mode === 'error' && (
        <div style={{
          fontSize: '11px',
          fontWeight: 300,
          color: '#f87171',
          marginTop: '4px',
          letterSpacing: '0.05em',
          fontFamily: 'var(--font-montserrat)',
        }}>
          Could not assign driver. Please try again.
        </div>
      )}
    </div>
  )
}
