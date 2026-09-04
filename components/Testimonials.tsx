import { getTranslations } from 'next-intl/server'
import Reveal from '@/components/Reveal'
import { getReviews } from '@/lib/google-reviews'
import TestimonialsCarousel from '@/components/TestimonialsCarousel'

export default async function Testimonials() {
  const reviews = await getReviews()
  const t = await getTranslations('Testimonials')

  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="theme-light bg-anthracite py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <Reveal variant="up" className="mb-14">
          <p className="label mb-6">{t('label')}</p>
          <span className="copper-line mb-8 block" />
          <h2 id="testimonials-heading" className="display text-[36px] md:text-[44px]">
            {t('headingLine1')}<br />
            <span className="display-italic">{t('headingLine2')}</span>
          </h2>
          <p className="body-text text-[12px] mt-6 max-w-xl" style={{ lineHeight: '1.9' }}>
            {t('body')}
          </p>
        </Reveal>

        <TestimonialsCarousel reviews={reviews} />
      </div>
    </section>
  )
}
