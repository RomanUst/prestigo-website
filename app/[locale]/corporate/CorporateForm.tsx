'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type FormState = 'idle' | 'sending' | 'success' | 'error'

// Option values sent to the API are the raw range strings — never translated.
// Only the visible label ("{count} trips/month") is localized (Corporate.form.tripsPerMonth).
const TRIPS_OPTIONS = ['1–5', '6–15', '16–30', '30+'] as const

export default function CorporateForm() {
  const t = useTranslations('Corporate.form')
  const [form, setForm] = useState({ company: '', name: '', email: '', trips: '', notes: '', website: '' })
  const [state, setState] = useState<FormState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    setErrorMessage(null)
    try {
      const res = await fetch('/api/corporate-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setState('success')
        setForm({ company: '', name: '', email: '', trips: '', notes: '', website: '' })
        return
      }
      if (res.status === 429) setErrorMessage(t('errors.rateLimited'))
      else if (res.status === 400) setErrorMessage(t('errors.invalidInput'))
      else setErrorMessage(t('errors.generic'))
      setState('error')
    } catch {
      setErrorMessage(t('errors.generic'))
      setState('error')
    }
  }

  const inputClass = 'w-full bg-anthracite-mid border border-anthracite-light px-4 py-3.5 font-body font-light text-[12px] text-offwhite placeholder-warmgrey/60 tracking-wide focus:outline-none focus:border-copper/60 transition-colors'
  const labelClass = 'block font-body font-light text-[10px] tracking-[0.18em] uppercase text-warmgrey mb-2'

  if (state === 'success') {
    return (
      <div className="border border-anthracite-light p-10 flex flex-col gap-6">
        <span className="w-10 h-10 rounded-full border border-copper/40 flex items-center justify-center">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--copper)' }}>
            <path d="M3 8l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <h3 className="font-display font-light text-[22px] text-offwhite mb-2">{t('success.heading')}</h3>
          <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>
            {t('success.body')}<br />
            {t('success.followUp')}
          </p>
        </div>
        <button onClick={() => setState('idle')} className="font-body font-light text-[10px] tracking-[0.18em] uppercase hover:text-offwhite transition-colors" style={{ color: 'var(--copper)' }}>
          {t('success.another')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-anthracite-light p-8 md:p-10 flex flex-col gap-6" noValidate>
      <div>
        <p className="font-display font-light text-[22px] text-offwhite mb-1">{t('heading')}</p>
        <p className="body-text text-[11px]">{t('subheading')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="company" className={labelClass}>{t('companyLabel')} <span style={{ color: 'var(--copper)' }}>*</span></label>
          <input id="company" type="text" required value={form.company} onChange={set('company')} placeholder={t('companyPlaceholder')} className={inputClass} />
        </div>
        <div>
          <label htmlFor="name" className={labelClass}>{t('contactNameLabel')} <span style={{ color: 'var(--copper)' }}>*</span></label>
          <input id="name" type="text" required value={form.name} onChange={set('name')} placeholder={t('contactNamePlaceholder')} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className={labelClass}>{t('emailLabel')} <span style={{ color: 'var(--copper)' }}>*</span></label>
          <input id="email" type="email" required value={form.email} onChange={set('email')} placeholder={t('emailPlaceholder')} className={inputClass} />
        </div>
        <div>
          <label htmlFor="trips" className={labelClass}>{t('tripsLabel')}</label>
          <select id="trips" value={form.trips} onChange={set('trips')} className={`${inputClass} appearance-none cursor-pointer`}>
            <option value="" disabled>{t('tripsPlaceholder')}</option>
            {TRIPS_OPTIONS.map(v => <option key={v} value={v}>{t('tripsPerMonth', { count: v })}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="notes" className={labelClass}>{t('notesLabel')}</label>
        <textarea id="notes" rows={4} value={form.notes} onChange={set('notes')} placeholder={t('notesPlaceholder')} className={`${inputClass} resize-none`} />
      </div>
      {/* Honeypot — hidden from real users */}
      <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0, opacity: 0 }} aria-hidden="true" />
      {state === 'error' && errorMessage && (
        <div className="border border-anthracite-light p-4 mb-4" style={{ color: 'var(--copper)' }}>{errorMessage}</div>
      )}
      <button type="submit" disabled={state === 'sending'} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed self-start">
        {state === 'sending' ? t('sending') : t('submit')}
      </button>
    </form>
  )
}
