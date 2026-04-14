import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'

export const metadata: Metadata = {
  title: 'VIP & Events Chauffeur Prague — Diplomatic & Private',
  description: 'VIP chauffeur service in Prague for diplomatic visits, private events, luxury hotel transfers, and multi-vehicle coordination. Discretion guaranteed.',
  alternates: { canonical: '/services/vip-events' },
  openGraph: {
    url: 'https://rideprestigo.com/services/vip-events',
    title: 'VIP & Events Chauffeur Prague — Diplomatic & Private | PRESTIGO',
    description: 'VIP chauffeur service in Prague for diplomatic visits, private events, luxury hotel transfers, and multi-vehicle coordination.',
    images: [{ url: 'https://rideprestigo.com/hero-vip-events.png', width: 1200, height: 630 }],
  },
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'VIP & Events Chauffeur Prague',
  description: 'Premium VIP chauffeur service for diplomatic visits, private events, luxury hotel transfers, and multi-vehicle event coordination in Prague.',
  provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
  areaServed: 'Prague, Czech Republic',
  url: 'https://rideprestigo.com/services/vip-events',
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'VIP & Events', item: 'https://rideprestigo.com/services/vip-events' },
  ],
}

const features = [
  {
    title: 'How does PRESTIGO handle diplomatic and VIP transfers?',
    body: 'Our senior chauffeurs understand the requirements of diplomatic and high-protocol engagements. Discretion, punctuality, and professional conduct — without exception.',
  },
  {
    title: 'Can you provide multiple cars for a large event?',
    body: 'For events requiring multiple vehicles, we coordinate fleet logistics to ensure every car arrives precisely on time, in sequence, without visible operational complexity.',
  },
  {
    title: 'How is passenger privacy protected?',
    body: 'Confidentiality is non-negotiable. Our chauffeurs sign NDAs on request. Your guests, your routes, and your schedule remain entirely private.',
  },
  {
    title: 'How do you prepare the route for a VIP arrival?',
    body: 'For high-security or time-critical movements, we conduct route reconnaissance in advance — identifying alternative routes, timing constraints, and access points.',
  },
]

const occasions = [
  { title: 'Diplomatic Visits', body: 'Embassy transfers, official delegations, government arrivals. Protocol-aware, discreet, on time.' },
  { title: 'Private Events', body: 'Gallery openings, private dinners, premiere evenings. Your guests arrive as they should.' },
  { title: 'Luxury Hotel Arrivals', body: 'Four Seasons, Mandarin Oriental, Augustine. We coordinate directly with concierge teams.' },
  { title: 'Incentive Travel', body: 'Multi-vehicle fleet for corporate incentive groups. Every transfer choreographed to schedule.' },
  { title: 'Weddings & Ceremonies', body: 'The most important day requires absolute reliability. We deliver that, without compromise.' },
  { title: 'Security Transfers', body: 'Discreet, route-verified transfers for guests who require additional operational security.' },
]

export default function VipEventsPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-vip-events.png" alt="VIP & Events Chauffeur Prague — PRESTIGO" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">VIP & Events · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            When nothing<br />
            <span className="display-italic">can go wrong.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Diplomatic visits. Private openings. Luxury hotel arrivals. Multi-vehicle coordination for events where every detail matters and the margin for error is zero.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/contact" className="btn-primary">Enquire About VIP Service</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* On request callout */}
      <section className="bg-anthracite-mid py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>Pricing</p>
            <p className="font-display font-light text-[28px] md:text-[36px] text-offwhite">On request</p>
            <p className="body-text text-[11px] mt-1">Bespoke pricing based on requirements</p>
          </div>
          <div className="flex flex-col gap-2">
            {['Diplomatic protocol awareness', 'Multi-vehicle coordination', 'Discretion guaranteed', 'Advance route reconnaissance', 'NDA available on request'].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Features */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Our commitment</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {features.map((f) => (
              <div key={f.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-6 block" />
                <h2 className="font-display font-light text-[22px] text-offwhite mb-3">{f.title}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Occasions */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Occasions we serve</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
            {occasions.map((o) => (
              <div key={o.title} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{o.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{o.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">Discuss your requirements</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Every VIP engagement<br />
            <span className="display-italic">handled personally.</span>
          </h2>
          <p className="body-text text-[13px] mt-4 max-w-md mx-auto" style={{ lineHeight: '1.9' }}>
            VIP and event bookings are handled directly by our senior team. Contact us to discuss your requirements.
          </p>
          <div className="mt-10">
            <a href="/contact" className="btn-primary">Enquire About VIP Service</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
