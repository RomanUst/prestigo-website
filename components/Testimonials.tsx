const testimonials = [
  {
    quote: 'Our driver was waiting before we even cleared customs. Seamless from landing to hotel.',
    name: 'M. Hoffmann',
    role: 'CFO, Frankfurt',
  },
  {
    quote: 'Travelled Prague–Vienna four times this year. Consistently excellent. The S-Class is exceptional.',
    name: 'S. Novák',
    role: 'Senior Partner, Prague',
  },
  {
    quote: 'Our corporate account saves hours of admin. Invoicing, reporting — everything just works.',
    name: 'L. Chen',
    role: 'Operations Director',
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
