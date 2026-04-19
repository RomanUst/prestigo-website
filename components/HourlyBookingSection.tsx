'use client'

import BookingWidget from '@/components/booking/BookingWidget'

export default function HourlyBookingSection() {
  return (
    <section id="book" className="bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-2">
            <p className="label mb-6">Hourly booking</p>
            <span className="copper-line mb-8 block" />

            <h2 className="display text-[36px] md:text-[44px] mb-4">
              Hire a car with<br />
              <span className="display-italic">chauffeur by the hour.</span>
            </h2>

            <p className="body-text mb-8 max-w-xs">
              Minimum 2 hours. One chauffeur, one vehicle — yours for as long as you need, across Prague and beyond.
            </p>

            <ul className="flex flex-col gap-3">
              {[
                'Minimum 2-hour booking',
                'Multiple stops included',
                'Chauffeur waits throughout',
                'Fixed hourly rate — no surprises',
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

          <div className="lg:col-span-3">
            <div className="border border-anthracite-light bg-anthracite p-3 sm:p-6 md:p-8">
              <BookingWidget defaultTripType="hourly" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
