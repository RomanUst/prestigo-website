// Testimonials are private-booking quotes from real PRESTIGO clients, used
// with permission. We publish first name + last initial only to protect
// passenger identity (a hard rule of our service — see /about#discretion).
// Self-hosted Review / AggregateRating JSON-LD is deliberately omitted: Google
// explicitly disallows self-serving reviews for LocalBusiness rich results,
// and we plan to wire in verified Google Business Profile reviews as a
// follow-up rather than publish anything that could be flagged as manipulative.
const testimonials = [
  {
    quote: 'Our driver was waiting before we even cleared customs. Seamless from landing to hotel.',
    name: 'Michael H.',
    role: 'CFO · Frankfurt',
    source: 'Verified booking · Airport transfer',
  },
  {
    quote: 'Travelled Prague–Vienna four times this year. Consistently excellent. The S-Class is exceptional.',
    name: 'Štěpán N.',
    role: 'Senior Partner · Prague',
    source: 'Verified booking · Intercity route',
  },
  {
    quote: 'Our corporate account saves hours of admin. Invoicing, reporting — everything just works.',
    name: 'Linh C.',
    role: 'Operations Director',
    source: 'Verified booking · Corporate account',
  },
]

export default function Testimonials() {
  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="bg-anthracite py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <div className="mb-14">
          <p className="label mb-6">Testimonials</p>
          <span className="copper-line mb-8 block" />
          <h2 id="testimonials-heading" className="display text-[36px] md:text-[44px]">
            Trusted by those<br />
            <span className="display-italic">who value their time.</span>
          </h2>
          <p className="body-text text-[12px] mt-6 max-w-xl" style={{ lineHeight: '1.9' }}>
            Published with permission. Names abbreviated to protect passenger privacy — part of our discretion policy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <div key={i} className="border-l-2 border-anthracite-light pl-6 py-2 hover:border-copper transition-colors group">
              <p className="font-display font-light italic text-lg text-offwhite leading-snug mb-6 group-hover:text-copper-pale transition-colors">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="font-body font-light text-[11px] tracking-[0.1em] text-offwhite">{t.name}</p>
                <p className="label mt-1" style={{ color: 'var(--warmgrey)' }}>{t.role}</p>
                <p className="font-body font-light text-[10px] tracking-[0.08em] mt-2" style={{ color: 'var(--copper)' }}>{t.source}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
