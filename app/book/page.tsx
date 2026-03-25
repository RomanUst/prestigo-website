import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import BookingWizard from '@/components/booking/BookingWizard'

export const metadata: Metadata = {
  title: 'Book a Transfer — PRESTIGO Prague Chauffeur',
  description: 'Book your Prague chauffeur in 60 seconds. Fixed price, instant confirmation, flight tracking included. Airport transfers, intercity routes, corporate travel.',
  robots: 'noindex',
}

const guarantees = [
  'Fixed price — guaranteed at booking',
  'Free cancellation up to 1 hour',
  'Flight tracking included',
]

export default function BookPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Header */}
      <section className="bg-anthracite pt-32 pb-10 md:pt-40 md:pb-12 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Instant Booking</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[52px] max-w-xl">
            Your transfer,<br />
            <span className="display-italic">confirmed in seconds.</span>
          </h1>
          <p className="body-text text-[13px] mt-4">Fixed price. Instant confirmation. No callbacks.</p>
        </div>
      </section>

      {/* Booking wizard */}
      <section className="bg-anthracite py-12 md:py-16">
        <BookingWizard />
      </section>

      {/* Guarantees */}
      <section className="bg-anthracite-mid py-12 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-center gap-8 md:gap-16">
            {guarantees.map((g) => (
              <div key={g} className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[11px] tracking-[0.12em] uppercase text-warmgrey">{g}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
