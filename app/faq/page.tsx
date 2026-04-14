import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

export const metadata: Metadata = {
  title: 'FAQ — Prague Chauffeur Service: Prices, Booking & More',
  description: 'Frequently asked questions about PRESTIGO: how to book, pricing, cancellation, flight delays, vehicle options, corporate accounts, and more.',
  alternates: {
    canonical: '/faq',
    languages: {
      en: 'https://rideprestigo.com/faq',
      'x-default': 'https://rideprestigo.com/faq',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/faq',
    title: 'FAQ — PRESTIGO Prague Chauffeur Service | Prices, Booking & More',
    description: 'Frequently asked questions about PRESTIGO: how to book, pricing, cancellation, flight delays, vehicle options, corporate accounts, and more.',
  },
}

const sections = [
  {
    title: 'Booking',
    faqs: [
      {
        q: 'How do I book a PRESTIGO transfer?',
        a: 'Book online at rideprestigo.com/book. Select your route, vehicle, and date. Confirmation is instant — no waiting for a callback.',
      },
      {
        q: 'How far in advance do I need to book?',
        a: 'Bookings must be made at least 12 hours in advance. For last-minute transfers, call directly on +420 725 986 855.',
      },
      {
        q: 'Can I book for someone else?',
        a: "Yes. Enter the passenger's name at checkout. Your driver will use their name on the board at Arrivals.",
      },
    ],
  },
  {
    title: 'Pricing',
    faqs: [
      {
        q: 'Is the price fixed?',
        a: 'Yes. The price shown at booking is the price you pay. No surge pricing. No hidden tolls. No extras unless you request them.',
      },
      {
        q: 'Are tolls included in the price?',
        a: 'Yes. All route tolls are included. There are no additional charges on delivery.',
      },
      {
        q: 'Do you charge extra for waiting time at the airport?',
        a: 'No. 60 minutes of free waiting is included for all airport pickups. We track your flight in real time.',
      },
    ],
  },
  {
    title: 'Flight Tracking & Delays',
    faqs: [
      {
        q: 'What happens if my flight is delayed?',
        a: 'Your driver monitors your flight in real time. A delay costs you nothing extra — your driver adjusts automatically.',
      },
      {
        q: 'What if my flight is cancelled?',
        a: 'Contact us and we will reschedule at no charge, or refund in full.',
      },
      {
        q: 'How will I find my driver at the airport?',
        a: "Your driver will be waiting at Arrivals with a name board. You'll also receive their contact number before landing.",
      },
    ],
  },
  {
    title: 'Cancellation',
    faqs: [
      {
        q: 'Can I cancel my booking?',
        a: 'Yes. Free cancellation up to 1 hour before the scheduled pickup. Later cancellations may be subject to a fee.',
      },
      {
        q: 'Can I change the pickup time?',
        a: 'Yes, at any time before the journey. Contact your driver directly or use the booking portal.',
      },
    ],
  },
  {
    title: 'Vehicles',
    faqs: [
      {
        q: 'What cars do you use?',
        a: 'All PRESTIGO vehicles are late-model Mercedes-Benz: E-Class (sedan), S-Class (executive sedan), and V-Class (executive van). All are fully insured and maintained to the highest standard.',
      },
      {
        q: 'Can I request a specific vehicle?',
        a: 'Yes. Select your preferred class at the time of booking.',
      },
      {
        q: 'Is there Wi-Fi in the car?',
        a: 'Yes, in all vehicles. Your driver can also provide a phone charger on request.',
      },
    ],
  },
  {
    title: 'Corporate',
    faqs: [
      {
        q: 'Do you offer corporate accounts?',
        a: 'Yes. Corporate accounts include monthly invoicing, a dedicated account manager, and priority dispatch. Set up in 24 hours. See /corporate for details.',
      },
      {
        q: 'Can I pay with a company card?',
        a: 'Yes. We accept Visa, Mastercard, and bank transfer. Invoices are issued for all corporate bookings.',
      },
    ],
  },
  {
    title: 'Children & Special Requests',
    faqs: [
      {
        q: 'Do you have child seats?',
        a: 'Yes. Child seats are available on request at the time of booking, at no extra charge.',
      },
      {
        q: 'Can I request a multilingual driver?',
        a: 'All drivers speak English. Russian, German, and Czech-speaking drivers are available on request.',
      },
    ],
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'How do I book a PRESTIGO transfer?', acceptedAnswer: { '@type': 'Answer', text: 'Book online at rideprestigo.com/book. Select your route, vehicle, and date. Confirmation is instant — no waiting for a callback.' } },
    { '@type': 'Question', name: 'Is the price fixed?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The price shown at booking is the price you pay. No surge pricing. No hidden tolls. No extras unless you request them.' } },
    { '@type': 'Question', name: 'What happens if my flight is delayed?', acceptedAnswer: { '@type': 'Answer', text: 'Your driver monitors your flight in real time. A delay costs you nothing extra — your driver adjusts automatically.' } },
    { '@type': 'Question', name: 'Can I cancel my booking?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Free cancellation up to 1 hour before the scheduled pickup. Later cancellations may be subject to a fee.' } },
    { '@type': 'Question', name: 'What cars do you use?', acceptedAnswer: { '@type': 'Answer', text: 'All PRESTIGO vehicles are late-model Mercedes-Benz: E-Class (sedan), S-Class (executive sedan), and V-Class (executive van). All are fully insured and maintained to the highest standard.' } },
    { '@type': 'Question', name: 'Do you offer corporate accounts?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Corporate accounts include monthly invoicing, a dedicated account manager, and priority dispatch. Set up in 24 hours.' } },
    { '@type': 'Question', name: 'Do you have child seats?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Child seats are available on request at the time of booking, at no extra charge.' } },
    { '@type': 'Question', name: 'Do you charge extra for waiting time at the airport?', acceptedAnswer: { '@type': 'Answer', text: '60 minutes of free waiting is included for all airport pickups. We track your flight in real time.' } },
  ],
}


const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'FAQ', item: 'https://rideprestigo.com/faq' },
  ],
}

export default function FaqPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <Divider />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Frequently Asked Questions</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Everything you need to know.<br />
            <span className="display-italic">Before you ask.</span>
          </h1>
        </div>
      </section>

      {/* FAQ sections */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12 flex flex-col gap-16">
          {sections.map((section, i) => (
            <Reveal key={section.title} variant="up" delay={i * 100}><div>
              <p className="label mb-8">{section.title}</p>
              <div className="flex flex-col gap-0">
                {section.faqs.map((faq, i) => (
                  <div
                    key={faq.q}
                    className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
                  >
                    <h3 className="font-body font-medium text-[12px] tracking-[0.08em] uppercase text-offwhite mb-3">{faq.q}</h3>
                    <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
                  </div>
                ))}
              </div>
            </div></Reveal>
          ))}
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite-mid py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <Reveal variant="up"><h2 className="display text-[28px] md:text-[36px] mb-4">
            Still have a question?<br />
            <span className="display-italic">We respond within the hour.</span>
          </h2></Reveal>
          <Reveal variant="fade" delay={150}><div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <a href="/contact" className="btn-primary">Contact Us</a>
            <a href="/book" className="btn-ghost">Book a Transfer</a>
          </div></Reveal>
          <Reveal variant="fade" delay={250}><p className="font-body font-light text-[12px] text-warmgrey mt-6">
            Or email us at{' '}
            <a href="mailto:info@rideprestigo.com" className="hover:text-offwhite transition-colors">
              info@rideprestigo.com
            </a>
          </p></Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
