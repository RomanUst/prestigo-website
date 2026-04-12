'use client'
import { useState, useEffect, useRef } from 'react'

const inputBaseStyle: React.CSSProperties = {
  backgroundColor: '#2A2A2D',
  border: '1px solid #3A3A3F',
  color: '#F5F2EE',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 300,
  letterSpacing: '0.03em',
  padding: '8px 12px',
  minHeight: '44px',
  borderRadius: '4px',
  outline: 'none',
  width: '100%',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: '#9A958F',
  marginBottom: '4px',
}

const errorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  color: '#f87171',
  marginTop: '4px',
}

export interface Driver {
  id: string
  name: string
  email: string
  phone: string
  vehicle_info: string | null
  created_at: string
}

type DriverFormProps = {
  driver?: Driver | null
  onSaved: (driver: Driver) => void
  onClose: () => void
}

export function DriverForm({ driver, onSaved, onClose }: DriverFormProps) {
  const [name, setName] = useState(driver?.name ?? '')
  const [email, setEmail] = useState(driver?.email ?? '')
  const [phone, setPhone] = useState(driver?.phone ?? '')
  const [vehicleInfo, setVehicleInfo] = useState(driver?.vehicle_info ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Focus first input on mount
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Re-populate fields when driver prop changes (edit mode re-open)
  useEffect(() => {
    setName(driver?.name ?? '')
    setEmail(driver?.email ?? '')
    setPhone(driver?.phone ?? '')
    setVehicleInfo(driver?.vehicle_info ?? '')
    setNameError(null)
    setEmailError(null)
    setFormError(null)
  }, [driver])

  function validateEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNameError(null)
    setEmailError(null)
    setFormError(null)

    let hasError = false
    if (!name.trim()) {
      setNameError('Name is required.')
      hasError = true
    }
    if (!validateEmail(email)) {
      setEmailError('Enter a valid email address.')
      hasError = true
    }
    if (hasError) return

    setSaving(true)
    try {
      const isEdit = Boolean(driver)
      const url = isEdit ? `/api/admin/drivers/${driver!.id}` : '/api/admin/drivers'
      const method = isEdit ? 'PATCH' : 'POST'

      const body: Record<string, string | null> = { name: name.trim(), email: email.trim() }
      if (phone.trim() !== '' || isEdit) body.phone = phone.trim() || null
      if (vehicleInfo.trim() !== '' || isEdit) body.vehicle_info = vehicleInfo.trim() || null

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()

      if (!res.ok) {
        setFormError(json.error ?? 'Something went wrong. Please try again.')
        return
      }

      const saved = Array.isArray(json.data) ? json.data[0] : json.data
      onSaved(saved as Driver)
      onClose()
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const isEdit = Boolean(driver)

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Name */}
        <div>
          <label style={labelStyle}>Name</label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={200}
            style={inputBaseStyle}
          />
          {nameError && <div style={errorStyle}>{nameError}</div>}
        </div>

        {/* Email */}
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            maxLength={200}
            style={inputBaseStyle}
          />
          {emailError && <div style={errorStyle}>{emailError}</div>}
        </div>

        {/* Phone */}
        <div>
          <label style={labelStyle}>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            maxLength={200}
            style={inputBaseStyle}
          />
        </div>

        {/* Vehicle Info */}
        <div>
          <label style={labelStyle}>Vehicle Info</label>
          <input
            type="text"
            value={vehicleInfo}
            onChange={e => setVehicleInfo(e.target.value)}
            maxLength={200}
            style={inputBaseStyle}
          />
        </div>

        {/* Form-level error */}
        {formError && <div style={errorStyle}>{formError}</div>}

        {/* Button row */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9A958F',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              backgroundColor: '#B87333',
              color: '#F5F2EE',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 24px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 400,
              cursor: saving ? 'not-allowed' : 'pointer',
              minHeight: '44px',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '...' : isEdit ? 'Save Changes' : 'Add Driver'}
          </button>
        </div>
      </div>
    </form>
  )
}
