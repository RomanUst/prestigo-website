type Props = {
  ratingValue: number
  reviewCount: number
}

/**
 * Compact Google rating trust signal for the Hero.
 * Server component — static render, no client JS.
 * Uses copper unicode stars to match TestimonialsCarousel.
 */
export default function HeroRating({ ratingValue, reviewCount }: Props) {
  const full = Math.floor(ratingValue)
  const hasHalf = ratingValue - full >= 0.25 && ratingValue - full < 0.75
  const filled = hasHalf ? full : Math.round(ratingValue)

  return (
    <div
      className="animate-on-load delay-700 mt-6 inline-flex items-center gap-3"
      aria-label={`Rated ${ratingValue} out of 5 from ${reviewCount} Google reviews`}
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
        Google reviews
      </span>
    </div>
  )
}
