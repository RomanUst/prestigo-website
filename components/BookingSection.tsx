'use client'

import BookingWidget from '@/components/booking/BookingWidget'

export default function BookingSection() {
  return (
    <section id="book" className="bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-start">

          {/* Left — text */}
          <div className="lg:col-span-2">
            <p className="label mb-6">Instant booking</p>
            <span className="copper-line mb-8 block" />

            <h2 className="display text-[36px] md:text-[44px] mb-4">
              Book your<br />
              <span className="display-italic">transfer now.</span>
            </h2>

            <p className="body-text mb-8 max-w-xs">
              Fixed price. Instant confirmation. Your driver tracks your flight automatically.
            </p>

            {/* Trust signals */}
            <ul className="flex flex-col gap-3">
              {[
                'Flight tracking included',
                'Fixed price — no surprises',
                'Free cancellation up to 1 hour',
                'Meet & greet at Arrivals',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: 'var(--copper)' }}
                  />
                  <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — Booking widget */}
          <div className="lg:col-span-3">
            <div className="border border-anthracite-light bg-anthracite p-6 md:p-8">
              <BookingWidget />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
