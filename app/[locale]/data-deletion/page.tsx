import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: { absolute: 'Data Deletion — PRESTIGO Premium Chauffeur Prague' },
  description:
    'How to request deletion of your personal data from PRESTIGO. GDPR data erasure request instructions.',
  alternates: {
    canonical: '/data-deletion',
    languages: {
      en: 'https://rideprestigo.com/data-deletion',
      'x-default': 'https://rideprestigo.com/data-deletion',
    },
  },
  robots: { index: false },
}

interface Props {
  searchParams: Promise<{ code?: string }>
}

export default async function DataDeletionPage({ searchParams }: Props) {
  const { code } = await searchParams

  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Data Deletion</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Request data deletion.
            <br />
            <span className="display-italic">Simple and transparent.</span>
          </h1>
        </div>
      </section>

      {/* Content */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12 flex flex-col gap-0">

          {code && (
            <div className="py-10 border-t border-b border-anthracite-light mb-0">
              <p className="label mb-4">Request Received</p>
              <p className="body-text text-[13px] mb-4" style={{ lineHeight: '1.9' }}>
                Your data deletion request has been received and will be processed within
                30&nbsp;days. Your confirmation code:
              </p>
              <p
                className="font-mono text-copper text-[15px] tracking-widest bg-anthracite-dark px-5 py-3 rounded inline-block"
              >
                {code}
              </p>
              <p className="body-text text-[13px] mt-4" style={{ lineHeight: '1.9' }}>
                Keep this code for your records. If you have questions, email{' '}
                <a
                  href="mailto:info@rideprestigo.com"
                  className="text-offwhite hover:text-copper transition-colors"
                >
                  info@rideprestigo.com
                </a>{' '}
                and quote this code.
              </p>
            </div>
          )}

          {[
            {
              number: '1',
              title: 'What data PRESTIGO holds',
              content: (
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                  If you booked a transfer or submitted an enquiry, we hold your name, email
                  address, phone number, and booking details. We also process anonymised
                  website analytics data via Google Analytics and Meta Pixel. We do not store
                  your Facebook user ID — the Meta Pixel only sends hashed behavioural data
                  for ad measurement purposes.
                </p>
              ),
            },
            {
              number: '2',
              title: 'How to request deletion',
              content: (
                <>
                  <p className="body-text text-[13px] mb-5" style={{ lineHeight: '1.9' }}>
                    Send an email to{' '}
                    <a
                      href="mailto:info@rideprestigo.com?subject=Data%20Deletion%20Request"
                      className="text-offwhite hover:text-copper transition-colors"
                    >
                      info@rideprestigo.com
                    </a>{' '}
                    with the subject line &ldquo;Data Deletion Request&rdquo;. Include the
                    email address associated with your booking or enquiry.
                  </p>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                    We will confirm receipt within 3 business days and complete the deletion
                    within 30&nbsp;days, unless we are required by law to retain certain
                    records (e.g. invoices for tax purposes — retained for 5 years as
                    required by Czech law).
                  </p>
                </>
              ),
            },
            {
              number: '3',
              title: 'Deletion via Facebook',
              content: (
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
                  If you used Facebook Login or interacted with PRESTIGO through Facebook
                  and wish to remove access, you can do so via{' '}
                  <a
                    href="https://www.facebook.com/settings?tab=applications"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-offwhite hover:text-copper transition-colors"
                  >
                    Facebook Settings &rarr; Apps and Websites
                  </a>
                  . This removes our app&rsquo;s access to your Facebook account. For
                  deletion of any booking data we may hold, please also email us as
                  described above.
                </p>
              ),
            },
          ].map((section, i) => (
            <div
              key={section.number}
              className={`py-10 border-b border-anthracite-light ${!code && i === 0 ? 'border-t' : ''}`}
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
            <a href="mailto:info@rideprestigo.com?subject=Data%20Deletion%20Request" className="btn-primary">
              Request Deletion
            </a>
            <a href="/privacy" className="btn-ghost">
              Privacy Policy
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
