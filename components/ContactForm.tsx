'use client'

import { useState } from 'react'

const services = [
  'Airport Transfer',
  'Intercity Route',
  'Corporate Account',
  'VIP & Events',
  'Group Transfer',
  'Other',
]

type FormState = 'idle' | 'sending' | 'success' | 'error'

export default function ContactForm({ whatsappNumber }: { whatsappNumber: string }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', service: '', message: '' })
  const [state, setState] = useState<FormState>('idle')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')

    // Build WhatsApp message and open in new tab as "send"
    const msg = encodeURIComponent(
      `Hello PRESTIGO,\n\nName: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone || '—'}\nService: ${form.service || '—'}\n\n${form.message}`
    )
    window.open(`https://wa.me/${whatsappNumber}?text=${msg}`, '_blank')

    // Simulate success
    setTimeout(() => {
      setState('success')
      setForm({ name: '', email: '', phone: '', service: '', message: '' })
    }, 400)
  }

  const inputClass =
    'w-full bg-anthracite-mid border border-anthracite-light px-4 py-3.5 font-body font-light text-[12px] text-offwhite placeholder-warmgrey/60 tracking-wide focus:outline-none focus:border-copper/60 transition-colors'

  const labelClass = 'block font-body font-light text-[10px] tracking-[0.18em] uppercase text-warmgrey mb-2'

  if (state === 'success') {
    return (
      <div className="border border-anthracite-light p-10 flex flex-col items-start gap-6">
        <span className="w-10 h-10 rounded-full border border-copper/40 flex items-center justify-center">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--copper)' }}>
            <path d="M3 8l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <div>
          <h3 className="font-display font-light text-[22px] text-offwhite mb-2">Message sent.</h3>
          <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>
            Your request has been forwarded to our team via WhatsApp.<br />
            We will get back to you shortly.
          </p>
        </div>
        <button
          onClick={() => setState('idle')}
          className="font-body font-light text-[10px] tracking-[0.18em] uppercase hover:text-offwhite transition-colors"
          style={{ color: 'var(--copper)' }}
        >
          Send another message →
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-anthracite-light p-8 md:p-10 flex flex-col gap-6" noValidate>
      <div>
        <p className="font-display font-light text-[22px] text-offwhite mb-1">Send us a message</p>
        <p className="body-text text-[11px]">We respond within 30 minutes during business hours.</p>
      </div>

      {/* Name + Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className={labelClass}>Name <span style={{ color: 'var(--copper)' }}>*</span></label>
          <input
            id="name"
            type="text"
            required
            value={form.name}
            onChange={set('name')}
            placeholder="Your full name"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email <span style={{ color: 'var(--copper)' }}>*</span></label>
          <input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={set('email')}
            placeholder="your@email.com"
            className={inputClass}
          />
        </div>
      </div>

      {/* Phone + Service */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className={labelClass}>Phone</label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+420 725 986 855"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="service" className={labelClass}>Service</label>
          <select
            id="service"
            value={form.service}
            onChange={set('service')}
            className={`${inputClass} appearance-none cursor-pointer`}
          >
            <option value="" disabled>Select service…</option>
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Message */}
      <div>
        <label htmlFor="message" className={labelClass}>Message <span style={{ color: 'var(--copper)' }}>*</span></label>
        <textarea
          id="message"
          required
          rows={5}
          value={form.message}
          onChange={set('message')}
          placeholder="Describe your transfer, dates, number of passengers…"
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Submit */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <button
          type="submit"
          disabled={state === 'sending'}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'sending' ? 'Sending…' : 'Send message'}
        </button>
        <p className="font-body font-light text-[10px] tracking-wide text-warmgrey/70">
          Message will be forwarded via WhatsApp
        </p>
      </div>
    </form>
  )
}
