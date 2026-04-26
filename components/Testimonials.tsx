import Reveal from '@/components/Reveal'
import { getReviews } from '@/lib/google-reviews'
import TestimonialsCarousel from '@/components/TestimonialsCarousel'

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

        <TestimonialsCarousel reviews={reviews} />
      </div>
    </section>
  )
}
