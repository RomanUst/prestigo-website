import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import ContactForm from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'Contact — PRESTIGO Premium Chauffeur Prague',
  description: 'Get in touch with PRESTIGO. Book a transfer, request a corporate account, or ask any question. Available 24/7 via WhatsApp or email.',
  alternates: { canonical: '/contact' },
  openGraph: {
    url: 'https://rideprestigo.com/contact',
    title: 'Contact — PRESTIGO Premium Chauffeur Prague',
    description: 'Get in touch with PRESTIGO. Book a transfer, request a corporate account, or ask any question. Available 24/7 via WhatsApp or email.',
  },
}

const WHATSAPP_NUMBER = '420725986855'


const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Contact', item: 'https://rideprestigo.com/contact' },
  ],
}

export default function ContactPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-contact.webp" alt="Contact PRESTIGO — Premium Chauffeur Prague" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)', objectPosition: '30% 15%' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Contact · Prague Chauffeur Service</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            We are here.<br />
            <span className="display-italic">Always.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-md" style={{ lineHeight: '1.9' }}>
            Available 24 hours a day, 7 days a week. Reach us via the form,
            email, or instantly on WhatsApp.
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-16">

          {/* Left — info + WhatsApp */}
          <div className="md:col-span-2 flex flex-col gap-10">

            {/* WhatsApp CTA */}
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hello%20PRESTIGO%2C%20I%20would%20like%20to%20book%20a%20transfer.`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 border border-[#25D366]/40 hover:border-[#25D366] px-6 py-5 transition-colors group"
            >
              {/* WhatsApp icon */}
              <svg viewBox="0 0 24 24" className="w-7 h-7 flex-shrink-0 text-[#25D366]" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <div>
                <p className="font-body font-medium text-[11px] tracking-[0.15em] uppercase text-[#25D366]">
                  WhatsApp
                </p>
                <p className="font-body font-light text-[12px] text-offwhite mt-0.5 group-hover:text-offwhite transition-colors">
                  Message us instantly
                </p>
              </div>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-auto text-warmgrey group-hover:text-[#25D366] transition-colors" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>

            {/* Contact details */}
            <div className="flex flex-col gap-6">
              <div>
                <p className="label mb-3">Phone</p>
                <a href="tel:+420725986855" className="font-body font-light text-[14px] text-offwhite hover:text-copper-light transition-colors">
                  +420 725 986 855
                </a>
              </div>
              <div>
                <p className="label mb-3">Email</p>
                <a href="mailto:info@rideprestigo.com" className="font-body font-light text-[14px] text-offwhite hover:text-copper-light transition-colors">
                  info@rideprestigo.com
                </a>
              </div>
              <div>
                <p className="label mb-3">Location</p>
                <p className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.8' }}>
                  Prague, Czech Republic<br />
                  Service area: Central Europe
                </p>
              </div>
              <div>
                <p className="label mb-3">Availability</p>
                <p className="font-body font-light text-[13px] text-warmgrey">
                  24 / 7 — 365 days a year
                </p>
              </div>
              <div>
                <p className="label mb-3">Legal entity</p>
                <address className="font-body font-light text-[13px] text-warmgrey not-italic" style={{ lineHeight: '1.8' }}>
                  <span className="text-offwhite">chelautotrans s.r.o.</span><br />
                  IČO: 05650801<br />
                  Spojovací 685, Vysoký Újezd<br />
                  Czech Republic
                </address>
              </div>
            </div>
          </div>

          {/* Right — contact form */}
          <div className="md:col-span-3">
            <ContactForm />
          </div>
        </div>
      </section>

      <Divider />

      {/* What to expect */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">What happens next</p>
          <span className="copper-line mb-10 block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                step: '01',
                title: 'You reach out',
                body: 'Send us a message via the form, WhatsApp, or email. Include your pickup location, destination, date, and time. No account required.',
              },
              {
                step: '02',
                title: 'We confirm within minutes',
                body: 'During business hours, expect a response in under 15 minutes. Outside business hours, we aim to confirm within 2 hours. Your booking is not final until confirmed in writing.',
              },
              {
                step: '03',
                title: 'Your driver is there',
                body: 'On the day, your assigned chauffeur arrives at the agreed location — on time, in uniform, name board held. For airport pickups, we track your flight automatically.',
              },
            ].map((s) => (
              <div key={s.step} className="flex flex-col gap-4">
                <p className="font-body font-light text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[20px] text-offwhite">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Common enquiries */}
      <section className="bg-anthracite py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
          <div>
            <p className="label mb-6">Common enquiries</p>
            <span className="copper-line mb-10 block" />
            <div className="flex flex-col gap-8">
              {[
                {
                  q: 'I need an airport transfer from Prague Václav Havel (PRG).',
                  a: 'Use the booking form or WhatsApp. Provide your flight number, arrival terminal, and destination address. We track the flight and adjust pickup time if it lands early or late.',
                },
                {
                  q: 'I need a transfer to Vienna, Berlin, or another European city.',
                  a: 'View our full route list, or simply tell us your pickup and destination. We serve 50 intercity routes from Prague with fixed prices and door-to-door service.',
                },
                {
                  q: 'My company needs a corporate account.',
                  a: 'We set up corporate accounts with monthly invoicing and a dedicated manager. Visit the Corporate page or describe your requirements in the form and we will follow up.',
                },
                {
                  q: 'I need to cancel or change a booking.',
                  a: 'Contact us via WhatsApp or email with your booking reference. Cancellations made at least 1 hour before departure are free of charge.',
                },
              ].map((item) => (
                <div key={item.q} className="border-b border-anthracite-light pb-8 last:border-0 last:pb-0">
                  <p className="font-body font-medium text-[12px] tracking-[0.03em] text-offwhite mb-2">{item.q}</p>
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.a}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-8">
            <div>
              <p className="label mb-6">Also useful</p>
              <span className="copper-line mb-10 block" />
              <div className="flex flex-col gap-4">
                {[
                  { label: 'Book online instantly', href: '/book', desc: 'Select route, vehicle, and date — confirmed in seconds.' },
                  { label: 'View all 50 routes', href: '/routes', desc: 'Prague to Vienna, Berlin, Munich, and 47 more destinations.' },
                  { label: 'Corporate accounts', href: '/corporate', desc: 'Monthly invoicing and dedicated management for companies.' },
                  { label: 'Full FAQ', href: '/faq', desc: 'Cancellation, child seats, waiting time, and more.' },
                ].map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex flex-col gap-1 border border-anthracite-light px-5 py-4 hover:border-copper transition-colors group"
                  >
                    <p className="font-body font-medium text-[11px] tracking-[0.1em] uppercase text-offwhite group-hover:text-copper transition-colors">{link.label} →</p>
                    <p className="body-text text-[11px]">{link.desc}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
