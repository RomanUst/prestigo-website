'use client'

export default function BookingSection() {
  // Replace this URL with your actual LimoAnywhere booking URL
  const LIMOANYWHERE_URL = 'https://booking.limoanywhere.com/your-company-id'

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

          {/* Right — LimoAnywhere iframe */}
          <div className="lg:col-span-3">
            <div className="border border-anthracite-light bg-anthracite p-1">
              <iframe
                id="limoanywhere-frame"
                src={LIMOANYWHERE_URL}
                title="Book a transfer — PRESTIGO"
                style={{
                  width: '100%',
                  minHeight: '520px',
                  border: 'none',
                  background: 'transparent',
                }}
                loading="lazy"
              />
            </div>

            {/* Placeholder shown until LimoAnywhere URL is set */}
            {LIMOANYWHERE_URL.includes('your-company-id') && (
              <div
                className="border border-anthracite-light bg-anthracite p-12 flex flex-col items-center justify-center text-center gap-4"
                style={{ minHeight: '520px' }}
              >
                <p className="label">Booking form</p>
                <span className="copper-line" />
                <p className="font-display font-light text-2xl text-offwhite">
                  LimoAnywhere
                </p>
                <p className="body-text max-w-xs">
                  Replace <code className="text-copper text-[11px]">LIMOANYWHERE_URL</code> in{' '}
                  <code className="text-copper text-[11px]">BookingSection.tsx</code> with your
                  actual booking URL.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
