import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'FAQ — PRESTIGO Prague Chauffeur Service | Prices, Booking & More',
  description: 'Frequently asked questions about PRESTIGO: how to book, pricing, cancellation, flight delays, vehicle options, corporate accounts, and more.',
}

const sections = [
  {
    title: 'Booking',
    faqs: [
      {
        q: 'How do I book a PRESTIGO transfer?',
        a: 'Book online at prestigo.com/book. Select your route, vehicle, and date. Confirmation is instant — no waiting for a callback.',
      },
      {
        q: 'How far in advance do I need to book?',
        a: 'We recommend booking at least 4 hours in advance. For same-day bookings, call directly on +420 XXX XXX XXX.',
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

export default function FaqPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
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
          {sections.map((section) => (
            <div key={section.title}>
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
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <h2 className="display text-[28px] md:text-[36px] mb-4">
            Still have a question?<br />
            <span className="display-italic">We respond within the hour.</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <a href="/contact" className="btn-primary">Contact Us</a>
            <a href="/book" className="btn-ghost">Book a Transfer</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
