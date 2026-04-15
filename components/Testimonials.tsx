import Reveal from '@/components/Reveal'
import { getReviews, type Review } from '@/lib/google-reviews'

function displayFields(review: Review) {
  if (review.source === 'google') {
    return {
      quote: review.text,
      name: review.author,
      role: review.relativeTime,
      sourceLabel: 'Google Review',
    }
  }
  return {
    quote: review.quote,
    name: review.name,
    role: review.role,
    sourceLabel: review.sourceLabel,
  }
}

export default async function Testimonials() {
  const reviews = await getReviews()

  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="bg-anthracite py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <Reveal variant="up" className="mb-14">
          <p className="label mb-6">Testimonials</p>
          <span className="copper-line mb-8 block" />
          <h2 id="testimonials-heading" className="display text-[36px] md:text-[44px]">
            Trusted by those<br />
            <span className="display-italic">who value their time.</span>
          </h2>
          <p className="body-text text-[12px] mt-6 max-w-xl" style={{ lineHeight: '1.9' }}>
            Published with permission. Names abbreviated to protect passenger privacy — part of our discretion policy.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((review, i) => {
            const f = displayFields(review)
            const key = review.source === 'google' ? `g-${review.time}-${i}` : `h-${review.name}-${i}`
            return (
              <Reveal key={key} variant="up" delay={i * 130}>
                <div className="border-l-2 border-anthracite-light pl-6 py-2 hover:border-copper transition-colors group">
                  <p className="font-display font-light italic text-lg text-offwhite leading-snug mb-6 group-hover:text-copper-pale transition-colors">
                    &ldquo;{f.quote}&rdquo;
                  </p>
                  <div>
                    <p className="font-body font-light text-[11px] tracking-[0.1em] text-offwhite">{f.name}</p>
                    <p className="label mt-1" style={{ color: 'var(--warmgrey)' }}>{f.role}</p>
                    <p className="font-body font-light text-[10px] tracking-[0.08em] mt-2" style={{ color: 'var(--copper)' }}>{f.sourceLabel}</p>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
