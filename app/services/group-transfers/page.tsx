import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'

export const metadata: Metadata = {
  title: 'Group Transfers Prague — Minivan & Multi-Car',
  description: 'Group chauffeur transfers in Prague. Minivans and multi-car coordination for conferences, incentive travel, and corporate events. Up to 50 passengers.',
  alternates: { canonical: '/services/group-transfers' },
  openGraph: {
    url: 'https://rideprestigo.com/services/group-transfers',
    title: 'Group Transfers Prague — Minivan & Multi-Car | PRESTIGO',
    description: 'Group chauffeur transfers in Prague. Minivans and multi-car coordination for conferences, incentive travel, and corporate events.',
    images: [{ url: 'https://rideprestigo.com/hero-group-transfers.png', width: 1200, height: 630 }],
  },
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Group Transfers Prague',
  description: 'Minivan and multi-car group transfers in Prague for conferences, corporate events, and incentive travel. Up to 50 passengers.',
  provider: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
  areaServed: 'Prague, Czech Republic',
  url: 'https://rideprestigo.com/services/group-transfers',
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://rideprestigo.com/services' },
    { '@type': 'ListItem', position: 3, name: 'Group Transfers', item: 'https://rideprestigo.com/services/group-transfers' },
  ],
}

const features = [
  {
    title: 'Minivan & Multi-Car Fleet',
    body: 'From an 8-seat Mercedes V-Class to a coordinated fleet of executive saloons. We match the vehicle configuration to your group size and logistics.',
  },
  {
    title: 'Precise Timing',
    body: 'Conference delegations cannot afford lateness. We build timing buffers, monitor flight arrivals, and coordinate vehicle dispatch to the minute.',
  },
  {
    title: 'Custom Itineraries',
    body: 'Airport to hotel. Hotel to venue. Venue to dinner. Dinner to airport. We manage the full movement schedule so your team can focus on the event.',
  },
  {
    title: 'Up to 50 Passengers',
    body: 'Small incentive groups or full conference delegations — we scale to your requirements and maintain the same standard across every vehicle in the fleet.',
  },
]

const groupTypes = [
  { title: 'Conference Delegations', body: 'Coordinated arrivals and departures for multi-day conferences. Hotel allocation, airport runs, gala transfers.' },
  { title: 'Incentive Travel Groups', body: 'Premium ground transport for incentive programmes. Every vehicle represents the quality of the experience.' },
  { title: 'Corporate Off-Sites', body: 'Transfer your team from Prague city centre to your off-site venue and back. Reliable, punctual, professional.' },
  { title: 'Familiarisation Trips', body: 'Hosted press trips and client FAM tours where ground transport sets the tone for the entire experience.' },
  { title: 'Airport Group Arrivals', body: 'Coordinating multiple flights arriving across a day? We manage the schedule and keep everyone moving.' },
  { title: 'Event Shuttle Services', body: 'Continuous shuttle loops between hotels and event venues for the duration of your event.' },
]

export default function GroupTransfersPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-group-transfers.png" alt="Group Transfers Prague — PRESTIGO" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Group Transfers · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Everyone arrives.<br />
            <span className="display-italic">On schedule.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Conference delegations. Incentive travel. Corporate off-sites. Minivans, multiple vehicles, precise timing. We coordinate the full movement schedule so your group arrives together, on time, every time.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="/contact" className="btn-primary">Request Group Quote</a>
            <a href="/services" className="btn-secondary">All Services</a>
          </div>
        </div>
      </section>

      <Divider />

      {/* Capacity callout */}
      <section className="bg-anthracite-mid py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--warmgrey)' }}>Capacity</p>
            <p className="font-display font-light text-[42px] md:text-[52px] text-offwhite">Up to 50</p>
            <p className="body-text text-[11px] mt-1">Passengers · Scalable fleet</p>
          </div>
          <div className="flex flex-col gap-2">
            {['Minivan & multi-car coordination', 'Custom itineraries', 'Airport group arrivals handled', 'Conference & events specialists', 'Pricing on request'].map((f) => (
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
          <p className="label mb-6">How we manage groups</p>
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

      {/* Group types */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Who we work with</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
            {groupTypes.map((g) => (
              <div key={g.title} className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors">
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{g.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{g.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <p className="label mb-6">Tell us about your group</p>
          <span className="copper-line mb-8 block mx-auto" />
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            We quote within<br />
            <span className="display-italic">a few hours.</span>
          </h2>
          <p className="body-text text-[13px] mt-4 max-w-md mx-auto" style={{ lineHeight: '1.9' }}>
            Share your group size, dates, and movement schedule. We will provide a detailed quote and logistics plan.
          </p>
          <div className="mt-10">
            <a href="/contact" className="btn-primary">Request Group Quote</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
