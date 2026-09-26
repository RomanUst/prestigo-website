'use client'
import { useState, useEffect, useRef } from 'react'

const inputBaseStyle: React.CSSProperties = {
  backgroundColor: '#36363B',
  border: '1px solid #4E4E56',
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
  color: '#CFC9C2',
  marginBottom: '4px',
}

const errorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  color: '#f87171',
  marginTop: '4px',
}

type AccountFormProps = {
  onCreated: (userId: string) => void
  onClose: () => void
}

export function AccountForm({ onCreated, onClose }: AccountFormProps) {
  const [accountType, setAccountType] = useState<'corporate' | 'personal'>('corporate')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [ico, setIco] = useState('')
  const [vatId, setVatId] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setFormError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Enter a valid email address.')
      return
    }
    if (accountType === 'corporate' && !companyName.trim()) {
      setFormError('Company name is required for corporate accounts.')
      return
    }

    submittingRef.current = true
    setSaving(true)
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          account_type: accountType,
          company_name: companyName.trim(),
          full_name: fullName.trim(),
          phone: phone.trim(),
          ico: ico.trim(),
          vat_id: vatId.trim(),
          billing_address: billingAddress.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(json.error ?? 'Something went wrong. Please try again.')
        return
      }
      onCreated(json.user_id as string)
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts: { type?: string; max?: number; ref?: React.Ref<HTMLInputElement> } = {},
  ) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        ref={opts.ref}
        type={opts.type ?? 'text'}
        value={value}
        onChange={e => set(e.target.value)}
        maxLength={opts.max ?? 200}
        style={inputBaseStyle}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Type</label>
          <select
            value={accountType}
            onChange={e => setAccountType(e.target.value as 'corporate' | 'personal')}
            style={{ ...inputBaseStyle, appearance: 'none' }}
          >
            <option value="corporate">Corporate</option>
            <option value="personal">Personal</option>
          </select>
        </div>

        {field('Email', email, setEmail, { type: 'email', ref: emailRef })}
        {accountType === 'corporate' && field('Company name', companyName, setCompanyName)}
        {field('Contact name', fullName, setFullName)}
        {field('Phone', phone, setPhone, { type: 'tel', max: 50 })}
        {accountType === 'corporate' && field('Reg. no. / IČO', ico, setIco, { max: 50 })}
        {accountType === 'corporate' && field('VAT ID', vatId, setVatId, { max: 50 })}

        <div>
          <label style={labelStyle}>Billing address</label>
          <textarea
            value={billingAddress}
            onChange={e => setBillingAddress(e.target.value)}
            maxLength={500}
            rows={3}
            style={{ ...inputBaseStyle, resize: 'vertical' }}
          />
        </div>

        {formError && <div style={errorStyle}>{formError}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#CFC9C2',
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
            {saving ? '...' : 'Create Account'}
          </button>
        </div>
      </div>
    </form>
  )
}
