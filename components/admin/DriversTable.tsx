'use client'
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Driver } from './DriverForm'

type DriversTableProps = {
  drivers: Driver[]
  onEdit: (driver: Driver) => void
  onDeleted: (id: string) => void
}

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: '#9A958F',
  padding: '10px 12px',
  textAlign: 'left',
}

const cellStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 300,
  color: '#F5F2EE',
  padding: '10px 12px',
  letterSpacing: '0.03em',
  borderBottom: '1px solid #3A3A3F',
}

export function DriversTable({ drivers, onEdit, onDeleted }: DriversTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<Record<string, string>>({})

  function handleDeleteClick(id: string) {
    setConfirmDeleteId(id)
    setDeleteError(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setTimeout(() => {
      setConfirmDeleteId(prev => (prev === id ? null : prev))
    }, 3000)
  }

  async function handleDeleteConfirm(id: string) {
    try {
      const res = await fetch(`/api/admin/drivers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setConfirmDeleteId(null)
        setDeleteError(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        onDeleted(id)
      } else {
        const json = await res.json()
        if (res.status === 409) {
          setDeleteError(prev => ({
            ...prev,
            [id]: json.error ?? 'Cannot delete — driver has an active assignment.',
          }))
        } else {
          setDeleteError(prev => ({
            ...prev,
            [id]: 'Something went wrong. Please try again.',
          }))
        }
      }
    } catch {
      setDeleteError(prev => ({
        ...prev,
        [id]: 'Something went wrong. Please try again.',
      }))
    }
  }

  function handleDeleteCancel(id: string) {
    setConfirmDeleteId(null)
    setDeleteError(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  if (drivers.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          border: '1px solid #3A3A3F',
          borderRadius: '8px',
          backgroundColor: '#2A2A2D',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: '#F5F2EE',
            marginBottom: '8px',
          }}
        >
          No drivers yet.
        </div>
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: '#9A958F',
          }}
        >
          Add your first driver to start assigning them to bookings.
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: '#2A2A2D',
        border: '1px solid #3A3A3F',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #3A3A3F' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Vehicle Info</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map(driver => (
              <tr key={driver.id}>
                <td style={cellStyle}>{driver.name}</td>
                <td style={cellStyle}>{driver.email}</td>
                <td style={cellStyle}>
                  {driver.phone || (
                    <span style={{ color: '#9A958F' }}>—</span>
                  )}
                </td>
                <td style={cellStyle}>
                  {driver.vehicle_info || (
                    <span style={{ color: '#9A958F' }}>—</span>
                  )}
                </td>
                <td style={{ ...cellStyle, padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {/* Edit button */}
                      <button
                        onClick={() => onEdit(driver)}
                        aria-label="Edit driver"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '44px',
                          minHeight: '44px',
                          padding: '0',
                          color: '#9A958F',
                          transition: 'color 150ms ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#F5F2EE' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9A958F' }}
                      >
                        <Pencil size={16} />
                      </button>

                      {/* Delete button / confirm area */}
                      {confirmDeleteId === driver.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => handleDeleteConfirm(driver.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '44px',
                              minHeight: '44px',
                              padding: '0 8px',
                              fontFamily: 'var(--font-montserrat)',
                              fontSize: '11px',
                              fontWeight: 400,
                              letterSpacing: '0.08em',
                              color: '#f87171',
                            }}
                          >
                            CONFIRM?
                          </button>
                          <button
                            onClick={() => handleDeleteCancel(driver.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-montserrat)',
                              fontSize: '11px',
                              fontWeight: 300,
                              color: '#9A958F',
                              minHeight: '44px',
                              padding: '0 4px',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDeleteClick(driver.id)}
                          aria-label="Delete driver"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '44px',
                            minHeight: '44px',
                            padding: '0',
                            color: '#9A958F',
                            transition: 'color 150ms ease',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9A958F' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Inline 409 / error message */}
                    {deleteError[driver.id] && (
                      <div
                        style={{
                          fontFamily: 'var(--font-montserrat)',
                          fontSize: '11px',
                          fontWeight: 400,
                          color: '#f87171',
                          padding: '0 8px',
                          maxWidth: '240px',
                        }}
                      >
                        {deleteError[driver.id]}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
