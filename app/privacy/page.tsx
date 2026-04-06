import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Privacy Policy — PRESTIGO Premium Chauffeur Prague',
  description:
    'How PRESTIGO collects, uses, and protects your personal data. GDPR-compliant privacy policy for our premium chauffeur service in Prague and Central Europe.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    url: 'https://rideprestigo.com/privacy',
    title: 'Privacy Policy — PRESTIGO Premium Chauffeur Prague',
    description:
      'How PRESTIGO collects, uses, and protects your personal data. GDPR-compliant privacy policy for our premium chauffeur service in Prague and Central Europe.',
  },
}

const sections = [
  {
    number: '1',
    title: 'Data Controller',
    content: (
      <>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          The controller of your personal data is <strong className="text-offwhite">chelautotrans s.r.o.</strong>, trading
          as PRESTIGO, with registered office at Spojovac&iacute; 685, Vysok&yacute; &Uacute;jezd, Czech Republic,
          I&Ccaron;O:&nbsp;05650801.
        </p>
        <p className="body-text text-[13px] mt-4" style={{ lineHeight: '1.9' }}>
          For any questions regarding the processing of your personal data, contact us
          at{' '}
          <a href="mailto:info@rideprestigo.com" className="text-offwhite hover:text-copper transition-colors">
            info@rideprestigo.com
          </a>{' '}
          or call{' '}
          <a href="tel:+420725986855" className="text-offwhite hover:text-copper transition-colors">
            +420&nbsp;725&nbsp;986&nbsp;855
          </a>
          .
        </p>
      </>
    ),
  },
  {
    number: '2',
    title: 'What Data We Collect',
    content: (
      <>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          We collect only what is necessary to provide our services.
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Booking form
        </h4>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          First name, last name, email, phone number, flight number, pickup and drop-off
          addresses, date and time, vehicle preference, child seat request, special
          requests.
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Contact form
        </h4>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          Name, email, phone number, service type, message.
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Corporate enquiry
        </h4>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          Company name, contact name and role, email, estimated monthly trips, notes.
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Automatically collected
        </h4>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          IP address, browser type and version, device type, pages visited, referring URL,
          and interaction data &mdash; collected via Google Analytics.
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Location data
        </h4>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          Pickup and destination addresses you enter are processed via the Google Maps API
          for route calculation and autocomplete. We do not track your real-time location.
        </p>
      </>
    ),
  },
  {
    number: '3',
    title: 'Legal Basis for Processing',
    content: (
      <>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          We process your personal data under the following legal bases defined in
          Article&nbsp;6 of the GDPR:
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Performance of a contract &mdash; Art.&nbsp;6(1)(b)
        </h4>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          Processing your booking data to arrange and fulfil your transfer, processing
          payment, sending booking confirmations, and providing driver contact details.
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Legitimate interest &mdash; Art.&nbsp;6(1)(f)
        </h4>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          Website analytics to improve our service, fraud prevention, and responding to
          your enquiries via the contact form.
        </p>

        <h4 className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-2">
          Legal obligation &mdash; Art.&nbsp;6(1)(c)
        </h4>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          Retaining booking and payment records as required by Czech tax and accounting
          regulations.
        </p>
      </>
    ),
  },
  {
    number: '4',
    title: 'Third-Party Service Providers',
    content: (
      <>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          We share personal data only with trusted service providers who process it on our
          behalf and under our instructions.
        </p>

        <div className="flex flex-col gap-4">
          {[
            {
              name: 'Stripe',
              purpose: 'Payment processing. Card data is sent directly to Stripe — PRESTIGO never stores your card number.',
              url: 'https://stripe.com/privacy',
            },
            {
              name: 'Google Analytics',
              purpose: 'Anonymised website usage statistics to help us improve our service.',
              url: 'https://policies.google.com/privacy',
            },
            {
              name: 'Google Maps Platform',
              purpose: 'Address autocomplete and route calculation.',
              url: 'https://policies.google.com/privacy',
            },
            {
              name: 'Supabase',
              purpose: 'Secure database hosting for booking records (EU region).',
              url: 'https://supabase.com/privacy',
            },
            {
              name: 'Resend',
              purpose: 'Transactional email delivery — booking confirmations and driver details.',
              url: 'https://resend.com/legal/privacy-policy',
            },
            {
              name: 'Vercel',
              purpose: 'Website hosting and content delivery.',
              url: 'https://vercel.com/legal/privacy-policy',
            },
          ].map((provider) => (
            <div key={provider.name}>
              <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
                {provider.name}
              </p>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {provider.purpose}{' '}
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-offwhite hover:text-copper transition-colors"
                >
                  Privacy&nbsp;policy&nbsp;&rarr;
                </a>
              </p>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    number: '5',
    title: 'International Data Transfers',
    content: (
      <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
        Your booking data is stored within the European Union (Supabase EU region). Some of
        our service providers &mdash; including Google, Stripe, Resend, and Vercel &mdash;
        may process data in the United States. These transfers are protected by the EU–US
        Data Privacy Framework and, where applicable, Standard Contractual Clauses approved
        by the European Commission.
      </p>
    ),
  },
  {
    number: '6',
    title: 'Data Retention',
    content: (
      <div className="flex flex-col gap-4">
        {[
          { type: 'Booking records', period: '5 years from the date of the transfer, as required by Czech tax and accounting regulations.' },
          { type: 'Contact form submissions', period: '12 months after your enquiry has been resolved.' },
          { type: 'Analytics data', period: '26 months (Google Analytics default retention period).' },
          { type: 'Payment records', period: 'PRESTIGO stores only the transaction reference ID. Full payment data is retained by Stripe in accordance with their retention policy.' },
        ].map((item) => (
          <div key={item.type}>
            <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
              {item.type}
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              {item.period}
            </p>
          </div>
        ))}
      </div>
    ),
  },
  {
    number: '7',
    title: 'Cookies',
    content: (
      <>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          Our website uses a limited number of cookies:
        </p>
        <div className="flex flex-col gap-4">
          {[
            { name: '_ga / _gid', purpose: 'Google Analytics — anonymised usage statistics. Expire after 2 years / 24 hours respectively.' },
            { name: 'Essential cookies', purpose: 'Session management only. Required for the website to function correctly.' },
          ].map((cookie) => (
            <div key={cookie.name}>
              <p className="font-body font-medium text-[11px] tracking-[0.08em] uppercase text-offwhite mb-1">
                {cookie.name}
              </p>
              <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                {cookie.purpose}
              </p>
            </div>
          ))}
        </div>
        <p className="body-text text-[13px] mt-5" style={{ lineHeight: '1.9' }}>
          We do not use advertising, remarketing, or social media tracking cookies.
        </p>
      </>
    ),
  },
  {
    number: '8',
    title: 'Your Rights Under GDPR',
    content: (
      <>
        <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
          Under the General Data Protection Regulation, you have the following rights:
        </p>
        <ul className="flex flex-col gap-3 mb-5">
          {[
            { right: 'Right of access', article: 'Art. 15', desc: 'Obtain a copy of the personal data we hold about you.' },
            { right: 'Right to rectification', article: 'Art. 16', desc: 'Request correction of inaccurate or incomplete data.' },
            { right: 'Right to erasure', article: 'Art. 17', desc: 'Request deletion of your personal data ("right to be forgotten").' },
            { right: 'Right to restriction', article: 'Art. 18', desc: 'Request that we limit the processing of your data.' },
            { right: 'Right to data portability', article: 'Art. 20', desc: 'Receive your data in a structured, machine-readable format.' },
            { right: 'Right to object', article: 'Art. 21', desc: 'Object to processing based on legitimate interest.' },
            { right: 'Right to withdraw consent', article: 'Art. 7(3)', desc: 'Withdraw consent at any time, without affecting prior processing.' },
          ].map((item) => (
            <li key={item.right} className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              <strong className="text-offwhite">{item.right}</strong>{' '}
              <span className="text-warmgrey">({item.article})</span> &mdash; {item.desc}
            </li>
          ))}
        </ul>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          To exercise any of these rights, email{' '}
          <a href="mailto:info@rideprestigo.com" className="text-offwhite hover:text-copper transition-colors">
            info@rideprestigo.com
          </a>
          . We will respond within 30&nbsp;days.
        </p>
      </>
    ),
  },
  {
    number: '9',
    title: 'Supervisory Authority',
    content: (
      <>
        <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
          If you believe your data protection rights have been violated, you have the right
          to lodge a complaint with the Czech supervisory authority:
        </p>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
          <strong className="text-offwhite">&Uacute;&rcaron;ad pro ochranu osobn&iacute;ch &uacute;daj&udblac;</strong>
          <br />
          Pplk. Sochora 27, 170&nbsp;00 Prague&nbsp;7, Czech Republic
          <br />
          <a
            href="https://www.uoou.cz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-offwhite hover:text-copper transition-colors"
          >
            www.uoou.cz
          </a>
        </p>
      </>
    ),
  },
  {
    number: '10',
    title: 'Changes to This Policy',
    content: (
      <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
        We may update this privacy policy from time to time. The &ldquo;last
        updated&rdquo; date at the top of this page reflects the most recent revision.
        Continued use of our services after any changes constitutes your acknowledgement of
        the updated policy.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Privacy Policy</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Your data, protected.
            <br />
            <span className="display-italic">By design.</span>
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
            Questions about your data?
            <br />
            <span className="display-italic">We are here to help.</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <a href="mailto:info@rideprestigo.com" className="btn-primary">
              Email Us
            </a>
            <a href="/contact" className="btn-ghost">
              Contact Page
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
