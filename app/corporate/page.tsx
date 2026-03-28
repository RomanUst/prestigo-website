'use client'

import { useState } from 'react'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

type FormState = 'idle' | 'sending' | 'success'

const WHATSAPP_NUMBER = '420725986855'

export default function CorporatePage() {
  const [form, setForm] = useState({ company: '', name: '', email: '', trips: '', notes: '' })
  const [state, setState] = useState<FormState>('idle')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    const msg = encodeURIComponent(
      `Hello PRESTIGO,\n\nCorporate Account Request:\nCompany: ${form.company}\nContact: ${form.name}\nEmail: ${form.email}\nEstimated monthly trips: ${form.trips || '—'}\nNotes: ${form.notes || '—'}`
    )
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank')
    setTimeout(() => {
      setState('success')
      setForm({ company: '', name: '', email: '', trips: '', notes: '' })
    }, 400)
  }

  const inputClass = 'w-full bg-anthracite-mid border border-anthracite-light px-4 py-3.5 font-body font-light text-[12px] text-offwhite placeholder-warmgrey/60 tracking-wide focus:outline-none focus:border-copper/60 transition-colors'
  const labelClass = 'block font-body font-light text-[10px] tracking-[0.18em] uppercase text-warmgrey mb-2'

  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Corporate Accounts</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Your company travels.<br />
            <span className="display-italic">We make it effortless.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            PRESTIGO corporate accounts are designed for companies that move people regularly and expect every detail handled. Fixed rates, monthly invoicing, a named account manager, and a fleet that reflects the standard your organisation holds itself to.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {[
              {
                title: 'Monthly Invoicing',
                body: 'One invoice. All trips. All departments. Sent on the first of every month, formatted for your accounts team, with full trip breakdown.',
              },
              {
                title: 'Account Manager',
                body: 'A single contact who knows your company, your preferences, and your travellers. Available by phone, email, or WhatsApp.',
              },
              {
                title: 'Priority Dispatch',
                body: 'Corporate accounts get priority allocation. Same-day bookings, last-minute changes, and early-morning airport runs — handled.',
              },
              {
                title: 'Reporting Dashboard',
                body: 'View all bookings, travellers, costs, and routes in one place. Export for expense reporting at any time.',
              },
            ].map((b) => (
              <div key={b.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{b.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For whom */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">Built for…</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: 'Prague-based companies',
                body: 'Transferring executives, clients, and VIP guests daily from Václav Havel Airport.',
              },
              {
                title: 'International companies',
                body: 'With staff visiting Prague regularly who need a reliable, bookable ground transport partner.',
              },
              {
                title: 'Event & conference organisers',
                body: 'Coordinating multi-vehicle group movements for delegations and incentive travel.',
              },
            ].map((c) => (
              <div key={c.title} className="border border-anthracite-light p-8">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{c.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-anthracite py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Apply', body: 'Fill in the form below. We\'ll set up your account within 24 hours.' },
              { step: '02', title: 'Book', body: 'Your team books online or via the account manager. No per-trip approval needed.' },
              { step: '03', title: 'Invoice', body: 'One monthly invoice. Pay by bank transfer or card. Full GDPR-compliant data handling.' },
            ].map((s) => (
              <div key={s.step} className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form + Quote */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">

          {/* Testimonial */}
          <div className="md:col-span-2 flex flex-col justify-center">
            <span className="copper-line mb-8 block" />
            <blockquote className="font-display font-light italic text-[22px] md:text-[26px] text-offwhite leading-[1.5]">
              "Three managing directors, two airports, one invoice. PRESTIGO made it simple."
            </blockquote>
            <p className="body-text text-[11px] mt-6">S. Novák · Senior Partner · Prague</p>
          </div>

          {/* Form */}
          <div className="md:col-span-3">
            {state === 'success' ? (
              <div className="border border-anthracite-light p-10 flex flex-col gap-6">
                <span className="w-10 h-10 rounded-full border border-copper/40 flex items-center justify-center">
                  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--copper)' }}>
                    <path d="M3 8l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <h3 className="font-display font-light text-[22px] text-offwhite mb-2">Request received.</h3>
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>
                    Your corporate account request has been forwarded to our team.<br />
                    We will have your account ready within 24 hours.
                  </p>
                </div>
                <button onClick={() => setState('idle')} className="font-body font-light text-[10px] tracking-[0.18em] uppercase hover:text-offwhite transition-colors" style={{ color: 'var(--copper)' }}>
                  Submit another request →
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="border border-anthracite-light p-8 md:p-10 flex flex-col gap-6" noValidate>
                <div>
                  <p className="font-display font-light text-[22px] text-offwhite mb-1">Set up your account</p>
                  <p className="body-text text-[11px]">We'll review your requirements and have your account ready within 24 hours.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="company" className={labelClass}>Company name <span style={{ color: 'var(--copper)' }}>*</span></label>
                    <input id="company" type="text" required value={form.company} onChange={set('company')} placeholder="ACME Corp" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="name" className={labelClass}>Contact name & role <span style={{ color: 'var(--copper)' }}>*</span></label>
                    <input id="name" type="text" required value={form.name} onChange={set('name')} placeholder="John Smith, CFO" className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="email" className={labelClass}>Email <span style={{ color: 'var(--copper)' }}>*</span></label>
                    <input id="email" type="email" required value={form.email} onChange={set('email')} placeholder="john@company.com" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="trips" className={labelClass}>Estimated monthly trips</label>
                    <select id="trips" value={form.trips} onChange={set('trips')} className={`${inputClass} appearance-none cursor-pointer`}>
                      <option value="" disabled>Select range…</option>
                      {['1–5', '6–15', '16–30', '30+'].map(v => <option key={v} value={v}>{v} trips/month</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="notes" className={labelClass}>Notes</label>
                  <textarea id="notes" rows={4} value={form.notes} onChange={set('notes')} placeholder="Preferred vehicles, recurring routes, special requirements…" className={`${inputClass} resize-none`} />
                </div>
                <button type="submit" disabled={state === 'sending'} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed self-start">
                  {state === 'sending' ? 'Sending…' : 'Submit Request'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
