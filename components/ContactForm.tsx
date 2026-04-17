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

// Fires a GA4 event — safe whether gtag.js has loaded yet or not. The dataLayer
// fallback is replayed by gtag.js once it initialises, so events submitted
// before the tag is ready are never lost.
function pushGA4Event(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  if (typeof w.gtag === 'function') {
    w.gtag('event', eventName, params)
    return
  }
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push(['event', eventName, params])
  w.dataLayer.push({ event: eventName, ...params })
}

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', service: '', message: '' })
  const [state, setState] = useState<FormState>('idle')
  const [formStartFired, setFormStartFired] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    // Fire form_start once on the user's first real interaction. GA4 Enhanced
    // Measurement autocaptures this for most forms but misses Next.js SPA forms
    // because focus/input events are attached before gtag.js initialises.
    if (!formStartFired) {
      setFormStartFired(true)
      pushGA4Event('form_start', { form_id: 'contact', form_name: 'Contact form' })
    }
    setForm(f => ({ ...f, [k]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          service: form.service || undefined,
          message: form.message,
        }),
      })

      if (!res.ok) throw new Error('Failed')

      // GA4 key event: generate_lead fires only after server confirms the
      // message was accepted — keeps lead counts honest. form_submit goes
      // alongside for funnel-continuity reporting.
      pushGA4Event('form_submit', { form_id: 'contact', form_name: 'Contact form' })
      pushGA4Event('generate_lead', {
        lead_source: 'contact_form',
        service: form.service || 'unspecified',
        currency: 'EUR',
        value: 0,
      })

      setState('success')
      setForm({ name: '', email: '', phone: '', service: '', message: '' })
      setFormStartFired(false)
    } catch {
      setState('error')
    }
  }

  const inputClass =
    'w-full bg-anthracite-mid border border-anthracite-light px-4 py-3.5 font-body font-light text-[12px] text-offwhite placeholder-warmgrey/60 tracking-wide focus:outline-none focus:border-copper/60 transition-colors'

  const labelClass = 'block font-body font-light text-[10px] tracking-[0.18em] uppercase text-warmgrey mb-2'

  if (state === 'error') {
    return (
      <div className="border border-anthracite-light p-10 flex flex-col items-start gap-6">
        <div>
          <h3 className="font-display font-light text-[22px] text-offwhite mb-2">Something went wrong.</h3>
          <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>
            We could not send your message. Please try again or contact us directly at<br />
            <span style={{ color: 'var(--copper)' }}>info@rideprestigo.com</span>
          </p>
        </div>
        <button
          onClick={() => setState('idle')}
          className="font-body font-light text-[10px] tracking-[0.18em] uppercase hover:text-offwhite transition-colors"
          style={{ color: 'var(--copper)' }}
        >
          Try again →
        </button>
      </div>
    )
  }

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
            Your message has been received by our team.<br />
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
          We respond within 30 minutes during business hours.
        </p>
      </div>
    </form>
  )
}
