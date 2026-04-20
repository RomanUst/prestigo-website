import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'

export const metadata: Metadata = {
  title: 'VIP & Events Chauffeur Prague — Diplomatic & Private',
  description: 'VIP chauffeur service in Prague for diplomatic visits, private events, luxury hotel transfers, and multi-vehicle coordination. Discretion guaranteed.',
  alternates: {
    canonical: '/services/vip-events',
    languages: {
      en: 'https://rideprestigo.com/services/vip-events',
      'x-default': 'https://rideprestigo.com/services/vip-events',
    },
  },
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
    body: 'Senior PRESTIGO chauffeurs operate in protocol-sensitive environments as a matter of routine. This means presenting credentials on request, understanding the distinction between a security advance team and a close-protection detail, positioning the vehicle so the principal exits on the pavement side without crossing traffic, and maintaining radio silence when required. A written briefing covering the guest\'s profile, schedule, and specific instructions is standard for senior VIP engagements. We do not assume preferences; we are briefed on them.',
  },
  {
    title: 'Can you provide multiple cars for a large event?',
    body: 'For events requiring multiple vehicles — a gala arrival across three cars, or an incentive group requiring six vehicles across two hotels — we coordinate the full fleet logistics from a single point of contact. The operational brief specifies vehicle order, chauffeur-to-guest assignment, timing intervals between arrivals, and the holding area for vehicles between runs. Your events team communicates with one coordinator. One invoice covers the entire operation. One escalation point handles any real-time adjustment on the day.',
  },
  {
    title: 'How is passenger privacy protected?',
    body: 'Chauffeurs assigned to VIP engagements do not discuss passengers, routes, timing, or any detail of the assignment — with anyone. NDAs are available on request and signed as standard for sensitive accounts. Fleet vehicles carry no PRESTIGO signage on assignments where anonymity is required. Photographs of passengers or vehicles are not permitted. The operational record of a journey is retained for billing purposes only and is never shared with third parties under any circumstances.',
  },
  {
    title: 'How do you prepare the route for a VIP arrival?',
    body: 'For any movement where disruption must be anticipated rather than reacted to, we conduct advance route reconnaissance. A PRESTIGO chauffeur drives the route at the same time of day as the engagement, notes the likely variables — road works, event-related closures in the Old Town, VIP motorcade restrictions near the Castle district or embassies — and prepares a primary and secondary route with confirmed timings for each. On the day, the primary route is taken unless conditions on the ground require the secondary. The principal or their team is informed of any deviation and given a revised ETA.',
  },
]

const editorial = [
  'A VIP transfer is not an airport transfer in a more expensive vehicle. It is a coordinated operational movement in which the ground transport element is one component of a larger schedule — one that may involve a hotel concierge team, a security detail, a corporate host, and an itinerary with zero tolerance for delay or improvisation.',
  'PRESTIGO has operated VIP-protocol transfers in Prague since 2016. In that time we have worked alongside concierge teams at the Four Seasons, the Mandarin Oriental, and the Augustine, and we have managed transfers for diplomatic missions requiring coordination with embassy security staff in the Hradčany district. Client names are not disclosed. The nature of past engagements is referenced because it is operationally relevant: our experience is practical, not theoretical.',
  'Enquiries for VIP and event bookings are handled directly by the senior team, not through the standard online booking flow. We request a brief covering the date, principal or group profile, movement schedule, and any specific requirements. From that brief we produce a logistics plan and a confirmed price. The process typically takes under four hours from first contact to confirmed quote.',
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
          <Image src="/hero-vip-events.png" alt="VIP & Events Chauffeur Prague — PRESTIGO" fill priority sizes="100vw" style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">VIP & Events · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            When nothing<br />
            <span className="display-italic">can go wrong.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Prestigo VIP and event transport coordinates private chauffeur service for diplomatic visits, luxury hotel arrivals, private openings, galas, and film production across Prague. Discreet drivers, synchronised arrival windows, live dispatch contact, and a zero-error protocol for events where timing, confidentiality, and presentation matter. Single-vehicle or full-fleet convoys on request.
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

      {/* Editorial — service depth */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">How VIP transfers work at PRESTIGO</p>
          <span className="copper-line mb-10 block" />
          <div className="max-w-3xl flex flex-col gap-6">
            {editorial.map((para, i) => (
              <p key={i} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{para}</p>
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
