'use client'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/admin/Modal'
import { DriverForm } from '@/components/admin/DriverForm'
import type { Driver } from '@/components/admin/DriverForm'
import { DriversTable } from '@/components/admin/DriversTable'

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)

  useEffect(() => {
    async function fetchDrivers() {
      try {
        const res = await fetch('/api/admin/drivers')
        if (res.ok) {
          const json = await res.json()
          setDrivers(json.data ?? [])
        }
      } finally {
        setLoading(false)
      }
    }
    fetchDrivers()
  }, [])

  function handleDriverSaved(driver: Driver) {
    setDrivers(prev => {
      const exists = prev.find(d => d.id === driver.id)
      return exists
        ? prev.map(d => d.id === driver.id ? driver : d)
        : [driver, ...prev]
    })
    setModalOpen(false)
    setEditingDriver(null)
  }

  function handleDriverDeleted(id: string) {
    setDrivers(prev => prev.filter(d => d.id !== id))
  }

  function handleEdit(driver: Driver) {
    setEditingDriver(driver)
    setModalOpen(true)
  }

  function handleAddClick() {
    setEditingDriver(null)
    setModalOpen(true)
  }

  function handleModalClose() {
    setModalOpen(false)
    setEditingDriver(null)
  }

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '32px',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '26px',
              fontWeight: 300,
              color: '#F5F2EE',
              margin: 0,
            }}
          >
            Drivers
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 300,
              color: '#9A958F',
              letterSpacing: '0.03em',
              marginTop: '4px',
              margin: '4px 0 0 0',
            }}
          >
            Manage the driver roster. Add, edit, or remove drivers.
          </p>
        </div>
        <button
          onClick={handleAddClick}
          style={{
            backgroundColor: '#B87333',
            color: '#F5F2EE',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 24px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          Add Driver
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: '#F5F2EE',
            opacity: 0.4,
          }}
        >
          ...
        </div>
      ) : (
        <DriversTable
          drivers={drivers}
          onEdit={handleEdit}
          onDeleted={handleDriverDeleted}
        />
      )}

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={handleModalClose}
        title={editingDriver ? 'Edit Driver' : 'Add Driver'}
      >
        <DriverForm
          driver={editingDriver}
          onSaved={handleDriverSaved}
          onClose={handleModalClose}
        />
      </Modal>
    </div>
  )
}
