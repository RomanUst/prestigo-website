import type { Metadata } from 'next'

export const dynamic = 'force-static'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: { absolute: 'Terms of Service — PRESTIGO Premium Chauffeur Prague' },
  description:
    'Terms and conditions for PRESTIGO chauffeur services. Booking policy, cancellation, payment terms, liability, and governing law.',
  alternates: {
    canonical: '/terms',
    languages: {
      en: 'https://rideprestigo.com/terms',
      'x-default': 'https://rideprestigo.com/terms',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/terms',
    title: 'Terms of Service — PRESTIGO Premium Chauffeur Prague',
    description:
      'Terms and conditions for PRESTIGO chauffeur services. Booking policy, cancellation, payment terms, liability, and governing law.',
  },
}

const sections = [
  {
    number: '1',
    title: 'Scope of Services',
    content: (
      <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
        PRESTIGO is a trading name of chelautotrans&nbsp;s.r.o. (I&#268;O:&nbsp;05650801,
        registered at Spojovac&iacute;&nbsp;685, Vysok&yacute;&nbsp;&Uacute;jezd, Czech
        Republic). We provide premium chauffeur and private transfer services in Prague and
        Central Europe, including airport transfers, intercity routes, corporate
        transportation, VIP and event transport, and group transfers. By placing a booking,
        you agree to these terms.
      </p>
    ),
  },
  {
    number: '2',
    title: 'Booking & Confirmation',
    content: (
      <>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          Bookings can be made via{' '}
          <a href="/book" className="text-offwhite hover:text-copper transition-colors">
            rideprestigo.com/book
          </a>
          , by email, phone, or WhatsApp.
        </p>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          A booking is confirmed upon receipt of a confirmation email containing your
          booking reference number. You are responsible for providing accurate passenger
          details, pickup location, and contact information.
        </p>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          PRESTIGO reserves the right to decline a booking at its sole discretion.
        </p>
      </>
    ),
  },
  {
    number: '3',
    title: 'Pricing & Payment',
    content: (
      <>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          All prices are fixed at the time of booking. There is no surge pricing and no
          hidden fees. The quoted price includes all route tolls and standard waiting time
          (60&nbsp;minutes for airport pickups, 15&nbsp;minutes for other pickups).
        </p>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          Payment is processed securely via Stripe. We accept Visa and Mastercard. Prices
          are displayed in EUR; CZK is available on request. Corporate accounts may pay by
          monthly invoice or company card as agreed.
        </p>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          Additional charges apply only for: waiting time beyond the included allowance,
          additional stops not in the original booking, or cleaning fees for damage caused
          by the passenger.
        </p>
      </>
    ),
  },
  {
    number: '4',
    title: 'Cancellation & Refunds',
    content: (
      <div className="flex flex-col gap-4">
        {[
          {
            label: 'Free cancellation',
            desc: 'Up to 1 hour before the scheduled pickup time — full refund, no questions asked.',
          },
          {
            label: 'Late cancellation',
            desc: 'Less than 1 hour before pickup — up to 100% of the booking amount may be charged.',
          },
          {
            label: 'No-show',
            desc: 'If you do not cancel and do not appear at the pickup location, the full booking amount is charged.',
          },
          {
            label: 'Flight cancellation',
            desc: 'If your flight is cancelled, we offer a full refund or free rebooking at your choice.',
          },
          {
            label: 'Refund processing',
            desc: 'Refunds are returned to the original payment method within 5–10 business days.',
          },
        ].map((item) => (
          <div key={item.label}>
            <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
              {item.label}
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    ),
  },
  {
    number: '5',
    title: 'Passenger Obligations',
    content: (
      <ul className="flex flex-col gap-3">
        {[
          'Be ready at the designated pickup location at the agreed time.',
          'Treat the vehicle and driver with respect.',
          'Wear seatbelts at all times as required by law.',
          'No smoking in the vehicle.',
          'Passengers are liable for any damage to the vehicle caused by their actions.',
        ].map((item) => (
          <li key={item} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
            {item}
          </li>
        ))}
        <li className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          PRESTIGO reserves the right to refuse service to passengers who are intoxicated
          or disruptive.
        </li>
      </ul>
    ),
  },
  {
    number: '6',
    title: 'Flight Tracking & Waiting Time',
    content: (
      <>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          For airport pickups, PRESTIGO monitors your flight status in real time. Your
          driver adjusts automatically to delays at no extra cost. 60&nbsp;minutes of
          complimentary waiting is included from the time of landing.
        </p>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          For non-airport pickups, 15&nbsp;minutes of complimentary waiting is included
          from the scheduled pickup time.
        </p>
      </>
    ),
  },
  {
    number: '7',
    title: 'Liability',
    content: (
      <>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          PRESTIGO maintains full commercial insurance for all vehicles and passengers
          during the transfer.
        </p>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          Liability for loss of or damage to personal belongings left in the vehicle is
          limited to &euro;500 per booking unless a higher value was declared in advance.
        </p>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          PRESTIGO is not liable for delays caused by traffic conditions, road closures, or
          circumstances beyond reasonable control. In all cases, our maximum liability does
          not exceed the total value of the booking.
        </p>
      </>
    ),
  },
  {
    number: '8',
    title: 'Force Majeure',
    content: (
      <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
        PRESTIGO is not liable for failure to perform due to natural disasters, severe
        weather, government actions, strikes, pandemics, or other events beyond reasonable
        control. In such cases, we will offer rebooking or a full refund.
      </p>
    ),
  },
  {
    number: '9',
    title: 'Intellectual Property',
    content: (
      <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
        All content on rideprestigo.com &mdash; including text, images, logos, and design
        &mdash; is the property of Roman&nbsp;Ustyugov and may not be reproduced
        without prior written permission.
      </p>
    ),
  },
  {
    number: '10',
    title: 'Privacy',
    content: (
      <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
        Your personal data is handled in accordance with our{' '}
        <a href="/privacy" className="text-offwhite hover:text-copper transition-colors">
          Privacy Policy
        </a>
        .
      </p>
    ),
  },
  {
    number: '11',
    title: 'Governing Law & Disputes',
    content: (
      <>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          These terms are governed by the laws of the Czech Republic. Any disputes arising
          from these terms or from our services shall first be attempted to resolve
          amicably.
        </p>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          If unresolved, disputes fall under the exclusive jurisdiction of the courts of
          Prague, Czech Republic.
        </p>
      </>
    ),
  },
  {
    number: '12',
    title: 'Changes to These Terms',
    content: (
      <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
        PRESTIGO reserves the right to update these terms. The &ldquo;last updated&rdquo;
        date at the top of this page reflects the most recent revision. Continued use of
        our services after any changes constitutes your acceptance of the updated terms.
      </p>
    ),
  },
]

export default function TermsPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Terms of Service</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Clear terms.
            <br />
            <span className="display-italic">No fine print.</span>
          </h1>
          <p className="body-text text-[13px] mt-6">Last updated: 6 April 2026</p>
        </div>
      </section>

      {/* Sections */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12 flex flex-col gap-0">
          {sections.map((section, i) => (
            <div
              key={section.number}
              className={`py-10 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
            >
              <p className="label mb-6">
                {section.number}. {section.title}
              </p>
              {section.content}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <h2 className="display text-[28px] md:text-[36px] mb-4">
            Have a question?
            <br />
            <span className="display-italic">We respond within the hour.</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <a href="/contact" className="btn-primary">
              Contact Us
            </a>
            <a href="/book" className="btn-ghost">
              Book a Transfer
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
