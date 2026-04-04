import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ContactForm from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'Contact — PRESTIGO Premium Chauffeur Prague',
  description: 'Get in touch with PRESTIGO. Book a transfer, request a corporate account, or ask any question. Available 24/7 via WhatsApp or email.',
  alternates: { canonical: '/contact' },
  openGraph: {
    url: 'https://prestigo-site.vercel.app/contact',
    title: 'Contact — PRESTIGO Premium Chauffeur Prague',
    description: 'Get in touch with PRESTIGO. Book a transfer, request a corporate account, or ask any question. Available 24/7 via WhatsApp or email.',
  },
}

const WHATSAPP_NUMBER = '420725986855'

export default function ContactPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Get in touch</p>
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
            </div>
          </div>

          {/* Right — contact form */}
          <div className="md:col-span-3">
            <ContactForm />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
