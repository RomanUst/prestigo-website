import { useTranslations } from 'next-intl'
import { GOOGLE_MAPS_URL } from '@/lib/google-maps-url'

type Props = {
  ratingValue: number
  reviewCount: number
  /** Wrapper classes; defaults to the Hero's load-animated placement. */
  className?: string
}

/**
 * Compact Google rating trust signal for the Hero.
 * Server component — static render, no client JS.
 * Uses copper unicode stars to match TestimonialsCarousel.
 * Links to the Google Business Profile so the rating can be verified at its
 * source. The review count is deliberately not shown on screen (owner's
 * choice); it stays machine-readable in aria-label, JSON-LD and llms.txt.
 */
export default function HeroRating({
  ratingValue,
  reviewCount,
  className = 'animate-on-load delay-700 mt-6 inline-flex items-center gap-3',
}: Props) {
  const t = useTranslations('Hero')
  const full = Math.floor(ratingValue)
  const hasHalf = ratingValue - full >= 0.25 && ratingValue - full < 0.75
  const filled = hasHalf ? full : Math.round(ratingValue)

  return (
    <a
      href={GOOGLE_MAPS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} hover:opacity-80 transition-opacity`}
      aria-label={`${t('ratingAria', { rating: ratingValue, count: reviewCount })}. ${t('googleReviewsLink')}`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{
              color: 'var(--copper)',
              opacity: i < filled ? 1 : i === full && hasHalf ? 1 : 0.28,
              fontSize: '14px',
            }}
          >
            {i === full && hasHalf ? '⯨' : '★'}
          </span>
        ))}
      </span>
      <span
        className="font-display font-light text-offwhite"
        style={{ fontSize: '14px', letterSpacing: '0.03em' }}
      >
        {ratingValue.toFixed(1)}
      </span>
      <span
        className="font-body font-light uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.12em',
          color: 'var(--warmgrey)',
        }}
      >
        {t('googleReviews')}
      </span>
    </a>
  )
}
