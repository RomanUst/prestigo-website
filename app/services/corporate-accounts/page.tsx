import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'

export const metadata: Metadata = {
  title: 'Corporate Chauffeur Accounts Prague',
  description: 'Corporate chauffeur accounts for Prague-based and international companies. Monthly invoicing, dedicated account manager, priority dispatch. Set up in 24 hours.',
  alternates: {
    canonical: '/corporate',
    languages: {
      en: 'https://rideprestigo.com/corporate',
      'x-default': 'https://rideprestigo.com/corporate',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/services/corporate-accounts',
    title: 'Corporate Chauffeur Accounts Prague | PRESTIGO',
    description: 'Corporate chauffeur accounts for Prague-based and international companies. Monthly invoicing, dedicated account manager, priority dispatch.',
    images: [{ url: 'https://rideprestigo.com/hero-corporate-accounts.png', width: 1200, height: 630 }],
  },
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Corporate Chauffeur Accounts Prague',
  description: 'Dedicated corporate chauffeur accounts with monthly invoicing, account manager, and priority dispatch for companies operating in Prague.',
  provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
  areaServed: 'Prague, Czech Republic',
  url: 'https://rideprestigo.com/services/corporate-accounts',
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Corporate Accounts', item: 'https://rideprestigo.com/services/corporate-accounts' },
  ],
}

const benefits = [
  {
    title: 'Monthly Invoicing',
    body: 'One invoice. All trips. All departments. Sent on the first of every month, formatted for your accounts team, with full trip breakdown.',
  },
  {
    title: 'Dedicated Account Manager',
    body: 'A single contact who knows your company, your travellers, and your preferences. Available by phone, email, or WhatsApp.',
  },
  {
    title: 'Priority Dispatch',
    body: 'Corporate accounts get priority allocation. Same-day bookings, last-minute changes, and early-morning airport runs — handled.',
  },
  {
    title: 'Reporting Dashboard',
    body: 'View all bookings, travellers, costs, and routes in one place. Export for expense reporting at any time.',
  },
]

export default function CorporateAccountsPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-corporate-accounts.png" alt="Corporate Chauffeur Accounts Prague — PRESTIGO" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Corporate Accounts · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Your company travels.<br />
            <span className="display-italic">We make it effortless.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            PRESTIGO corporate accounts are designed for companies that move people regularly and expect every detail handled. Fixed rates, monthly invoicing, a named account manager, and a fleet that reflects the standard your organisation holds itself to.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/corporate" className="btn-primary">Set Up Corporate Account</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Volume pricing callout */}
      <section className="bg-anthracite-mid py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>Corporate pricing</p>
            <p className="font-display font-light text-[28px] md:text-[36px] text-offwhite">Volume pricing available</p>
            <p className="body-text text-[11px] mt-1">Rates negotiated based on monthly trip volume</p>
          </div>
          <div className="flex flex-col gap-2">
            {['Monthly consolidated invoicing', 'Dedicated account manager', 'Priority dispatch', 'Corporate reporting dashboard', 'Account set up within 24 hours'].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Benefits */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">What you get</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {benefits.map((b) => (
              <div key={b.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{b.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Built for */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Built for</p>
          <span className="copper-line mb-10 block" />
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

      <Divider />

      {/* How it works */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">How it works</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Apply', body: 'Fill in the enquiry form. We review your requirements and set up your account within 24 hours.' },
              { step: '02', title: 'Book', body: 'Your team books online or via the account manager. No per-trip approval process needed.' },
              { step: '03', title: 'Invoice', body: 'One monthly invoice covering all trips. Pay by bank transfer or card. Full GDPR-compliant data handling.' },
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

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">Set up your account</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Account ready<br />
            <span className="display-italic">within 24 hours.</span>
          </h2>
          <div className="mt-10">
            <a href="/corporate" className="btn-primary">Set Up Corporate Account</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
