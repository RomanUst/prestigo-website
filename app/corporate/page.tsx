'use client'

import { useState } from 'react'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

type FormState = 'idle' | 'sending' | 'success'

const WHATSAPP_NUMBER = '420725986855'


const corporateFaqs = [
  {
    q: 'What is a PRESTIGO corporate chauffeur account?',
    a: 'A PRESTIGO corporate account is a dedicated billing and dispatch relationship for companies that use chauffeur transport in Prague on a regular basis. Instead of paying per trip with corporate cards and chasing receipts for expense reports, your travellers book against a central account by name, every trip is captured with a unique reference, and everything is invoiced once a month in a single consolidated statement with full trip-level breakdown. A named account manager handles your company&rsquo;s preferences, recurring routes, and exception requests — same-day changes, after-hours bookings, protocol requirements — without routing through public dispatch. Accounts are set up in roughly 48 hours: you fill in the application form, we countersign a short service agreement, configure your travellers in our dispatch system, run a free test booking, and you are live. There is no joining fee, no minimum spend, and no lock-in contract.',
  },
  {
    q: 'Who typically uses corporate accounts?',
    a: 'Our corporate clients are the law firms, consulting practices, investment houses, embassies, global employers, event agencies, and privately owned Czech businesses that move people through Prague on a weekly basis. A typical account might book two or three airport runs on a Monday morning, a half-day roadshow for a visiting executive mid-week, and an evening dinner transfer on Friday. Account sizes range from boutique firms with four or five trips a month to multinational corporates with several hundred bookings. We deliberately keep the book of accounts compact so every client receives the same level of attention regardless of volume — there is no tiered service model where small accounts wait longer. If your company regularly books airport transfers or intercity trips for visiting executives, clients, or directors, an account almost always saves both money and administration time.',
  },
  {
    q: 'How does monthly invoicing and payment work?',
    a: 'Every trip on a corporate account is captured at the moment of booking with a unique reference number, vehicle class, passenger name, route, and any optional notes your travel manager provides (cost centre, project code, client reference). On the first working day of each month, our finance team compiles all trips from the previous month into a single VAT-registered invoice, itemised by trip and optionally grouped by cost centre, department, or traveller. The invoice is sent as a PDF to your accounts payable address and is payable within 30 days by bank transfer in EUR or CZK, or by credit card. We can also support automatic monthly card billing for companies that prefer it. For international clients we issue invoices with reverse-charge VAT handling where applicable. Any dispute or adjustment is handled through your account manager without delay.',
  },
  {
    q: 'Can multiple travellers book under one account without individual logins?',
    a: 'Yes. Corporate accounts operate on a named-traveller model, not a per-user login model. Your travel manager (or account manager for smaller accounts) adds authorised travellers to the account — typically the partners, directors, and assistants who travel regularly — and each traveller can be booked either by themselves, by an assistant, or by the central travel desk. Bookings can be made online against the account, by phone or WhatsApp direct to the account manager, or by email with a standing authorisation on file. There are no passwords to manage, no booking quotas per traveller, and no approval chains unless your internal policy requires them. For companies that need approval workflows (for example, requiring a line manager sign-off for trips above a certain value), we can implement the approval step as part of the booking flow — just tell us the policy at onboarding.',
  },
  {
    q: 'What about insurance, GDPR, and corporate compliance?',
    a: 'PRESTIGO is operated by chelautotrans s.r.o. (Czech company ID 05650801, VAT registered), a fully licensed Czech passenger-transport operator holding the commercial koncese required for chauffeur work. Every vehicle carries commercial passenger-liability insurance and fully comprehensive vehicle cover underwritten by an EU insurer — we can provide certificates of insurance, driver licence numbers, and vehicle registration details in advance for any booking where your security or procurement team requires it. Traveller data is handled under GDPR with a clear retention policy: trip records are kept for seven years (Czech accounting law) and personal contact details only as long as the account is active, then deleted. We do not share data with third parties, do not use traveller data for marketing, and sign mutual NDAs at no charge for accounts that require them. Data is stored on EU-based infrastructure.',
  },
  {
    q: 'What is the typical onboarding timeline?',
    a: 'Most corporate accounts are live and taking bookings within 48 hours of the initial enquiry. The sequence is: Day 0, you complete the three-minute application form at /corporate describing your company, expected monthly volume, and any specific requirements. Within the same working day we assign an account manager and send a short service agreement for countersignature (usually two pages — our standard terms plus your specific notes). Day 1, once signed, we configure your account in the dispatch system, invite your listed travellers, and run a test booking free of charge so your first real trip is never the first trip. Day 2, you make your first live booking. For companies with unusual requirements — bespoke invoicing formats, integration with an existing travel management platform, or multi-entity setups — onboarding can take up to a week, and we agree the timeline up front.',
  },
]

const corporateSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://rideprestigo.com/corporate#breadcrumbs',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Corporate Accounts', item: 'https://rideprestigo.com/corporate' },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/corporate#faq',
      mainEntity: corporateFaqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@type': 'Service',
      '@id': 'https://rideprestigo.com/corporate#service',
      name: 'PRESTIGO Corporate Chauffeur Accounts',
      serviceType: 'Corporate Chauffeur Account',
      description:
        'Dedicated corporate chauffeur accounts in Prague with monthly consolidated invoicing, a named account manager, priority dispatch, and a reporting dashboard. Designed for law firms, consulting groups, finance, embassies, and event organisers who move people regularly.',
      provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      areaServed: [
        { '@type': 'City', name: 'Prague', sameAs: 'https://www.wikidata.org/wiki/Q1085' },
        { '@type': 'Country', name: 'Czech Republic', sameAs: 'https://www.wikidata.org/wiki/Q213' },
      ],
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'Enterprise and SME corporate travel buyers',
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Corporate account benefits',
        itemListElement: [
          {
            '@type': 'Offer',
            name: 'Monthly consolidated invoicing',
            description: 'One invoice on the first of every month covering all trips and all departments, formatted for corporate accounts teams.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Dedicated account manager',
            description: 'A single named contact who knows your company, preferences, and travellers — reachable by phone, email, and WhatsApp.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Priority dispatch',
            description: 'Corporate accounts receive priority allocation for same-day, last-minute, and early-morning bookings.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Reporting dashboard',
            description: 'Bookings, travellers, routes, and costs exportable for expense and compliance reporting at any time.',
            priceCurrency: 'EUR',
            price: '0',
            availability: 'https://schema.org/InStock',
          },
        ],
      },
      termsOfService: 'https://rideprestigo.com/corporate',
      url: 'https://rideprestigo.com/corporate',
    },
  ],
}

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(corporateSchemaGraph) }} />

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

      {/* Who uses corporate accounts */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">
          <div className="md:col-span-2">
            <p className="label mb-6">Who uses a PRESTIGO corporate account</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Built for the firms <span className="display-italic">Prague works with.</span></h2>
          </div>
          <div className="md:col-span-3 flex flex-col gap-5">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Our corporate clients are the law firms, consulting practices, investment houses, embassies, global employers, and event agencies that move people through Prague on a weekly basis. A typical account might book two or three airport runs on a Monday morning, a half-day roadshow for a visiting executive mid-week, and an evening dinner transfer on Friday — all without a single phone call, approval chain, or per-trip invoice.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Corporate accounts also absorb the edge cases that eat most travel managers&rsquo; time: a last-minute swap when a meeting runs long, a second vehicle dispatched to collect late arrivals, a private pickup at a residence outside the city for a visiting board member. These calls go directly to the account manager, who makes the decision and sends the confirmation before the travel manager has finished the request email.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              We keep account sizes deliberately modest so every client receives the same level of attention. PRESTIGO corporate isn&rsquo;t a volume programme with tiered service — every account is handled as if it were our largest.
            </p>
          </div>
        </div>
      </section>

      {/* Typical usage patterns */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="mb-14">
            <p className="label mb-6">Typical usage patterns</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">What a week on a<br /><span className="display-italic">PRESTIGO account looks like.</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                title: 'The multi-leg roadshow',
                body: 'A visiting managing director lands at 08:10, is collected from Arrivals with a name board, and is driven through four back-to-back meetings across Prague before a 17:00 departure. One chauffeur, one vehicle, one fixed half-day fee. The traveller never queues for a taxi and never checks a map.',
              },
              {
                title: 'The pre-dawn airport run',
                body: 'A senior partner on the 06:15 flight to London needs collection at 04:20 from a Vinohrady address in a Tuesday snowstorm. Priority dispatch allocates the car the night before, the chauffeur clears snow from the vehicle before arrival, and the client is at the gate before most of Prague is awake.',
              },
              {
                title: 'The board-meeting V-Class',
                body: 'Four directors arriving on separate flights within ninety minutes. Rather than four E-Class transfers, the account manager books a single V-Class to circulate through Terminal 1, collect each passenger at their gate, and deliver the group directly to the meeting venue in Old Town. One fixed fee, one arrival time, one invoice line.',
              },
            ].map((item) => (
              <div key={item.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Onboarding + Compliance */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <div>
            <p className="label mb-6">Onboarding in 48 hours</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[34px] mb-6">From form to first trip, <span className="display-italic">inside two working days.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              The application form below takes roughly three minutes to complete. Within the same working day we assign your account manager, draft a service agreement, and send it over for countersignature. Once signed, we configure your account in our dispatch system, invite your travellers, and run a test booking free of charge so your first real trip is never the first trip. Most accounts are live and making bookings inside 48 hours of the initial enquiry.
            </p>
          </div>
          <div>
            <p className="label mb-6">Compliance, insurance &amp; invoicing</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[34px] mb-6">Documentation ready <span className="display-italic">for your finance team.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              PRESTIGO is operated by chelautotrans s.r.o. (Czech company ID 05650801), a fully licensed and VAT-registered Czech operator. Every invoice is issued with VAT, trip-level breakdown, and a unique reference per booking. We carry commercial passenger-liability and fully comprehensive vehicle insurance, and can provide certificates on request for security or procurement teams. Traveller data is handled under GDPR with a clear retention policy and is never shared with third parties.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Corporate account questions</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-12">Questions from finance, travel &amp; procurement.</h2>
          <div className="flex flex-col gap-0">
            {corporateFaqs.map((faq, i) => (
              <div key={faq.q} className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
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
